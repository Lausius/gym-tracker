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
            const ready = await evaluate('return document.readyState === "complete" && !!document.getElementById("program-content")');
            if (ready) break;
            await sleep(150);
        }
        await sleep(400); // lad init() og DOMContentLoaded køre færdigt
    }

    // ─── 1. Indlæsning ────────────────────────────────────────────
    console.log('── 1. Indlæsning og initial visning');
    // Start altid fra rene data: browserens localStorage overlever mellem kørsler,
    // så en suite der ikke selv rydder op arver state fra sidste kørsel.
    await load(URL_UNDER_TEST);
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    ok('Siden indlæses uden JS-fejl', pageErrors.length === 0, JSON.stringify(pageErrors));
    ok('Titel er Gym Tracker', (await evaluate('return document.title')) === 'Gym Tracker');
    ok('Program-sektionen viser øvelser', (await evaluate('return document.querySelectorAll("#program-content .program-exercise").length')) > 0);
    ok('Ingen historik → foreslår Upper A', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'A');
    ok('Hint siger "foreslået"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'suggested',
        JSON.stringify(await evaluate('return { hint: document.getElementById("variant-hint").textContent, programVariant: state.programVariant, active: document.querySelector(".variant-btn.active").dataset.variant }')));

    // ─── 2. Programmet er dagens træning (ingen "tilføj"-knap) ─────
    console.log('\n── 2. Programmet ligger klart ved åbning');
    ok('Der er ingen "Tilføj alle"-knap mere', (await evaluate('return document.getElementById("program-load")')) === null);
    ok('Der er ingen "Tilføj øvelse"-formular mere', (await evaluate('return document.getElementById("add-exercise-section")')) === null);
    ok('Dagens program giver 6 øvelser af sig selv (Upper A)',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) ===
        (await evaluate('return getProgram("upper", "A").length')));
    ok('Gem-knappen er aktiv med det samme (programmet er indlæst)',
        (await evaluate('return document.getElementById("save-btn").disabled')) === false);
    ok('Alle programrækker står som ✓ tilføjet', (await evaluate(`
        const rows = [...document.querySelectorAll("#program-content .program-exercise")];
        return rows.length === getProgram("upper", "A").length
            && rows.every(r => r.querySelector(".program-ex-added"));
    `)) === true);
    ok('Programrækken viser den anbefalede vægt', (await evaluate(`
        return document.querySelector("#program-content .program-exercise .program-ex-added").textContent.includes("65 kg");
    `)) === true);
    ok('Bench Press står i øvelseslisten', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Bench Press")')) === true);
    ok('Sættene er præfyldt fra programmet (65 kg × 8 ×3)', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        const w = card.querySelector(".set-weight").value;
        const r = card.querySelector(".set-reps").value;
        return w === "65" && r === "8" && card.querySelectorAll(".set-weight").length === 3;
    `)) === true);
    ok('Kortet viser anbefalingen fra programmet', (await evaluate(`
        const t = document.querySelector("#exercise-list .exercise-target");
        return !!t && /Recommended: 3 × 8 @ 65 kg/.test(t.textContent.trim());
    `)) === true);
    ok('Opvarmningsrampen vises på Bench Press (65 kg → 20×10, 45×5, 55×3)', (await evaluate(`
        const t = document.querySelector("#exercise-list .exercise-card .warmup-block");
        const txt = t ? t.textContent : "";
        return !!t && txt.includes("20 × 10") && txt.includes("45 × 5") && txt.includes("55 × 3");
    `)) === true);
    ok('Opvarmningen er foldet sammen som standard', (await evaluate('return document.querySelector("#exercise-list .warmup-block").open === false')) === true);
    ok('Isolation får ét let sæt (Calf Raise er ikke med på Upper A, så vi måler reglen)',
        (await evaluate(`
            const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
                .find(c => !c.querySelector(".tag.compound") && c.querySelector(".warmup-block"));
            if (!card) return true; // ingen isolation på denne dag
            const ex = ALL_EXERCISES.upper.find(e => e.name === card.querySelector(".exercise-name").textContent);
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
            const name = card.querySelector(".exercise-name").textContent.trim();
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
    await evaluate('document.querySelector(\'.variant-btn[data-variant="B"]\').click(); return true;');
    await sleep(150);
    ok('B-knappen er aktiv', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'B');
    ok('Hint skifter til "valgt"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'chosen');
    ok('Upper B viser Face Pull', (await evaluate('return document.getElementById("program-content").innerText.includes("Face Pull")')) === true);
    ok('Upper B viser ikke Bench Press', (await evaluate('return document.getElementById("program-content").innerText.includes("Bench Press")')) === false);
    ok('↻-knappen er fjernet (A/B skiftes med knapperne)', (await evaluate('return document.getElementById("program-refresh")')) === null);
    ok('Variantskiftet lægger den nye variants program ind i dagens træning', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
        const want = getProgram("upper", "B").map(i => ALL_EXERCISES.upper.find(e => e.id === i.exerciseId).name);
        return cards.length === want.length && cards.every((n, i) => n === want[i]);
    `)) === true);
    await evaluate('document.querySelector(\'.variant-btn[data-variant="A"]\').click(); return true;');
    await sleep(150);
    ok('A-knappen skifter tilbage til A', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'A');
    ok('Og dagens øvelser følger med tilbage til Upper A', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
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
    ok('Opvarmningen følger den rettede vægt (65 kg → 32.5×8, 55×3)', (await evaluate(`
        const t = document.querySelector("#exercise-list .exercise-card .warmup-block").textContent;
        return t.includes("32.5 × 8") && t.includes("55 × 3");
    `)) === true);
    ok('Åben opvarmning forbliver åben mens vægten rettes', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        card.querySelector(".warmup-block").open = true;
        const w = card.querySelector(".set-weight");
        w.value = "70";
        w.dispatchEvent(new Event("input", { bubbles: true }));
        const stillOpen = card.querySelector(".warmup-block").open === true;
        const followed = card.querySelector(".warmup-block").innerText.includes("35 × 8");
        w.value = "65";
        w.dispatchEvent(new Event("input", { bubbles: true }));
        return stillOpen && followed && card.querySelector(".warmup-block").innerText.includes("32.5 × 8");
    `)) === true);
    await evaluate('document.querySelector("#exercise-list .add-set-btn").click(); return true;');
    await sleep(150);
    ok('Tilføj sæt giver 4 sæt på første øvelse', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[0].querySelectorAll(".set-weight").length')) === 4);
    ok('De øvrige øvelser har stadig 3 sæt', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[1].querySelectorAll(".set-weight").length')) === 3);

    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(300);
    ok('Efter gem er næste variant i rotationen lagt klar som dagens træning', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
        const want = getProgram("upper", "B").map(i => ALL_EXERCISES.upper.find(e => e.id === i.exerciseId).name);
        return document.querySelector(".variant-btn.active").dataset.variant === "B"
            && cards.length === want.length && cards.every((n, i) => n === want[i]);
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
    ok('Næste forslag er nu Upper B (rotation virker)', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === "B");
    ok('Foreslået variant er igen markeret "foreslået"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'suggested');
    ok('Progressiv overload foreslår 67.5 kg efter 65 kg × 8', (await evaluate(`
        const el = [...document.querySelectorAll("#progressive-list .progressive-item")]
            .find(i => i.dataset.exerciseId === "bench_press");
        return el.innerText.includes("67.5");
    `)) === true);

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
    await evaluate('document.querySelector(\'.day-btn[data-day="lower"]\').click(); return true;');
    await sleep(250);
    ok('Lower-variant foreslås A (upper-historik påvirker ikke)', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'A');
    ok('Lower-programmet viser Leg Press', (await evaluate('return document.getElementById("program-content").innerText.includes("Leg Press")')) === true);
    ok('Lower A lægges ind med sine øvelser', (await evaluate(`
        return document.querySelectorAll("#exercise-list .exercise-card").length === getProgram("lower", "A").length;
    `)) === true);

    // Gem lower-træningen på en anden dato, så begge dage har historik
    await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        w.push({ id: "w_lower_1", date: "2026-09-02", day: "lower", variant: "A", exercises: [
            { exerciseId: "squat", sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify(w));
        return true;
    `);
    await load(URL_UNDER_TEST);
    await evaluate('document.querySelector(\'.day-btn[data-day="lower"]\').click(); return true;');
    await sleep(250);
    ok('Efter Lower A → foreslår Lower B', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'B');
    ok('Lower B viser Calf Raise (Leg Press)', (await evaluate('return document.getElementById("program-content").innerText.includes("Calf Raise (Leg Press)")')) === true);

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
                ['#progressive-list', '.progressive-item', '.add-from-prog-btn'],
                ['#program-content', '.program-exercise', null],
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
                report.push({
                    container, count: rows.length,
                    widths: [...new Set(rects.map(r => Math.round(r.width)))],
                    edgeOffsets, centerOffsets, topOffsets, spill,
                });
            }
            return { overflow: doc.scrollWidth - doc.clientWidth, report };
        `);
    }

    const spread = a => Math.max(...a) - Math.min(...a);
    const label = { '#progressive-list': 'Progressiv overload', '#program-content': 'Dagens program', '#exercise-list': 'Øvelseslisten' };

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
                g.spill === 0, `${g.spill} rækker med overløb`);
        }
    }

    // Selve regressionen: gør teksten markant længere — knappen må ikke flytte sig
    await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(250);
    const before = await evaluate(`
        const r = document.querySelector("#progressive-list .progressive-item");
        const b = r.querySelector(".add-from-prog-btn").getBoundingClientRect();
        return Math.round(r.getBoundingClientRect().right - b.right);
    `);
    await evaluate(`
        document.querySelectorAll("#progressive-list .progressive-item").forEach(r => {
            r.querySelector(".progressive-ex-name").insertAdjacentText("afterbegin",
                "Incline Dumbbell Press med ekstra langt navn og mere tekst ");
            r.querySelector(".suggestion-detail").textContent =
                "Bedst: 112,5 kg × 12 reps (onsdag den 30. september 2026, meget lang detaljetekst)";
        });
        return true;
    `);
    await sleep(200);
    const after = await evaluate(`
        const r = document.querySelector("#progressive-list .progressive-item");
        const b = r.querySelector(".add-from-prog-btn").getBoundingClientRect();
        const edges = [...document.querySelectorAll("#progressive-list .progressive-item")].map(row => {
            const btn = row.querySelector(".add-from-prog-btn").getBoundingClientRect();
            return Math.round(row.getBoundingClientRect().right - btn.right);
        });
        return { offset: Math.round(r.getBoundingClientRect().right - b.right), spread: Math.max(...edges) - Math.min(...edges) };
    `);
    ok(`＋-knappen flytter sig ikke ved lang tekst (før ${before}px, efter ${after.offset}px)`, before === after.offset);
    ok('＋-knapperne holder samme afstand til kanten selv med lang tekst', after.spread <= 1, `spredning ${after.spread}px`);
    await load(URL_UNDER_TEST, '#app');
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(200);

    // ─── 9. Byt en øvelse (samme muskelgruppe) ────────────────────
    // Man bygger ikke programmet op selv længere: man bytter en øvelse ud med en
    // anden i samme muskelgruppe, og byttet huskes for den dag+variant.
    console.log('\n── 9. Byt en øvelse til en anden i samme muskelgruppe');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await evaluate('document.querySelector(\'.day-btn[data-day="upper"]\').click(); return true;');
    await sleep(300);

    ok('Navnet på en programrække er en knap', (await evaluate('return document.querySelectorAll("#program-content .program-ex-name-btn").length')) > 0);
    await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "bench_press");
        row.querySelector(".program-ex-name-btn").click();
        return true;
    `);
    await sleep(250);
    const menu = await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "bench_press");
        const opts = [...row.querySelectorAll(".swap-option")];
        return {
            count: opts.length,
            ids: opts.map(o => o.dataset.swapId),
            names: opts.map(o => o.querySelector(".swap-option-name").textContent.trim()),
            current: (opts.find(o => o.classList.contains("current")) || { dataset: {} }).dataset.swapId || null,
            muscles: opts.map(o => ALL_EXERCISES.upper.find(e => e.id === o.dataset.swapId).muscle),
            sessionIds: [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim()),
        };
    `);
    ok('Bytte-listen åbner når man trykker på navnet', menu.count > 1, JSON.stringify(menu));
    ok('Alle valg er i samme muskelgruppe som Bench Press', menu.muscles.every(m => m === 'Chest'), JSON.stringify(menu.muscles));
    ok('Listen rummer ikke øvelser fra andre grupper', !menu.ids.includes('lat_pulldown') && !menu.ids.includes('ez_bar_curl'));
    ok('Den nuværende øvelse er markeret i listen', menu.current === 'bench_press');
    ok('Øvelser der allerede står i dagens træning tilbydes ikke', (await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "bench_press");
        const opts = [...row.querySelectorAll(".swap-option")].map(o => o.dataset.swapId);
        const inSession = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
        return opts.every(id => {
            const ex = ALL_EXERCISES.upper.find(e => e.id === id);
            return id === "bench_press" || !inSession.includes(ex.name);
        });
    `)) === true);

    // Vælg en anden øvelse: rækken, kortet og anbefalingen følger med
    await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "bench_press");
        [...row.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "chest_press_machine").click();
        return true;
    `);
    await sleep(300);
    ok('Programrækken viser den nye øvelse', (await evaluate('return document.getElementById("program-content").innerText.includes("Chest Press (Machine)")')) === true);
    ok('Med redskabet i meta-linjen', (await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "chest_press_machine");
        return row.querySelector(".program-ex-meta").textContent.includes("Machine");
    `)) === true);
    ok('Øvelseskortet følger med, og den gamle er væk', (await evaluate(`
        const t = document.getElementById("exercise-list").innerText;
        return t.includes("Chest Press (Machine)") && !t.includes("Bench Press") &&
            document.querySelectorAll("#exercise-list .exercise-card").length === getProgram("upper", "A").length;
    `)) === true);
    ok('Kortet viser hvad programmet anbefaler', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.innerText.includes("Chest Press (Machine)"));
        return /Recommended: 3 × 8/.test(card.querySelector(".exercise-target").textContent);
    `)) === true);
    ok('Dagen har stadig kun sine egne øvelser (ingen dublet)', (await evaluate(`
        const names = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
        return new Set(names).size === names.length;
    `)) === true);
    ok('Byttet gemmes, så det huskes næste gang', (await evaluate(`
        const s = JSON.parse(localStorage.getItem("gym_tracker_program_swaps") || "{}");
        return s.upperA && s.upperA.bench_press === "chest_press_machine";
    `)) === true);
    ok('Gem-info viser at dagen er fyldt op', /of 6 exercises/.test(await evaluate('return document.getElementById("save-info").textContent')));

    // Byttet overlever en reload og gælder kun den dag+variant
    await load(URL_UNDER_TEST);
    ok('Efter reload står den byttede øvelse der stadig', (await evaluate('return document.getElementById("program-content").innerText.includes("Chest Press (Machine)")')) === true);
    await evaluate('document.querySelector(\'.variant-btn[data-variant="B"]\').click(); return true;');
    await sleep(250);
    ok('Byttet gælder kun Upper A (ikke B)', (await evaluate('return document.getElementById("program-content").innerText.includes("Chest Press (Machine)")')) === false);
    await evaluate('document.querySelector(\'.variant-btn[data-variant="A"]\').click(); return true;');
    await sleep(250);

    // Byt tilbage til programmets øvelse: overriden fjernes
    await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "chest_press_machine");
        row.querySelector(".program-ex-name-btn").click();
        return true;
    `);
    await sleep(200);
    await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "chest_press_machine");
        [...row.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "bench_press").click();
        return true;
    `);
    await sleep(300);
    ok('Man kan bytte tilbage til programmets øvelse', (await evaluate('return document.getElementById("program-content").innerText.includes("Bench Press")')) === true);
    ok('Og så er overriden væk (ingen gammel husket bytte)',
        (await evaluate('return JSON.stringify(JSON.parse(localStorage.getItem("gym_tracker_program_swaps") || "{}"))')) === '{}');

    // En øvelse uden alternativer (Leg Curl er alene i sin muskelgruppe) får ingen menu
    await evaluate('document.querySelector(\'.day-btn[data-day="lower"]\').click(); return true;');
    await sleep(300);
    ok('Leg Curl har ingen bytte-knap (den er alene i sin gruppe)',
        (await evaluate(`
            const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "leg_curl");
            return !!row && !row.querySelector(".program-ex-name-btn");
        `)) === true);
    ok('Hip Thrust har en bytte-knap (Glute Bridge i samme gruppe)',
        (await evaluate(`
            const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "hip_thrust");
            return !!row && !!row.querySelector(".program-ex-name-btn");
        `)) === true);
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
    await evaluate('document.querySelector(\'.day-btn[data-day="upper"]\').click(); return true;');
    await sleep(300);
    await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        cards[cards.length - 1].querySelector(".remove-btn").click();
        return true;
    `);
    await sleep(250);
    ok('Øvelsen er fjernet fra dagens træning', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 5);
    ok('Programrækken står nu uden ✓ (den er ikke med i dag)',
        (await evaluate('return document.querySelectorAll("#program-content .program-exercise.not-added").length')) === 1);
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(400);

    const readWorkouts = `const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");`;
    const afterSave = await evaluate(`
        ${readWorkouts}
        return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0, day: w[0] && w[0].day, variant: w[0] && w[0].variant };
    `);
    ok('Træningen blev gemt (1 træning, 5 øvelser)', afterSave.count === 1 && afterSave.ex === 5, JSON.stringify(afterSave));
    ok('Efter gem lægges den næste variant klar som dagens træning',
        (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'B');

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
    ok('Dagen følger træningen der redigeres', (await evaluate('return document.querySelector(".day-btn.active").dataset.day')) === 'upper');
    ok('Sættene er indlæst med vægt og reps', (await evaluate(`
        const inputs = [...document.querySelectorAll("#exercise-list input[type=number]")];
        return inputs.length > 0 && inputs.every(i => Number(i.value) > 0);
    `)) === true);
    ok('Indholdet skubbes fri af det højere gem-panel', (await evaluate(`
        return getComputedStyle(document.querySelector(".app-container")).paddingBottom;
    `)) === '156px');

    // Hent den glemte øvelse ind igen ved at trykke på dens programrække
    await evaluate('document.querySelector("#program-content .program-exercise.not-added").click(); return true;');
    await sleep(300);
    ok('Den glemte øvelse er nu i editoren igen', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 6);
    ok('Programrækken står som ✓ igen', (await evaluate('return document.querySelectorAll("#program-content .program-exercise.not-added").length')) === 0);

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
    const variantNow = await evaluate('return document.querySelector(".variant-btn.active").dataset.variant');
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

    // ─── 13. Filtrering i Næste uge-listen ────────────────────────
    // Programmets øvelser er dagens træning og bliver ikke filtreret. Det er
    // "Næste uge"-listen der viser hele databasen skåret ned til det man laver.
    console.log('\n── 13. Filtrering: kun øvelser man har udført (Næste uge-listen)');

    // Fixture: én Upper-A-træning med KUN to af programmets øvelser. Resten er
    // dermed "aldrig udført" og skal skjules i Næste uge-listen.
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
    const upperDb = await evaluate('return ALL_EXERCISES.upper.length');

    // Rotationen foreslår nu B (sidste upper var A) — vis A, som har historikken
    await evaluate(`document.querySelector('.variant-btn[data-variant="A"]').click(); return true;`);
    await sleep(300);

    ok('Programmet viser hele skabelonen uanset historik (dagens træning er programmet)',
        (await evaluate('return document.querySelectorAll("#program-content .program-exercise").length')) === progA, `skabelon ${progA}`);
    ok('Dagens træning er programmets øvelser, ikke kun dem med historik',
        (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === progA);
    ok('Der er ikke længere en "Vis alle"-knap i programmet', (await evaluate('return document.getElementById("program-toggle")')) === null);

    // Næste uge-listen: samme regel som før, og det var ønsket #1
    const progItems = await evaluate('return [...document.querySelectorAll("#progressive-list .progressive-item")].map(i => i.dataset.exerciseId)');
    ok('Næste-uge-listen viser øvelserne med historik', progItems.includes('bench_press') && progItems.includes('lat_pulldown'), JSON.stringify(progItems));
    // Reglen er nu: med historik ELLER med i dagens program. Alt andet skal være væk —
    // derfor tjekkes det datadrevet i stedet for på et par håndskrevne id'er.
    const progAudit = await evaluate(`
        const listed = [...document.querySelectorAll("#progressive-list .progressive-item")].map(i => i.dataset.exerciseId);
        const inSession = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
        const sessionIds = ALL_EXERCISES.upper.filter(e => inSession.includes(e.name)).map(e => e.id);
        const history = loadWorkouts().flatMap(w => (w.exercises || []).map(e => e.exerciseId));
        return {
            hidden: listed.filter(id => !history.includes(id) && !sessionIds.includes(id)),
            missing: sessionIds.filter(id => !listed.includes(id)),
            absent: ALL_EXERCISES.upper.map(e => e.id).filter(id => !listed.includes(id)),
        };
    `);
    ok('Lange lister af aldrig-udførte øvelser er væk',
        progAudit.hidden.length === 0 && progAudit.absent.length > 0, JSON.stringify(progAudit));
    ok('Dagens program-øvelser mangler ikke i Næste uge-listen', progAudit.missing.length === 0, JSON.stringify(progAudit.missing));
    ok('Øvelserne i dagens træning står altid i listen', (await evaluate(`
        const inSession = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
        const listed = [...document.querySelectorAll("#progressive-list .progressive-ex-name")].map(e => e.textContent.trim());
        return inSession.every(n => listed.some(l => l.startsWith(n)));
    `)) === true);
    ok(`Listen er gået fra ${upperDb} til ${progItems.length} poster`, progItems.length < upperDb);
    ok('Knappen tilbyder de skjulte i Næste uge', /Show all \(\d+\)/.test(await evaluate('return document.getElementById("progressive-toggle").textContent')), await evaluate('return document.getElementById("progressive-toggle").textContent'));
    await evaluate('document.getElementById("progressive-toggle").click(); return true;');
    await sleep(250);
    ok('"Vis alle" i Næste uge viser hele databasen', (await evaluate('return document.querySelectorAll("#progressive-list .progressive-item").length')) === upperDb);
    await evaluate('document.getElementById("progressive-toggle").click(); return true;');
    await sleep(250);
    ok('Filtret slås til igen', (await evaluate('return document.querySelectorAll("#progressive-list .progressive-item").length')) === progItems.length);

    // Dags-skift henter den nye dags program, og uden historik filtreres der ikke
    await evaluate(`document.querySelector('.day-btn[data-day="lower"]').click(); return true;`);
    await sleep(300);
    const lowerShown = await evaluate('return document.querySelectorAll("#program-content .program-exercise").length');
    const lowerActive = await evaluate('return getProgram("lower", document.querySelector(".variant-btn.active").dataset.variant).length');
    ok('Lower viser hele sit program', lowerShown === lowerActive && lowerShown > 0, `${lowerShown} af ${lowerActive}`);
    ok('Dagens træning følger med til Lower', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === lowerActive);
    ok('Næste uge viser hele lower-databasen', (await evaluate('return document.querySelectorAll("#progressive-list .progressive-item").length')) === (await evaluate('return ALL_EXERCISES.lower.length')));
    ok('Ingen "Vis alle"-knap i Næste uge uden historik', (await evaluate('return document.getElementById("progressive-toggle").classList.contains("hidden")')) === true);

    await evaluate(`document.querySelector('.day-btn[data-day="upper"]').click(); return true;`);
    await sleep(300);
    await evaluate(`document.querySelector('.variant-btn[data-variant="A"]').click(); return true;`);
    await sleep(250);
    ok('Tilbage i Upper A er filtreringen der igen', (await evaluate('return document.querySelectorAll("#progressive-list .progressive-item").length')) === progItems.length);

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
            const header = document.querySelector(".program-header").getBoundingClientRect();
            const btn = document.querySelector(".program-ex-name-btn");
            const spill = [];
            for (const sel of ["#progressive-list", "#program-content", ".program-header", ".progressive-header", "#exercise-list"]) {
                for (const el of document.querySelectorAll(sel + " *")) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.right > client + 1) {
                        spill.push(sel + " > " + (el.id || el.className || el.tagName));
                    }
                }
            }
            return {
                client,
                headerRight: Math.round(header.right),
                btnRight: btn ? Math.round(btn.getBoundingClientRect().right) : -1,
                btnHeight: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
                spill,
            };
        `);
        ok(`[${w}px] Header og bytte-knap holder sig inden for bredden`,
            fits.headerRight <= fits.client + 1 && fits.btnRight > 0 && fits.btnRight <= fits.client + 1,
            `bredde=${fits.client} header=${fits.headerRight} knap=${fits.btnRight}`);
        ok(`[${w}px] Intet indhold flyder over kanten`, fits.spill.length === 0, fits.spill.join(', '));
        ok(`[${w}px] Bytte-knappen er et gyldigt tap-target`, fits.btnHeight >= 28, `${fits.btnHeight}px`);
    }
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(200);

    // Kropsvægtøvelser må ikke forsvinde. saveWorkout gemmer kun sæt med vægt > 0, så
    // en programrække uden vægt (Back Extension) optræder aldrig i en gemt træning —
    // og den skal blive stående i programmet alligevel, fordi programmet er dagens
    // træning og ikke et spejl af historikken.
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await evaluate(`document.querySelector('.day-btn[data-day="lower"]').click(); return true;`);
    await sleep(300);
    ok('Lower A er indlæst med Back Extension', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Back Extension")')) === true);
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(450);
    ok('Den gemte træning indeholder ikke back extension (vægt 0 gemmes ikke)', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"))[0];
        return w.exercises.length > 0 && !w.exercises.some(e => e.exerciseId === "back_extension");
    `)) === true);
    await load(URL_UNDER_TEST);
    await evaluate(`document.querySelector('.day-btn[data-day="lower"]').click(); return true;`);
    await sleep(300);
    await evaluate(`document.querySelector('.variant-btn[data-variant="A"]').click(); return true;`);
    await sleep(300);
    const lowerAfter = await evaluate('return [...document.querySelectorAll("#program-content .program-exercise")].map(r => r.dataset.exerciseId)');
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

    // Pointen med funktionen: filtreringen kan nu ses i en frisk browser, hvor der
    // ellers ikke ville være noget at filtrere på.
    const seededList = await evaluate('return document.querySelectorAll("#progressive-list .progressive-item").length');
    const upperDbSize = await evaluate('return ALL_EXERCISES.upper.length');
    ok('Næste-uge-listen er filtreret med eksempeldata', seededList > 0 && seededList < upperDbSize, `${seededList} af ${upperDbSize}`);

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
        await evaluate(`document.querySelector('.day-btn[data-day="${day}"]').click(); return true;`);
        await sleep(350);

        for (const variant of ['A', 'B']) {
            await evaluate(`document.querySelector('.variant-btn[data-variant="${variant}"]').click(); return true;`);
            await sleep(350);

            const sweep = await evaluate(`
                const day = ${JSON.stringify(day)};
                const variant = ${JSON.stringify(variant)};
                const items = getProgram(day, variant);
                const out = { rows: [], cards: [], items: items.map(i => i.exerciseId) };

                // Kortene: cue, opvarmning og anbefaling skal være det reglerne siger
                for (const card of document.querySelectorAll("#exercise-list .exercise-card")) {
                    const name = card.querySelector(".exercise-name").textContent.trim();
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

                // Programrækkerne: bytte-listen skal være præcis samme muskelgruppe,
                // minus det der allerede står i dagens træning.
                // Vigtigt: hvert klik på et navn tegner programmet om, så elementerne
                // fra en opsamlet liste er derefter løsrevet fra dokumentet — et klik på
                // en løsrevet knap når ikke den delegerede lytter. Derfor slås rækken
                // op på sit id hver gang, i stedet for at genbruge en gammel reference.
                const rowById = id => [...document.querySelectorAll("#program-content .program-exercise")]
                    .find(r => r.dataset.exerciseId === id);
                const rowIds = [...document.querySelectorAll("#program-content .program-exercise")].map(r => r.dataset.exerciseId);
                for (const id of rowIds) {
                    const row = rowById(id);
                    const ex = ALL_EXERCISES[day].find(e => e.id === id);
                    const inSession = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name")].map(e => e.textContent.trim());
                    const expected = ALL_EXERCISES[day]
                        .filter(e => e.muscle === ex.muscle && (e.id === id || !inSession.includes(e.name)))
                        .map(e => e.id);
                    const btn = row.querySelector(".program-ex-name-btn");
                    let opts = null;
                    if (btn) {
                        btn.click();
                        const menuRow = rowById(id);
                        opts = [...menuRow.querySelectorAll(".swap-option")].map(o => ({
                            id: o.dataset.swapId,
                            name: o.querySelector(".swap-option-name").textContent.trim(),
                            current: o.classList.contains("current"),
                            muscle: (ALL_EXERCISES[day].find(e => e.id === o.dataset.swapId) || {}).muscle,
                        }));
                        menuRow.querySelector(".program-ex-name-btn").click();
                    }
                    const fresh = rowById(id);
                    out.rows.push({
                        id,
                        muscle: ex.muscle,
                        hasButton: !!btn,
                        opts,
                        expected,
                        label: fresh.querySelector(".program-ex-added") ? fresh.querySelector(".program-ex-added").textContent.trim() : "",
                        note: (fresh.querySelector(".program-ex-note") || { textContent: "" }).textContent.trim(),
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
            ok(`${day}${variant}: programrækkerne viser præcis dagens øvelser`,
                sweep.rows.map(r => r.id).join(',') === sweep.items.join(','),
                `${sweep.rows.map(r => r.id).join(',')} vs ${sweep.items.join(',')}`);
            ok(`${day}${variant}: hver programrække viser sit mål og sin note`,
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
            ok(`${day}${variant}: alle valg i bytte-listen er samme muskelgruppe`,
                sweep.rows.every(r => !r.hasButton ||
                    r.opts.every(o => o.muscle === r.muscle)));
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
    await evaluate(`document.querySelector('.day-btn[data-day="lower"]').click(); return true;`);
    await sleep(300);
    await evaluate(`document.querySelector('.variant-btn[data-variant="B"]').click(); return true;`);
    await sleep(350);

    ok('Uden historik vises skabelonens tal', (await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "leg_curl");
        return row.querySelector(".program-ex-added").textContent.includes("45 kg");
    `)) === true);
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
    await evaluate(`document.querySelector('.day-btn[data-day="lower"]').click(); return true;`);
    await sleep(300);
    await evaluate(`document.querySelector('.variant-btn[data-variant="B"]').click(); return true;`);
    await sleep(350);
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
    ok('Anbefalingen på kortet er programmets tal (45 kg), ikke det man tastede',
        (await evaluate(`
            const card = document.querySelector("#exercise-list .exercise-card");
            return /Recommended: 3 × 15 @ 45 kg/.test(card.querySelector(".exercise-target").textContent)
                && card.querySelector(".set-weight").value === "99";
        `)) === true);
    ok('Programrækken viser også programmets mål', (await evaluate(`
        const row = [...document.querySelectorAll("#program-content .program-exercise")].find(r => r.dataset.exerciseId === "leg_curl");
        return row.querySelector(".program-ex-added").textContent.includes("45 kg");
    `)) === true);


    // ─── 17. Coach notes (hentet fra nettet, vist i panelet) ──────
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
    ok('Og appen virker stadig bagefter (programmet tegnes, knapperne svarer)',
        (await evaluate('return document.querySelectorAll("#program-content .program-exercise").length')) > 0
        && (await evaluate(`
            document.querySelector('.variant-btn[data-variant="B"]').click();
            return document.querySelector('.variant-btn[data-variant="B"]').classList.contains('active');
        `)) === true);
    await evaluate('document.getElementById("close-notes").click(); return true;');
    await sleep(250);
    ok('Ingen JS-fejl fra notes-panelet', pageErrors.length === 0, JSON.stringify(pageErrors));

    const smallBtns = await evaluate(`
        const btns = [...document.querySelectorAll("button")].filter(b => b.offsetParent !== null);
        return btns.filter(b => b.getBoundingClientRect().height < 28)
                   .map(b => (b.id || b.className) + "=" + Math.round(b.getBoundingClientRect().height) + "px");
    `);
    ok(`Alle synlige knapper er mindst 28px høje (${smallBtns.length} for små)`, smallBtns.length === 0, smallBtns.join(', '));

    ok('Ingen uventede console-fejl', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

    console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);

    ws.close();
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* Chrome kan stadig skrive profilfiler */ }
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('FEJL:', err); process.exit(1); });