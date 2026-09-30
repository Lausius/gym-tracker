// Browser-verifikation af gym-tracker via Chrome DevTools Protocol.
// Kører den fulde brugerrejse i en rigtig browser og tjekker localStorage-persistens.
// Kør: node tests/browser-check.js [url]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_UNDER_TEST = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const CHROME = '/home/lausius/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const PORT = 9223;
const PROFILE = path.join(os.tmpdir(), 'gt-chrome-' + Date.now());

const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function main() {
    const chrome = spawn(CHROME, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
        '--window-size=390,844', 'about:blank',
    ], { stdio: 'ignore' });

    // Vent på at DevTools-endpointet svarer
    let version;
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
            if (res.ok) { version = await res.json(); break; }
        } catch { /* ikke klar endnu */ }
        await sleep(250);
    }
    if (!version) { console.error('Kunne ikke starte Chrome'); chrome.kill(); process.exit(1); }
    console.log(`\nChrome: ${version['Browser']}\nURL: ${URL_UNDER_TEST}\n`);

    const ws = new WebSocket(version.webSocketDebuggerUrl);
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

    // Opret en fane og attach til den
    const { result: target } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: attached } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const session = attached.sessionId;
    const S = (method, params) => send(method, params, session);

    await S('Runtime.enable');
    await S('Page.enable');

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
    await load(URL_UNDER_TEST);
    ok('Siden indlæses uden JS-fejl', pageErrors.length === 0, JSON.stringify(pageErrors));
    ok('Titel er Gym Tracker', (await evaluate('return document.title')) === 'Gym Tracker');
    ok('Program-sektionen viser øvelser', (await evaluate('return document.querySelectorAll("#program-content .program-exercise").length')) > 0);
    ok('Ingen historik → foreslår Upper A', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'A');
    ok('Hint siger "foreslået"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'foreslået');
    ok('Gem-knappen er disabled uden øvelser', (await evaluate('return document.getElementById("save-btn").disabled')) === true);

    // ─── 2. Indlæs program ────────────────────────────────────────
    console.log('\n── 2. Indlæs Upper A-programmet');
    await evaluate('document.getElementById("program-load").click(); return true;');
    await sleep(250);
    ok('7 øvelser tilføjet fra Upper A', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 7);
    ok('Alle programrækker viser ✓ Tilføjet', (await evaluate('return [...document.querySelectorAll("#program-content .program-ex-added")].length')) === 7);
    ok('Gem-knappen er nu aktiv', (await evaluate('return document.getElementById("save-btn").disabled')) === false);
    ok('Bench Press står i øvelseslisten', (await evaluate('return document.getElementById("exercise-list").innerText.includes("Bench Press")')) === true);
    ok('Sæt er præfyldt fra programmet (60 kg × 8)', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        const w = card.querySelector(".set-weight").value;
        const r = card.querySelector(".set-reps").value;
        return w === "60" && r === "8";
    `)) === true);

    // ─── 3. A/B-skift ─────────────────────────────────────────────
    console.log('\n── 3. Skift til B-varianten');
    await evaluate('document.querySelector(\'.variant-btn[data-variant="B"]\').click(); return true;');
    await sleep(150);
    ok('B-knappen er aktiv', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'B');
    ok('Hint skifter til "valgt"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'valgt');
    ok('Upper B viser Incline Dumbbell Press', (await evaluate('return document.getElementById("program-content").innerText.includes("Incline Dumbbell Press")')) === true);
    ok('Upper B viser ikke Bench Press', (await evaluate('return document.getElementById("program-content").innerText.includes("Bench Press")')) === false);
    await evaluate('document.getElementById("program-refresh").click(); return true;');
    await sleep(150);
    ok('↻ skifter tilbage til A', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'A');
    ok('Dagens øvelser er urørt af variantskift (stadig 7)', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 7);

    // ─── 4. Rediger sæt og gem ────────────────────────────────────
    console.log('\n── 4. Rediger sæt og gem træningen');
    ok('Sæt-input opdaterer volumen', (await evaluate(`
        const card = document.querySelector("#exercise-list .exercise-card");
        const w = card.querySelector(".set-weight");
        w.value = "65";
        w.dispatchEvent(new Event("input", { bubbles: true }));
        return card.querySelector(".volume-cell").textContent.trim() === "520";
    `)) === true);
    await evaluate('document.querySelector("#exercise-list .add-set-btn").click(); return true;');
    await sleep(150);
    ok('Tilføj sæt giver 4 sæt på første øvelse', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[0].querySelectorAll(".set-weight").length')) === 4);
    ok('De øvrige øvelser har stadig 3 sæt', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[1].querySelectorAll(".set-weight").length')) === 3);

    await evaluate('document.getElementById("save-btn").click(); return true;');
    await sleep(300);
    ok('Øvelseslisten er tømt efter gem', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 0);
    ok('Træningen ligger i localStorage', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        return w.length === 1 && w[0].day === "upper" && w[0].variant === "A" && w[0].exercises.length === 7;
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
    ok('Foreslået variant er igen markeret "foreslået"', (await evaluate('return document.getElementById("variant-hint").textContent')) === 'foreslået');
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
    ok('Del-modal genererer tekst med overblik', shareText.includes('TRÆNINGSOVERBLIK') && shareText.includes('65×8'));
    ok('Del-teksten indeholder fremgang pr. øvelse', shareText.includes('FREMGANGSHISTORIK PER ØVELSE'));
    await evaluate('document.getElementById("share-close").click(); return true;');

    await evaluate('document.getElementById("program-rules").click(); return true;');
    await sleep(150);
    ok('Regler-modalen åbner', (await evaluate('return !document.getElementById("rules-modal").classList.contains("hidden")')) === true);
    await evaluate('document.getElementById("rules-close").click(); return true;');
    await sleep(150);
    ok('Regler-modalen lukker', (await evaluate('return document.getElementById("rules-modal").classList.contains("hidden")')) === true);

    // ─── 7. Lower day + mobillayout ───────────────────────────────
    console.log('\n── 7. Lower day og mobillayout');
    await evaluate('document.querySelector(\'.day-btn[data-day="lower"]\').click(); return true;');
    await sleep(250);
    ok('Lower-variant foreslås A (upper-historik påvirker ikke)', (await evaluate('return document.querySelector(".variant-btn.active").dataset.variant')) === 'A');
    ok('Lower-programmet viser Squat', (await evaluate('return document.getElementById("program-content").innerText.includes("Squat")')) === true);
    await evaluate('document.getElementById("program-load").click(); return true;');
    await sleep(250);
    ok('Lower A giver 6 øvelser', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) === 6);
    ok('Deadlift findes i lower-databasen', (await evaluate(`
        const sel = document.getElementById("exercise-select");
        return [...sel.options].some(o => o.text.includes("Deadlift"));
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
    ok('Lower B viser Deadlift', (await evaluate('return document.getElementById("program-content").innerText.includes("Deadlift")')) === true);

    // Mobillayout: gentagne rækker skal have knapper i samme faste position ude i siden,
    // uanset hvor lang teksten i rækken er (iPhone-bredder).
    console.log('\n── 8. Mobillayout: fast knappeposition ved varierende tekstlængde');

    // Dags-skiftet ryddede øvelseslisten, så fyld den igen for at teste den gruppe også
    await evaluate('document.getElementById("program-load").click(); return true;');
    await sleep(250);
    ok('Øvelseslisten er fyldt op til layout-testen', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length')) > 0);

    async function layoutAt(width) {
        await S('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
        await sleep(300);
        return evaluate(`
            const doc = document.documentElement;
            const groups = [
                ['#progressive-list', '.progressive-item'],
                ['#program-content', '.program-exercise'],
                ['#exercise-list', '.exercise-card'],
            ];
            const report = [];
            for (const [container, rowSel] of groups) {
                const rows = [...document.querySelectorAll(container + ' ' + rowSel)];
                if (!rows.length) { report.push({ container, count: 0 }); continue; }
                const rects = rows.map(r => r.getBoundingClientRect());
                // Højre kant af rækkens sidste synlige barn = der hvor ＋/✕/planen skal ligge
                const edgeOffsets = rows.map((r, i) => {
                    const kids = [...r.children].filter(c => c.getBoundingClientRect().width > 0);
                    const last = kids[kids.length - 1].getBoundingClientRect();
                    return Math.round(rects[i].right - last.right);
                });
                const centerOffsets = rows.map((r, i) => {
                    const kids = [...r.children].filter(c => c.getBoundingClientRect().width > 0);
                    const last = kids[kids.length - 1].getBoundingClientRect();
                    return Math.round(Math.abs((rects[i].top + rects[i].height / 2) - (last.top + last.height / 2)));
                });
                // Øvelseskortets ✕ sidder bevidst i toppen af kortet, ikke lodret centreret
                const topOffsets = rows.map((r, i) => {
                    const kids = [...r.children].filter(c => c.getBoundingClientRect().width > 0);
                    const last = kids[kids.length - 1].getBoundingClientRect();
                    return Math.round(last.top - rects[i].top);
                });
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

    const tapTargets = await evaluate(`
        const btns = [...document.querySelectorAll("button")].filter(b => b.offsetParent !== null);
        return btns.filter(b => b.getBoundingClientRect().height < 28).length;
    `);
    ok(`Alle synlige knapper er mindst 28px høje (${tapTargets} for små)`, tapTargets === 0);

    ok('Ingen uventede console-fejl', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

    console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);

    ws.close();
    chrome.kill();
    await sleep(500);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* Chrome kan stadig skrive profilfiler */ }
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('FEJL:', err); process.exit(1); });