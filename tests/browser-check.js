// Browser-verifikation af gym-tracker via Chrome DevTools Protocol.
// Kører den fulde brugerrejse i en rigtig browser og tjekker localStorage-persistens.
// Kør: node tests/browser-check.js [url]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_UNDER_TEST = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const CHROME = '/home/lausius/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const PROFILE = path.join(os.tmpdir(), 'gt-chrome-' + Date.now());

const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function main() {
    // Port 0: lad Chrome selv vælge en fri port, og læs den faktiske WebSocket-URL fra
    // dens stderr. En fast port er en fælde — ligger der en gammel Chrome-instans og
    // lytter på den (fx fra en tidligere, dræbt kørsel), svarer /json/version fra DEN,
    // og hele suiten kører så mod en gammel browser med en gammel app.js i cachen,
    // mens den rapporterer på det site man tror den tester.
    const chrome = spawn(CHROME, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`,
        '--window-size=390,844', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const wsUrl = await new Promise((resolve, reject) => {
        let buf = '';
        const timer = setTimeout(() => reject(new Error('Chrome svarede ikke med en DevTools-URL')), 30000);
        chrome.stderr.on('data', d => {
            buf += d.toString();
            const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
            if (m) { clearTimeout(timer); resolve(m[1]); }
        });
        chrome.on('exit', code => { clearTimeout(timer); reject(new Error('Chrome afsluttede med kode ' + code)); });
    });

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.addEventListener('open', r));

    let msgId = 0;
    const pending = new Map();
    const consoleErrors = [];
    const pageErrors = [];

    ws.addEventListener('message', ev => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        if (msg.method === 'Runtime.exceptionThrown') {
            pageErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            consoleErrors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
        }
    });

    function send(method, params = {}, sessionId) {
        const id = ++msgId;
        return new Promise(resolve => {
            pending.set(id, resolve);
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
    }

    const { result: browserInfo } = await send('Browser.getVersion');
    console.log(`\nChrome: ${browserInfo.product}\nURL: ${URL_UNDER_TEST}\n`);

    // Opret en fane og attach til den
    const { result: target } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: attached } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const session = attached.sessionId;
    const S = (method, params) => send(method, params, session);

    await S('Runtime.enable');
    await S('Page.enable');
    // Ingen HTTP-cache under testen. Ellers kan en gammel app.js overleve fra en tidligere
    // kørsel (eller fra en anden Chrome), og suiten efterprøver så kode der ikke findes
    // mere. Sporet sidst: vores instrumenterede app.js blev aldrig indlæst, og
    // performance-API'et meldte transferSize 0 for både app.js og styles.css.
    await S('Network.enable');
    await S('Network.setCacheDisabled', { cacheDisabled: true });

    async function evaluate(expr) {
        const res = await S('Runtime.evaluate', {
            expression: `(() => { ${expr} })()`,
            awaitPromise: true,
            returnByValue: true,
        });
        if (res.result?.exceptionDetails) {
            throw new Error(res.result.exceptionDetails.exception?.description || 'eval fejl');
        }
        return res.result?.result?.value;
    }

    async function load(url) {
        await S('Page.navigate', { url });
        for (let i = 0; i < 80; i++) {
            const ready = await evaluate('return document.readyState === "complete" && !!document.getElementById("exercise-list") && !!document.getElementById("session-bar")');
            if (ready) break;
            await sleep(150);
        }
        await sleep(400); // lad init() og DOMContentLoaded køre færdigt
    }

    // Ugebjælkens felter er den eneste måde at skifte pas på: der er ingen særskilt
    // dag- eller A/B-vælger mere. Et felt hedder sin nøgle: upperA, upperB, lowerA, lowerB.
    async function openSession(key) {
        await evaluate(`document.querySelector('#week-strip .week-chip[data-session="${key}"]').click(); return true;`);
        await sleep(350);
    }
    // Hvilket pas står på skærmen lige nu
    const currentSession = () => evaluate('return (document.querySelector("#week-strip .week-chip.current") || {dataset:{}}).dataset.session');
    // Hvilket pas appen foreslår som det næste
    const nextSession = () => evaluate('return (document.querySelector("#week-strip .week-chip.next") || {dataset:{}}).dataset.session');

    // ─── 1. Indlæsning ────────────────────────────────────────────
    console.log('── 1. Indlæsning og initial visning');
    // Start altid fra rene data: browserens localStorage overlever mellem kørsler,
    // så en suite der ikke selv rydder op arver state fra sidste kørsel.
    await load(URL_UNDER_TEST);
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    ok('Siden indlæses uden JS-fejl', pageErrors.length === 0, JSON.stringify(pageErrors));
    ok('Titel er Gym Tracker', (await evaluate('return document.title')) === 'Gym Tracker');
    ok('Dagens pas står i bjælken med navn og fokus', (await evaluate(`
        return document.getElementById("session-label").textContent === "Upper A"
            && document.getElementById("session-focus").textContent.length > 3;
    `)) === true, await evaluate('return document.getElementById("session-focus").textContent'));
    ok('Ingen historik → foreslår Upper A', (await currentSession()) === 'upperA');
    ok('Der er ingen dag- eller A/B-vælger mere (ugens felter gør det)', (await evaluate(`
        return document.getElementById("day-selector") === null && document.getElementById("variant-selector") === null
            && document.getElementById("first-use-banner") === null;
    `)) === true);
    ok('Hint siger "foreslået"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'suggested',
        JSON.stringify(await evaluate('return { hint: document.getElementById("variant-hint").textContent, programVariant: state.programVariant }')));

    // ─── 2. Programmet er dagens træning (ingen "tilføj"-knap) ─────
    console.log('\n── 2. Programmet ligger klart ved åbning');
    ok('Der er ingen "Tilføj alle"-knap mere', (await evaluate('return document.getElementById("program-load")')) === null);
    ok('Der er ingen "Tilføj øvelse"-formular mere', (await evaluate('return document.getElementById("add-exercise-section")')) === null);
    ok('Dagens program giver 6 øvelser af sig selv (Upper A)',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) ===
        (await evaluate('return getProgram("upper", "A").length')));
    ok('Gem-knappen er aktiv med det samme (programmet er indlæst)',
        (await evaluate('return document.getElementById("save-btn").disabled')) === false);
    ok('Hvert programpunkt er et kort i listen (ingen særskilt programliste)', (await evaluate(`
        return document.querySelectorAll("#exercise-list .exercise-card").length === programItems("upper", "A").length;
    `)) === true);
    ok('Kortene er i programmets rækkefølge', (await evaluate(`
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return ids.join(",") === programItems("upper", "A").map(i => i.exerciseId).join(",");
    `)) === true, await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).join(",")'));
    ok('Kortet viser programmets plan (ikke en gammel vægt)', (await evaluate(`
        const first = programItems("upper", "A")[0];
        const t = document.querySelector("#exercise-list .exercise-target").textContent;
        return t.includes("Recommended: " + first.sets + " × " + first.reps + " @ " + first.weight + " kg");
    `)) === true, await evaluate('return document.querySelector("#exercise-list .exercise-target").textContent.trim()'));
    ok('Bench Press står i øvelseslisten', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Bench Press")')) === true);
    ok('Sættene er præfyldt fra programmet', (await evaluate(`
        const first = programItems("upper", "A")[0];
        const card = document.querySelector("#exercise-list .exercise-card");
        const w = card.querySelector(".set-weight").value;
        const r = card.querySelector(".set-reps").value;
        return w === String(first.weight) && r === String(first.reps) && card.querySelectorAll(".set-weight").length === first.sets;
    `)) === true);
    ok('Kortet viser anbefalingen fra programmet', (await evaluate(`
        const first = programItems("upper", "A")[0];
        const t = document.querySelector("#exercise-list .exercise-target");
        return !!t && t.textContent.includes("Recommended: " + first.sets + " × " + first.reps);
    `)) === true);
    ok('Opvarmningsrampen følger den anbefalede vægt', (await evaluate(`
        const first = programItems("upper", "A")[0];
        const ex = getExerciseById("upper", first.exerciseId);
        const card = document.querySelector("#exercise-list .exercise-card");
        const block = card.querySelector(".warmup-block");
        if (!block) return false;
        const expected = warmupSets(first.weight, ex).map(s => s.weight + " × " + s.reps);
        const shown = [...block.querySelectorAll(".warmup-set")].map(s => s.textContent.replace(/\\s+/g, " ").trim());
        return expected.length > 0 && expected.every(e => shown.some(t => t.includes(e)));
    `)) === true, await evaluate(`
        const first = programItems("upper", "A")[0];
        const ex = getExerciseById("upper", first.exerciseId);
        return warmupSets(first.weight, ex).map(s => s.weight + " × " + s.reps).join(" | ");
    `));
    ok('Opvarmningen er foldet sammen som standard', (await evaluate('return document.querySelector("#exercise-list .warmup-block").open === false')) === true);
    ok('Isolation får ét let sæt (Calf Raise er ikke med på Upper A, så vi måler reglen)',
        (await evaluate(`
            const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
                .find(c => !c.querySelector(".tag.compound") && c.querySelector(".warmup-block"));
            if (!card) return true; // ingen isolation på denne dag
            const ex = ALL_EXERCISES.upper.find(e => e.name === card.querySelector(".exercise-name, .exercise-name-btn").textContent.replace("\u25be", "").trim());
            return card.querySelectorAll(".warmup-block .warmup-set").length === warmupSets(Number(card.querySelector(".set-weight").value), ex).length;
        `)) === true);

    // ─── 2b. Teknik-cues ──────────────────────────────────────────
    console.log('\n── 2b. Teknik-cues på kortet');
    ok('Bench Press-kortet viser sin cue', (await evaluate(`
        const cue = document.querySelector("#exercise-list .exercise-card .cue-line");
        return !!cue && /Shoulder blades/.test(cue.textContent);
    `)) === true);
    ok('Cuen er synlig uden at folde noget ud (ikke bag <details>)', (await evaluate(`
        const cue = document.querySelector("#exercise-list .exercise-card .cue-line");
        return cue.offsetHeight > 0 && !cue.closest("details");
    `)) === true);
    ok('Cuen står over opvarmningen på kortet', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        const cue = card.querySelector(".cue-line");
        const warm = card.querySelector(".warmup-block");
        return cue.getBoundingClientRect().top < warm.getBoundingClientRect().top;
    `)) === true);
    ok('Hvert øvelseskort har præcis én cue-linje', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        return cards.length === getProgram("upper", "A").length
            && cards.every(c => c.querySelectorAll(".cue-line").length === 1);
    `)) === true);
    ok('Hver cue siger noget forskelligt (ingen kopi til alle)', (await evaluate(`
        const cues = [...document.querySelectorAll("#exercise-list .cue-line")].map(c => c.textContent);
        return new Set(cues).size === cues.length;
    `)) === true);
    ok('Hver cue på kortet er øvelsens egen cue', (await evaluate(`
        const day = "upper";
        return [...document.querySelectorAll("#exercise-list .exercise-card")].every(card => {
            const name = card.querySelector(".exercise-name, .exercise-name-btn").textContent.replace("\u25be", "").trim();
            const ex = ALL_EXERCISES[day].find(e => e.name === name);
            return ex && card.querySelector(".cue-line").textContent.trim() === "💡 " + exerciseCue(ex);
        });
    `)) === true);
    ok('Cue-teksten læses som én linje tekst (under 130 tegn)', (await evaluate(`
        return [...document.querySelectorAll("#exercise-list .cue-line")]
            .every(c => c.textContent.length < 130);
    `)) === true);

    // ─── 3. A/B-skift ─────────────────────────────────────────────
    console.log('\n── 3. Skift til B-varianten');
    await openSession('upperB');
    ok('Ugebjælkens felt for Upper B er nu det aktive pas', (await currentSession()) === 'upperB');
    ok('Hint skifter til "valgt"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'chosen');
    ok('Upper B viser Face Pull', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Face Pull")')) === true);
    ok('Upper B viser ikke Bench Press', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Bench Press")')) === false);
    ok('↻-knappen er fjernet (A/B skiftes med knapperne)', (await evaluate('return document.getElementById("program-refresh")')) === null);
    ok('Variantskiftet lægger den nye variants program ind i dagens træning', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name, #exercise-list .exercise-card .exercise-name-btn")].map(e => e.textContent.replace("\u25be", "").trim());
        const want = getProgram("upper", "B").map(i => ALL_EXERCISES.upper.find(e => e.id === i.exerciseId).name);
        return cards.length === want.length && cards.every((n, i) => n === want[i]);
    `)) === true);
    await openSession('upperA');
    ok('Og feltet for Upper A skifter tilbage', (await currentSession()) === 'upperA');
    ok('Og dagens øvelser følger med tilbage til Upper A', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name, #exercise-list .exercise-card .exercise-name-btn")].map(e => e.textContent.replace("\u25be", "").trim());
        return cards.length === getProgram("upper", "A").length && cards[0] === "Bench Press";
    `)) === true);

    // ─── 4. Rediger sæt og gem ────────────────────────────────────
    console.log('\n── 4. Rediger sæt og gem træningen');
    ok('Sæt-input opdaterer volumen', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        const w = card.querySelector(".set-weight");
        w.value = "65";
        w.dispatchEvent(new Event("input", { bubbles: true }));
        return card.querySelector(".volume-cell").textContent.trim() === "520";
    `)) === true);
    ok('Opvarmningen følger den rettede vægt', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        card.querySelectorAll(".set-weight").forEach(w => {
            w.value = "65";
            w.dispatchEvent(new Event("input", { bubbles: true }));
        });
        const t = card.querySelector(".warmup-block").textContent;
        return t.includes("working weight 65 kg") && t.includes("32.5 × 8") && t.includes("55 × 3");
    `)) === true, await evaluate(`
        return document.querySelector("#exercise-list .warmup-block").textContent.replace(/\\s+/g, " ").slice(0, 120);
    `));
    ok('Åben opvarmning forbliver åben mens vægten rettes', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        card.querySelector(".warmup-block").open = true;
        const setAll = v => card.querySelectorAll(".set-weight").forEach(w => {
            w.value = v;
            w.dispatchEvent(new Event("input", { bubbles: true }));
        });
        setAll("70");
        const stillOpen = card.querySelector(".warmup-block").open === true;
        const followed = card.querySelector(".warmup-block").textContent.includes("35 × 8");
        setAll("65");
        return stillOpen && followed && card.querySelector(".warmup-block").textContent.includes("32.5 × 8");
    `)) === true);
    await evaluate('document.querySelector("#exercise-list .add-set-btn").click(); return true;');
    await sleep(150);
    ok('Tilføj sæt giver 4 sæt på første øvelse', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[0].querySelectorAll(".set-weight").length')) === 4);
    ok('De øvrige øvelser har stadig 3 sæt', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[1].querySelectorAll(".set-weight").length')) === 3);

    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(300);
    ok('Efter gem er det næste pas i ugen lagt klar som dagens træning', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name, #exercise-list .exercise-card .exercise-name-btn")].map(e => e.textContent.replace("\u25be", "").trim());
        const want = getProgram("upper", "B").map(i => ALL_EXERCISES.upper.find(e => e.id === i.exerciseId).name);
        const current = (document.querySelector("#week-strip .week-chip.current") || {dataset:{}}).dataset.session;
        return current === "upperB" && cards.length === want.length && cards.every((n, i) => n === want[i]);
    `)) === true);
    ok('Træningen ligger i localStorage', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        return w.length === 1 && w[0].day === "upper" && w[0].variant === "A" && w[0].exercises.length === 6;
    `)) === true);
    ok('Kun sæt med vægt+reps gemmes (4 sæt på Bench Press, 3 på resten)', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"))[0];
        const bp = w.exercises.find(e => e.exerciseId === "bench_press");
        const other = w.exercises.find(e => e.exerciseId === "lat_pulldown");
        return bp.sets.length === 4 && other.sets.length === 3;
    `)) === true);
    ok('Redigeret vægt (65 kg) er gemt', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"))[0];
        return w.exercises.find(e => e.exerciseId === "bench_press").sets[0].weight === 65;
    `)) === true);

    // ─── 5. Persistens + rotation efter reload ────────────────────
    console.log('\n── 5. Reload: persistens og A/B-rotation');
    await load(URL_UNDER_TEST);
    ok('Data overlever reload', (await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length')) === 1);
    ok('Næste pas i ugen står klar (rotationen virker)', (await currentSession()) === "upperB");
    ok('Foreslået variant er igen markeret "foreslået"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'suggested');
    // Fremgangen vises ikke længere i en liste for sig: den ligger som tal på kortet,
    // hvor man kan se den mens man retter vægten. Programmets plan står uændret.
    ok('Kortet viser programmets tal mens man retter dem', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        return cards.length > 0 && cards.every(c => /Recommended: \\d+ × \\d+ @ [\\d.]+ kg/.test(c.querySelector(".exercise-target").textContent));
    `)) === true, await evaluate('return document.querySelector("#exercise-list .exercise-target").textContent'));

    // ─── 6. Historik, deling og regler ────────────────────────────
    console.log('\n── 6. Historik, deling og regler');
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(200);
    ok('Historik-panelet åbner', (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === true);
    ok('Historik viser Upper og Bench Press', (await evaluate(`
        const t = document.getElementById("history-content").innerText;
        return t.includes("Upper") && t.includes("Bench Press");
    `)) === true);
    ok('Historik viser det bedste sæt', (await evaluate('return document.querySelectorAll("#history-content .hist-set.best").length')) > 0);
    await evaluate('document.getElementById("close-history").click(); return true;');
    await sleep(150);
    ok('Historik kan lukkes', (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === false);

    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(200);
    const shareText = await evaluate('return document.getElementById("share-text").value;');
    ok('Del-modal genererer tekst med uge-overskrift og sæt', shareText.includes('NEW SINCE LAST') && shareText.includes('65×8'), shareText.split('\n')[0]);
    ok('Del-teksten har all-time-bedste og fremgangs-headline', shareText.includes('🏆 Best ever') && shareText.includes('📈 Progress:'));
    ok('Del-teksten viser hvilken uge træningen hører til', /NEW SINCE LAST \(\d+\) · WEEK \d+/.test(shareText), shareText.split('\n')[0]);
    await evaluate('document.getElementById("share-close").click(); return true;');

    ok('Regler-knappen er væk (reglerne ligger i README)', (await evaluate('return document.getElementById("program-rules")')) === null);
    ok('Regler-modalen er væk', (await evaluate('return document.getElementById("rules-modal")')) === null);

    // ─── 7. Lower day + mobillayout ───────────────────────────────
    console.log('\n── 7. Lower day og mobillayout');
    // Upper A er klaret i ugen, så det næste pas skal være et ben-pas — og det vælges
    // direkte i ugebjælken (der er ingen særskilt dag-vælger mere).
    ok('Næste pas i ugen er et ben-pas (upper-historik smitter ikke)', (await nextSession()) === 'lowerA');
    await openSession('lowerA');
    ok('Ugebjælkens felt skifter til Lower A', (await currentSession()) === 'lowerA');
    ok('Lower-programmet viser Leg Press', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Leg Press")')) === true);
    ok('Lower A lægges ind med sine øvelser', (await evaluate(`
        return document.querySelectorAll("#exercise-list .exercise-card").length === getProgram("lower", "A").length;
    `)) === true);

    // Gem lower-træningen på en anden dato, så begge dage har historik
    await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        // Ugen er enheden: træningen skal ligge i den aktuelle uge for at tælle med
        w.push({ id: "w_lower_1", date: isoDate(mondayOf(new Date())), day: "lower", variant: "A", exercises: [
            { exerciseId: "squat", sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify(w));
        return true;
    `);
    await load(URL_UNDER_TEST);
    // Begge A-pas er klaret i ugen (upper i dag, lower i mandags). Både Upper B og
    // Lower B mangler altså; hvilken af dem der vises som "næste" afhænger af hvilken
    // dag der blev trænet sidst, og de to pas ligger her på samme dato.
    ok('Kun de to B-pas mangler i ugen', (await evaluate(`
        const left = SESSION_ORDER.filter(k => !weekDone()[k]);
        return left.length === 2 && left.join(",") === "upperB,lowerB";
    `)) === true);
    await openSession('lowerB');
    ok('Lower B viser Calf Raise (Leg Press)', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Calf Raise (Leg Press)")')) === true);

    // Mobillayout: gentagne rækker skal have knapper i samme faste position ude i siden,
    // uanset hvor lang teksten i rækken er (iPhone-bredder).
    console.log('\n── 8. Mobillayout: fast knappeposition ved varierende tekstlængde');

    // Dags-skiftet lagde den nye dags program ind — øvelseslisten er fyldt til
    // layout-testen uden at man skal trykke på noget.
    await sleep(250);
    ok('Øvelseslisten er fyldt op til layout-testen', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) > 0);

    async function layoutAt(width) {
        await S('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
        await sleep(300);
        return evaluate(`
            const doc = document.documentElement;
            const groups = [
                ['#exercise-list', '.exercise-card', '.remove-btn'],
            ];
            const report = [];
            for (const [container, rowSel, rightSel] of groups) {
                const rows = [...document.querySelectorAll(container + ' ' + rowSel)];
                if (!rows.length) { report.push({ container, count: 0 }); continue; }
                const rects = rows.map(r => r.getBoundingClientRect());
                // Højre-elementet: eksplicit knap hvor rækken har en, ellers rækkens sidste barn
                const rightEls = rows.map(r => rightSel
                    ? r.querySelector(rightSel)
                    : [...r.children].filter(c => c.getBoundingClientRect().width > 0).pop());
                const edgeOffsets = rows.map((r, i) => Math.round(rects[i].right - rightEls[i].getBoundingClientRect().right));
                const centerOffsets = rows.map((r, i) => {
                    const eb = rightEls[i].getBoundingClientRect();
                    return Math.round(Math.abs((rects[i].top + rects[i].height / 2) - (eb.top + eb.height / 2)));
                });
                // Øvelseskortets ✕ sidder bevidst i toppen af kortet, ikke lodret centreret
                const topOffsets = rows.map((r, i) => Math.round(rightEls[i].getBoundingClientRect().top - rects[i].top));
                const spill = rows.filter((r, i) => [...r.querySelectorAll('*')].some(el => {
                    const eb = el.getBoundingClientRect();
                    return eb.right > rects[i].right + 1 || eb.left < rects[i].left - 1;
                })).length;
                // Hvem er skyld i overløbet: rækkens id og den klasse der stikker ud
                const spillWho = rows.flatMap((r, i) => [...r.querySelectorAll('*')]
                    .filter(el => {
                        const eb = el.getBoundingClientRect();
                        return eb.width > 0 && (eb.right > rects[i].right + 1 || eb.left < rects[i].left - 1);
                    })
                    .map(el => (r.dataset.exerciseId || i) + ':' + (el.className || el.tagName)));
                report.push({
                    container, count: rows.length,
                    widths: [...new Set(rects.map(r => Math.round(r.width)))],
                    edgeOffsets, centerOffsets, topOffsets, spill, spillWho,
                });
            }
            return { overflow: doc.scrollWidth - doc.clientWidth, report };
        `);
    }

    const spread = a => Math.max(...a) - Math.min(...a);
    const label = { '#exercise-list': 'Øvelseslisten' };

    for (const width of [320, 375, 390, 430]) {
        const { overflow, report } = await layoutAt(width);
        ok(`[${width}px] intet vandret overflow`, overflow <= 1, `overflow=${overflow}`);
        for (const g of report) {
            if (!g.count) { ok(`[${width}px] ${label[g.container]}: rækker fundet`, false); continue; }
            ok(`[${width}px] ${label[g.container]}: alle ${g.count} rækker lige brede`,
                g.widths.length === 1, `bredder: ${g.widths.join(', ')}`);
            ok(`[${width}px] ${label[g.container]}: højre-elementet har samme afstand til kanten i alle rækker`,
                spread(g.edgeOffsets) <= 1, `afstande: ${[...new Set(g.edgeOffsets)].join(', ')}`);
            const isCard = g.container === '#exercise-list';
            const vertical = isCard ? g.topOffsets : g.centerOffsets;
            ok(`[${width}px] ${label[g.container]}: højre-elementet sidder samme sted lodret i alle rækker (${isCard ? 'top-justeret' : 'centreret'})`,
                spread(vertical) <= 1, `afvigelse: ${spread(vertical)}px (${[...new Set(vertical)].join(', ')})`);
            ok(`[${width}px] ${label[g.container]}: intet stikker ud over rækken`,
                g.spill === 0, `${g.spill} rækker med overløb: ${g.spillWho.join(', ')}`);
        }
    }

    // Selve regressionen: gør navnet markant længere — ✕-knappen må ikke flytte sig.
    // (Det var netop fejlen før: et langt øvelsesnavn skubbede knappen ud af rækken.)
    await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(250);
    const before = await evaluate(`
        const c = document.querySelector("#exercise-list .exercise-card");
        const b = c.querySelector(".remove-btn").getBoundingClientRect();
        return Math.round(c.getBoundingClientRect().right - b.right);
    `);
    await evaluate(`
        document.querySelectorAll("#exercise-list .exercise-card").forEach(c => {
            const name = c.querySelector(".exercise-name-btn") || c.querySelector(".exercise-name");
            name.insertAdjacentText("afterbegin", "Incline Dumbbell Press med ekstra langt navn og mere tekst ");
        });
        return true;
    `);
    await sleep(200);
    const after = await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        const edges = cards.map(c => {
            const b = c.querySelector(".remove-btn").getBoundingClientRect();
            return Math.round(c.getBoundingClientRect().right - b.right);
        });
        return { offset: edges[0], spread: Math.max(...edges) - Math.min(...edges) };
    `);
    ok(`✕-knappen flytter sig ikke ved lang tekst (før ${before}px, efter ${after.offset}px)`, before === after.offset);
    ok('✕-knapperne holder samme afstand til kanten selv med lang tekst', after.spread <= 1, `spredning ${after.spread}px`);
    await load(URL_UNDER_TEST, '#app');
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(200);

    // ─── 9. Byt en øvelse (samme muskelgruppe) ────────────────────
    // Man bygger ikke programmet op selv længere: man bytter en øvelse ud med en
    // anden i samme muskelgruppe, og byttet huskes for den dag+variant.
    console.log('\n── 9. Byt en øvelse til en anden i samme muskelgruppe');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('upperA');

    ok('Navnet på et øvelseskort er en knap', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-name-btn").length')) > 0);
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        card.querySelector(".exercise-name-btn").click();
        return true;
    `);
    await sleep(250);
    const menu = await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        const opts = [...card.querySelectorAll(".swap-option")];
        return {
            count: opts.length,
            ids: opts.map(o => o.dataset.swapId),
            names: opts.map(o => o.querySelector(".swap-option-name").textContent.trim()),
            current: (opts.find(o => o.classList.contains("current")) || { dataset: {} }).dataset.swapId || null,
            muscles: opts.map(o => ALL_EXERCISES.upper.find(e => e.id === o.dataset.swapId).muscle),
            sessionIds: [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name, #exercise-list .exercise-card .exercise-name-btn")].map(e => e.textContent.replace("\u25be", "").trim()),
        };
    `);
    ok('Bytte-listen åbner når man trykker på navnet', menu.count > 1, JSON.stringify(menu));
    ok('Alle valg deler muskelgruppe med Bench Press',
        menu.muscles.every(m => m.split('/').map(s => s.trim()).includes('Chest')), JSON.stringify(menu.muscles));
    ok('Listen rummer ikke øvelser fra andre grupper', !menu.ids.includes('lat_pulldown') && !menu.ids.includes('ez_bar_curl'));
    ok('Den nuværende øvelse er markeret i listen', menu.current === 'bench_press');
    ok('Øvelser der allerede står i dagens træning tilbydes ikke', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        const opts = [...card.querySelectorAll(".swap-option")].map(o => o.dataset.swapId);
        const inSession = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return opts.every(id => {
            const ex = ALL_EXERCISES.upper.find(e => e.id === id);
            return id === "bench_press" || !inSession.includes(ex.id);
        });
    `)) === true);

    // Vælg en anden øvelse: kortet og anbefalingen følger med
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        [...card.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "chest_press_machine").click();
        return true;
    `);
    await sleep(300);
    ok('Kortet viser den nye øvelse på samme plads', (await evaluate(`
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return ids[0] === "chest_press_machine";
    `)) === true, await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).join(",")'));
    ok('Øvelseskortet følger med, og den gamle er væk', (await evaluate(`
        const t = document.getElementById("exercise-list").innerText;
        return t.includes("Chest Press (Machine)") && !t.includes("Bench Press") &&
            document.querySelectorAll("#exercise-list .exercise-card").length === getProgram("upper", "A").length;
    `)) === true);
    ok('Kortet viser hvad programmet anbefaler', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.dataset.exerciseId === "chest_press_machine");
        return card.querySelector(".exercise-target").textContent.includes("Recommended: ");
    `)) === true);
    ok('Dagen har stadig kun sine egne øvelser (ingen dublet)', (await evaluate(`
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return new Set(ids).size === ids.length;
    `)) === true);
    ok('Byttet gemmes, så det huskes næste gang', (await evaluate(`
        const s = JSON.parse(localStorage.getItem("gym_tracker_program_swaps") || "{}");
        return s.upperA && s.upperA.bench_press === "chest_press_machine";
    `)) === true);
    ok('Gem-info viser at dagen er fyldt op', /of 6 exercises/.test(await evaluate('return document.getElementById("save-info").textContent')));

    // Byttet overlever en reload og gælder kun den dag+variant
    await load(URL_UNDER_TEST);
    ok('Efter reload står den byttede øvelse der stadig', (await evaluate(`
        return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId)[0] === "chest_press_machine";
    `)) === true);
    await openSession('upperB');
    ok('Byttet gælder kun Upper A (ikke B)', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Chest Press (Machine)")')) === false);
    await openSession('upperA');

    // Byt tilbage til programmets øvelse: overriden fjernes
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "chest_press_machine");
        card.querySelector(".exercise-name-btn").click();
        return true;
    `);
    await sleep(200);
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "chest_press_machine");
        [...card.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "bench_press").click();
        return true;
    `);
    await sleep(300);
    ok('Man kan bytte tilbage til programmets øvelse', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Bench Press")')) === true);
    ok('Og så er overriden væk (ingen gammel husket bytte)',
        (await evaluate('return JSON.stringify(JSON.parse(localStorage.getItem("gym_tracker_program_swaps") || "{}"))')) === '{}');

    // Leg Curl sad før alene i sin muskelgruppe og havde derfor ingen menu. Det var
    // en fejl: den skal kunne byttes til de andre hamstring-øvelser.
    await openSession('lowerA');
    const legCurlSwap = await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_curl");
        const btn = card.querySelector(".exercise-name-btn");
        if (!btn) return { has: false, opts: [] };
        btn.click();
        const after = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_curl");
        const opts = [...after.querySelectorAll(".swap-option")].map(o => o.dataset.swapId);
        after.querySelector(".exercise-name-btn").click();
        return { has: true, opts };
    `);
    ok('Leg Curl har en bytte-knap', legCurlSwap.has === true, JSON.stringify(legCurlSwap));
    ok('Leg Curl kan byttes til Nordic og Seated Leg Curl',
        legCurlSwap.opts.includes('nordic_curl') && legCurlSwap.opts.includes('seated_leg_curl'),
        JSON.stringify(legCurlSwap.opts));
    ok('Back Extension kan byttes (Good Morning deler Lower back)',
        (await evaluate(`
            const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "back_extension");
            const btn = card && card.querySelector(".exercise-name-btn");
            if (!btn) return false;
            btn.click();
            const after = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "back_extension");
            const ids = [...after.querySelectorAll(".swap-option")].map(o => o.dataset.swapId);
            after.querySelector(".exercise-name-btn").click();
            return ids.includes("good_morning");
        `)) === true);
    ok('Leg Press kan byttes til Bulgarian Split Squat',
        (await evaluate(`
            const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press");
            const btn = card && card.querySelector(".exercise-name-btn");
            if (!btn) return false;
            btn.click();
            const after = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press");
            const ids = [...after.querySelectorAll(".swap-option")].map(o => o.dataset.swapId);
            after.querySelector(".exercise-name-btn").click();
            return ids.includes("bulgarian_split");
        `)) === true);
    ok('Hip Thrust har en bytte-knap (Glute Bridge i samme gruppe)',
        (await evaluate(`
            const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "hip_thrust");
            return !!card && !!card.querySelector(".exercise-name-btn");
        `)) === true);

    // Tallene hører til øvelsen, ikke til rækken. Bytter man Leg Press (225 kg) til
    // Leg Extension, må de 225 kg ikke følge med — Leg Extension vejer 70 kg.
    const legExtSwap = await evaluate(`
        const card = () => [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.dataset.exerciseId === "leg_press");
        const btn = card() && card().querySelector(".exercise-name-btn");
        if (!btn) return { swapped: false };
        btn.click();
        const option = [...card().querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "leg_extension");
        if (!option) return { swapped: false, opts: [...card().querySelectorAll(".swap-option")].map(o => o.dataset.swapId) };
        option.click();
        return { swapped: true };
    `);
    await sleep(300);
    const extCard = await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.dataset.exerciseId === "leg_extension");
        if (!card) return { found: false };
        const row = getProgram("lower", "B").find(r => r.exerciseId === "leg_extension");
        return {
            found: true,
            plan: (card.querySelector(".exercise-target") || { textContent: "" }).textContent.trim(),
            weights: [...card.querySelectorAll(".set-weight")].map(i => Number(i.value)),
            reps: [...card.querySelectorAll(".set-reps")].map(i => Number(i.value)),
            sets: card.querySelectorAll(".set-weight").length,
            row: { sets: row.sets, reps: row.reps, weight: row.weight },
        };
    `);
    ok('Leg Press kan byttes til Leg Extension', legExtSwap.swapped === true, JSON.stringify(legExtSwap));
    ok('Anbefalingen på kortet er Leg Extensions egne tal, ikke Leg Press\' 225 kg',
        extCard.found && extCard.plan.includes("@ " + extCard.row.weight + " kg") && !extCard.plan.includes("225"),
        JSON.stringify(extCard));
    ok('Felterne er forudfyldt med Leg Extensions egen vægt og reps',
        extCard.found && extCard.sets === extCard.row.sets &&
        extCard.weights.every(w => w === extCard.row.weight) && extCard.reps.every(r => r === extCard.row.reps),
        JSON.stringify(extCard));
    ok('Ingen 225 kg fra Leg Press står tilbage på kortet',
        extCard.found && !extCard.weights.includes(225), JSON.stringify(extCard.weights));

    // ─── 9b. Byt direkte fra øvelseskortet ────────────────────────
    // Man kigger på sine øvelser i "Exercises", ikke i programlisten, når man står
    // midt i en træning. Navnet på kortet skal derfor åbne samme bytte-liste.
    console.log('\n── 9b. Byt direkte fra øvelseskortet');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('upperA');

    ok('Navnet på øvelseskortet er en knap', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-name-btn").length')) > 0);
    ok('Sektionshovedet siger at navnene kan trykkes på',
        (await evaluate('return document.getElementById("exercise-hint").textContent')) === 'Tap a name to swap');
    ok('Et kort uden alternativer har stadig et almindeligt navn',
        (await evaluate(`
            const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
            return cards.some(c => c.querySelector(".exercise-name")) || cards.every(c => c.querySelector(".exercise-name-btn"));
        `)) === true);

    const cardMenu = await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.querySelector(".exercise-name-btn").textContent.includes("Bench Press"));
        card.querySelector(".exercise-name-btn").click();
        return true;
    `);
    await sleep(250);
    const fromCard = await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.querySelector(".exercise-name-btn") && c.querySelector(".exercise-name-btn").textContent.includes("Bench Press"));
        const opts = [...card.querySelectorAll(".swap-option")];
        return {
            inCard: opts.map(o => o.dataset.swapId),
            ids: opts.map(o => o.dataset.swapId),
            expected: swapCandidates("upper", "bench_press").map(c => c.id).join(","),
            muscles: opts.map(o => ALL_EXERCISES.upper.find(e => e.id === o.dataset.swapId).muscle),
            current: (opts.find(o => o.classList.contains("current")) || { dataset: {} }).dataset.swapId || null,
            slot: card.querySelector(".exercise-name-btn").dataset.swapSlot,
        };
    `);
    ok('Kortets navn åbner bytte-listen', fromCard.inCard.length > 1, JSON.stringify(fromCard));
    ok('Bytte-listen er de samme kandidater som reglen giver', fromCard.ids.join(',') === fromCard.expected,
        `${fromCard.ids.join(',')} vs ${fromCard.expected}`);
    ok('Kortets liste deler muskelgruppe med øvelsen',
        fromCard.muscles.every(m => m.split('/').map(s => s.trim()).includes('Chest')), JSON.stringify(fromCard.muscles));
    ok('Kortet ved hvilken programrække det hører til', fromCard.slot === 'bench_press');
    ok('Den nuværende øvelse er markeret', fromCard.current === 'bench_press');

    // Vælg en anden øvelse fra kortet: byttet skal ramme programrækken og huskes
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.querySelector(".exercise-name-btn") && c.querySelector(".exercise-name-btn").textContent.includes("Bench Press"));
        [...card.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "chest_press_machine").click();
        return true;
    `);
    await sleep(300);
    ok('Kortet viser den byttede øvelse', (await evaluate(`
        const t = document.getElementById("exercise-list").innerText;
        return t.includes("Chest Press (Machine)") && !t.includes("Bench Press");
    `)) === true);
    ok('Programmet (programItems) følger med', (await evaluate(`return programItems("upper","A")[0].exerciseId`)) === 'chest_press_machine');
    ok('Byttet huskes, selv om det blev sat fra kortet', (await evaluate(`return programItems("upper","A")[0].exerciseId`)) === 'chest_press_machine');
    ok('Dagen har stadig kun sine egne øvelser (ingen dublet)', (await evaluate(`
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return new Set(ids).size === ids.length && ids.length === getProgram("upper", "A").length;
    `)) === true);
    ok('Kortet viser den nye øvelses anbefaling', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.dataset.exerciseId === "chest_press_machine");
        return /Recommended: \\d+ × \\d+/.test(card.querySelector(".exercise-target").textContent);
    `)) === true);

    // Et kort der ikke er en del af programmet (hentet ind i hånden) har intet at bytte.
    // Invarianten er derfor: hver bytte-knap peger på en række der findes i programmet.
    ok('Alle kort i dagens træning peger på en programrække', (await evaluate(`
        const slots = programItems("upper", "A").map(i => i.swappedFrom || i.exerciseId);
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        return cards.every(c => {
            const btn = c.querySelector(".exercise-name-btn");
            return !btn || slots.includes(btn.dataset.swapSlot);
        });
    `)) === true);

    // Tilbage til udgangspunktet for resten af forløbet
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('lowerA');
    // Del-rapportens "per hand"/"per leg"-linje afhænger af om de delte træninger
    // indeholder en øvelse med en loadNote. Programmerne indeholder ingen, så der
    // lægges en træning ind med den første øvelse i databasen der har en. Datadrevet,
    // så en ny øvelse med loadNote ikke kræver en ændring her.
    const noteSaved = await evaluate('return localStorage.getItem("gym_tracker_workouts")');
    const noteCheck = await evaluate(`
        const found = ["upper", "lower"]
            .map(day => ({ day, ex: ALL_EXERCISES[day].find(e => e.loadNote) }))
            .filter(x => x.ex)[0];
        if (!found) return { skipped: true };
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        w.push({
            id: "note_1", date: "2026-09-28", day: found.day, variant: "A",
            exercises: [{ exerciseId: found.ex.id, sets: [{ weight: 20, reps: 8 }] }],
        });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify(w));
        return { name: found.ex.name, loadNote: found.ex.loadNote };
    `);
    if (noteCheck.skipped) {
        console.log('  – ingen øvelse med loadNote i databasen; noten kan ikke efterprøves');
    } else {
        await load(URL_UNDER_TEST);
        const shareText = await evaluate(`
            document.getElementById("btn-share").click();
            const sel = document.getElementById("share-scope");
            sel.value = "all";
            sel.dispatchEvent(new Event("change"));
            const t = document.getElementById("share-text").value;
            document.getElementById("share-close").click();
            return t;
        `);
        ok('Del-rapporten oplyser "per hånd"/"per ben" for de øvelser der kræver det',
            new RegExp(`ℹ️ ${noteCheck.loadNote} = kg per side: .*${noteCheck.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(shareText),
            JSON.stringify({ name: noteCheck.name, loadNote: noteCheck.loadNote }));
        // Ryd op igen: resten af forløbet regner med den oprindelige log
        await evaluate(`localStorage.setItem("gym_tracker_workouts", ${JSON.stringify(noteSaved || '[]')}); return true;`);
        await load(URL_UNDER_TEST);
    }

    // ─── 10. Rediger en gemt træning ──────────────────────────────
    // ─── 10. Rediger en gemt træning ──────────────────────────────
    console.log('\n── 10. Rediger en gemt træning (øvelse glemt og hentet ind bagefter)');

    // Start forfra med rene data: dagen ligger klar, fjern den sidste øvelse (som om
    // man gik hjem før den) og gem. Bagefter hentes den ind igen under redigering.
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('upperA');
    await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        cards[cards.length - 1].querySelector(".remove-btn").click();
        return true;
    `);
    await sleep(250);
    ok('Øvelsen er fjernet fra dagens træning', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 5);
    ok('Linjen "hent tilbage" vises nu (øvelsen er ikke med i dag)', (await evaluate(`
        const row = document.getElementById("exercise-restore");
        return !row.classList.contains("hidden") && /1 exercise removed/.test(row.textContent);
    `)) === true, await evaluate('return document.getElementById("exercise-restore").textContent.trim()'));
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(400);

    const readWorkouts = `const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");`;
    const afterSave = await evaluate(`
        ${readWorkouts}
        return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0, day: w[0] && w[0].day, variant: w[0] && w[0].variant };
    `);
    ok('Træningen blev gemt (1 træning, 5 øvelser)', afterSave.count === 1 && afterSave.ex === 5, JSON.stringify(afterSave));
    ok('Efter gem lægges det næste pas i ugen klar som dagens træning',
        (await currentSession()) === 'upperB');

    // Historikken: én træning, med Rediger-knap
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    ok('Historikken viser én træning med Rediger-knap', (await evaluate('return document.querySelectorAll("#history-content .history-edit-btn").length')) === 1);
    ok('Historik-blokken viser antal øvelser og volumen', (await evaluate(`
        const m = document.querySelector("#history-content .history-workout-meta").textContent;
        return /5 exercises/.test(m) && /kg total/.test(m);
    `)) === true);

    // Gå i redigeringstilstand
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    ok('Redigering indlæser træningens 5 øvelser', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 5);
    ok('Historik-panelet lukkes når redigeringen starter', (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === false);
    ok('Banneret viser hvilken træning der redigeres', (await evaluate(`
        const b = document.getElementById("edit-banner");
        return !b.classList.contains("hidden") && b.textContent.includes("Editing Upper");
    `)) === true);
    ok('Knappen skifter til "Update workout"', (await evaluate('return document.getElementById("save-btn").textContent.includes("Update workout")')) === true);
    ok('Passet på skærmen er det pas der redigeres (Upper)', (await currentSession()) === 'upperA');
    ok('Sættene er indlæst med vægt og reps', (await evaluate(`
        const inputs = [...document.querySelectorAll("#exercise-list input[type=number]")];
        return inputs.length > 0 && inputs.every(i => Number(i.value) > 0);
    `)) === true);
    ok('Indholdet skubbes fri af det højere gem-panel', (await evaluate(`
        return getComputedStyle(document.querySelector(".app-container")).paddingBottom;
    `)) === '156px');

    // Hent den glemte øvelse ind igen ved at trykke på "restore"-linjen
    await evaluate('document.getElementById("btn-restore").click(); return true;');
    await sleep(300);
    ok('Øvelsen er hentet tilbage på sin plads i programmet', (await evaluate(`
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return ids.join(",") === programItems("upper", "A").map(i => i.exerciseId).join(",");
    `)) === true, await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).join(",")'));
    ok('"Hent tilbage"-linjen er væk igen', (await evaluate('return document.getElementById("exercise-restore").classList.contains("hidden")')) === true);
    ok('Den glemte øvelse er nu i editoren igen', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 6);
    ok('"Hent tilbage"-linjen er væk igen (intet mangler)', (await evaluate('return document.getElementById("exercise-restore").classList.contains("hidden")')) === true);

    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(350);

    const afterEdit = await evaluate(`
        ${readWorkouts}
        return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0,
                 hasNew: w[0] ? w[0].exercises.some(e => e.exerciseId === "ez_bar_curl") : false,
                 day: w[0] && w[0].day, variant: w[0] && w[0].variant };
    `);
    ok('Der er stadig kun én træning — ingen dublet', afterEdit.count === 1, JSON.stringify(afterEdit));
    ok('Id er uændret efter redigering', afterEdit.id === afterSave.id);
    ok('Datoen er uændret efter redigering', afterEdit.date === afterSave.date);
    ok('Træningen har nu 6 øvelser', afterEdit.ex === 6, `fik ${afterEdit.ex}`);
    ok('Den glemte øvelse ligger i den gemte træning', afterEdit.hasNew === true);
    ok('Dag og variant er bevaret', afterEdit.day === 'upper' && afterEdit.variant === afterSave.variant);
    ok('Redigeringstilstanden er forladt', (await evaluate('return document.getElementById("edit-banner").classList.contains("hidden")')) === true);
    ok('Knappen er tilbage til "Save workout"', (await evaluate('return document.getElementById("save-btn").textContent.includes("Save workout")')) === true);
    ok('Siden skubbes tilbage til normal afstand', (await evaluate('return getComputedStyle(document.querySelector(".app-container")).paddingBottom')) === '100px');

    // Historikken afspejler den opdaterede træning
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    ok('Historikken viser den tilføjede øvelse', (await evaluate('return document.getElementById("history-content").innerText.includes("Bicep Curl (EZ-bar)")')) === true);
    ok('Historikken viser nu 6 øvelser', (await evaluate('return /6 exercises/.test(document.querySelector("#history-content .history-workout-meta").textContent)')) === true);

    // Annuller må ikke skrive noget
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(300);
    await evaluate('document.querySelector("#exercise-list .remove-btn").click(); return true;');
    await sleep(250);
    ok('En øvelse kan fjernes under redigering', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 5);
    await evaluate('document.getElementById("edit-cancel").click(); return true;');
    await sleep(300);
    const afterCancel = await evaluate(`
        ${readWorkouts}
        return { count: w.length, ex: w[0] ? w[0].exercises.length : 0 };
    `);
    ok('Annuller efterlader træningen uændret (6 øvelser)', afterCancel.ex === 6 && afterCancel.count === 1, JSON.stringify(afterCancel));
    ok('Annuller lægger dagens program tilbage i listen', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) > 0);
    ok('Annuller skjuler banneret', (await evaluate('return document.getElementById("edit-banner").classList.contains("hidden")')) === true);
    ok('Gem-knappen er aktiv igen efter annullering (programmet er indlæst)', (await evaluate('return document.getElementById("save-btn").disabled')) === false);


    // ─── 11. Bevidst overskrivning (bekræftet ønsket) ─────────────
    // Gemmer man igen samme dag og dagstype, skal den gemte træning overskrives
    // frem for at der laves en ny. Bemærk at appen samtidig roterer til næste
    // A/B-variant, så den overskrevne træning får det program man indlæste.
    console.log('\n── 11. Gem igen samme dag overskriver i stedet for at dublere');
    await sleep(250);
    const variantNow = await evaluate('return (document.querySelector("#week-strip .week-chip.current")||{dataset:{}}).dataset.session.slice(-1)');
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(300);
    const afterResave = await evaluate(`
        ${readWorkouts}
        return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date,
                 ex: w[0] ? w[0].exercises.length : 0, variant: w[0] && w[0].variant };
    `);
    ok('Gem igen samme dag giver stadig kun én træning', afterResave.count === 1, JSON.stringify(afterResave));
    ok('Den overskrevne træning beholder id og dato', afterResave.id === afterSave.id && afterResave.date === afterSave.date);
    ok('Den overskrevne træning indeholder den netop gemte session', afterResave.ex > 0 && afterResave.variant === variantNow, `variant=${afterResave.variant} forventet=${variantNow}`);
    ok('Ingen dublet på samme dato og dagstype', (await evaluate(`
        ${readWorkouts}
        return w.filter(x => x.date === "${afterSave.date}" && x.day === "upper").length;
    `)) === 1);

    // ─── 12. Uge-opdelt deling ───────────────────────────────────
    console.log('\n── 12. Uge-opdelt deling med tegnbudget');

    ok('Appens funktioner er globale i browseren (som i test-harnesset)', (await evaluate('return typeof getProgram')) === 'function');

    // Fixture bygget af appens egne programmer, så øvelses-id'er ikke kan drive
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`
        const mk = (id, date, day, variant) => ({
            id, date, day, variant,
            exercises: getProgram(day, variant).map((item, idx) => ({
                exerciseId: item.exerciseId,
                sets: [0, 1, 2].map(n => ({ weight: 40 + idx * 5 + n * 2.5, reps: 8 })),
            })),
        });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([
            mk("u40a", "2026-09-28", "upper", "A"),
            mk("l40a", "2026-09-30", "lower", "A"),
            mk("u41b", "2026-10-05", "upper", "B"),
            mk("l41b", "2026-10-07", "lower", "B"),
        ]));
        return true;
    `);
    await load(URL_UNDER_TEST);

    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(300);

    const shareOpts = await evaluate(`
        const sel = document.getElementById("share-scope");
        return [...sel.options].map(o => ({ v: o.value, t: o.textContent }));
    `);
    ok('Delingsvinduet har en visnings-vælger', shareOpts.length === 4, JSON.stringify(shareOpts.map(o => o.v)));
    ok('Vælgeren tilbyder "kun nyt" når intet er delt', shareOpts[0].v === 'new' && /Only new since last \(4 workouts\)/.test(shareOpts[0].t), shareOpts[0] && shareOpts[0].t);
    ok('Vælgeren tilbyder begge uger', shareOpts.filter(o => o.v.startsWith('week:')).length === 2);
    ok('Vælgeren tilbyder alle uger', shareOpts[shareOpts.length - 1].v === 'all');
    const w40label = (shareOpts.find(o => o.v === 'week:2026-W40') || {}).t || '';
    ok('Uge-label viser interval og antal træninger', /Week 40 \(\d+\.\d+–\d+\.\d+\) · 2 workouts/.test(w40label), w40label);
    ok('Standardvisningen er "kun nyt siden sidst"', (await evaluate('return document.getElementById("share-scope").value')) === 'new');
    ok('Eksporten er under Discords 2.000 tegn', (await evaluate('return document.getElementById("share-text").value.length')) <= 2000);
    const sizeNew = await evaluate('return document.getElementById("share-size").textContent');
    ok('Tælleren bekræfter at den passer i én besked', /fits in one message/.test(sizeNew), sizeNew);

    // Vælg en bestemt uge
    await evaluate(`
        const sel = document.getElementById("share-scope");
        sel.value = "week:2026-W41";
        sel.dispatchEvent(new Event("change"));
        return true;
    `);
    await sleep(250);
    const weekText = await evaluate('return document.getElementById("share-text").value');
    ok('Valg af en uge viser kun den uge', weekText.includes('WEEK 41') && !weekText.includes('WEEK 40'));
    ok('Ugens træninger står i loggen', weekText.includes('5.10 UPPER B') && weekText.includes('7.10 LOWER B'), weekText.split('\n').slice(3, 5).join(' / '));
    ok('All-time-bedste følger med, så trenden ikke går tabt', weekText.includes('🏆 Best ever'));
    ok('Ugens eksport passer i én besked', weekText.length <= 2000, `${weekText.length} tegn`);
    ok('Tælleren viser tallet for den valgte uge', (await evaluate('return document.getElementById("share-size").textContent')).includes(String(weekText.length)));

    // Kopiér → automatisk markering af netop den viste uge
    await evaluate('document.getElementById("share-copy").click(); return true;');
    await sleep(400);
    const sharedState = await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return {
            total: w.length,
            shared: w.filter(x => x.sharedAt).length,
            onlyWeek41: w.filter(x => x.sharedAt).every(x => x.date >= "2026-10-05"),
        };
    `);
    ok('Kopiering markerer ugens 2 træninger som delt', sharedState.shared === 2, JSON.stringify(sharedState));
    ok('Kun den valgte uges træninger markeres', sharedState.onlyWeek41 === true);
    ok('Markeringen vises i vælgeren', (await evaluate(`
        const sel = document.getElementById("share-scope");
        return [...sel.options].find(o => o.value === "week:2026-W41").textContent;
    `)).includes('✓ shared'));

    // Genåbn: "kun nyt" tilbyder nu kun det resterende
    await evaluate('document.getElementById("share-modal-close").click(); return true;');
    await sleep(200);
    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(300);
    ok('Efter deling tilbyder "kun nyt" kun de resterende 2', /Only new since last \(2 workouts\)/.test(await evaluate(`
        const sel = document.getElementById("share-scope");
        return [...sel.options].map(o => o.textContent).join(" | ");
    `)));

    await evaluate('document.getElementById("share-copy").click(); return true;');
    await sleep(400);
    const afterAll = await evaluate(`
        const sel = document.getElementById("share-scope");
        return { values: [...sel.options].map(o => o.value), value: sel.value };
    `);
    ok('Når alt er delt, forsvinder "kun nyt" fra listen', !afterAll.values.includes('new'), JSON.stringify(afterAll.values));
    ok('Vælgeren falder tilbage til en uge i stedet for en tom visning', afterAll.value.startsWith('week:') || afterAll.value === 'all', afterAll.value);
    ok('Alle 4 træninger er nu markeret som delt', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return w.filter(x => x.sharedAt).length;
    `)) === 4);

    // Historikken viser markeringen
    await evaluate('document.getElementById("share-modal-close").click(); return true;');
    await sleep(200);
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(300);
    ok('Historikken viser at træningerne er delt', (await evaluate('return document.querySelectorAll("#history-content .shared-badge").length')) === 4);
    await evaluate('document.getElementById("close-history").click(); return true;');
    await sleep(200);

    // ─── 13. Programmet er dagens træning, uanset historik ────────
    // Programmets øvelser ER dagens træning. Historikken bestemmer kun hvilke vægte
    // der er lagt ind — ikke hvilke øvelser man ser.
    console.log('\n── 13. Programmet er dagens træning, uanset historik');

    // Fixture: én Upper-A-træning med KUN to af programmets øvelser. Resten har
    // dermed ingen historik og skal alligevel stå både i programmet og i dagens træning.
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([{
            id: "u_fil", date: "2026-09-28", day: "upper", variant: "A",
            exercises: [
                { exerciseId: "bench_press",  sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
                { exerciseId: "lat_pulldown", sets: [{ weight: 59, reps: 10 }, { weight: 59, reps: 10 }] },
            ],
        }]));
        return true;
    `);
    await load(URL_UNDER_TEST);

    ok('Appens databaser er globale i browseren (som i test-harnesset)', (await evaluate('return typeof ALL_EXERCISES')) === 'object');
    const progA = await evaluate('return getProgram("upper","A").length');

    // Rotationen foreslår nu B (sidste upper var A) — vis A, som har historikken
    await openSession('upperA');

    ok('Der er ingen særskilt programliste mere — bjælken viser pas, fokus og uge',
        (await evaluate('return document.getElementById("program-content") === null && !!document.getElementById("week-strip")')) === true);
    ok('Dagens træning er programmets øvelser, ikke kun dem med historik',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === progA);
    ok('Der er ikke længere en "Vis alle"-knap i programmet', (await evaluate('return document.getElementById("program-toggle")')) === null);
    // Den gamle "Næste uge"-liste er fjernet helt, med sin sektion og sin knap.
    ok('Næste-uge-sektionen findes ikke længere',
        (await evaluate('return document.getElementById("progressive-section") || document.getElementById("progressive-list") || document.getElementById("progressive-toggle")')) === null);
    // Historikken vises i stedet der hvor den hører: tallene på kortet. Programmets
    // anbefaling (65 kg) står ved siden af den vægt der er lagt ind fra sidst (60 kg).
    const prefill = await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        const card = cards.find(c => c.dataset.exerciseId === "bench_press");
        return {
            entered: card.querySelector(".set-weight").value,
            recommended: card.querySelector(".exercise-target").textContent,
            plan: programItems("upper", "A").find(i => i.exerciseId === "bench_press"),
        };
    `);
    ok('Kortet åbner med sidste uges vægt (60 kg) fra historikken', prefill.entered === '60', JSON.stringify(prefill));
    ok('Og anbefalingen fra programmet står ved siden af (den er planen, ikke historikken)',
        prefill.recommended.includes(`Recommended: ${prefill.plan.sets} × ${prefill.plan.reps} @ ${prefill.plan.weight} kg`) &&
        `${prefill.plan.weight}` !== prefill.entered, prefill.recommended.trim());

    // Dags-skift henter den nye dags program
    await openSession('lowerA');
    const lowerShown = await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length');
    const lowerActive = await evaluate('return getProgram("lower", (document.querySelector("#week-strip .week-chip.current")||{dataset:{}}).dataset.session.slice(-1)).length');
    ok('Lower viser hele sit program', lowerShown === lowerActive && lowerShown > 0, `${lowerShown} af ${lowerActive}`);
    ok('Dagens træning følger med til Lower', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === lowerActive);

    // Den nye knap (øvelsesnavnet) må ikke sprænge rækken på de smalle bredder.
    //
    // Bemærk: ved 390px dukker der en klassisk 35px scrollbar op i headless-
    // emuleringen, så dokumentets scrollWidth bliver 425 mens clientWidth er 390.
    // Det er en artefakt af emuleringen (rigtige mobiler bruger overlay-scrollbars
    // uden bredde), ikke et layoutproblem — vi måler derfor direkte på de
    // containere vi har ændret, og holder os til i-flow-indhold.
    for (const w of [320, 375, 390, 430]) {
        await S('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: true });
        await sleep(300);
        const fits = await evaluate(`
            const client = document.documentElement.clientWidth;
            const bar = document.querySelector(".session-bar").getBoundingClientRect();
            const btn = document.querySelector("#exercise-list .exercise-name-btn");
            const spill = [];
            for (const sel of [".session-bar", "#exercise-list"]) {
                for (const el of document.querySelectorAll(sel + " *")) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.right > client + 1) {
                        spill.push(sel + " > " + (el.id || el.className || el.tagName));
                    }
                }
            }
            return {
                client,
                headerRight: Math.round(bar.right),
                btnRight: btn ? Math.round(btn.getBoundingClientRect().right) : -1,
                btnHeight: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
                spill,
            };
        `);
        ok(`[${w}px] Bjælken og bytte-knappen holder sig inden for bredden`,
            fits.headerRight <= fits.client + 1 && fits.btnRight > 0 && fits.btnRight <= fits.client + 1,
            `bredde=${fits.client} header=${fits.headerRight} knap=${fits.btnRight}`);
        ok(`[${w}px] Intet indhold flyder over kanten`, fits.spill.length === 0, fits.spill.join(', '));
        ok(`[${w}px] Bytte-knappen er et gyldigt tap-target`, fits.btnHeight >= 28, `${fits.btnHeight}px`);
    }
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(200);

    // Kropsvægtøvelsen har et vægt-mærke i skabelonen (Back Extension = 1), så den
    // gemmes som en helt almindelig række i stedet for at falde ud af loggen.
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('lowerA');
    ok('Lower A er indlæst med Back Extension', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Back Extension")')) === true);
    ok('Kortet er præfyldt med mærket fra skabelonen (1 kg)', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "back_extension");
        return card.querySelector(".set-weight").value === String(programItems("lower", "A").find(i => i.exerciseId === "back_extension").weight);
    `)) === true);
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(450);
    ok('Den gemte træning indeholder Back Extension (den har et vægt-mærke)', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"))[0];
        return w.exercises.length > 0 && w.exercises.some(e => e.exerciseId === "back_extension");
    `)) === true);
    await load(URL_UNDER_TEST);
    await openSession('lowerA');
    const lowerAfter = await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId)');
    ok('Back Extension står stadig i programmet efter et gem', lowerAfter.includes('back_extension'), JSON.stringify(lowerAfter));
    ok('De udførte lower-øvelser er stadig med', lowerAfter.includes('leg_curl') && lowerAfter.includes('leg_press'), JSON.stringify(lowerAfter));
    ok('Hele Lower A-programmet vises (ingen skjulte øvelser)', lowerAfter.length === (await evaluate('return getProgram("lower","A").length')), JSON.stringify(lowerAfter));


    // ─── 14. Eksempeldata ─────────────────────────────────────────
    console.log('\n── 14. Eksempeldata til preview og test');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);

    ok('Knappen tilbyder at fylde eksempeldata ind', /Load sample data/.test(await evaluate('return document.getElementById("sample-btn").textContent')));
    ok('Blokken er synlig når loggen er tom', (await evaluate('return document.getElementById("sample-section").classList.contains("hidden")')) === false);
    ok('Noten forklarer hvad der sker', (await evaluate('return document.getElementById("sample-note").textContent')).length > 0);
    ok('Den er et gyldigt tap-target', (await evaluate('return Math.round(document.getElementById("sample-btn").getBoundingClientRect().height)')) >= 28);

    // Regression: knappen lå først 1746px nede i regler-modalen (som nu er væk), så
    // man skulle scrolle forbi otte afsnit for at finde den. Den ligger nu på
    // forsiden og skal være synlig uden at scrolle overhovedet.
    const sampleVisible = await evaluate(`
        const btn = document.getElementById("sample-btn");
        const br = btn.getBoundingClientRect();
        return {
            synligIViewport: br.height > 0 && br.top >= 0 && br.bottom <= window.innerHeight,
            afstandFraTop: Math.round(br.top),
            viewportHoejde: window.innerHeight,
            ingenModal: !document.getElementById("rules-modal"),
        };
    `);
    ok('Knappen er synlig på forsiden uden at scrolle', sampleVisible.synligIViewport === true, JSON.stringify(sampleVisible));
    ok('Der er ingen modal at gemme sig i', sampleVisible.ingenModal === true);

    await evaluate('document.getElementById("sample-btn").click(); return true;');
    await sleep(450);
    const seeded = await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        return { count: w.length, allSample: w.every(x => x.sample === true), days: [...new Set(w.map(x => x.day))].sort().join(",") };
    `);
    ok('Eksempeldata lægges ind (12 træninger)', seeded.count === 12, JSON.stringify(seeded));
    ok('Alle er markeret som eksempeldata', seeded.allSample === true);
    ok('Begge dage får historik', seeded.days === 'lower,upper', seeded.days);
    ok('Knappen skifter til at kunne rydde igen', /Clear sample data/.test(await evaluate('return document.getElementById("sample-btn").textContent')));

    // Pointen med funktionen: med historik kan man se virkningen med det samme i en
    // frisk browser — programmet åbner med sidste (eksempel-)uges vægte, og rotationen
    // foreslår den næste variant.
    await load(URL_UNDER_TEST);
    const seededPrefill = await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        return {
            entered: Number(card.querySelector(".set-weight").value),
            hint: document.getElementById("variant-hint").textContent,
        };
    `);
    ok('Med eksempeldata åbner programmet med vægte fra historikken', seededPrefill.entered > 0, JSON.stringify(seededPrefill));
    ok('Og rotationen foreslår den næste variant (ikke et selvvalgt)', seededPrefill.hint === 'suggested', seededPrefill.hint);

    // Sikkerheden: så snart der ligger én rigtig træning, må knappen ikke kunne bruges
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([{
            id: "rigtig_1", date: "2026-09-28", day: "upper", variant: "A",
            exercises: [{ exerciseId: "bench_press", sets: [{ weight: 60, reps: 8 }] }],
        }]));
        return true;
    `);
    await load(URL_UNDER_TEST);
    ok('Med en rigtig træning skjules hele blokken', (await evaluate('return document.getElementById("sample-section").classList.contains("hidden")')) === true);
    ok('Knappen er deaktiveret', (await evaluate('return document.getElementById("sample-btn").disabled')) === true);
    ok('Blokken fylder intet i den daglige visning', (await evaluate('return Math.round(document.getElementById("sample-section").getBoundingClientRect().height)')) === 0);
    await evaluate('document.getElementById("sample-btn").click(); return true;');
    await sleep(300);
    ok('Et klik ændrer ikke de rigtige data', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return w.length === 1 && w[0].id === "rigtig_1" && !w[0].sample;
    `)) === true);
    // ─── 15. Bytte-listerne og kortene for hele programmet ────────
    // Datadrevet med vilje: vi gennemløber programmerne i stedet for at skrive en test
    // pr. øvelse. En ny øvelse kræver derfor kun en række i EXERCISES og en cue —
    // ingen nye tests. Skal der tjekkes mere, så gør det som et løb over dataene,
    // ikke som endnu en håndskrevet liste af id'er.
    console.log('\n── 15. Bytte-listerne og kortene for hele programmet');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);

    for (const day of ['upper', 'lower']) {
        for (const variant of ['A', 'B']) {
            // Ugebjælkens felt er både dag og variant: at gå gennem alle fire pas
            // er det samme som at gå gennem hele programmet.
            await openSession(`${day}${variant}`);

            const sweep = await evaluate(`
                const day = ${JSON.stringify(day)};
                const variant = ${JSON.stringify(variant)};
                const items = getProgram(day, variant);
                const out = { rows: [], cards: [], items: items.map(i => i.exerciseId) };

                // Kortene: cue, opvarmning og anbefaling skal være det reglerne siger
                for (const card of document.querySelectorAll("#exercise-list .exercise-card")) {
                    const name = card.querySelector(".exercise-name, .exercise-name-btn").textContent.replace("\u25be", "").trim();
                    const ex = ALL_EXERCISES[day].find(e => e.name === name);
                    const weight = Number(card.querySelector(".set-weight").value);
                    out.cards.push({
                        id: ex ? ex.id : null,
                        cue: card.querySelector(".cue-line").textContent.trim(),
                        expectedCue: ex && exerciseCue(ex) ? "💡 " + exerciseCue(ex) : "",
                        expectedWarmup: ex ? warmupSets(weight, ex).map(s => s.weight + " × " + s.reps) : [],
                        shownWarmup: [...card.querySelectorAll(".warmup-block .warmup-set")].map(s => s.textContent.trim()),
                        plan: (card.querySelector(".exercise-target") || { textContent: "" }).textContent.trim(),
                        sets: card.querySelectorAll(".set-weight").length,
                    });
                }

                // Øvelserne: bytte-listen skal være de øvelser der deler mindst én
                // muskelgruppe (Quads og Quads/Glutes hører sammen), minus det der
                // allerede står i dagens træning, med øvelsen selv øverst og fuld
                // match før delvis match.
                // Vigtigt: hvert klik på et navn tegner listen om, så elementerne fra en
                // opsamlet liste er derefter løsrevet fra dokumentet — et klik på en
                // løsrevet knap når ikke den delegerede lytter. Derfor slås kortet op
                // på sit id hver gang, i stedet for at genbruge en gammel reference.
                const cardById = id => [...document.querySelectorAll("#exercise-list .exercise-card")]
                    .find(c => c.dataset.exerciseId === id);
                const inSession = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
                for (const id of programItems(day, variant).map(i => i.exerciseId)) {
                    const card = cardById(id);
                    const ex = ALL_EXERCISES[day].find(e => e.id === id);
                    const groups = m => String(m).split("/").map(s => s.trim()).filter(Boolean);
                    const shares = (a, b) => groups(b).some(g => groups(a).includes(g));
                    const expected = ALL_EXERCISES[day]
                        .filter(e => shares(e.muscle, ex.muscle) && e.id !== "romanian_deadlift" &&
                            (e.id === id || !inSession.includes(e.id)))
                        .sort((a, b) => {
                            if (a.id === id) return -1;
                            if (b.id === id) return 1;
                            return (a.muscle === ex.muscle ? 0 : 1) - (b.muscle === ex.muscle ? 0 : 1);
                        })
                        .map(e => e.id);
                    const btn = card.querySelector(".exercise-name-btn");
                    let opts = null;
                    if (btn) {
                        btn.click();
                        opts = [...cardById(id).querySelectorAll(".swap-option")].map(o => ({
                            id: o.dataset.swapId,
                            name: o.querySelector(".swap-option-name").textContent.trim(),
                            current: o.classList.contains("current"),
                            muscle: (ALL_EXERCISES[day].find(e => e.id === o.dataset.swapId) || {}).muscle,
                        }));
                        cardById(id).querySelector(".exercise-name-btn").click();
                    }
                    const fresh = cardById(id);
                    out.rows.push({
                        id,
                        muscle: ex.muscle,
                        hasButton: !!btn,
                        opts,
                        expected,
                        label: (fresh.querySelector(".exercise-target") || { textContent: "" }).textContent.trim(),
                        note: (fresh.querySelector(".cue-line") || { textContent: "" }).textContent.trim(),
                    });
                }
                return out;
            `);

            const badCue = sweep.cards.filter(c => !c.id || c.cue !== c.expectedCue).map(c => c.id).join(', ');
            ok(`${day}${variant}: hvert kort viser øvelsens egen cue`, badCue === '', badCue);
            ok(`${day}${variant}: opvarmningen på kortet er den reglerne giver`,
                sweep.cards.every(c => JSON.stringify(c.shownWarmup) === JSON.stringify(c.expectedWarmup)),
                sweep.cards.filter(c => JSON.stringify(c.shownWarmup) !== JSON.stringify(c.expectedWarmup))
                    .map(c => `${c.id}: [${c.expectedWarmup}] ≠ [${c.shownWarmup}]`).join(' · '));
            ok(`${day}${variant}: hvert kort viser hvad programmet anbefaler`,
                sweep.cards.every(c => /^🎯 Recommended: \d+ × \d+/.test(c.plan)),
                sweep.cards.map(c => `${c.id}:${c.plan}`).join(' · '));
            ok(`${day}${variant}: listen viser præcis dagens øvelser`,
                sweep.rows.map(r => r.id).join(',') === sweep.items.join(','),
                `${sweep.rows.map(r => r.id).join(',')} vs ${sweep.items.join(',')}`);
            ok(`${day}${variant}: hvert kort viser sit mål og sin teknik-linje`,
                sweep.rows.every(r => /\d+ × \d+/.test(r.label)),
                sweep.rows.filter(r => !/\d+ × \d+/.test(r.label)).map(r => r.id).join(', '));
            ok(`${day}${variant}: bytte-listen er hele muskelgruppen (minus dagens træning)`,
                sweep.rows.every(r => !r.hasButton ||
                    (r.opts.map(o => o.id).join(',') === r.expected.join(',') && r.opts.filter(o => o.current).length === 1)),
                sweep.rows.filter(r => r.hasButton &&
                    (r.opts.map(o => o.id).join(',') !== r.expected.join(',') || r.opts.filter(o => o.current).length !== 1))
                    .map(r => `${r.id}: [${r.opts.map(o => o.id)}] ≠ [${r.expected}]`).join(' · '));
            ok(`${day}${variant}: en bytte-knap findes kun når der er noget at bytte til`,
                sweep.rows.every(r => r.hasButton === (r.expected.length > 1)),
                sweep.rows.filter(r => r.hasButton !== (r.expected.length > 1)).map(r => r.id).join(', '));
            ok(`${day}${variant}: alle valg i bytte-listen deler en muskelgruppe med øvelsen`,
                sweep.rows.every(r => !r.hasButton ||
                    r.opts.every(o => o.muscle.split('/').map(s => s.trim())
                        .some(g => r.muscle.split('/').map(s => s.trim()).includes(g)))),
                sweep.rows.filter(r => r.hasButton && r.opts.some(o => !o.muscle.split('/').map(s => s.trim())
                    .some(g => r.muscle.split('/').map(s => s.trim()).includes(g))))
                    .map(r => `${r.id}: ${r.opts.map(o => o.id + '=' + o.muscle).join(', ')}`).join(' · '));
            ok(`${day}${variant}: bytte-listen rummer ikke Romanian Deadlift`,
                sweep.rows.every(r => !r.hasButton || !r.opts.some(o => o.id === 'romanian_deadlift')));
        }
    }

    // Antallet af øvelser pr. dag er loftet, ikke et mål: programmet fylder ikke op selv
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    ok('Dagens træning har højst MAX_PER_DAY øvelser', (await evaluate(`
        let worst = 0;
        for (const day of ["upper", "lower"]) {
            for (const variant of ["A", "B"]) {
                worst = Math.max(worst, getProgram(day, variant).length);
            }
        }
        return worst <= MAX_PER_DAY && worst > 0;
    `)) === true);

    // ─── 16. Programmet husker vægte og sæt fra sidste gang ───────
    console.log('\n── 16. Programmet husker vægte og sæt fra sidste gang');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('lowerB');

    ok('Uden historik vises skabelonens tal', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_curl");
        const plan = programItems("lower", "B").find(i => i.exerciseId === "leg_curl");
        return card.querySelector(".exercise-target").textContent.includes("Recommended: " + plan.sets + " × " + plan.reps + " @ " + plan.weight + " kg");
    `)) === true, await evaluate(`
        return document.querySelector("#exercise-list .exercise-card .exercise-target").textContent.trim();
    `));
    ok('Uden historik fortæller linjen at det er programmet',
        /Your Lower B program/.test(await evaluate('return document.getElementById("program-memory").textContent')));
    ok('Programmet er lagt ind som dagens træning',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === (await evaluate('return getProgram("lower","B").length')));

    // Kør en træning: ret vægten, fjern den sidste øvelse, gem
    const templateCount = await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length');
    await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        cards[cards.length - 1].querySelector(".remove-btn").click();
        const w = document.querySelectorAll("#exercise-list .exercise-card .set-weight")[0];
        w.value = "99";
        w.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    `);
    await sleep(300);
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(450);
    ok('Træningen er gemt med én øvelse færre', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return w.length === 1 && w[0].variant === "B" && w[0].exercises.length === ${templateCount - 1};
    `)) === true);

    // Næste gang: samme øvelser og vægte som sidst — uden at man bygger noget op
    await load(URL_UNDER_TEST);
    await openSession('lowerB');
    ok('Programmet er stadig hele skabelonen (den fjernede øvelse er tilbage)',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === templateCount);
    ok('Den rettede vægt er husket (99 kg)',
        (await evaluate('return document.querySelector("#exercise-list .exercise-card .set-weight").value')) === '99');
    ok('"Husker"-linjen vises nu', (await evaluate('return document.getElementById("program-memory").classList.contains("hidden")')) === false);
    ok('Og den siger hvilken træning og hvilken dag',
        /Same exercises and weights as your Lower B on/.test(await evaluate('return document.getElementById("program-memory").textContent')),
        await evaluate('return document.getElementById("program-memory").textContent'));
    // Anbefalingen er programmets tal, også når man har løftet noget andet: den skal
    // kunne ses mens man retter tallene, og den flytter sig ikke med dem.
    ok('Anbefalingen på kortet er programmets tal, ikke det man tastede', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        const plan = programItems("lower", "B").find(i => i.exerciseId === "leg_curl");
        const t = card.querySelector(".exercise-target").textContent;
        return t.includes("Recommended: " + plan.sets + " × " + plan.reps + " @ " + plan.weight + " kg")
            && card.querySelector(".set-weight").value === "99";
    `)) === true, await evaluate('return document.querySelector("#exercise-list .exercise-card .exercise-target").textContent.trim()'));
    ok('Alle kort viser programmets mål (de flytter sig ikke med det man taster)', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        const plan = programItems("lower", "B");
        return cards.every((c, i) => c.querySelector(".exercise-target").textContent
            .includes("Recommended: " + plan[i].sets + " × " + plan[i].reps + " @ " + plan[i].weight + " kg"));
    `)) === true);


    // ─── 16b. Ugen: hvad der er klaret, og låsen mod to ens pas ────
    // Han skal kunne se hvor i ugen han er, og appen skal ikke lade ham gemme
    // samme dag+variant to gange i samme uge.
    console.log('\n── 16b. Ugen: status, næste pas og låsen');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    ok('Ugebjælken viser fire pas og ugenummeret', (await evaluate(`
        const chips = [...document.querySelectorAll("#week-strip .week-chip")];
        const label = document.querySelector("#week-strip .week-label").textContent;
        return chips.length === 4 && /Week \\d+/.test(label)
            && chips.map(c => c.textContent.replace(/✓|next/g, "").trim()).join(",") === "Upper A,Lower A,Upper B,Lower B";
    `)) === true, await evaluate('return document.getElementById("week-strip").innerText'));
    ok('Med en tom log er intet pas klaret, og det første står som næste', (await evaluate(`
        const chips = [...document.querySelectorAll("#week-strip .week-chip")];
        return chips.every(c => !c.classList.contains("done"))
            && chips.filter(c => c.classList.contains("next")).length === 1
            && document.querySelector("#week-strip .week-chip.next").dataset.session === "upperA";
    `)) === true);

    // Gem dagens pas, og se det blive krydset af i ugen
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(450);
    ok('Det gemte pas står som klaret i ugen', (await evaluate(`
        const chip = [...document.querySelectorAll("#week-strip .week-chip")].find(c => c.dataset.session === "upperA");
        return chip.classList.contains("done") && chip.textContent.includes("✓");
    `)) === true, await evaluate('return document.getElementById("week-strip").innerText'));
    ok('A/B-knappen for den variant viser også at den er klaret', (await evaluate(`
        return document.querySelector('#week-strip .week-chip[data-session="upperA"]').classList.contains("done");
    `)) === true);
    ok('Næste pas i ugen er et ben-pas (overkrop lige lavet)', (await evaluate(`
        const next = document.querySelector("#week-strip .week-chip.next");
        return !!next && next.dataset.session.indexOf("lower") === 0;
    `)) === true, await evaluate('return document.getElementById("week-strip").innerText'));

    // Låsen: et pas fra en anden dag i samme uge må ikke gemmes igen
    await evaluate(`
        const t = new Date();
        const d = mondayOf(t);
        if (isoDate(d) === isoDate(t)) d.setDate(d.getDate() + 1); // en anden dag i samme uge
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        w.push({ id: "w_week_dupe", date: isoDate(d), day: "upper", variant: "B", exercises: [
            { exerciseId: "chest_supported_row", sets: [{ weight: 24, reps: 12 }] }] });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify(w));
        return isoDate(d);
    `);
    await load(URL_UNDER_TEST);
    await openSession('upperB');
    ok('Upper B er markeret som klaret i ugen', (await evaluate(`
        return document.querySelector('#week-strip .week-chip[data-session="upperB"]').classList.contains("done");
    `)) === true);
    ok('Advarslen står ved passet, med dagens navn', (await evaluate(`
        const w = document.getElementById("session-warning");
        return !w.classList.contains("hidden") && /Upper B is already logged this week/.test(w.textContent);
    `)) === true, await evaluate('return document.getElementById("session-warning").innerText'));
    ok('Advarslen tilbyder det pas der mangler', (await evaluate(`
        const b = document.getElementById("btn-next-session");
        return !!b && /Go to/.test(b.textContent);
    `)) === true, await evaluate('return (document.getElementById("btn-next-session")||{}).textContent'));
    ok('Gem-knappen fortæller at passet er låst', (await evaluate(`
        return /already logged this week/.test(document.getElementById("save-info").textContent);
    `)) === true, await evaluate('return document.getElementById("save-info").textContent'));

    const countBefore = await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length');
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(400);
    ok('Et låst pas kan ikke gemmes (ingen ny træning)', (await evaluate(`
        return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length;
    `)) === countBefore);
    ok('Man får en forklaring i stedet', /already logged/.test(await evaluate('return document.querySelector(".toast") ? document.querySelector(".toast").textContent : ""')),
        await evaluate('return document.querySelector(".toast") ? document.querySelector(".toast").textContent : "(ingen toast)"'));

    // "Log anyway" lukker op for dem der bevidst vil køre passet igen
    await evaluate('document.getElementById("btn-log-anyway").click(); return true;');
    await sleep(300);
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(450);
    ok('"Log anyway" gør det muligt at gemme alligevel', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        const today = w.filter(x => x.date === isoDate(new Date()));
        return today.length === 1 && today[0].variant === "B" && today[0].day === "upper";
    `)) === true, await evaluate(`
        return JSON.parse(localStorage.getItem("gym_tracker_workouts")).map(x => x.date + " " + x.day + x.variant).join(" | ");
    `));
    ok('Advarslen er væk igen efter et gem', (await evaluate(`
        return document.getElementById("session-warning").classList.contains("hidden");
    `)) === true);

    // Et chip i ugebjælken skifter pas
    await evaluate(`
        const chip = [...document.querySelectorAll("#week-strip .week-chip")].find(c => c.dataset.session === "lowerB");
        chip.click();
        return true;
    `);
    await sleep(350);
    ok('Et chip i ugebjælken skifter til det pas', (await evaluate(`
        return document.getElementById("session-label").textContent === "Lower B"
            && (document.querySelector("#week-strip .week-chip.current")||{dataset:{}}).dataset.session === "lowerB";
    `)) === true, await evaluate('return document.getElementById("session-label").textContent'));
    ok('Fokus-linjen skifter med passet', (await evaluate(`
        return document.getElementById("session-focus").textContent === SESSION_FOCUS.lowerB;
    `)) === true, await evaluate('return document.getElementById("session-focus").textContent'));


    console.log('\n── 17. Coach notes-panelet');
    await load(URL_UNDER_TEST);
    // Netværket stubber vi: testen skal ikke afhænge af, at gisten svarer.
    await evaluate(`
        window.__notesCalls = [];
        const md = '# Coach notes\\n\\n## Week 41 · 5–11 Oct 2026\\n\\n**Load up**\\n- Bench Press 65×8×3 → 67.5×6-8\\n';
        window.fetch = (url, opts) => {
            window.__notesCalls.push({ url: url, cache: opts && opts.cache });
            return Promise.resolve({ ok: true, status: 200,
                json: () => Promise.resolve({ files: { 'weekly-notes.md': { content: md, truncated: false } } }),
                text: () => Promise.resolve(md) });
        };
        return true;
    `);
    ok('Noterne hentes ikke ved indlæsning (kun når panelet åbnes)',
        (await evaluate('return window.__notesCalls.length')) === 0);

    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(400);
    ok('Panelet åbner', (await evaluate('return document.getElementById("notes-panel").classList.contains("open")')) === true);
    ok('Overlejringen vises med panelet', (await evaluate('return document.getElementById("notes-overlay").classList.contains("open")')) === true);
    ok('Noterne hentes fra gist-API\'et, ikke raw-linket (raw kan vise den forrige uge)',
        /^https:\/\/api\.github\.com\/gists\/[0-9a-f]+$/.test((await evaluate('return window.__notesCalls[0].url')) || ''),
        JSON.stringify(await evaluate('return window.__notesCalls')));
    ok('Hentningen beder om at omgå cachen',
        (await evaluate('return window.__notesCalls[0].cache')) === 'no-store');
    ok('Ugen vises med overskrift', (await evaluate('return document.getElementById("notes-content").textContent')).includes('Week 41 · 5–11 Oct 2026'));
    ok('Punkterne vises som liste', (await evaluate('return document.querySelectorAll("#notes-content .notes-list li").length')) === 1);
    ok('Punktet står med fed sektion ovenover', (await evaluate('return document.querySelectorAll("#notes-content .notes-list li")[0].textContent')).includes('Bench Press 65×8×3'));
    ok('Noterne er ikke HTML-injiceret', (await evaluate('return document.querySelectorAll("#notes-content .notes-week").length')) === 1);
    ok('Kortet er ikke i vejen: historik-panelet er lukket',
        (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === false);

    await evaluate('document.getElementById("close-notes").click(); return true;');
    await sleep(300);
    ok('Panelet lukker med ✕', (await evaluate('return document.getElementById("notes-panel").classList.contains("open")')) === false);

    // Overlejringen lukker også, og Escape skal virke som i historikken
    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(300);
    await evaluate('document.getElementById("notes-overlay").click(); return true;');
    await sleep(300);
    ok('Klik på baggrunden lukker panelet', (await evaluate('return document.getElementById("notes-panel").classList.contains("open")')) === false);

    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(300);
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); return true;');
    await sleep(300);
    ok('Escape lukker panelet', (await evaluate('return document.getElementById("notes-panel").classList.contains("open")')) === false);

    // Død forbindelse: appen skal kunne bruges, og panelet sige det med ord
    await evaluate(`
        window.fetch = () => Promise.reject(new Error("offline"));
        return true;
    `);
    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(400);
    ok('Død forbindelse giver en besked i panelet, ikke en tom rude',
        (await evaluate('return document.getElementById("notes-content").textContent')).includes('Could not load the notes'));
    ok('Og appen virker stadig bagefter (dagens øvelser tegnes, knapperne svarer)',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) > 0
        && (await evaluate(`
            const chip = document.querySelector('#week-strip .week-chip[data-session="lowerB"]');
            chip.click();
            return document.querySelector("#session-label").textContent === 'Lower B';
        `)) === true);
    await evaluate('document.getElementById("close-notes").click(); return true;');
    await sleep(250);
    ok('Ingen JS-fejl fra notes-panelet', pageErrors.length === 0, JSON.stringify(pageErrors));

    // ─── 18. Byt en øvelse mens en gemt træning redigeres ─────────
    // Klage: efter "Save" → historik → Rediger kunne Leg Press ikke byttes, mens
    // det virkede fint i en ny træning. Redigeringstilstanden må ikke låse byttet.
    console.log('\n── 18. Bytte under redigering af en gemt træning');
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('lowerB');
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(400);

    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    ok('Redigering af Lower B indlæser træningen',
        (await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).includes("leg_press")')) === true);

    const editSwap = await evaluate(`
        const byId = id => [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === id);
        const card = byId("leg_press");
        const btn = card && card.querySelector(".exercise-name-btn");
        if (!btn) return { hasButton: false, opts: [] };
        btn.click();
        const after = byId("leg_press");
        const opts = [...after.querySelectorAll(".swap-option")].map(o => o.dataset.swapId);
        const option = [...after.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "bulgarian_split");
        if (option) option.click();
        return { hasButton: true, opts, clicked: !!option };
    `);
    ok('Leg Press har stadig en bytte-knap under redigering', editSwap.hasButton === true, JSON.stringify(editSwap));
    ok('Bytte-listen under redigering rummer Bulgarian Split Squat', editSwap.opts.includes('bulgarian_split'), JSON.stringify(editSwap.opts));
    await sleep(300);
    ok('Valget skifter øvelsen på kortet under redigering',
        (await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).includes("bulgarian_split")')) === true,
        await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).join(",")'));

    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(400);
    ok('Opdateringen gemmer den byttede øvelse i den gemte træning',
        (await evaluate(`
            const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
            return w.length === 1 && w[0].exercises.some(e => e.exerciseId === "bulgarian_split") &&
                !w[0].exercises.some(e => e.exerciseId === "leg_press");
        `)) === true,
        await evaluate('return JSON.stringify((JSON.parse(localStorage.getItem("gym_tracker_workouts")||"[]")[0]||{}).exercises?.map(e=>e.exerciseId))'));

    // ─── 18b. Husket bytte + gammel gemt træning ──────────────────
    // Har man byttet Leg Press væk i programmet, viser et ældre gemt pas stadig Leg
    // Press. Kortet skal kunne byttes alligevel — det var det der ikke virkede.
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await openSession('lowerB');
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(400);
    // Efter gem rykker appen til næste pas i ugen — tilbage til Lower B, som er det
    // gemte pas, byttet skal ramme.
    await openSession('lowerB');
    // Byt Leg Press væk i selve programmet (huskes for lowerB)
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press");
        card.querySelector(".exercise-name-btn").click();
        return true;
    `);
    await sleep(250);
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press");
        [...card.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "lunges").click();
        return true;
    `);
    await sleep(300);
    const programSwapIds = await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).join(",")');
    ok('Programmet husker byttet (Leg Press → Lunges)', programSwapIds.includes('lunges'), programSwapIds);

    // Åbn den gamle træning (den indeholder stadig Leg Press) og prøv at bytte den
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    const oldSweep = await evaluate(`
        const byId = id => [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === id);
        const card = byId("leg_press");
        const btn = card && card.querySelector(".exercise-name-btn");
        if (!btn) return { hasButton: false, opts: [] };
        btn.click();
        const after = byId("leg_press");
        return { hasButton: true, opts: [...after.querySelectorAll(".swap-option")].map(o => o.dataset.swapId) };
    `);
    ok('Leg Press i en ældre gemt træning har stadig en bytte-knap', oldSweep.hasButton === true, JSON.stringify(oldSweep));
    ok('Bytte-listen virker selv om programmet er byttet videre', oldSweep.opts.includes('bulgarian_split'), JSON.stringify(oldSweep.opts));

    // Og valget skal faktisk skifte kortet i den gemte træning
    await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press");
        [...card.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "bulgarian_split").click();
        return true;
    `);
    await sleep(300);
    ok('Valget skifter Leg Press i den ældre træning',
        (await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).join(",")')) .includes('bulgarian_split'),
        await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId).join(",")'));
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(400);
    ok('Opdateringen gemmer det nye bytte i den ældre træning',
        (await evaluate(`
            const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
            return w.length === 1 && w[0].exercises.some(e => e.exerciseId === "bulgarian_split") &&
                !w[0].exercises.some(e => e.exerciseId === "leg_press");
        `)) === true,
        await evaluate('return JSON.stringify((JSON.parse(localStorage.getItem("gym_tracker_workouts")||"[]")[0]||{}).exercises?.map(e=>e.exerciseId))'));

    const smallBtns = await evaluate(`
        const btns = [...document.querySelectorAll("button")].filter(b => b.offsetParent !== null);
        return btns.filter(b => b.getBoundingClientRect().height < 28)
                   .map(b => (b.id || b.className) + "=" + Math.round(b.getBoundingClientRect().height) + "px");
    `);
    ok(`Alle synlige knapper er mindst 28px høje (${smallBtns.length} for små)`, smallBtns.length === 0, smallBtns.join(', '));

    // ─── 19. Felt-fontstørrelse (iOS zoomer ind under 16px) ──────
    // iOS Safari zoomer hele siden ind, når et felt med font-size under 16px får fokus,
    // og bliver hængende i det zoom. Testen måler den BEREGNEDE størrelse (ikke kilden),
    // så en fremtidig "lidt mindre font" i styles.css ikke kan genindføre zoomet i stilhed.
    // Løsningen er fontstørrelsen, ikke user-scalable=no/maximum-scale: det slår
    // pinch-zoom fra for alle og ignoreres alligevel af nyere iOS.
    console.log('\n── 19. Felt-fontstørrelse (iOS fokus-zoom)');

    const viewportMeta = await evaluate('return document.querySelector("meta[name=\\"viewport\\"]").content;');
    ok('Viewporten forbyder ikke zoom (ingen maximum-scale/user-scalable=no)',
        !/maximum-scale|user-scalable\s*=\s*no/i.test(viewportMeta), viewportMeta);

    const maalFelter = async (hvor) => {
        const fields = await evaluate(`
            return [...document.querySelectorAll("input, select, textarea")]
                .filter(f => f.offsetParent !== null)
                .map(f => ({ felt: (f.id || f.className || f.tagName.toLowerCase()), px: parseFloat(getComputedStyle(f).fontSize) }));
        `);
        const smaa = fields.filter(x => !(x.px >= 16));
        ok(`Intet synligt felt under 16px i "${hvor}" (${fields.length} målt)`, smaa.length === 0,
            smaa.map(x => `${x.felt}=${x.px}px`).join(', '));
        return fields.length;
    };

    const antalKortFelter = await maalFelter('træningskortene');
    ok('Der blev faktisk målt nogle felter på kortene', antalKortFelter > 0, String(antalKortFelter));

    // 16px i et sæt-tabel kan presse kolonnerne, så siden får vandret scroll — det ville
    // være en dårligere kur end zoomet.
    const overflow = await evaluate(`
        return {
            sideBredde: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            tabelOver: [...document.querySelectorAll("#exercise-list .sets-table")]
                .filter(t => t.scrollWidth > t.clientWidth + 1)
                .map(t => (t.closest(".exercise-card") || {}).dataset ? t.closest(".exercise-card").dataset.exerciseId : "tabel"),
        };
    `);
    ok('De større felter giver ingen vandret overflow',
        overflow.sideBredde <= overflow.viewport + 1 && overflow.tabelOver.length === 0, JSON.stringify(overflow));

    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(250);
    await maalFelter('deling af træning');
    await evaluate('document.getElementById("share-modal-close").click(); return true;');
    await sleep(200);

    // ─── 20. Det tastede huskes hvis appen genindlæses ────────────
    // Selve fejlen: midt i et sæt genindlæser telefonen siden (fanen smides ud, eller
    // man kommer til at trække nedad), og alt det tastede var væk og skulle tastes
    // igen. Tallene skal derfor ligge i localStorage mens man taster, og lægges
    // tilbage når appen åbner igen uden at træningen blev gemt.
    console.log('\n── 20. Det tastede huskes hvis appen genindlæses');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);

    const skriv = async (sel, value) => evaluate(`
        const el = document.querySelector(${JSON.stringify(sel)});
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    `);
    const firstWeight = '#exercise-list .exercise-card:first-child .set-weight';
    const firstReps = '#exercise-list .exercise-card:first-child .set-reps';
    const foersteOevelse = await evaluate('return programItems("upper", "A")[0].exerciseId');
    const nulstilFelt = async () => evaluate(`
        const el = document.querySelector(${JSON.stringify(firstWeight)});
        return el ? el.value : null;
    `);

    await skriv(firstWeight, '87.5');
    await skriv(firstReps, '9');
    await sleep(700); // debouncen skal have skrevet ned

    const draftEfterTastning = await evaluate('return localStorage.getItem("gym_tracker_draft")');
    ok('Det tastede skrives ned mens man taster (før man gemmer)',
        !!draftEfterTastning
        && JSON.parse(draftEfterTastning).upperA
        && JSON.parse(draftEfterTastning).upperA.exercises[0].sets[0].weight === 87.5
        && JSON.parse(draftEfterTastning).upperA.exercises[0].sets[0].reps === 9,
        String(draftEfterTastning).slice(0, 180));
    ok('Og appen viser at det tastede ligger gemt (linjen under gem-linjen)', (await evaluate(`
        const el = document.getElementById("draft-note");
        return !!el && !el.classList.contains("hidden") && /Kept if the page reloads/.test(el.textContent);
    `)) === true, await evaluate('return (document.getElementById("draft-note")||{}).textContent || "ingen linje"'));

    // Genindlæsningen — det er her tallene forsvandt før
    await load(URL_UNDER_TEST);
    ok('Vægten står der igen efter genindlæsning',
        (await evaluate(`return document.querySelector("${firstWeight}").value`)) === '87.5',
        String(await nulstilFelt()));
    ok('Reps står der igen efter genindlæsning',
        (await evaluate(`return document.querySelector("${firstReps}").value`)) === '9');
    ok('Appen siger at den har lagt det tastede tilbage',
        /Restored what you had typed/.test(await evaluate('return document.getElementById("toast-container").textContent')));
    ok('Og linjen om at det er gemt står der stadig efter genindlæsningen', (await evaluate(`
        const el = document.getElementById("draft-note");
        return !!el && !el.classList.contains("hidden") && /Kept if the page reloads/.test(el.textContent);
    `)) === true);
    ok('Hele passet er med, ikke kun det felt man nåede at rette',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length'))
            === (await evaluate('return programItems("upper", "A").length')));
    ok('Anbefalingslinjen er stadig programmets tal (ikke det tastede)',
        (await evaluate(`
            const card = document.querySelector("#exercise-list .exercise-card");
            const plan = programItems("upper", "A")[0];
            return card.querySelector(".exercise-target").textContent.includes("Recommended: " + plan.sets + " × " + plan.reps + " @ " + plan.weight + " kg");
        `)) === true);

    // Siden kan forsvinde uden varsel: så skrives der med det samme, uden at vente
    // på debouncen (et træk nedad genindlæser siden, og fanen kan smides ud).
    await evaluate('localStorage.removeItem("gym_tracker_draft"); return true;');
    await skriv(firstWeight, '92.5');
    await evaluate('window.dispatchEvent(new Event("pagehide")); return true;');
    const draftVedPagehide = await evaluate('return localStorage.getItem("gym_tracker_draft")');
    ok('Når siden forsvinder, skrives det tastede ned med det samme',
        !!draftVedPagehide && JSON.parse(draftVedPagehide).upperA.exercises[0].sets[0].weight === 92.5,
        String(draftVedPagehide).slice(0, 180));

    ok('Et træk nedad genindlæser ikke siden (pull-to-refresh slået fra i CSS)',
        (await evaluate('return getComputedStyle(document.body).overscrollBehaviorY')) === 'contain');

    // Et pas der er gemt, er ikke længere et udkast
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(500);
    ok('Træningen blev gemt med det tastede tal', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        return w.length === 1 && w[0].exercises[0].sets[0].weight === 92.5;
    `)) === true, await evaluate('return localStorage.getItem("gym_tracker_workouts")'));
    ok('Efter et gem ligger udkastet ikke længere på passet', (await evaluate(`
        const drafts = JSON.parse(localStorage.getItem("gym_tracker_draft") || "{}");
        return !drafts.upperA;
    `)) === true, await evaluate('return localStorage.getItem("gym_tracker_draft")'));
    ok('Og linjen om at det er gemt forsvinder', (await evaluate(`
        const el = document.getElementById("draft-note");
        return !el || el.classList.contains("hidden") || el.textContent === "";
    `)) === true);
    await load(URL_UNDER_TEST);
    ok('Og der bliver ikke lagt noget gammelt tilbage ved næste åbning',
        (await evaluate('return document.getElementById("toast-container").textContent')).indexOf('Restored') === -1);

    // Et udkast fra en tidligere uge er ikke noget man er i gang med
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await evaluate(`localStorage.setItem("gym_tracker_draft", JSON.stringify({
        upperA: { week: "2020-W01", editingId: null,
            exercises: [{ exerciseId: ${JSON.stringify(foersteOevelse)}, sets: [{ weight: 111, reps: 3 }] }] }
    })); return true;`);
    await load(URL_UNDER_TEST);
    ok('Et udkast fra en tidligere uge lægges ikke tilbage',
        (await evaluate(`return document.querySelector("${firstWeight}").value`)) !== '111');
    ok('Og det smides væk i stedet for at blive liggende',
        (await evaluate(`return !JSON.parse(localStorage.getItem("gym_tracker_draft") || "{}").upperA`)) === true);

    // Og et udkast hører til sit eget pas: det må ikke dukke op i et andet
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await skriv(firstWeight, '83.5');
    await sleep(700);
    const passet = await currentSession();
    const andetPas = passet === 'upperA' ? 'upperB' : 'upperA';
    await openSession(andetPas);
    ok(`Udkastet for ${passet} dukker ikke op i ${andetPas}`,
        (await evaluate('return document.querySelector("#exercise-list .exercise-card .set-weight").value')) !== '83.5');
    ok('Og der er ikke skrevet et udkast på det pas man ikke har tastet i',
        (await evaluate(`return !JSON.parse(localStorage.getItem("gym_tracker_draft") || "{}")[${JSON.stringify(andetPas)}]`)) === true);
    await openSession(passet);
    ok('Tilbage på passet står det tastede der igen',
        (await evaluate(`return document.querySelector("${firstWeight}").value`)) === '83.5');

    // Brugerens egen sag: passet er ALLEREDE gemt i denne uge, så ugen-låsen står i
    // baren (og appen foreslår et andet pas). Udkastet skal stadig lægges tilbage —
    // man kan være i gang med et ekstra pas, eller være i gang med at rette noget.
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`(() => {
        const d = new Date(); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off);
        const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([{
            id: "w_man", date: iso, day: "upper", variant: "A",
            exercises: [{ exerciseId: "bench_press", sets: [{ weight: 72.5, reps: 8 }] }],
        }]));
        return true;
    })()`);
    await load(URL_UNDER_TEST);
    // Siden man forlod skrev sit eget udkast ned under navigationen (pagehide), så
    // udkastet ryddes på den NYE side — ellers stod det gamle tastede (83.5) i feltet.
    await evaluate('localStorage.removeItem("gym_tracker_draft"); return true;');
    await openSession('upperA');
    ok('Passet er allerede gemt i ugen (ugen-låsen står i baren)',
        /already logged this week/.test(await evaluate('return document.getElementById("save-info").textContent')));
    ok('Programmets vægt fra historikken står i feltet før man taster',
        (await evaluate(`return document.querySelector("${firstWeight}").value`)) === '72.5',
        String(await nulstilFelt()));
    await skriv(firstWeight, '70');
    await sleep(700);
    await load(URL_UNDER_TEST);
    await openSession('upperA');
    ok('Det tastede kommer tilbage selv om passet allerede er gemt i ugen',
        (await evaluate(`return document.querySelector("${firstWeight}").value`)) === '70',
        String(await nulstilFelt()));


    // ─── 21. Klap en færdig øvelse sammen ─────────────────────────
    // Man er ikke altid færdig med øvelserne i den rækkefølge programmet stiller dem i:
    // er man færdig med nr. 3, skal den kunne klappes sammen, så de resterende er til at
    // finde. En klap-knap i kortets hoved, og en liste der huskes pr. pas (og overlever
    // at telefonen genindlæser siden).
    console.log('\n── 21. Klap en færdig øvelse sammen');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);

    const antalKort = () => evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length');
    const kort = i => `#exercise-list .exercise-card[data-index="${i}"]`;
    const klapKnap = i => `${kort(i)} .collapse-btn`;
    const kortInfo = i => evaluate(`
        const c = document.querySelector(${JSON.stringify(kort(i))});
        if (!c) return null;
        return {
            collapsed: c.classList.contains("collapsed"),
            inputs: c.querySelectorAll(".set-weight").length,
            tabeller: c.querySelectorAll(".sets-table").length,
            cue: c.querySelectorAll(".cue-line").length,
            target: c.querySelectorAll(".exercise-target").length,
            summary: (c.querySelector(".collapsed-summary") || {}).textContent || null,
            meta: c.querySelectorAll(".exercise-meta").length,
            navn: (c.querySelector(".exercise-name") || c.querySelector(".exercise-name-btn") || {}).textContent || null,
            fjern: c.querySelectorAll(".remove-btn").length,
            hoejde: Math.round(c.getBoundingClientRect().height),
            aria: (c.querySelector(".collapse-btn") || {}).getAttribute ? c.querySelector(".collapse-btn").getAttribute("aria-expanded") : null,
            tegn: (c.querySelector(".collapse-btn") || {}).textContent || null,
        };
    `);

    const kortene = await antalKort();
    ok('Hvert kort har en klap-knap',
        (await evaluate('return document.querySelectorAll("#exercise-list .collapse-btn").length')) === kortene,
        String(await evaluate('return document.querySelectorAll("#exercise-list .collapse-btn").length')));
    ok('Klap-knappen er til at ramme med en tommelfinger (mindst 32px)',
        (await evaluate(`
            const b = document.querySelector("#exercise-list .collapse-btn").getBoundingClientRect();
            return b.width >= 32 && b.height >= 32;
        `)) === true,
        JSON.stringify(await evaluate(`
            const b = document.querySelector("#exercise-list .collapse-btn").getBoundingClientRect();
            return { w: Math.round(b.width), h: Math.round(b.height) };
        `)));

    const foer = await kortInfo(2);
    const vaegtFoer = await evaluate(`return document.querySelector(${JSON.stringify(kort(2) + ' .set-weight')}).value`);
    ok('Kortet er foldet ud fra starten (ingen collapsed-klasse)',
        foer.collapsed === false && foer.inputs > 0 && foer.tabeller === 1, JSON.stringify(foer));
    ok('Intet kort er klappet sammen fra starten',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')) === 0);

    // Tryk på klap-knappen — det er hele funktionen
    await evaluate(`document.querySelector(${JSON.stringify(klapKnap(2))}).click(); return true;`);
    await sleep(250);

    const efter = await kortInfo(2);
    ok('Et tryk klapper kortet sammen', efter.collapsed === true, JSON.stringify(efter));
    ok('Kortets sæt-felter er væk, ikke bare skjulte',
        efter.inputs === 0 && efter.tabeller === 0, JSON.stringify(efter));
    ok('Cue, anbefaling og opvarmning er væk sammen med felterne',
        efter.cue === 0 && efter.target === 0, JSON.stringify(efter));
    ok('Navnet og ✕ står der stadig (man kan stadig se og fjerne øvelsen)',
        efter.fjern === 1 && /Bench|Shoulder|Lat|Row|Triceps|Curl|Press/.test(efter.navn || ''), String(efter.navn));
    ok('I stedet står der hvor mange sæt der har tal, og hvor mange kg',
        efter.summary === (await evaluate(`
            const ex = state.exercises[2];
            const volume = ex.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
            const logged = ex.sets.filter(s => s.weight > 0 && s.reps > 0).length;
            return logged + "/" + ex.sets.length + " sets · " + volume.toFixed(0) + " kg";
        `)),
        String(efter.summary));
    ok('Knappen fortæller at kortet er klappet sammen (aria-expanded=false) og peger ud',
        efter.aria === 'false' && efter.tegn === '▸', JSON.stringify({ aria: efter.aria, tegn: efter.tegn }));
    ok('Det klappede kort er lavere end det var (der er sparet plads)', efter.hoejde < foer.hoejde,
        `${foer.hoejde} → ${efter.hoejde}`);
    ok('Kun det ene kort er klappet sammen — de andre er urørt',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')) === 1
        && (await evaluate('return document.querySelectorAll("#exercise-list .sets-table").length')) === kortene - 1);
    ok('De andre kort har stadig deres felter med de samme tal',
        (await kortInfo(0)).inputs > 0 && (await kortInfo(0)).collapsed === false);

    // Man kan skifte mening: samme knap folder ud igen, og felterne er tilbage med tallene
    await evaluate(`document.querySelector(${JSON.stringify(klapKnap(2))}).click(); return true;`);
    await sleep(250);
    const aabnet = await kortInfo(2);
    ok('Samme knap folder kortet ud igen',
        aabnet.collapsed === false && aabnet.inputs === foer.inputs && aabnet.summary === null, JSON.stringify(aabnet));
    ok('Tallene står uændret i felterne efter en tur sammen og ud igen',
        (await evaluate(`return document.querySelector(${JSON.stringify(kort(2) + ' .set-weight')}).value`)) === vaegtFoer
        && vaegtFoer.length > 0,
        vaegtFoer);

    // Det tastede står på det klappede kort, og sammenklapningen overlever en genindlæsning
    await skriv(`${kort(0)} .set-weight`, '77.5');
    await skriv(`${kort(0)} .set-reps`, '6');
    await sleep(700);
    await evaluate(`document.querySelector(${JSON.stringify(klapKnap(0))}).click(); return true;`);
    await evaluate(`document.querySelector(${JSON.stringify(klapKnap(4))}).click(); return true;`);
    await sleep(250);
    ok('Man kan klappe flere kort sammen',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')) === 2);
    const klappetFoer = (await kortInfo(0)).summary;
    ok('Det klappede kort viser det man har tastet',
        klappetFoer === (await evaluate(`
            const ex = state.exercises[0];
            const volume = ex.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
            return ex.sets.length + "/" + ex.sets.length + " sets · " + volume.toFixed(0) + " kg";
        `)), String(klappetFoer));

    await load(URL_UNDER_TEST);
    ok('Efter en genindlæsning er de samme kort stadig klappet sammen',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')) === 2,
        String(await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')));
    ok('Og de står på de rigtige øvelser',
        (await kortInfo(0)).collapsed === true && (await kortInfo(4)).collapsed === true
        && (await kortInfo(1)).collapsed === false);
    ok('Det tastede tal står stadig på det klappede kort efter genindlæsningen',
        (await kortInfo(0)).summary === klappetFoer, String((await kortInfo(0)).summary));

    // Sammenklapningen hører til passet — næste pas skal ikke arve den
    await openSession('upperB');
    ok('Et andet pas starter med alle kort foldet ud',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')) === 0);
    await openSession('upperA');
    ok('Tilbage på passet er det stadig klappet sammen',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')) === 2);

    // Et gem er grænsen: passet er færdigt, og næste gang åbner det foldet ud
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(500);
    ok('Træningen blev gemt', (await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]").length')) === 1);
    await openSession('upperA');
    ok('Efter et gem står kortene foldet ud igen',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')) === 0,
        String(await evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length')));

    // Et klappet kort må ikke kunne skubbe siden ud i bredden på en telefon
    await evaluate(`document.querySelector(${JSON.stringify(klapKnap(1))}).click(); return true;`);
    await sleep(250);
    ok('Et klappet kort giver ingen vandret rulning på 390px',
        (await evaluate('return document.documentElement.scrollWidth <= window.innerWidth + 1')) === true,
        JSON.stringify(await evaluate('return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }')));

    ok('Ingen uventede console-fejl', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

    console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);

    ws.close();
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* Chrome kan stadig skrive profilfiler */ }
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('FEJL:', err); process.exit(1); });