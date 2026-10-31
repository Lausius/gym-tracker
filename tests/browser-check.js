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
    // lytter på den, svarer /json/version fra DEN, og hele suiten kører så mod en
    // gammel browser med en gammel app.js i cachen.
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
    // Ingen HTTP-cache: ellers kan en gammel app.js overleve fra en tidligere kørsel,
    // og suiten efterprøver så kode der ikke findes mere.
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
    // Hvilket pas står på skærmen lige nu, og hvilket foreslår appen som det næste
    const currentSession = () => evaluate('return (document.querySelector("#week-strip .week-chip.current") || {dataset:{}}).dataset.session');
    const nextSession = () => evaluate('return (document.querySelector("#week-strip .week-chip.next") || {dataset:{}}).dataset.session');

    // ── fælles hjælpere (bruges af mange sektioner) ──────────────────
    const cardIds = () => evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);');
    const cardCount = () => evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length;');
    const listText = () => evaluate('return (document.getElementById("exercise-list") || {innerText: ""}).innerText;');
    const storage = (key, fallback = '[]') => evaluate(`return localStorage.getItem(${JSON.stringify(key)}) || ${JSON.stringify(fallback)};`);
    // Skriv i et felt som en rigtig bruger (input-event, så listeners og debounce får det)
    const skriv = async (sel, value) => evaluate(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("input", { bubbles: true })); return true;`);
    const saveBtn = async (wait = 400) => { await evaluate('document.getElementById("save-btn").click(); return true;'); await sleep(wait); };
    // Bytte-lister: kortet slås op på id hver gang — et klik tegner listen om, så gamle
    // referencer er løsrevet fra dokumentet, og klik på dem når ikke den delegerede lytter.
    const openSwap = (id) => evaluate(`return (async () => {
        const find = () => [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === ${JSON.stringify(id)});
        const card = find(); const btn = card && card.querySelector(".exercise-name-btn");
        if (!btn) return { hasButton: false, opts: [] };
        btn.click(); await new Promise(r => setTimeout(r, 250));
        const after = find();
        const opts = after ? [...after.querySelectorAll(".swap-option")].map(o => o.dataset.swapId) : [];
        const btn2 = after && after.querySelector(".exercise-name-btn");
        if (btn2) btn2.click();
        return { hasButton: true, opts };
    })()`);
    const pickSwap = (id, target) => evaluate(`return (async () => {
        const find = () => [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === ${JSON.stringify(id)});
        const card = find(); if (!card) return false;
        card.querySelector(".exercise-name-btn").click();
        await new Promise(r => setTimeout(r, 250));
        const after = find();
        const opt = after && [...after.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === ${JSON.stringify(target)});
        if (!opt) return false;
        opt.click(); await new Promise(r => setTimeout(r, 300));
        return true;
    })()`);
    // Nulstil til rene data og indlæs evt. et bestemt pas
    const fresh = async (key) => { await evaluate('localStorage.clear(); return true;'); await load(URL_UNDER_TEST); if (key) await openSession(key); };
    const readWorkouts = 'const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");';
    // Skriv 0 reps i alle sæt på det sidste kort — den måde man springer en øvelse over
    const skipLastExercise = async () => {
        await evaluate(`return (() => { const kort = [...document.querySelectorAll("#exercise-list .exercise-card")].pop(); kort.querySelectorAll(".set-reps").forEach(r => { r.value = "0"; r.dispatchEvent(new Event("input", { bubbles: true })); }); return true; })()`);
        await sleep(300);
    };

    // ─── 1. Indlæsning ────────────────────────────────────────────
    console.log('── 1. Indlæsning og initial visning');
    // Start altid fra rene data: browserens localStorage overlever mellem kørsler,
    // så en suite der ikke selv rydder op arver state fra sidste kørsel.
    await load(URL_UNDER_TEST);
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    ok('Siden indlæses uden JS-fejl, med titel, pas og fokus', pageErrors.length === 0
        && (await evaluate('return document.title')) === 'Gym Tracker'
        && (await evaluate('return document.getElementById("session-label").textContent')) === 'Upper A'
        && (await evaluate('return document.getElementById("session-focus").textContent.length')) > 3,
        JSON.stringify({ errors: pageErrors, focus: await evaluate('return document.getElementById("session-focus").textContent') }));
    ok('Ingen historik → foreslår Upper A, og hintet siger "foreslået"', (await currentSession()) === 'upperA'
        && (await evaluate('return document.getElementById("variant-hint").textContent')) === 'suggested',
        JSON.stringify({ current: await currentSession(), hint: await evaluate('return document.getElementById("variant-hint").textContent') }));
    ok('Der er ingen dag-/A/B-vælger, "Tilføj alle" eller "Tilføj øvelse" tilbage', (await evaluate(`return document.getElementById("day-selector") === null && document.getElementById("variant-selector") === null && document.getElementById("first-use-banner") === null && document.getElementById("program-load") === null && document.getElementById("add-exercise-section") === null;`)) === true);

    // ─── 2. Programmet er dagens træning (ingen "tilføj"-knap) ─────
    console.log('\n── 2. Programmet ligger klart ved åbning');
    // Ingen ✕-knap: man springer en øvelse over med 0 reps, og kortets eneste
    // handling-knap er funktionel (klap-knappen i sektion 21).
    ok('Der er ingen ✕-knap på kortene længere', (await evaluate(`return document.querySelector("#exercise-list .remove-btn") === null && [...document.querySelectorAll("#exercise-list .exercise-card .exercise-card-actions button")].every(b => (b.className || "").includes("collapse"));`)) === true,
        await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card .exercise-card-actions button")].map(b => b.outerHTML.slice(0, 60)).join(" | ")'));
    ok('Dagens program giver alle programmets øvelser, i programmets rækkefølge, som kort', (await evaluate(`const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId); return ids.join(",") === programItems("upper", "A").map(i => i.exerciseId).join(",");`)) === true,
        JSON.stringify({ cards: await cardIds() }));
    ok('Sættene er præfyldt fra programmet', (await evaluate(`const first = programItems("upper", "A")[0]; const card = document.querySelector("#exercise-list .exercise-card"); return card.querySelector(".set-weight").value === String(first.weight) && card.querySelector(".set-reps").value === String(first.reps) && card.querySelectorAll(".set-weight").length === first.sets;`)) === true,
        JSON.stringify(await evaluate(`const card = document.querySelector("#exercise-list .exercise-card"); return { w: card.querySelector(".set-weight").value, r: card.querySelector(".set-reps").value, n: card.querySelectorAll(".set-weight").length, plan: programItems("upper", "A")[0] };`)));
    ok('Kortet viser programmets anbefaling, og opvarmningen følger den', (await evaluate(`
        const first = programItems("upper", "A")[0]; const ex = getExerciseById("upper", first.exerciseId);
        const card = document.querySelector("#exercise-list .exercise-card"); const block = card.querySelector(".warmup-block");
        const target = card.querySelector(".exercise-target").textContent;
        if (!block || !target.includes("Recommended: " + first.sets + " × " + first.reps + " @ " + first.weight + " kg")) return false;
        const expected = warmupSets(first.weight, ex).map(s => s.weight + " × " + s.reps);
        const shown = [...block.querySelectorAll(".warmup-set")].map(s => s.textContent.replace(/\\s+/g, " ").trim());
        return expected.length > 0 && expected.every(e => shown.some(t => t.includes(e)));`)) === true,
        JSON.stringify({
            target: await evaluate('return document.querySelector("#exercise-list .exercise-target").textContent.trim()'),
            warmup: await evaluate('return [...document.querySelectorAll("#exercise-list .warmup-block .warmup-set")].map(s => s.textContent.trim()).join(" | ")'),
        }));
    ok('Opvarmningen er foldet sammen som standard', (await evaluate(`return document.querySelector("#exercise-list .warmup-block") && document.querySelector("#exercise-list .warmup-block").open === false;`)) === true);
    ok('Gem-knappen er aktiv med det samme (programmet er indlæst)', (await evaluate('return document.getElementById("save-btn").disabled')) === false);

    // ─── 2b. Teknik-cues ──────────────────────────────────────────
    console.log('\n── 2b. Teknik-cues på kortet');
    ok('Hvert kort har præcis én synlig cue (uden for <details>), og det er øvelsens egen', (await evaluate(`
        return [...document.querySelectorAll("#exercise-list .exercise-card")].every(card => {
            const cue = card.querySelector(".cue-line");
            if (!cue || card.querySelectorAll(".cue-line").length !== 1) return false;
            if (cue.offsetHeight === 0 || cue.closest("details")) return false;
            const name = card.querySelector(".exercise-name, .exercise-name-btn").textContent.replace("\\u25be", "").trim();
            const ex = ALL_EXERCISES.upper.find(e => e.name === name);
            return ex && cue.textContent.trim() === "💡 " + exerciseCue(ex);
        });`)) === true,
        JSON.stringify(await evaluate(`return [...document.querySelectorAll("#exercise-list .exercise-card")].map(card => ({ id: card.dataset.exerciseId, cue: (card.querySelector(".cue-line") || { textContent: null }).textContent }));`)));
    ok('Bench Press-kortet viser sin cue, og cuerne er ikke kopier af hinanden', (await evaluate(`const cues = [...document.querySelectorAll("#exercise-list .cue-line")].map(c => c.textContent); return cues.some(c => /Shoulder blades/.test(c)) && new Set(cues).size === cues.length;`)) === true,
        JSON.stringify(await evaluate('return [...document.querySelectorAll("#exercise-list .cue-line")].map(c => c.textContent);')));

    // ─── 3. A/B-skift ─────────────────────────────────────────────
    console.log('\n── 3. Skift til B-varianten');
    await openSession('upperB');
    ok('Skift til Upper B lægger B-programmet ind (hint: "valgt")', (await currentSession()) === 'upperB'
        && (await evaluate('return document.getElementById("variant-hint").textContent')) === 'chosen'
        && (await evaluate(`return (() => { const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name, #exercise-list .exercise-card .exercise-name-btn")].map(e => e.textContent.replace("\\u25be", "").trim()); const want = getProgram("upper", "B").map(i => ALL_EXERCISES.upper.find(e => e.id === i.exerciseId).name); return cards.length === want.length && cards.every((n, i) => n === want[i]); })()`)) === true,
        JSON.stringify({ current: await currentSession(), cards: await cardIds() }));
    ok('Der er ingen ↻-knap tilbage (A/B skiftes med ugebjælkens felter)',
        (await evaluate('return document.getElementById("program-refresh")')) === null);
    await openSession('upperA');
    ok('Og feltet for Upper A skifter tilbage med sine øvelser', (await currentSession()) === 'upperA'
        && (await evaluate(`return (() => { const cards = [...document.querySelectorAll("#exercise-list .exercise-card .exercise-name, #exercise-list .exercise-card .exercise-name-btn")].map(e => e.textContent.replace("\\u25be", "").trim()); return cards.length === getProgram("upper", "A").length && cards[0] === "Bench Press"; })()`)) === true,
        JSON.stringify({ current: await currentSession(), cards: await cardIds() }));

    // ─── 4. Rediger sæt og gem ────────────────────────────────────
    console.log('\n── 4. Rediger sæt og gem træningen');
    ok('Sæt-input opdaterer volumen på kortet', (await evaluate(`const card = document.querySelector("#exercise-list .exercise-card"); const w = card.querySelector(".set-weight"); w.value = "65"; w.dispatchEvent(new Event("input", { bubbles: true })); return card.querySelector(".volume-cell").textContent.trim() === "520";`)) === true,
        await evaluate('return document.querySelector("#exercise-list .volume-cell").textContent'));
    ok('Opvarmningen følger den rettede vægt (og forbliver åben mens man retter)', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        card.querySelector(".warmup-block").open = true;
        card.querySelectorAll(".set-weight").forEach(w => { w.value = "65"; w.dispatchEvent(new Event("input", { bubbles: true })); });
        const t = card.querySelector(".warmup-block").textContent;
        return card.querySelector(".warmup-block").open === true && t.includes("working weight 65 kg") && t.includes("32.5 × 8") && t.includes("55 × 3");`)) === true,
        await evaluate('return document.querySelector("#exercise-list .warmup-block").textContent.replace(/\\s+/g, " ").slice(0, 120)'));
    await evaluate('document.querySelector("#exercise-list .add-set-btn").click(); return true;');
    await sleep(150);
    ok('Tilføj sæt giver 4 sæt på første øvelse, uden at røre de andre', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[0].querySelectorAll(".set-weight").length')) === 4
        && (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[1].querySelectorAll(".set-weight").length')) === 3);
    await saveBtn(300);
    // Man skal stå på det pas ugen kalder det næste — og det er ikke "samme dag, næste
    // variant": Upper A → Lower A. Ugebjælkens "next" og det pas man står på peger
    // samme sted, og kortene er det programs øvelser.
    const efterGem = await evaluate(`return (() => {
        const current = (document.querySelector("#week-strip .week-chip.current") || {dataset:{}}).dataset.session;
        const next = (document.querySelector("#week-strip .week-chip.next") || {dataset:{}}).dataset.session;
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        const want = getProgram(current.slice(0, -1), current.slice(-1)).map(i => i.exerciseId);
        return { current, next, cards, want };
    })();`);
    ok('Efter gem står man på ugens næste pas (Upper A → Lower A), og ugebjælken peger samme sted',
        efterGem.current === 'lowerA' && efterGem.next === 'lowerA'
        && JSON.stringify(efterGem.cards) === JSON.stringify(efterGem.want),
        JSON.stringify(efterGem));
    ok('Træningen ligger i localStorage med kun de udfyldte sæt (65 kg er med)', (await evaluate(`
        ${readWorkouts}
        const bp = w[0] && w[0].exercises.find(e => e.exerciseId === "bench_press");
        const other = w[0] && w[0].exercises.find(e => e.exerciseId === "lat_pulldown");
        return w.length === 1 && w[0].day === "upper" && w[0].variant === "A" && w[0].exercises.length === 6
            && bp.sets.length === 4 && other.sets.length === 3 && bp.sets[0].weight === 65;`)) === true,
        String(await storage('gym_tracker_workouts')).slice(0, 200));

    // ─── 5. Persistens + rotation efter reload ────────────────────
    console.log('\n── 5. Reload: persistens og A/B-rotation');
    await load(URL_UNDER_TEST);
    ok('Data overlever reload, og man står stadig på ugens næste pas ("foreslået" igen)', (await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length')) === 1
        && (await currentSession()) === 'lowerA'
        && (await evaluate('return document.getElementById("variant-hint").textContent')) === 'suggested',
        JSON.stringify({ current: await currentSession(), hint: await evaluate('return document.getElementById("variant-hint").textContent') }));

    // ─── 6. Historik, deling og regler ────────────────────────────
    console.log('\n── 6. Historik, deling og regler');
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(200);
    ok('Historik-panelet åbner og viser træningen med det bedste sæt', (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === true
        && (await evaluate('return document.getElementById("history-content").innerText')).includes('Bench Press')
        && (await evaluate('return document.querySelectorAll("#history-content .hist-set.best").length')) > 0,
        await evaluate('return document.getElementById("history-content").innerText.slice(0, 120)'));
    await evaluate('document.getElementById("close-history").click(); return true;');
    await sleep(150);
    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(200);
    const shareText = await evaluate('return document.getElementById("share-text").value;');
    ok('Del-teksten indeholder reglerne: uge-overskrift, sæt, bedste og fremgang',
        shareText.includes('NEW SINCE LAST') && shareText.includes('65×8')
        && shareText.includes('🏆 Best ever') && shareText.includes('📈 Progress:')
        && /NEW SINCE LAST \(\d+\) · WEEK \d+/.test(shareText), shareText.split('\n')[0]);
    await evaluate('document.getElementById("share-close").click(); return true;');
    ok('Regler-knappen og regler-modalen er væk (reglerne ligger i README)',
        (await evaluate(`return document.getElementById("program-rules") === null && document.getElementById("rules-modal") === null;`)) === true);

    // ─── 7. Lower day + mobillayout ───────────────────────────────
    console.log('\n── 7. Lower day og mobillayout');
    // Upper A er klaret i ugen, så det næste pas skal være et ben-pas — og det vælges
    // direkte i ugebjælken (der er ingen særskilt dag-vælger mere).
    ok('Næste pas i ugen er et ben-pas (upper-historik smitter ikke)', (await nextSession()) === 'lowerA');
    await openSession('lowerA');
    ok('Lower-programmet lægges ind med sine øvelser', (await currentSession()) === 'lowerA'
        && (await listText()).includes('Leg Press')
        && (await cardCount()) === (await evaluate('return getProgram("lower", "A").length')),
        JSON.stringify({ current: await currentSession(), cards: await cardCount() }));

    // Gem lower-træningen på en anden dato, så begge dage har historik
    // (træningen skal ligge i den aktuelle uge for at tælle med)
    await evaluate(`return (() => { const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]"); w.push({ id: "w_lower_1", date: isoDate(mondayOf(new Date())), day: "lower", variant: "A", exercises: [{ exerciseId: "squat", sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] }); localStorage.setItem("gym_tracker_workouts", JSON.stringify(w)); return true; })()`);
    await load(URL_UNDER_TEST);
    ok('Kun de to B-pas mangler i ugen', (await evaluate(`const left = SESSION_ORDER.filter(k => !weekDone()[k]); return left.length === 2 && left.join(",") === "upperB,lowerB";`)) === true,
        JSON.stringify(await evaluate('return SESSION_ORDER.filter(k => !weekDone()[k]);')));
    await openSession('lowerB');
    ok('Lower B viser Calf Raise (Leg Press)', (await listText()).includes('Calf Raise (Leg Press)'));

    // ─── 8. Mobillayout: fast knappeposition ved varierende tekstlængde ──
    // Dags-skiftet lagde den nye dags program ind — øvelseslisten er fyldt til
    // layout-testen uden at man skal trykke på noget.
    console.log('\n── 8. Mobillayout: fast knappeposition ved varierende tekstlængde');
    await sleep(250);
    ok('Øvelseslisten er fyldt op til layout-testen', (await cardCount()) > 0);

    async function layoutAt(width) {
        await S('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
        await sleep(300);
        return evaluate(`return (() => {
            const doc = document.documentElement;
            const rows = [...document.querySelectorAll('#exercise-list .exercise-card')];
            const rects = rows.map(r => r.getBoundingClientRect());
            const rightEls = rows.map(r => r.querySelector('.collapse-btn'));
            const edgeOffsets = rows.map((r, i) => rightEls[i] ? Math.round(rects[i].right - rightEls[i].getBoundingClientRect().right) : -1);
            // Klap-knappen sidder bevidst i toppen af kortet, ikke lodret centreret
            const topOffsets = rows.map((r, i) => rightEls[i] ? Math.round(rightEls[i].getBoundingClientRect().top - rects[i].top) : -1);
            const spillWho = rows.flatMap((r, i) => [...r.querySelectorAll('*')]
                .filter(el => { const eb = el.getBoundingClientRect(); return eb.width > 0 && (eb.right > rects[i].right + 1 || eb.left < rects[i].left - 1); })
                .map(el => (r.dataset.exerciseId || i) + ':' + (el.className || el.tagName)));
            return { count: rows.length, widths: [...new Set(rects.map(r => Math.round(r.width)))], edgeOffsets, topOffsets, spill: spillWho.length, spillWho, overflow: doc.scrollWidth - doc.clientWidth };
        })()`);
    }

    const spread = a => Math.max(...a) - Math.min(...a);
    for (const width of [320, 390]) {
        const g = await layoutAt(width);
        ok(`[${width}px] alle ${g.count} kort lige brede, klap-knappen samme sted, intet stikker ud, intet overflow`,
            g.count > 0 && g.widths.length === 1 && spread(g.edgeOffsets) <= 1
            && spread(g.topOffsets) <= 1 && g.spill === 0 && g.overflow <= 1,
            JSON.stringify({ widths: g.widths, edge: g.edgeOffsets, top: g.topOffsets, spill: g.spillWho, overflow: g.overflow }));
    }

    // Selve regressionen: gør navnet markant længere — klap-knappen må ikke flytte sig.
    // (Det var netop fejlen før: et langt øvelsesnavn skubbede knappen ud af rækken.)
    await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(250);
    const before = await evaluate(`return (() => { const c = document.querySelector("#exercise-list .exercise-card"); const b = c.querySelector(".collapse-btn").getBoundingClientRect(); return Math.round(c.getBoundingClientRect().right - b.right); })()`);
    await evaluate(`return (() => { document.querySelectorAll("#exercise-list .exercise-card").forEach(c => { const name = c.querySelector(".exercise-name-btn") || c.querySelector(".exercise-name"); name.insertAdjacentText("afterbegin", "Incline Dumbbell Press med ekstra langt navn og mere tekst "); }); return true; })()`);
    await sleep(200);
    const after = await evaluate(`return (() => { const cards = [...document.querySelectorAll("#exercise-list .exercise-card")]; const edges = cards.map(c => { const b = c.querySelector(".collapse-btn").getBoundingClientRect(); return Math.round(c.getBoundingClientRect().right - b.right); }); return { offset: edges[0], spread: Math.max(...edges) - Math.min(...edges) }; })()`);
    ok(`Klap-knappen flytter sig ikke ved lang tekst (før ${before}px, efter ${after.offset}px)`, before === after.offset);
    ok('Klap-knapperne holder samme afstand til kanten selv med lang tekst', after.spread <= 1, `spredning ${after.spread}px`);
    await load(URL_UNDER_TEST);
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(200);

    // ─── 9. Byt en øvelse (samme muskelgruppe) ────────────────────
    // Man bytter en øvelse ud med en anden i samme muskelgruppe, og byttet huskes
    // for den dag+variant.
    console.log('\n── 9. Byt en øvelse til en anden i samme muskelgruppe');
    await fresh('upperA');

    const menu = await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        card.querySelector(".exercise-name-btn").click();
        const after = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        const opts = [...after.querySelectorAll(".swap-option")];
        return { count: opts.length, ids: opts.map(o => o.dataset.swapId),
            current: (opts.find(o => o.classList.contains("current")) || { dataset: {} }).dataset.swapId || null,
            muscles: opts.map(o => (ALL_EXERCISES.upper.find(e => e.id === o.dataset.swapId) || {}).muscle) };
    })()`);
    // Luk listen igen — et næste klik på navnet i pickSwap skal åbne den, ikke lukke den
    await evaluate(`return (() => { const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press"); const btn = card && card.querySelector(".exercise-name-btn"); if (btn) btn.click(); return true; })()`);
    ok('Bytte-listen åbner når man trykker på navnet, med øvelsen selv markeret øverst',
        menu.count > 1 && menu.current === 'bench_press', JSON.stringify(menu));
    ok('Alle valg deler muskelgruppe med Bench Press — og rummer ikke andre gruppers øvelser',
        menu.muscles.every(m => String(m).split('/').map(s => s.trim()).includes('Chest'))
        && !menu.ids.includes('lat_pulldown') && !menu.ids.includes('ez_bar_curl'),
        JSON.stringify(menu.muscles));
    ok('Øvelser der allerede står i dagens træning tilbydes ikke', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        const opts = [...card.querySelectorAll(".swap-option")].map(o => o.dataset.swapId);
        const inSession = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return opts.every(id => id === "bench_press" || !inSession.includes(id));`)) === true);

    // Vælg en anden øvelse: kortet og anbefalingen følger med
    await pickSwap('bench_press', 'chest_press_machine');
    await sleep(300);
    ok('Kortet viser den nye øvelse på samme plads, med programmets anbefaling', (await cardIds())[0] === 'chest_press_machine'
        && (await listText()).includes('Chest Press (Machine)') && !(await listText()).includes('Bench Press')
        && /Recommended: \d+ × \d+/.test(await evaluate(`return (document.querySelector('#exercise-list .exercise-card[data-exercise-id="chest_press_machine"] .exercise-target') || {textContent:''}).textContent;`)),
        JSON.stringify({ ids: await cardIds(), target: await evaluate('return document.querySelector("#exercise-list .exercise-target").textContent') }));
    ok('Byttet gemmes, så det huskes næste gang', (await evaluate(`const s = JSON.parse(localStorage.getItem("gym_tracker_program_swaps") || "{}"); return s.upperA && s.upperA.bench_press === "chest_press_machine";`)) === true,
        String(await storage('gym_tracker_program_swaps', '{}')));

    // Byttet overlever en reload og gælder kun den dag+variant
    await load(URL_UNDER_TEST);
    ok('Efter reload står den byttede øvelse der stadig', (await cardIds())[0] === 'chest_press_machine');
    await openSession('upperB');
    ok('Byttet gælder kun Upper A (ikke B)', !(await listText()).includes('Chest Press (Machine)'),
        (await listText()).includes('Chest Press (Machine)') ? 'Chest Press står i Upper B' : '');
    await openSession('upperA');

    // Byt tilbage til programmets øvelse: overriden fjernes
    await pickSwap('chest_press_machine', 'bench_press');
    await sleep(300);
    ok('Man kan bytte tilbage til programmets øvelse, og så er overriden væk',
        (await listText()).includes('Bench Press') && (await storage('gym_tracker_program_swaps', '{}')) === '{}',
        String(await storage('gym_tracker_program_swaps', '{}')));

    // Tallene hører til øvelsen, ikke til rækken. Bytter man Leg Press (225 kg) til
    // Leg Extension, må de 225 kg ikke følge med — Leg Extension vejer 70 kg.
    await openSession('lowerA');
    const lpMenu = await openSwap('leg_press');
    ok('Leg Press kan byttes til Leg Extension og til Bulgarian Split Squat',
        lpMenu.hasButton === true && lpMenu.opts.includes('leg_extension') && lpMenu.opts.includes('bulgarian_split'),
        JSON.stringify(lpMenu));
    const legExtSwap = await pickSwap('leg_press', 'leg_extension');
    await sleep(300);
    const extCard = await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_extension");
        if (!card) return { found: false };
        const row = getProgram("lower", "B").find(r => r.exerciseId === "leg_extension");
        return { found: true,
            plan: (card.querySelector(".exercise-target") || { textContent: "" }).textContent.trim(),
            weights: [...card.querySelectorAll(".set-weight")].map(i => Number(i.value)),
            reps: [...card.querySelectorAll(".set-reps")].map(i => Number(i.value)),
            sets: card.querySelectorAll(".set-weight").length,
            row: { sets: row.sets, reps: row.reps, weight: row.weight } };
    })()`);
    ok('Anbefalingen og felterne er Leg Extensions egne tal — ikke Leg Press\' 225 kg',
        legExtSwap === true && extCard.found
        && extCard.plan.includes('@ ' + extCard.row.weight + ' kg') && !extCard.plan.includes('225')
        && extCard.sets === extCard.row.sets
        && extCard.weights.every(w => w === extCard.row.weight)
        && extCard.reps.every(r => r === extCard.row.reps)
        && !extCard.weights.includes(225), JSON.stringify(extCard));

    // ─── 9b. Byt direkte fra øvelseskortet ────────────────────────
    // Navnet på kortet er indgangen til samme bytte-liste, også midt i en træning.
    console.log('\n── 9b. Byt direkte fra øvelseskortet');
    await fresh('upperA');

    const fromCard = await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.querySelector(".exercise-name-btn") && c.querySelector(".exercise-name-btn").textContent.includes("Bench Press"));
        card.querySelector(".exercise-name-btn").click();
        const after = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.querySelector(".exercise-name-btn") && c.querySelector(".exercise-name-btn").textContent.includes("Bench Press"));
        const opts = [...after.querySelectorAll(".swap-option")];
        return { inCard: opts.map(o => o.dataset.swapId),
            expected: swapCandidates("upper", "bench_press").map(c => c.id).join(","),
            muscles: opts.map(o => (ALL_EXERCISES.upper.find(e => e.id === o.dataset.swapId) || {}).muscle),
            current: (opts.find(o => o.classList.contains("current")) || { dataset: {} }).dataset.swapId || null,
            slot: after.querySelector(".exercise-name-btn").dataset.swapSlot };
    })()`);
    ok('Kortets navn åbner bytte-listen: samme kandidater som reglen giver, øvelsen markeret, rækken kendt',
        fromCard.inCard.length > 1 && fromCard.inCard.join(',') === fromCard.expected
        && fromCard.muscles.every(m => String(m).split('/').map(s => s.trim()).includes('Chest'))
        && fromCard.current === 'bench_press' && fromCard.slot === 'bench_press',
        JSON.stringify(fromCard));

    // Vælg en anden øvelse fra kortet: byttet skal ramme programrækken og huskes
    await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")]
            .find(c => c.querySelector(".exercise-name-btn") && c.querySelector(".exercise-name-btn").textContent.includes("Bench Press"));
        [...card.querySelectorAll(".swap-option")].find(o => o.dataset.swapId === "chest_press_machine").click();
        return true;
    })()`);
    await sleep(300);
    ok('Kortet viser den byttede øvelse, programrækken følger med, og dagen har ingen dubletter', (await evaluate(`
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return programItems("upper","A")[0].exerciseId === "chest_press_machine"
            && new Set(ids).size === ids.length && ids.length === getProgram("upper", "A").length
            && /Recommended: \\d+ × \\d+/.test(document.querySelector('#exercise-list .exercise-card[data-exercise-id="chest_press_machine"] .exercise-target').textContent);`)) === true,
        JSON.stringify({ ids: await cardIds(), plan0: await evaluate('return programItems("upper","A")[0].exerciseId') }));
    // Invarianten: hver bytte-knap peger på en række der findes i programmet.
    ok('Alle kort i dagens træning peger på en programrække', (await evaluate(`
        const slots = programItems("upper", "A").map(i => i.swappedFrom || i.exerciseId);
        return [...document.querySelectorAll("#exercise-list .exercise-card")].every(c => {
            const btn = c.querySelector(".exercise-name-btn");
            return !btn || slots.includes(btn.dataset.swapSlot); });`)) === true);

    // Del-rapportens "per hand"/"per leg"-linje afhænger af om de delte træninger
    // indeholder en øvelse med en loadNote. Datadrevet, så en ny øvelse med loadNote
    // ikke kræver en ændring her.
    await openSession('lowerA');
    const noteSaved = await storage('gym_tracker_workouts');
    const noteCheck = await evaluate(`return (() => {
        const found = ["upper", "lower"].map(day => ({ day, ex: ALL_EXERCISES[day].find(e => e.loadNote) })).filter(x => x.ex)[0];
        if (!found) return { skipped: true };
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        w.push({ id: "note_1", date: "2026-09-28", day: found.day, variant: "A",
            exercises: [{ exerciseId: found.ex.id, sets: [{ weight: 20, reps: 8 }] }] });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify(w));
        return { name: found.ex.name, loadNote: found.ex.loadNote };
    })()`);
    if (noteCheck.skipped) {
        console.log('  – ingen øvelse med loadNote i databasen; noten kan ikke efterprøves');
    } else {
        await load(URL_UNDER_TEST);
        const noteShareText = await evaluate(`return (() => {
            document.getElementById("btn-share").click();
            const sel = document.getElementById("share-scope");
            sel.value = "all"; sel.dispatchEvent(new Event("change"));
            const t = document.getElementById("share-text").value;
            document.getElementById("share-close").click();
            return t;
        })()`);
        ok('Del-rapporten oplyser "per hånd"/"per ben" for de øvelser der kræver det',
            new RegExp(`ℹ️ ${noteCheck.loadNote} = kg per side: .*${noteCheck.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(noteShareText),
            JSON.stringify({ name: noteCheck.name, loadNote: noteCheck.loadNote }));
        // Ryd op igen: resten af forløbet regner med den oprindelige log
        await evaluate(`localStorage.setItem("gym_tracker_workouts", ${JSON.stringify(noteSaved || '[]')}); return true;`);
        await load(URL_UNDER_TEST);
    }

    // ─── 10. Rediger en gemt træning ──────────────────────────────
    // Man går hjem før den sidste øvelse og skriver 0 reps i alle dens sæt — det er
    // måden man springer en øvelse over nu, hvor ✕-knappen er væk. Den bliver stående
    // på skærmen, men kommer ikke med i loggen.
    console.log('\n── 10. Rediger en gemt træning (øvelse glemt og hentet ind bagefter)');
    await fresh('upperA');
    await skipLastExercise();
    ok('Den oversprungne øvelse står stadig på skærmen, og der er intet at hente tilbage midt i passet',
        (await cardCount()) === 6
        && (await evaluate('return document.getElementById("exercise-restore").classList.contains("hidden")')) === true,
        JSON.stringify({ cards: await cardCount() }));
    await saveBtn();

    const afterSave = await evaluate(`${readWorkouts} return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0, day: w[0] && w[0].day, variant: w[0] && w[0].variant };`);
    ok('Træningen blev gemt (1 træning, 5 øvelser), og ugens næste pas ligger klar', afterSave.count === 1 && afterSave.ex === 5
        && (await currentSession()) === 'lowerA', JSON.stringify({ afterSave, current: await currentSession() }));

    // Historikken: én træning, med Rediger-knap — gå i redigeringstilstand
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    ok('Redigering indlæser træningens 5 øvelser med banner og Update-knap', (await cardCount()) === 5
        && (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === false
        && (await evaluate(`return !document.getElementById("edit-banner").classList.contains("hidden") && document.getElementById("edit-banner").textContent.includes("Editing Upper");`)) === true
        && (await evaluate(`return document.getElementById("save-btn").textContent.includes("Update workout");`)) === true
        && (await currentSession()) === 'upperA',
        JSON.stringify({ cards: await cardCount(), banner: await evaluate('return (document.getElementById("edit-banner")||{textContent:""}).textContent') }));

    // Hent den glemte øvelse ind igen ved at trykke på "restore"-linjen
    await evaluate('document.getElementById("btn-restore").click(); return true;');
    await sleep(300);
    ok('Øvelsen er hentet tilbage på sin plads, og "Hent tilbage"-linjen er væk', (await evaluate(`
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return ids.join(",") === programItems("upper", "A").map(i => i.exerciseId).join(",")
            && document.getElementById("exercise-restore").classList.contains("hidden");`)) === true,
        JSON.stringify({ ids: await cardIds() }));

    await saveBtn(350);
    const afterEdit = await evaluate(`${readWorkouts} return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0, hasNew: w[0] ? w[0].exercises.some(e => e.exerciseId === "ez_bar_curl") : false, day: w[0] && w[0].day, variant: w[0] && w[0].variant };`);
    ok('Redigeringen gemmer i samme træning (samme id/dato, 6 øvelser, ingen dublet)',
        afterEdit.count === 1 && afterEdit.id === afterSave.id && afterEdit.date === afterSave.date
        && afterEdit.ex === 6 && afterEdit.hasNew === true && afterEdit.day === 'upper'
        && afterEdit.variant === afterSave.variant, JSON.stringify({ afterSave, afterEdit }));
    ok('Redigeringstilstanden er forladt, knappen tilbage til "Save workout"', (await evaluate(`return document.getElementById("edit-banner").classList.contains("hidden") && document.getElementById("save-btn").textContent.includes("Save workout");`)) === true);

    // Historikken afspejler den opdaterede træning; annuller må ikke skrive noget
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    ok('Historikken viser den tilføjede øvelse og 6 øvelser', (await evaluate(`return document.getElementById("history-content").innerText.includes("Bicep Curl (EZ-bar)") && /6 exercises/.test(document.querySelector("#history-content .history-workout-meta").textContent);`)) === true);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(300);
    await skriv('#exercise-list .exercise-card .set-reps', '3');
    await sleep(250);
    ok('Man kan rette et sæt under redigering (der er ændret noget at annullere)', (await evaluate('return document.querySelector("#exercise-list .exercise-card .set-reps").value')) === '3'
        && (await cardCount()) === 6);
    await evaluate('document.getElementById("edit-cancel").click(); return true;');
    await sleep(300);
    const afterCancel = await evaluate(`${readWorkouts} return { count: w.length, ex: w[0] ? w[0].exercises.length : 0 };`);
    ok('Annuller efterlader træningen uændret, lægger dagens program tilbage og skjuler banneret',
        afterCancel.ex === 6 && afterCancel.count === 1
        && (await cardCount()) > 0
        && (await evaluate('return document.getElementById("edit-banner").classList.contains("hidden")')) === true
        && (await evaluate('return document.getElementById("save-btn").disabled')) === false,
        JSON.stringify({ afterCancel, cards: await cardCount() }));

    // ─── 11. Bevidst overskrivning (bekræftet ønsket) ─────────────
    // Gemmer man igen samme dag og dagstype, skal den gemte træning overskrives
    // frem for at der laves en ny. Bemærk at appen samtidig roterer til næste
    // A/B-variant, så den overskrevne træning får det program man indlæste.
    console.log('\n── 11. Gem igen samme dag overskriver i stedet for at dublere');
    await sleep(250);
    const variantNow = await evaluate('return (document.querySelector("#week-strip .week-chip.current")||{dataset:{}}).dataset.session.slice(-1)');
    await saveBtn(300);
    const afterResave = await evaluate(`${readWorkouts} return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0, variant: w[0] && w[0].variant };`);
    ok('Gem igen samme dag giver stadig kun én træning med samme id og dato',
        afterResave.count === 1 && afterResave.id === afterSave.id && afterResave.date === afterSave.date
        && afterResave.ex > 0 && afterResave.variant === variantNow,
        JSON.stringify({ afterResave, variantNow }));
    ok('Ingen dublet på samme dato og dagstype', (await evaluate(`${readWorkouts} return w.filter(x => x.date === "${afterSave.date}" && x.day === "upper").length;`)) === 1);

    // ─── 12. Uge-opdelt deling ───────────────────────────────────
    console.log('\n── 12. Uge-opdelt deling med tegnbudget');

    // Fixture bygget af appens egne programmer, så øvelses-id'er ikke kan drive
    await fresh();
    await evaluate(`return (() => {
        const mk = (id, date, day, variant) => ({ id, date, day, variant,
            exercises: getProgram(day, variant).map((item, idx) => ({
                exerciseId: item.exerciseId,
                sets: [0, 1, 2].map(n => ({ weight: 40 + idx * 5 + n * 2.5, reps: 8 })),
            })) });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([
            mk("u40a", "2026-09-28", "upper", "A"), mk("l40a", "2026-09-30", "lower", "A"),
            mk("u41b", "2026-10-05", "upper", "B"), mk("l41b", "2026-10-07", "lower", "B"),
        ]));
        return true;
    })()`);
    await load(URL_UNDER_TEST);

    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(300);
    const shareOpts = await evaluate(`return [...document.getElementById("share-scope").options].map(o => ({ v: o.value, t: o.textContent }));`);
    ok('Vælgeren tilbyder "kun nyt", begge uger og alle uger — og "kun nyt" er standard',
        shareOpts.length === 4 && shareOpts[0].v === 'new' && /Only new since last \(4 workouts\)/.test(shareOpts[0].t)
        && shareOpts.filter(o => o.v.startsWith('week:')).length === 2 && shareOpts[3].v === 'all'
        && (await evaluate('return document.getElementById("share-scope").value')) === 'new',
        JSON.stringify(shareOpts));
    ok('Eksporten af det nye er under Discords 2.000 tegn, og tælleren bekræfter det', (await evaluate('return document.getElementById("share-text").value.length')) <= 2000
        && /fits in one message/.test(await evaluate('return document.getElementById("share-size").textContent')),
        await evaluate('return document.getElementById("share-text").value.length + " tegn: " + document.getElementById("share-size").textContent'));

    // Vælg en bestemt uge
    await evaluate(`return (() => { const sel = document.getElementById("share-scope"); sel.value = "week:2026-W41"; sel.dispatchEvent(new Event("change")); return true; })()`);
    await sleep(250);
    const weekText = await evaluate('return document.getElementById("share-text").value');
    ok('Valg af en uge viser kun den uge, med træningerne og bedste-listen — og passer i én besked',
        weekText.includes('WEEK 41') && !weekText.includes('WEEK 40')
        && weekText.includes('5.10 UPPER B') && weekText.includes('7.10 LOWER B')
        && weekText.includes('🏆 Best ever') && weekText.length <= 2000,
        `${weekText.length} tegn; ${weekText.split('\n').slice(0, 5).join(' / ')}`);
    ok('Uge-label viser interval og antal træninger', /Week 40 \(\d+\.\d+–\d+\.\d+\) · 2 workouts/.test(
        (shareOpts.find(o => o.v === 'week:2026-W40') || {}).t || ''), (shareOpts.find(o => o.v === 'week:2026-W40') || {}).t);
    ok('Tælleren viser tallet for den valgte uge', (await evaluate('return document.getElementById("share-size").textContent')).includes(String(weekText.length)));

    // Kopiér → automatisk markering af netop den viste uge
    await evaluate('document.getElementById("share-copy").click(); return true;');
    await sleep(400);
    const sharedState = await evaluate(`return (() => {
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return { total: w.length, shared: w.filter(x => x.sharedAt).length,
            onlyWeek41: w.filter(x => x.sharedAt).every(x => x.date >= "2026-10-05") };
    })()`);
    ok('Kopiering markerer kun den valgte uges 2 træninger som delt', sharedState.shared === 2
        && sharedState.onlyWeek41 === true, JSON.stringify(sharedState));
    ok('Markeringen vises i vælgeren', (await evaluate(`return [...document.getElementById("share-scope").options].find(o => o.value === "week:2026-W41").textContent;`)).includes('✓ shared'));

    // Genåbn: "kun nyt" tilbyder nu kun det resterende
    await evaluate('document.getElementById("share-modal-close").click(); return true;');
    await sleep(200);
    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(300);
    ok('Efter deling tilbyder "kun nyt" kun de resterende 2', /Only new since last \(2 workouts\)/.test(await evaluate(`return [...document.getElementById("share-scope").options].map(o => o.textContent).join(" | ");`)));

    await evaluate('document.getElementById("share-copy").click(); return true;');
    await sleep(400);
    const afterAll = await evaluate(`return (() => { const sel = document.getElementById("share-scope"); return { values: [...sel.options].map(o => o.value), value: sel.value }; })()`);
    ok('Når alt er delt, forsvinder "kun nyt" fra listen, og alle 4 er markeret som delt',
        !afterAll.values.includes('new')
        && (afterAll.value.startsWith('week:') || afterAll.value === 'all')
        && (await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).filter(x => x.sharedAt).length')) === 4,
        JSON.stringify(afterAll));

    // ─── 13. Programmet er dagens træning, uanset historik ────────
    // Programmets øvelser ER dagens træning. Historikken bestemmer kun hvilke vægte
    // der er lagt ind — ikke hvilke øvelser man ser.
    console.log('\n── 13. Programmet er dagens træning, uanset historik');

    // Fixture: én Upper-A-træning med KUN to af programmets øvelser. Resten har
    // dermed ingen historik og skal alligevel stå både i programmet og i dagens træning.
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`localStorage.setItem("gym_tracker_workouts", JSON.stringify([{ id: "u_fil", date: "2026-09-28", day: "upper", variant: "A", exercises: [
        { exerciseId: "bench_press",  sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
        { exerciseId: "lat_pulldown", sets: [{ weight: 59, reps: 10 }, { weight: 59, reps: 10 }] }] }])); return true;`);
    await load(URL_UNDER_TEST);
    const progA = await evaluate('return getProgram("upper","A").length');

    // Rotationen foreslår nu B (sidste upper var A) — vis A, som har historikken
    await openSession('upperA');
    ok('Dagens træning er programmets øvelser, ikke kun dem med historik', (await cardCount()) === progA
        && (await evaluate(`return document.getElementById("program-content") === null && !!document.getElementById("week-strip") && document.getElementById("program-toggle") === null && document.getElementById("progressive-section") === null && document.getElementById("progressive-list") === null && document.getElementById("progressive-toggle") === null;`)) === true,
        JSON.stringify({ cards: await cardCount(), progA }));
    // Historikken vises der hvor den hører: tallene på kortet. Programmets anbefaling
    // (65 kg) står ved siden af den vægt der er lagt ind fra sidst (60 kg).
    const prefill = await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        return { entered: card.querySelector(".set-weight").value,
            recommended: card.querySelector(".exercise-target").textContent,
            plan: programItems("upper", "A").find(i => i.exerciseId === "bench_press") };
    })()`);
    ok('Kortet åbner med sidste uges vægt (60 kg), og anbefalingen fra programmet står ved siden af',
        prefill.entered === '60'
        && prefill.recommended.includes(`Recommended: ${prefill.plan.sets} × ${prefill.plan.reps} @ ${prefill.plan.weight} kg`)
        && `${prefill.plan.weight}` !== prefill.entered, JSON.stringify(prefill));

    // Dags-skift henter den nye dags program
    await openSession('lowerA');
    const lowerShown = await cardCount();
    const lowerActive = await evaluate('return getProgram("lower", (document.querySelector("#week-strip .week-chip.current")||{dataset:{}}).dataset.session.slice(-1)).length');
    ok('Dagens træning følger med til Lower og viser hele programmet',
        lowerShown === lowerActive && lowerShown > 0, `${lowerShown} af ${lowerActive}`);

    // Kropsvægtøvelsen har et vægt-mærke i skabelonen (Back Extension = 1), så den
    // gemmes som en helt almindelig række i stedet for at falde ud af loggen.
    await fresh('lowerA');
    ok('Kortet er præfyldt med mærket fra skabelonen (Back Extension = 1 kg)', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "back_extension");
        return !!card && card.querySelector(".set-weight").value === String(programItems("lower", "A").find(i => i.exerciseId === "back_extension").weight);`)) === true,
        JSON.stringify(await evaluate(`return (() => { const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "back_extension"); return { present: !!card, w: card ? card.querySelector(".set-weight").value : null }; })()`)));
    await saveBtn(450);
    await load(URL_UNDER_TEST);
    await openSession('lowerA');
    const lowerAfter = await cardIds();
    ok('Et gem med Back Extension fjerner den ikke fra programmet — hele Lower A står der bagefter',
        lowerAfter.includes('back_extension') && lowerAfter.includes('leg_curl') && lowerAfter.includes('leg_press')
        && lowerAfter.length === (await evaluate('return getProgram("lower","A").length')), JSON.stringify(lowerAfter));

    // ─── 14. Eksempeldata ─────────────────────────────────────────
    console.log('\n── 14. Eksempeldata til preview og test');
    await fresh();

    ok('Knappen tilbyder at fylde eksempeldata ind, blokken er synlig, og knappen er på forsiden', (await evaluate(`
        const btn = document.getElementById("sample-btn"); const br = btn.getBoundingClientRect();
        return /Load sample data/.test(btn.textContent)
            && !document.getElementById("sample-section").classList.contains("hidden")
            && br.height > 0 && br.top >= 0 && br.bottom <= window.innerHeight
            && !document.getElementById("rules-modal");`)) === true,
        JSON.stringify(await evaluate(`return (() => { const btn = document.getElementById("sample-btn"); const br = btn.getBoundingClientRect(); return { text: btn.textContent, top: Math.round(br.top), hidden: document.getElementById("sample-section").classList.contains("hidden") }; })()`)));

    await evaluate('document.getElementById("sample-btn").click(); return true;');
    await sleep(450);
    const seeded = await evaluate(`return (() => {
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        return { count: w.length, allSample: w.every(x => x.sample === true), days: [...new Set(w.map(x => x.day))].sort().join(",") };
    })()`);
    ok('Eksempeldata lægges ind (12 træninger, begge dage), og knappen kan rydde igen',
        seeded.count === 12 && seeded.allSample === true && seeded.days === 'lower,upper'
        && /Clear sample data/.test(await evaluate('return document.getElementById("sample-btn").textContent')),
        JSON.stringify(seeded));

    // Pointen med funktionen: med historik kan man se virkningen med det samme i en
    // frisk browser — programmet åbner med sidste (eksempel-)uges vægte.
    await load(URL_UNDER_TEST);
    const seededPrefill = await evaluate(`return (() => { const card = document.querySelector("#exercise-list .exercise-card"); return { entered: Number(card.querySelector(".set-weight").value), hint: document.getElementById("variant-hint").textContent }; })()`);
    ok('Med eksempeldata åbner programmet med vægte fra historikken, og rotationen foreslår selv',
        seededPrefill.entered > 0 && seededPrefill.hint === 'suggested', JSON.stringify(seededPrefill));

    // Sikkerheden: så snart der ligger én rigtig træning, må knappen ikke kunne bruges
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`localStorage.setItem("gym_tracker_workouts", JSON.stringify([{ id: "rigtig_1", date: "2026-09-28", day: "upper", variant: "A", exercises: [{ exerciseId: "bench_press", sets: [{ weight: 60, reps: 8 }] }] }])); return true;`);
    await load(URL_UNDER_TEST);
    ok('Med en rigtig træning er blokken væk, og knappen er deaktiveret', (await evaluate(`
        return document.getElementById("sample-section").classList.contains("hidden")
            && document.getElementById("sample-btn").disabled === true
            && Math.round(document.getElementById("sample-section").getBoundingClientRect().height) === 0;`)) === true);
    await evaluate('document.getElementById("sample-btn").click(); return true;');
    await sleep(300);
    ok('Et klik på den deaktiverede knap ændrer ikke de rigtige data', (await evaluate(`return (() => { const w = JSON.parse(localStorage.getItem("gym_tracker_workouts")); return w.length === 1 && w[0].id === "rigtig_1" && !w[0].sample; })()`)) === true);

    // ─── 15. Bytte-listerne og kortene for hele programmet ────────
    // Datadrevet med vilje: vi gennemløber programmerne i stedet for at skrive en test
    // pr. øvelse. En ny øvelse kræver derfor kun en række i EXERCISES og en cue —
    // ingen nye tests.
    console.log('\n── 15. Bytte-listerne og kortene for hele programmet');

    await fresh();

    for (const day of ['upper', 'lower']) {
        for (const variant of ['A', 'B']) {
            // Ugebjælkens felt er både dag og variant: at gå gennem alle fire pas
            // er det samme som at gå gennem hele programmet.
            await openSession(`${day}${variant}`);

            const sweep = await evaluate(`return (() => {
                const day = ${JSON.stringify(day)}; const variant = ${JSON.stringify(variant)};
                const items = getProgram(day, variant);
                const out = { rows: [], cards: [], items: items.map(i => i.exerciseId) };
                for (const card of document.querySelectorAll("#exercise-list .exercise-card")) {
                    const name = card.querySelector(".exercise-name, .exercise-name-btn").textContent.replace("\\u25be", "").trim();
                    const ex = ALL_EXERCISES[day].find(e => e.name === name);
                    const weight = Number(card.querySelector(".set-weight").value);
                    out.cards.push({ id: ex ? ex.id : null,
                        cue: card.querySelector(".cue-line").textContent.trim(),
                        expectedCue: ex && exerciseCue(ex) ? "💡 " + exerciseCue(ex) : "",
                        expectedWarmup: ex ? warmupSets(weight, ex).map(s => s.weight + " × " + s.reps) : [],
                        shownWarmup: [...card.querySelectorAll(".warmup-block .warmup-set")].map(s => s.textContent.trim()),
                        plan: (card.querySelector(".exercise-target") || { textContent: "" }).textContent.trim() });
                }
                const cardById = id => [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === id);
                const inSession = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
                for (const id of programItems(day, variant).map(i => i.exerciseId)) {
                    const card = cardById(id);
                    const ex = ALL_EXERCISES[day].find(e => e.id === id);
                    const groups = m => String(m).split("/").map(s => s.trim()).filter(Boolean);
                    const shares = (a, b) => groups(b).some(g => groups(a).includes(g));
                    const expected = ALL_EXERCISES[day]
                        .filter(e => shares(e.muscle, ex.muscle) && e.id !== "romanian_deadlift" && (e.id === id || !inSession.includes(e.id)))
                        .sort((a, b) => {
                            if (a.id === id) return -1;
                            if (b.id === id) return 1;
                            return (a.muscle === ex.muscle ? 0 : 1) - (b.muscle === ex.muscle ? 0 : 1);
                        }).map(e => e.id);
                    const btn = card.querySelector(".exercise-name-btn");
                    let opts = null;
                    if (btn) {
                        btn.click();
                        opts = [...cardById(id).querySelectorAll(".swap-option")].map(o => ({
                            id: o.dataset.swapId, current: o.classList.contains("current"),
                            muscle: (ALL_EXERCISES[day].find(e => e.id === o.dataset.swapId) || {}).muscle }));
                        cardById(id).querySelector(".exercise-name-btn").click();
                    }
                    out.rows.push({ id, muscle: ex.muscle, hasButton: !!btn, opts, expected });
                }
                return out;
            })()`);

            const badCue = sweep.cards.filter(c => !c.id || c.cue !== c.expectedCue).map(c => c.id).join(', ');
            ok(`${day}${variant}: hvert kort viser øvelsens egen cue og sin opvarmning`,
                badCue === '' && sweep.cards.every(c => JSON.stringify(c.shownWarmup) === JSON.stringify(c.expectedWarmup)),
                [badCue, ...sweep.cards.filter(c => JSON.stringify(c.shownWarmup) !== JSON.stringify(c.expectedWarmup))
                    .map(c => `${c.id}: [${c.expectedWarmup}] ≠ [${c.shownWarmup}]`)].filter(Boolean).join(' · '));
            ok(`${day}${variant}: listen viser præcis dagens øvelser, og hvert kort viser programmets anbefaling`,
                sweep.rows.map(r => r.id).join(',') === sweep.items.join(',')
                && sweep.cards.every(c => /^🎯 Recommended: \d+ × \d+/.test(c.plan)),
                `${sweep.rows.map(r => r.id).join(',')} vs ${sweep.items.join(',')}`);
            ok(`${day}${variant}: bytte-listen er hele muskelgruppen (minus dagens træning), kun når der er noget at bytte til`,
                sweep.rows.every(r => r.hasButton === (r.expected.length > 1)
                    && (!r.hasButton || (r.opts.map(o => o.id).join(',') === r.expected.join(',') && r.opts.filter(o => o.current).length === 1))),
                sweep.rows.filter(r => r.hasButton !== (r.expected.length > 1)
                    || (r.hasButton && r.opts.map(o => o.id).join(',') !== r.expected.join(',')))
                    .map(r => `${r.id}: [${(r.opts || []).map(o => o.id)}] ≠ [${r.expected}]`).join(' · '));
            ok(`${day}${variant}: alle valg deler en muskelgruppe — og Romanian Deadlift tilbydes aldrig`,
                sweep.rows.every(r => !r.hasButton
                    || (r.opts.every(o => String(o.muscle).split('/').map(s => s.trim())
                        .some(g => r.muscle.split('/').map(s => s.trim()).includes(g)))
                        && !r.opts.some(o => o.id === 'romanian_deadlift'))),
                sweep.rows.filter(r => r.hasButton && (r.opts.some(o => !String(o.muscle).split('/').map(s => s.trim())
                    .some(g => r.muscle.split('/').map(s => s.trim()).includes(g))) || r.opts.some(o => o.id === 'romanian_deadlift')))
                    .map(r => `${r.id}: ${r.opts.map(o => o.id + '=' + o.muscle).join(', ')}`).join(' · '));
        }
    }

    // Antallet af øvelser pr. dag er loftet, ikke et mål: programmet fylder ikke op selv
    await fresh();
    ok('Dagens træning har højst MAX_PER_DAY øvelser', (await evaluate(`
        let worst = 0;
        for (const day of ["upper", "lower"]) { for (const variant of ["A", "B"]) worst = Math.max(worst, getProgram(day, variant).length); }
        return worst <= MAX_PER_DAY && worst > 0;`)) === true);

    // ─── 16. Programmet husker vægte og sæt fra sidste gang ───────
    console.log('\n── 16. Programmet husker vægte og sæt fra sidste gang');
    await fresh('lowerB');

    ok('Uden historik vises skabelonens tal, og linjen fortæller at det er programmet', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_curl");
        const plan = programItems("lower", "B").find(i => i.exerciseId === "leg_curl");
        return card.querySelector(".exercise-target").textContent.includes("Recommended: " + plan.sets + " × " + plan.reps + " @ " + plan.weight + " kg")
            && /Your Lower B program/.test(document.getElementById("program-memory").textContent);`)) === true,
        await evaluate('return document.querySelector("#exercise-list .exercise-card .exercise-target").textContent.trim()'));

    // Kør en træning: ret vægten, sæt 0 reps på den sidste øvelse (sprunget over), gem
    const templateCount = await cardCount();
    await skipLastExercise();
    await skriv('#exercise-list .exercise-card .set-weight', '99');
    await sleep(300);
    await saveBtn(450);
    ok('Den oversprungne øvelse er ikke med i den gemte træning', (await evaluate(`${readWorkouts} return w.length === 1 && w[0].variant === "B" && w[0].exercises.length === ${templateCount - 1};`)) === true,
        String(await storage('gym_tracker_workouts')).slice(0, 200));

    // Næste gang: samme øvelser og vægte som sidst — uden at man bygger noget op
    await load(URL_UNDER_TEST);
    await openSession('lowerB');
    ok('Programmet er stadig hele skabelonen, den rettede vægt (99 kg) er husket, og "Husker"-linjen vises',
        (await cardCount()) === templateCount
        && (await evaluate('return document.querySelector("#exercise-list .exercise-card .set-weight").value')) === '99'
        && (await evaluate('return document.getElementById("program-memory").classList.contains("hidden")')) === false
        && /Same exercises and weights as your Lower B on/.test(await evaluate('return document.getElementById("program-memory").textContent')),
        JSON.stringify({ cards: await cardCount(), w: await evaluate('return document.querySelector("#exercise-list .exercise-card .set-weight").value'), memory: await evaluate('return document.getElementById("program-memory").textContent') }));
    // Anbefalingen er programmets tal, også når man har løftet noget andet: den skal
    // kunne ses mens man retter tallene, og den flytter sig ikke med dem.
    ok('Anbefalingen på kortet er programmets tal, ikke det man tastede', (await evaluate(`
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        const plan = programItems("lower", "B");
        return cards.every((c, i) => c.querySelector(".exercise-target").textContent
            .includes("Recommended: " + plan[i].sets + " × " + plan[i].reps + " @ " + plan[i].weight + " kg"));`)) === true,
        await evaluate('return document.querySelector("#exercise-list .exercise-card .exercise-target").textContent.trim()'));

    // ─── 16b. Ugen: hvad der er klaret, og låsen mod to ens pas ────
    // Han skal kunne se hvor i ugen han er, og appen skal ikke lade ham gemme
    // samme dag+variant to gange i samme uge.
    console.log('\n── 16b. Ugen: status, næste pas og låsen');

    await fresh();
    ok('Ugebjælken viser fire pas i træningsordenen og ugenummeret; med tom log er intet klaret', (await evaluate(`
        const chips = [...document.querySelectorAll("#week-strip .week-chip")];
        const label = document.querySelector("#week-strip .week-label").textContent;
        return chips.length === 4 && /Week \\d+/.test(label)
            && chips.map(c => c.textContent.replace(/✓|next/g, "").trim()).join(",") === "Upper A,Lower A,Upper B,Lower B"
            && chips.every(c => !c.classList.contains("done"))
            && chips.filter(c => c.classList.contains("next")).length === 1
            && document.querySelector("#week-strip .week-chip.next").dataset.session === "upperA";`)) === true,
        await evaluate('return document.getElementById("week-strip").innerText'));

    // Gem dagens pas, og se det blive krydset af i ugen
    await saveBtn(450);
    ok('Det gemte pas står som klaret i ugen, og næste pas er et ben-pas', (await evaluate(`
        const chip = document.querySelector('#week-strip .week-chip[data-session="upperA"]');
        const next = document.querySelector("#week-strip .week-chip.next");
        return chip.classList.contains("done") && chip.textContent.includes("✓") && !!next && next.dataset.session.indexOf("lower") === 0;`)) === true,
        await evaluate('return document.getElementById("week-strip").innerText'));

    // Låsen: et pas fra en anden dag i samme uge må ikke gemmes igen
    await evaluate(`return (() => {
        const t = new Date(); const d = mondayOf(t);
        if (isoDate(d) === isoDate(t)) d.setDate(d.getDate() + 1);
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        w.push({ id: "w_week_dupe", date: isoDate(d), day: "upper", variant: "B", exercises: [
            { exerciseId: "chest_supported_row", sets: [{ weight: 24, reps: 12 }] }] });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify(w));
        return isoDate(d);
    })()`);
    await load(URL_UNDER_TEST);
    await openSession('upperB');
    ok('Upper B er markeret som klaret, advarslen står ved passet, og gem-knappen fortæller at passet er låst', (await evaluate(`
        return document.querySelector('#week-strip .week-chip[data-session="upperB"]').classList.contains("done")
            && !document.getElementById("session-warning").classList.contains("hidden")
            && /Upper B is already logged this week/.test(document.getElementById("session-warning").textContent)
            && /already logged this week/.test(document.getElementById("save-info").textContent);`)) === true,
        JSON.stringify({
            warning: await evaluate('return document.getElementById("session-warning").innerText'),
            info: await evaluate('return document.getElementById("save-info").textContent'),
        }));

    const countBefore = await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length');
    await saveBtn(400);
    ok('Et låst pas kan ikke gemmes (ingen ny træning), og man får en forklaring', (await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length')) === countBefore
        && /already logged/.test(await evaluate('return (document.querySelector(".toast") || {textContent: ""}).textContent')),
        await evaluate('return (document.querySelector(".toast") || {textContent: "(ingen toast)"}).textContent'));

    // "Log anyway" lukker op for dem der bevidst vil køre passet igen
    await evaluate(`return (() => { const b = document.getElementById("btn-log-anyway"); if (!b) return false; b.click(); return true; })()`);
    await sleep(300);
    // Datoen læses præcis som appen skriver den (getTodayStr = UTC-dato, ikke lokal —
    // de to afviger efter midnat lokal tid), så påstanden ikke kan skævhed mellem gem
    // og påstand.
    const gemDato = await evaluate('return new Date().toISOString().split("T")[0]');
    await saveBtn(450);
    ok('"Log anyway" gør det muligt at gemme alligevel, og advarslen er væk bagefter', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return w.some(x => x.date === "${gemDato}" && x.day === "upper" && x.variant === "B")
            && document.getElementById("session-warning").classList.contains("hidden");`)) === true,
        await evaluate('return JSON.stringify(JSON.parse(localStorage.getItem("gym_tracker_workouts")).map(x => x.date + " " + x.day + x.variant))'));

    ok('Et chip i ugebjælken skifter pas med fokus-linjen', (await evaluate(`
        const chip = [...document.querySelectorAll("#week-strip .week-chip")].find(c => c.dataset.session === "lowerB");
        chip.click();
        return document.getElementById("session-label").textContent === "Lower B"
            && (document.querySelector("#week-strip .week-chip.current")||{dataset:{}}).dataset.session === "lowerB"
            && document.getElementById("session-focus").textContent === SESSION_FOCUS.lowerB;`)) === true,
        await evaluate('return document.getElementById("session-label").textContent'));

    // ─── 17. Coach notes-panelet ──────────────────────────────────
    console.log('\n── 17. Coach notes-panelet');
    await load(URL_UNDER_TEST);
    // Netværket stubber vi: testen skal ikke afhænge af, at gisten svarer.
    await evaluate(`return (() => {
        window.__notesCalls = [];
        const md = '# Coach notes\\n\\n## Week 41 · 5–11 Oct 2026\\n\\n**Load up**\\n- Bench Press 65×8×3 → 67.5×6-8\\n';
        window.fetch = (url, opts) => {
            window.__notesCalls.push({ url: url, cache: opts && opts.cache });
            return Promise.resolve({ ok: true, status: 200,
                json: () => Promise.resolve({ files: { 'weekly-notes.md': { content: md, truncated: false } } }),
                text: () => Promise.resolve(md) });
        };
        return true;
    })()`);
    ok('Noterne hentes ikke ved indlæsning (kun når panelet åbnes)', (await evaluate('return window.__notesCalls.length')) === 0);

    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(400);
    ok('Panelet åbner og henter fra gist-API\'et (ikke raw-linket), og beder om at omgå cachen', (await evaluate('return document.getElementById("notes-panel").classList.contains("open")')) === true
        && /^https:\/\/api\.github\.com\/gists\/[0-9a-f]+$/.test((await evaluate('return window.__notesCalls[0].url')) || '')
        && (await evaluate('return window.__notesCalls[0].cache')) === 'no-store',
        JSON.stringify(await evaluate('return window.__notesCalls')));
    ok('Ugen vises med overskrift, punkterne som liste, og noterne er ikke HTML-injiceret', (await evaluate(`
        const c = document.getElementById("notes-content");
        return c.textContent.includes("Week 41 · 5–11 Oct 2026")
            && document.querySelectorAll("#notes-content .notes-list li").length === 1
            && document.querySelectorAll("#notes-content .notes-list li")[0].textContent.includes("Bench Press 65×8×3")
            && document.querySelectorAll("#notes-content .notes-week").length === 1;`)) === true,
        await evaluate('return document.getElementById("notes-content").textContent.slice(0, 120)'));
    await evaluate('document.getElementById("close-notes").click(); return true;');
    await sleep(300);
    ok('Panelet lukker med ✕, og historik-panelet er ikke i vejen', (await evaluate('return document.getElementById("notes-panel").classList.contains("open")')) === false
        && (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === false);

    // Død forbindelse: appen skal kunne bruges, og panelet sige det med ord
    await evaluate('window.fetch = () => Promise.reject(new Error("offline")); return true;');
    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(400);
    ok('Død forbindelse giver en besked i panelet, ikke en tom rude — og appen virker stadig', (await evaluate('return document.getElementById("notes-content").textContent')).includes('Could not load the notes')
        && (await cardCount()) > 0, await evaluate('return document.getElementById("notes-content").textContent.slice(0, 80)'));
    await evaluate('document.getElementById("close-notes").click(); return true;');
    await sleep(250);
    ok('Ingen JS-fejl fra notes-panelet', pageErrors.length === 0, JSON.stringify(pageErrors));

    // ─── 18. Byt en øvelse mens en gemt træning redigeres ─────────
    // Klage: efter "Save" → historik → Rediger kunne Leg Press ikke byttes, mens
    // det virkede fint i en ny træning. Redigeringstilstanden må ikke låse byttet.
    console.log('\n── 18. Bytte under redigering af en gemt træning');
    await fresh('lowerB');
    await saveBtn();
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    ok('Redigering af Lower B indlæser træningen', (await cardIds()).includes('leg_press'));

    const editSwap = await openSwap('leg_press');
    ok('Leg Press har stadig en bytte-knap under redigering, med Bulgarian Split Squat i listen',
        editSwap.hasButton === true && editSwap.opts.includes('bulgarian_split'), JSON.stringify(editSwap));
    await pickSwap('leg_press', 'bulgarian_split');
    await sleep(300);
    ok('Valget skifter øvelsen på kortet under redigering', (await cardIds()).includes('bulgarian_split'),
        JSON.stringify(await cardIds()));
    await saveBtn(400);
    ok('Opdateringen gemmer den byttede øvelse i den gemte træning', (await evaluate(`${readWorkouts} return w.length === 1 && w[0].exercises.some(e => e.exerciseId === "bulgarian_split") && !w[0].exercises.some(e => e.exerciseId === "leg_press");`)) === true,
        await evaluate('return JSON.stringify((JSON.parse(localStorage.getItem("gym_tracker_workouts")||"[]")[0]||{}).exercises?.map(e=>e.exerciseId))'));

    // ─── 18b. Husket bytte + gammel gemt træning ──────────────────
    // Har man byttet Leg Press væk i programmet, viser et ældre gemt pas stadig Leg
    // Press. Kortet skal kunne byttes alligevel — det var det der ikke virkede.
    await fresh('lowerB');
    await saveBtn();
    // Efter gem rykker appen til næste pas i ugen — tilbage til Lower B, som er det
    // gemte pas, byttet skal ramme.
    await openSession('lowerB');
    // Byt Leg Press væk i selve programmet (huskes for lowerB)
    await pickSwap('leg_press', 'lunges');
    await sleep(300);
    const programSwapIds = await cardIds();
    ok('Programmet husker byttet (Leg Press → Lunges)', programSwapIds.includes('lunges'), programSwapIds.join(','));

    // Åbn den gamle træning (den indeholder stadig Leg Press) og prøv at bytte den
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    const oldSweep = await openSwap('leg_press');
    ok('Leg Press i en ældre gemt træning har stadig en bytte-knap, selv om programmet er byttet videre',
        oldSweep.hasButton === true && oldSweep.opts.includes('bulgarian_split'), JSON.stringify(oldSweep));
    await pickSwap('leg_press', 'bulgarian_split');
    await sleep(300);
    ok('Valget skifter Leg Press i den ældre træning', (await cardIds()).includes('bulgarian_split'),
        JSON.stringify(await cardIds()));
    await saveBtn(400);
    ok('Opdateringen gemmer det nye bytte i den ældre træning', (await evaluate(`${readWorkouts} return w.length === 1 && w[0].exercises.some(e => e.exerciseId === "bulgarian_split") && !w[0].exercises.some(e => e.exerciseId === "leg_press");`)) === true,
        await evaluate('return JSON.stringify((JSON.parse(localStorage.getItem("gym_tracker_workouts")||"[]")[0]||{}).exercises?.map(e=>e.exerciseId))'));

    const smallBtns = await evaluate(`return (() => {
        const btns = [...document.querySelectorAll("button")].filter(b => b.offsetParent !== null);
        return btns.filter(b => b.getBoundingClientRect().height < 28)
            .map(b => (b.id || b.className) + "=" + Math.round(b.getBoundingClientRect().height) + "px");
    })()`);
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
        const fields = await evaluate(`return [...document.querySelectorAll("input, select, textarea")]
            .filter(f => f.offsetParent !== null)
            .map(f => ({ felt: (f.id || f.className || f.tagName.toLowerCase()), px: parseFloat(getComputedStyle(f).fontSize) }));`);
        const smaa = fields.filter(x => !(x.px >= 16));
        ok(`Intet synligt felt under 16px i "${hvor}" (${fields.length} målt)`, fields.length > 0 && smaa.length === 0,
            smaa.map(x => `${x.felt}=${x.px}px`).join(', '));
        return fields.length;
    };

    await maalFelter('træningskortene');

    // 16px i et sæt-tabel kan presse kolonnerne, så siden får vandret scroll — det ville
    // være en dårligere kur end zoomet.
    const overflow = await evaluate(`return (() => {
        return { sideBredde: document.documentElement.scrollWidth, viewport: window.innerWidth,
            tabelOver: [...document.querySelectorAll("#exercise-list .sets-table")]
                .filter(t => t.scrollWidth > t.clientWidth + 1)
                .map(t => (t.closest(".exercise-card") || {}).dataset ? t.closest(".exercise-card").dataset.exerciseId : "tabel") };
    })()`);
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

    await fresh();

    const firstWeight = '#exercise-list .exercise-card:first-child .set-weight';
    const firstReps = '#exercise-list .exercise-card:first-child .set-reps';
    const foersteOevelse = await evaluate('return programItems("upper", "A")[0].exerciseId');
    const nulstilFelt = async () => evaluate(`return (document.querySelector(${JSON.stringify(firstWeight)}) || {value: null}).value;`);

    await skriv(firstWeight, '87.5');
    await skriv(firstReps, '9');
    await sleep(700); // debouncen skal have skrevet ned

    const draftEfterTastning = await evaluate('return localStorage.getItem("gym_tracker_draft")');
    ok('Det tastede skrives ned mens man taster (før man gemmer), og linjen under gem-linjen viser det',
        !!draftEfterTastning
        && JSON.parse(draftEfterTastning).upperA
        && JSON.parse(draftEfterTastning).upperA.exercises[0].sets[0].weight === 87.5
        && JSON.parse(draftEfterTastning).upperA.exercises[0].sets[0].reps === 9
        && (await evaluate(`return !!document.getElementById("draft-note") && !document.getElementById("draft-note").classList.contains("hidden") && /Kept if the page reloads/.test(document.getElementById("draft-note").textContent);`)) === true,
        String(draftEfterTastning).slice(0, 180));

    // Genindlæsningen — det er her tallene forsvandt før
    await load(URL_UNDER_TEST);
    ok('Det tastede står der igen efter genindlæsning, med besked og hele passet, og anbefalingen er uændret', (await evaluate(`return document.querySelector("${firstWeight}").value;`)) === '87.5'
        && (await evaluate(`return document.querySelector("${firstReps}").value;`)) === '9'
        && /Restored what you had typed/.test(await evaluate('return document.getElementById("toast-container").textContent'))
        && (await cardCount()) === (await evaluate('return programItems("upper", "A").length'))
        && (await evaluate(`
            const card = document.querySelector("#exercise-list .exercise-card"); const plan = programItems("upper", "A")[0];
            return card.querySelector(".exercise-target").textContent.includes("Recommended: " + plan.sets + " × " + plan.reps + " @ " + plan.weight + " kg");`)) === true,
        JSON.stringify({ w: await nulstilFelt(), r: await evaluate(`return document.querySelector("${firstReps}").value;`),
            toast: await evaluate('return document.getElementById("toast-container").textContent.slice(0, 60)') }));

    // Siden kan forsvinde uden varsel: så skrives der med det samme, uden at vente
    // på debouncen (et træk nedad genindlæser siden, og fanen kan smides ud).
    await evaluate('localStorage.removeItem("gym_tracker_draft"); return true;');
    await skriv(firstWeight, '92.5');
    await evaluate('window.dispatchEvent(new Event("pagehide")); return true;');
    const draftVedPagehide = await evaluate('return localStorage.getItem("gym_tracker_draft")');
    ok('Når siden forsvinder, skrives det tastede ned med det samme',
        !!draftVedPagehide && JSON.parse(draftVedPagehide).upperA.exercises[0].sets[0].weight === 92.5,
        String(draftVedPagehide).slice(0, 180));

    // Et pas der er gemt, er ikke længere et udkast
    await saveBtn(500);
    ok('Træningen blev gemt med det tastede tal, udkastet ligger ikke længere på passet, og linjen er væk', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        const drafts = JSON.parse(localStorage.getItem("gym_tracker_draft") || "{}");
        const el = document.getElementById("draft-note");
        return w.length === 1 && w[0].exercises[0].sets[0].weight === 92.5 && !drafts.upperA
            && (!el || el.classList.contains("hidden") || el.textContent === "");`)) === true,
        String(await storage('gym_tracker_workouts')).slice(0, 160));
    await load(URL_UNDER_TEST);
    ok('Og der bliver ikke lagt noget gammelt tilbage ved næste åbning', (await evaluate('return document.getElementById("toast-container").textContent')).indexOf('Restored') === -1);

    // Et udkast fra en tidligere uge er ikke noget man er i gang med
    await fresh();
    await evaluate(`localStorage.setItem("gym_tracker_draft", JSON.stringify({ upperA: { week: "2020-W01", editingId: null, exercises: [{ exerciseId: ${JSON.stringify(foersteOevelse)}, sets: [{ weight: 111, reps: 3 }] }] } })); return true;`);
    await load(URL_UNDER_TEST);
    ok('Et udkast fra en tidligere uge lægges ikke tilbage og smides væk i stedet for at blive liggende', (await evaluate(`return document.querySelector("${firstWeight}").value;`)) !== '111'
        && (await evaluate('return !JSON.parse(localStorage.getItem("gym_tracker_draft") || "{}").upperA;')) === true);

    // Og et udkast hører til sit eget pas: det må ikke dukke op i et andet
    await fresh();
    await skriv(firstWeight, '83.5');
    await sleep(700);
    const passet = await currentSession();
    const andetPas = passet === 'upperA' ? 'upperB' : 'upperA';
    await openSession(andetPas);
    ok(`Udkastet for ${passet} dukker ikke op i ${andetPas}, og der er ikke skrevet et udkast på det`, (await evaluate('return document.querySelector("#exercise-list .exercise-card .set-weight").value;')) !== '83.5'
        && (await evaluate(`return !JSON.parse(localStorage.getItem("gym_tracker_draft") || "{}")[${JSON.stringify(andetPas)}];`)) === true);
    await openSession(passet);
    ok('Tilbage på passet står det tastede der igen', (await evaluate(`return document.querySelector("${firstWeight}").value;`)) === '83.5');

    // Brugerens egen sag: passet er ALLEREDE gemt i denne uge, så ugen-låsen står i
    // baren (og appen foreslår et andet pas). Udkastet skal stadig lægges tilbage —
    // man kan være i gang med et ekstra pas, eller være i gang med at rette noget.
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`return (() => {
        const d = new Date(); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off);
        const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([{ id: "w_man", date: iso, day: "upper", variant: "A",
            exercises: [{ exerciseId: "bench_press", sets: [{ weight: 72.5, reps: 8 }] }] }]));
        return true;
    })()`);
    await load(URL_UNDER_TEST);
    // Siden man forlod skrev sit eget udkast ned under navigationen (pagehide), så
    // udkastet ryddes på den NYE side — ellers stod det gamle tastede (83.5) i feltet.
    await evaluate('localStorage.removeItem("gym_tracker_draft"); return true;');
    await openSession('upperA');
    ok('Passet er allerede gemt i ugen (ugen-låsen står i baren), og programmets vægt står i feltet før man taster',
        /already logged this week/.test(await evaluate('return document.getElementById("save-info").textContent'))
        && (await evaluate(`return document.querySelector("${firstWeight}").value;`)) === '72.5',
        String(await nulstilFelt()));
    await skriv(firstWeight, '70');
    await sleep(700);
    await load(URL_UNDER_TEST);
    await openSession('upperA');
    ok('Det tastede kommer tilbage selv om passet allerede er gemt i ugen', (await evaluate(`return document.querySelector("${firstWeight}").value;`)) === '70',
        String(await nulstilFelt()));

    // ─── 21. Klap en færdig øvelse sammen ─────────────────────────
    // Man er ikke altid færdig i programmets rækkefølge: den man er færdig med skal kunne
    // klappes sammen (kortets eneste knap), og det huskes pr. pas — også over en genindlæsning.
    console.log('\n── 21. Klap en færdig øvelse sammen');

    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    // Siden man forlod i forrige sektion skriver sit eget udkast ned under navigationen
    // (pagehide), så den nye side står med det. Det ryddes, og passet indlæses forfra, så
    // kortene her starter som programmet (3 sæt, ikke det 1-sæts pas der blev efterladt).
    await evaluate('localStorage.removeItem("gym_tracker_draft"); loadProgram(); restoreDraft(); renderAll(); return true;');

    const kort = i => `#exercise-list .exercise-card[data-index="${i}"]`;
    const antalKlappede = () => evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length');
    const klap = async i => {
        await evaluate(`document.querySelector(${JSON.stringify(kort(i) + ' .collapse-btn')}).click(); return true;`);
        await sleep(250);
    };
    const viser = expr => evaluate(`const c = document.querySelector(${JSON.stringify(kort(0))}); return ${expr};`);

    ok('Kortet har kun klap-knappen i hovedet — der er ingen ✕ tilbage', (await evaluate(`
        return document.querySelector("#exercise-list .remove-btn") === null
            && [...document.querySelectorAll("#exercise-list .exercise-card")]
                .every(c => c.querySelectorAll(".exercise-card-actions button").length === 1);`)) === true);

    await skriv(`${kort(0)} .set-weight`, '77.5');
    await skriv(`${kort(0)} .set-reps`, '6');
    await sleep(700);
    await klap(0);

    ok('Et tryk klapper kortet sammen: navnet står, sæt-felterne er væk',
        (await viser(`c.classList.contains("collapsed") && c.querySelectorAll(".set-weight").length === 0
            && c.querySelectorAll(".sets-table").length === 0 && !!c.querySelector(".exercise-name, .exercise-name-btn")`)) === true);
    ok('I stedet står der hvor mange sæt der har tal, og hvor mange kg',
        (await viser(`(() => { const el = c.querySelector(".collapsed-summary"); if (!el) return false;
            const ex = state.exercises[0];
            const volume = ex.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
            return el.textContent === ex.sets.length + "/" + ex.sets.length + " sets · " + volume.toFixed(0) + " kg"; })()`)) === true,
        String(await viser('(c.querySelector(".collapsed-summary") || {}).textContent || "intet sammendrag"')));
    ok('Kun det ene kort er klappet sammen — de andre er urørt',
        (await antalKlappede()) === 1 && (await evaluate('return document.querySelectorAll("#exercise-list .sets-table").length')) > 0);

    await load(URL_UNDER_TEST);
    ok('Genindlæsningen folder ikke kortet ud igen, og tallene er der stadig',
        (await antalKlappede()) === 1
        && (await viser(`(() => { const el = c.querySelector(".collapsed-summary"); if (!el) return false;
            return c.classList.contains("collapsed") && el.textContent.includes("3/3 sets"); })()`)) === true,
        String(await viser('(c.querySelector(".collapsed-summary") || {}).textContent || "intet sammendrag"')));

    await klap(0);
    ok('Samme knap folder ud igen, med tallene i behold',
        (await viser(`(() => { const f = c.querySelector(".set-weight"); if (!f) return false;
            return !c.classList.contains("collapsed") && f.value === "77.5"; })()`)) === true);

    await openSession('upperB');
    ok('Et andet pas starter foldet ud', (await antalKlappede()) === 0);
    await openSession('upperA');
    await klap(1);
    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(500);
    await openSession('upperA');
    ok('Et gem rydder listen', (await antalKlappede()) === 0);

    // ── Bytte på et klappet kort ──────────────────────────────────
    // Bytte-listen tegnes i kortets krop, og et klappet kort har ingen krop: et tryk på
    // navnet skal derfor folde kortet ud, ellers sker der ingenting på skærmen.
    const kortTilstand = i => evaluate(`return (() => { const c = document.querySelector(${JSON.stringify(kort(i))});
        if (!c) return null;
        return { klappet: c.classList.contains("collapsed"),
            menu: !!c.querySelector(".swap-menu"), valg: c.querySelectorAll(".swap-option").length,
            felter: c.querySelectorAll(".set-weight").length }; })()`);
    const bytteKort = await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].findIndex(c => c.querySelector(".exercise-name-btn"));');
    const bytteNavn = kort(bytteKort) + ' .exercise-name-btn';
    ok('Der er et kort med en bytte-liste at trykke på', bytteKort >= 0, `data-index: ${bytteKort}`);

    await klap(bytteKort);
    await evaluate(`document.querySelector(${JSON.stringify(bytteNavn)}).click(); return true;`);
    await sleep(300);
    const efterNavn = await kortTilstand(bytteKort);
    ok('Et tryk på navnet på et klappet kort folder kortet ud og viser bytte-listen',
        !!efterNavn && efterNavn.klappet === false && efterNavn.menu === true && efterNavn.valg > 1 && efterNavn.felter > 0,
        JSON.stringify(efterNavn));

    await evaluate(`document.querySelector(${JSON.stringify(bytteNavn)}).click(); return true;`);
    await sleep(250);
    const efterLuk = await kortTilstand(bytteKort);
    ok('Bytte-listen kan lukkes igen uden at kortet klapper sammen af sig selv',
        !!efterLuk && efterLuk.klappet === false && efterLuk.menu === false, JSON.stringify(efterLuk));

    // ── Animationerne ────────────────────────────────────────────
    // Overgangene måles som serier af skærmbilleder inde i siden (requestAnimationFrame) i
    // stedet for et enkelt tryk efter et fast antal millisekunder: så betyder maskinens
    // hastighed ikke noget for om der ER en overgang, kun hvad serierne indeholder.
    // Sammenklapningen kører i to trin: kroppen foldes ud af skærmen, og først derefter
    // skiftes tilstanden. Et hop på plads ville være det modsatte: klappet med det samme.
    const foldSerie = await evaluate(`return new Promise(resolve => {
        const vaelger = ${JSON.stringify(kort(0))};
        const krop = c => [...c.children].filter(el => !el.classList.contains("exercise-card-header"));
        const samples = [];
        const t0 = performance.now();
        document.querySelector(vaelger).querySelector(".collapse-btn").click();
        const tick = () => {
            // Kortet hentes på ny hver frame: tilstanden der skifter, tegner listen om, og en
            // fastholdt knude står derefter tilbage med klasserne fra før.
            const c = document.querySelector(vaelger);
            samples.push({ collapsing: c.classList.contains("collapsing"), klappet: c.classList.contains("collapsed"),
                folded: krop(c).map(el => getComputedStyle(el).animationName).includes("foldAway") });
            if (performance.now() - t0 < 400) requestAnimationFrame(tick);
            else resolve(samples);
        };
        requestAnimationFrame(tick);
    })`);
    const midtUnderFold = foldSerie.filter(s => s.collapsing);
    const efterFold = await kortTilstand(0);
    ok('Sammenklapningen folder kroppen ud af skærmen først og skifter derpå tilstand',
        midtUnderFold.length > 0 && midtUnderFold.every(s => s.klappet === false && s.folded === true)
        && foldSerie[foldSerie.length - 1].klappet === true && !!efterFold && efterFold.klappet === true,
        JSON.stringify({ antalSamplinger: foldSerie.length, midtUnderFold: midtUnderFold.slice(0, 2), slut: foldSerie[foldSerie.length - 1] }));

    // Delings-modalen toner ind og ud i stedet for at hoppe. Mens den toner ud, er den
    // stadig tegnet (display), fordi display skifter til sidst (allow-discrete).
    const indSerie = await evaluate(`return new Promise(resolve => {
        const el = document.getElementById("share-modal");
        const samples = [];
        const t0 = performance.now();
        document.getElementById("btn-share").click();
        const tick = () => { samples.push(Number(getComputedStyle(el).opacity));
            if (performance.now() - t0 < 400) requestAnimationFrame(tick); else resolve(samples); };
        requestAnimationFrame(tick);
    })`);
    const udSerie = await evaluate(`return new Promise(resolve => {
        const el = document.getElementById("share-modal");
        const samples = [];
        const t0 = performance.now();
        document.getElementById("share-modal-close").click();
        const tick = () => { samples.push({ o: Number(getComputedStyle(el).opacity), display: getComputedStyle(el).display });
            if (performance.now() - t0 < 400) requestAnimationFrame(tick); else resolve(samples); };
        requestAnimationFrame(tick);
    })`);
    const tonerUd = udSerie.filter(s => s.o > 0 && s.o < 1);
    ok('Delings-modalen toner ind og ud i stedet for at hoppe',
        indSerie.some(o => o > 0 && o < 1) && indSerie[indSerie.length - 1] === 1
        && tonerUd.length > 0 && tonerUd.some(s => s.display !== 'none')
        && udSerie[udSerie.length - 1].display === 'none',
        JSON.stringify({ ind: indSerie.slice(0, 3), ud: udSerie.slice(0, 3), slut: udSerie[udSerie.length - 1] }));

    // Har man slået bevægelse fra i systemet, sker skiftet med det samme — også i JS, der
    // ikke venter på en animation man har bedt om at slippe for.
    await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate(`document.querySelector(${JSON.stringify(kort(1) + ' .collapse-btn')}).click(); return true;`);
    const udenBevægelse = await kortTilstand(1);
    await S('Emulation.setEmulatedMedia', { features: [] });
    ok('Er bevægelse slået fra i systemet, klapper kortet sammen med det samme',
        !!udenBevægelse && udenBevægelse.klappet === true, JSON.stringify(udenBevægelse));

    ok('Ingen uventede console-fejl', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

    console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);

    ws.close();
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* Chrome kan stadig skrive profilfiler */ }
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('FEJL:', err); process.exit(1); });
