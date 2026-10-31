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
    // dens stderr — en fast port kan ramme en gammel Chrome-instans med gammel app.js.
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

    const { result: target } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: attached } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const session = attached.sessionId;
    const S = (method, params) => send(method, params, session);

    await S('Runtime.enable');
    await S('Page.enable');
    // Ingen HTTP-cache: ellers kan en gammel app.js overleve fra en tidligere kørsel.
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
        await sleep(400);
    }

    // Ugebjælkens felter er den eneste måde at skifte pas på: et felt hedder sin
    // nøgle — upperA, upperB, lowerA, lowerB.
    async function openSession(key) {
        await evaluate(`document.querySelector('#week-strip .week-chip[data-session="${key}"]').click(); return true;`);
        await sleep(350);
    }
    const currentSession = () => evaluate('return (document.querySelector("#week-strip .week-chip.current") || {dataset:{}}).dataset.session');
    const nextSession = () => evaluate('return (document.querySelector("#week-strip .week-chip.next") || {dataset:{}}).dataset.session');

    // ── fælles hjælpere ──────────────────────────────────────────────
    const cardIds = () => evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);');
    const cardCount = () => evaluate('return document.querySelectorAll("#exercise-list .exercise-card").length;');
    const listText = () => evaluate('return (document.getElementById("exercise-list") || {innerText: ""}).innerText;');
    const storage = (key, fallback = '[]') => evaluate(`return localStorage.getItem(${JSON.stringify(key)}) || ${JSON.stringify(fallback)};`);
    // Skriv i et felt som en rigtig bruger (input-event, så listeners og debounce får det)
    const skriv = async (sel, value) => evaluate(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("input", { bubbles: true })); return true;`);
    const saveBtn = async (wait = 400) => { await evaluate('document.getElementById("save-btn").click(); return true;'); await sleep(wait); };
    // Bytte-lister: kortet slås op på id hver gang — et klik tegner listen om.
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
    // Venter til en tilstand er indtrådt i stedet for at gætte på millisekunder
    const vent = async (expr, ms = 2000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            if (await evaluate(`return ${expr};`)) return true;
            await sleep(50);
        }
        return false;
    };

    // ─── 1. Indlæsning ────────────────────────────────────────────
    console.log('── 1. Indlæsning og initial visning');
    // Start altid fra rene data: localStorage overlever mellem kørsler.
    await load(URL_UNDER_TEST);
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    ok('Siden indlæses uden JS-fejl, med titel, pas og fokus', pageErrors.length === 0
        && (await evaluate('return document.title')) === 'Gym Tracker'
        && (await evaluate('return document.getElementById("session-label").textContent')) === 'Upper A'
        && (await evaluate('return document.getElementById("session-focus").textContent.length')) > 3,
        JSON.stringify({ errors: pageErrors }));
    ok('Dagens program er programmets øvelser, præfyldt, og gem-knappen er aktiv', (await evaluate(`return (() => {
        const cards = [...document.querySelectorAll("#exercise-list .exercise-card")];
        const want = programItems("upper", "A").map(i => i.exerciseId);
        const first = programItems("upper", "A")[0];
        return cards.map(c => c.dataset.exerciseId).join(",") === want.join(",")
            && cards[0].querySelector(".set-weight").value === String(first.weight)
            && cards[0].querySelectorAll(".set-weight").length === first.sets
            && document.getElementById("save-btn").disabled === false; })()`)) === true,
        JSON.stringify({ cards: await cardIds() }));
    ok('Gamle betjenings-elementer er væk (vælger, tilføj-knapper, ✕, ↻, programvisning)', (await evaluate(`return ["day-selector","variant-selector","first-use-banner","program-load","add-exercise-section","program-refresh","program-content","program-toggle"].every(id => document.getElementById(id) === null) && document.querySelector("#exercise-list .remove-btn") === null;`)) === true);

    // ─── 2. A/B-skift ─────────────────────────────────────────────
    console.log('\n── 2. Skift til B-varianten og tilbage');
    await openSession('upperB');
    ok('Skift til Upper B lægger B-programmet ind', (await currentSession()) === 'upperB'
        && (await cardCount()) === (await evaluate('return getProgram("upper", "B").length')),
        JSON.stringify({ current: await currentSession(), cards: await cardCount() }));
    await openSession('upperA');
    ok('Og feltet for Upper A skifter tilbage med sine øvelser', (await currentSession()) === 'upperA'
        && (await cardIds())[0] === 'bench_press');

    // ─── 3. Rediger sæt og gem ────────────────────────────────────
    console.log('\n── 3. Rediger sæt og gem træningen');
    ok('Man kan taste i felterne uden at listen tegnes om, og tilføje et sæt', (await evaluate(`const card = document.querySelector("#exercise-list .exercise-card"); const w = card.querySelector(".set-weight");
        window.__kort = card; w.value = "65"; w.dispatchEvent(new Event("input", { bubbles: true }));
        return document.querySelector("#exercise-list .exercise-card") === window.__kort;`)) === true);
    await evaluate('document.querySelector("#exercise-list .add-set-btn").click(); return true;');
    await sleep(150);
    ok('Tilføj sæt giver 4 sæt på første øvelse, uden at røre de andre', (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[0].querySelectorAll(".set-weight").length')) === 4
        && (await evaluate('return document.querySelectorAll("#exercise-list .exercise-card")[1].querySelectorAll(".set-weight").length')) === 3);
    await saveBtn(300);
    ok('Efter gem ligger træningen i localStorage med kun de udfyldte sæt', (await evaluate(`return (() => {
        ${readWorkouts}
        const bp = w[0] && w[0].exercises.find(e => e.exerciseId === "bench_press");
        const other = w[0] && w[0].exercises.find(e => e.exerciseId === "lat_pulldown");
        return w.length === 1 && w[0].day === "upper" && w[0].variant === "A" && w[0].exercises.length === 6
            && bp.sets.length === 4 && other.sets.length === 3 && bp.sets[0].weight === 65; })()`)) === true,
        String(await storage('gym_tracker_workouts')).slice(0, 200));
    ok('Efter gem står man på ugens næste pas (Upper A → Lower A), med dets program', (await currentSession()) === 'lowerA'
        && (await nextSession()) === 'lowerA'
        && (await cardCount()) === (await evaluate('return getProgram("lower", "A").length')),
        JSON.stringify({ current: await currentSession(), next: await nextSession() }));

    // ─── 4. Persistens efter reload ───────────────────────────────
    console.log('\n── 4. Reload: persistens');
    await load(URL_UNDER_TEST);
    ok('Data overlever reload, og man står stadig på ugens næste pas', (await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length')) === 1
        && (await currentSession()) === 'lowerA',
        JSON.stringify({ current: await currentSession() }));

    // ─── 5. Historik og deling ────────────────────────────────────
    console.log('\n── 5. Historik og deling');
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(200);
    ok('Historik-panelet åbner og viser træningen med det bedste sæt', (await evaluate('return document.getElementById("history-panel").classList.contains("open")')) === true
        && (await evaluate('return document.getElementById("history-content").innerText')).includes('Bench Press')
        && (await evaluate('return document.querySelectorAll("#history-content .hist-set.best").length')) > 0);
    await evaluate('document.getElementById("close-history").click(); return true;');
    await sleep(150);
    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(200);
    const shareText = await evaluate('return document.getElementById("share-text").value;');
    ok('Del-teksten indeholder reglerne (uge-overskrift, sæt, bedste, fremgang)',
        shareText.includes('NEW SINCE LAST') && shareText.includes('65×8')
        && shareText.includes('🏆 Best ever') && shareText.includes('📈 Progress:')
        && /NEW SINCE LAST \(\d+\) · WEEK \d+/.test(shareText), shareText.split('\n')[0]);
    await evaluate('document.getElementById("share-close").click(); return true;');

    // ─── 6. Lower-pas ─────────────────────────────────────────────
    console.log('\n── 6. Lower-pas og B-programmet');
    await openSession('lowerA');
    ok('Lower-programmet lægges ind med sine øvelser', (await currentSession()) === 'lowerA'
        && (await listText()).includes('Leg Press')
        && (await cardCount()) === (await evaluate('return getProgram("lower", "A").length')),
        JSON.stringify({ current: await currentSession(), cards: await cardCount() }));
    await openSession('lowerB');
    ok('Lower B viser Calf Raise (Leg Press)', (await listText()).includes('Calf Raise (Leg Press)'));

    // ─── 7. Mobillayout og felt-fontstørrelse ─────────────────────
    console.log('\n── 7. Mobillayout: knappeplacering og 16px-felter');
    await openSession('lowerA');
    await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    const layout = await evaluate(`return (() => {
        const doc = document.documentElement;
        const rows = [...document.querySelectorAll('#exercise-list .exercise-card')];
        const rects = rows.map(r => r.getBoundingClientRect());
        const rightEls = rows.map(r => r.querySelector('.collapse-btn'));
        const edges = rows.map((r, i) => rightEls[i] ? Math.round(rects[i].right - rightEls[i].getBoundingClientRect().right) : -1);
        const spill = rows.flatMap((r, i) => [...r.querySelectorAll('*')]
            .filter(el => { const eb = el.getBoundingClientRect(); return eb.width > 0 && (eb.right > rects[i].right + 1 || eb.left < rects[i].left - 1); }));
        const fields = [...document.querySelectorAll("input, select, textarea")].filter(f => f.offsetParent !== null)
            .map(f => parseFloat(getComputedStyle(f).fontSize));
        const save = document.getElementById("save-btn").getBoundingClientRect();
        return { count: rows.length, widths: [...new Set(rects.map(r => Math.round(r.width)))], edges, spill: spill.length,
            overflow: doc.scrollWidth - doc.clientWidth, smaaFelter: fields.filter(px => px < 16).length,
            gemKnap: save.height > 0 && save.top >= 0 && save.bottom <= window.innerHeight };
    })()`);
    ok('[390px] Kortene lige brede, klap-knappen på linje, intet stikker ud, ingen små felter, gem-knappen nås',
        layout.count > 0 && layout.widths.length === 1 && Math.max(...layout.edges) - Math.min(...layout.edges) <= 1
            && layout.spill === 0 && layout.overflow <= 1 && layout.smaaFelter === 0 && layout.gemKnap === true,
        JSON.stringify(layout));
    // Selve regressionen: et langt øvelsesnavn må ikke skubbe klap-knappen ud af rækken.
    const before = await evaluate(`return (() => { const c = document.querySelector("#exercise-list .exercise-card"); const b = c.querySelector(".collapse-btn").getBoundingClientRect(); return Math.round(c.getBoundingClientRect().right - b.right); })()`);
    await evaluate(`return (() => { document.querySelectorAll("#exercise-list .exercise-card").forEach(c => { const name = c.querySelector(".exercise-name-btn") || c.querySelector(".exercise-name"); name.insertAdjacentText("afterbegin", "Incline Dumbbell Press med ekstra langt navn og mere tekst "); }); return true; })()`);
    await sleep(200);
    const after = await evaluate(`return (() => { const c = document.querySelector("#exercise-list .exercise-card"); const b = c.querySelector(".collapse-btn").getBoundingClientRect(); return Math.round(c.getBoundingClientRect().right - b.right); })()`);
    ok(`Klap-knappen flytter sig ikke ved lang tekst (før ${before}px, efter ${after}px)`, before === after);
    await load(URL_UNDER_TEST);
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(200);

    // ─── 8. Byt en øvelse (fra både bytte-listen og kortets navn) ──
    console.log('\n── 8. Byt en øvelse til en anden i samme muskelgruppe');
    await fresh('upperA');
    const menu = await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        card.querySelector(".exercise-name-btn").click();
        const after = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        const opts = [...after.querySelectorAll(".swap-option")];
        const inSession = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return { ids: opts.map(o => o.dataset.swapId),
            expected: swapCandidates("upper", "bench_press").map(c => c.id).join(","),
            current: (opts.find(o => o.classList.contains("current")) || { dataset: {} }).dataset.swapId || null,
            muscles: opts.map(o => (ALL_EXERCISES.upper.find(e => e.id === o.dataset.swapId) || {}).muscle),
            slot: after.querySelector(".exercise-name-btn").dataset.swapSlot,
            inSession: inSession };
    })()`);
    // Luk listen igen — et næste klik på navnet i pickSwap skal åbne den, ikke lukke den
    await sleep(250);
    await evaluate(`return (() => { const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press"); const btn = card && card.querySelector(".exercise-name-btn"); if (btn) btn.click(); return true; })()`);
    ok('Kortets navn åbner bytte-listen: samme kandidater som reglen giver, øvelsen markeret, samme muskelgruppe, ingen der allerede står i dagens træning',
        menu.ids.length > 1 && menu.ids.join(',') === menu.expected
        && menu.muscles.every(m => String(m).split('/').map(s => s.trim()).includes('Chest'))
        && menu.current === 'bench_press' && menu.slot === 'bench_press'
        && menu.ids.every(id => id === 'bench_press' || !menu.inSession.includes(id)),
        JSON.stringify(menu));
    await pickSwap('bench_press', 'chest_press_machine');
    await sleep(300);
    ok('Kortet viser den nye øvelse på samme plads, med programmets anbefaling og ingen dubletter', (await evaluate(`return (() => {
        const ids = [...document.querySelectorAll("#exercise-list .exercise-card")].map(c => c.dataset.exerciseId);
        return ids[0] === "chest_press_machine" && new Set(ids).size === ids.length
            && /Recommended: \\d+ × \\d+/.test(document.querySelector('#exercise-list .exercise-card[data-exercise-id="chest_press_machine"] .exercise-target').textContent); })()`)) === true,
        JSON.stringify({ ids: await cardIds() }));
    ok('Byttet gemmes, overlever en reload, og gælder kun Upper A', (await evaluate(`const s = JSON.parse(localStorage.getItem("gym_tracker_program_swaps") || "{}"); return s.upperA && s.upperA.bench_press === "chest_press_machine";`)) === true);
    await load(URL_UNDER_TEST);
    const byttet = (await cardIds())[0] === 'chest_press_machine';
    await openSession('upperB');
    ok('Efter reload står den byttede øvelse der stadig — men ikke i Upper B', byttet
        && !(await listText()).includes('Chest Press (Machine)'),
        JSON.stringify({ ids: await cardIds(), upperB: (await listText()).includes('Chest Press (Machine)') }));
    await openSession('upperA');
    await pickSwap('chest_press_machine', 'bench_press');
    await sleep(300);
    ok('Man kan bytte tilbage til programmets øvelse, og så er overriden væk',
        (await listText()).includes('Bench Press') && (await storage('gym_tracker_program_swaps', '{}')) === '{}');
    // Tallene hører til øvelsen, ikke til rækken: Leg Press' 225 kg må ikke følge med.
    await openSession('lowerA');
    ok('Bytter man Leg Press til Leg Extension, følger Leg Extensions egne tal med', (await pickSwap('leg_press', 'leg_extension')) === true
        && (await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_extension");
        if (!card) return false;
        const row = getProgram("lower", "B").find(r => r.exerciseId === "leg_extension");
        const weights = [...card.querySelectorAll(".set-weight")].map(i => Number(i.value));
        return card.querySelector(".exercise-target").textContent.includes("@ " + row.weight + " kg")
            && weights.every(w => w === row.weight) && !weights.includes(225); })()`)) === true);

    // ─── 9. Rediger en gemt træning ───────────────────────────────
    console.log('\n── 9. Rediger en gemt træning (øvelse glemt og hentet ind bagefter)');
    await fresh('upperA');
    await skipLastExercise();
    ok('Den oversprungne øvelse står stadig på skærmen, og der er intet at hente tilbage midt i passet',
        (await cardCount()) === 6
        && (await evaluate('return document.getElementById("exercise-restore").classList.contains("hidden")')) === true);
    await saveBtn();
    const afterSave = await evaluate(`${readWorkouts} return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0 };`);
    ok('Træningen blev gemt (1 træning, 5 øvelser), og ugens næste pas ligger klar', afterSave.count === 1 && afterSave.ex === 5
        && (await currentSession()) === 'lowerA', JSON.stringify({ afterSave }));
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    ok('Redigering indlæser træningens 5 øvelser med banner og Update-knap', (await cardCount()) === 5
        && (await evaluate(`return !document.getElementById("edit-banner").classList.contains("hidden") && document.getElementById("edit-banner").textContent.includes("Editing Upper");`)) === true
        && (await evaluate(`return document.getElementById("save-btn").textContent.includes("Update workout");`)) === true);
    await evaluate('document.getElementById("btn-restore").click(); return true;');
    await sleep(300);
    await saveBtn(350);
    const afterEdit = await evaluate(`${readWorkouts} return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date, ex: w[0] ? w[0].exercises.length : 0 };`);
    ok('Den hentede øvelse gemmes i samme træning (samme id/dato, 6 øvelser), og redigeringstilstanden er forladt',
        afterEdit.count === 1 && afterEdit.id === afterSave.id && afterEdit.date === afterSave.date && afterEdit.ex === 6
        && (await evaluate('return document.getElementById("edit-banner").classList.contains("hidden")')) === true,
        JSON.stringify({ afterSave, afterEdit }));
    // Annuller må ikke skrive noget
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(300);
    await skriv('#exercise-list .exercise-card .set-reps', '3');
    await sleep(250);
    await evaluate('document.getElementById("edit-cancel").click(); return true;');
    await sleep(300);
    const afterCancel = await evaluate(`${readWorkouts} return { count: w.length, ex: w[0] ? w[0].exercises.length : 0 };`);
    ok('Annuller efterlader træningen uændret og skjuler banneret',
        afterCancel.ex === 6 && afterCancel.count === 1
        && (await evaluate('return document.getElementById("edit-banner").classList.contains("hidden")')) === true,
        JSON.stringify(afterCancel));

    // ─── 10. Gem igen samme dag overskriver ───────────────────────
    console.log('\n── 10. Gem igen samme dag overskriver i stedet for at dublere');
    await saveBtn(300);
    const afterResave = await evaluate(`${readWorkouts} return { count: w.length, id: w[0] && w[0].id, date: w[0] && w[0].date };`);
    ok('Gem igen samme dag giver stadig kun én træning med samme id og dato',
        afterResave.count === 1 && afterResave.id === afterSave.id && afterResave.date === afterSave.date,
        JSON.stringify({ afterResave }));

    // ─── 11. Uge-opdelt deling ────────────────────────────────────
    console.log('\n── 11. Uge-opdelt deling med tegnbudget');
    await fresh();
    await evaluate(`return (() => {
        const mk = (id, date, day, variant) => ({ id, date, day, variant,
            exercises: getProgram(day, variant).map((item, idx) => ({
                exerciseId: item.exerciseId,
                sets: [0, 1, 2].map(n => ({ weight: 40 + idx * 5 + n * 2.5, reps: 8 })) })) });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([
            mk("u40a", "2026-09-28", "upper", "A"), mk("l40a", "2026-09-30", "lower", "A"),
            mk("u41b", "2026-10-05", "upper", "B"), mk("l41b", "2026-10-07", "lower", "B")]));
        return true;
    })()`);
    await load(URL_UNDER_TEST);
    await evaluate('document.getElementById("btn-share").click(); return true;');
    await sleep(300);
    const shareOpts = await evaluate(`return [...document.getElementById("share-scope").options].map(o => ({ v: o.value, t: o.textContent }));`);
    ok('Vælgeren tilbyder "kun nyt" som standard, begge uger og alle uger',
        shareOpts.length === 4 && shareOpts[0].v === 'new' && shareOpts.filter(o => o.v.startsWith('week:')).length === 2
        && shareOpts[3].v === 'all' && (await evaluate('return document.getElementById("share-scope").value')) === 'new',
        JSON.stringify(shareOpts));
    await evaluate(`return (() => { const sel = document.getElementById("share-scope"); sel.value = "week:2026-W41"; sel.dispatchEvent(new Event("change")); return true; })()`);
    await sleep(250);
    const weekText = await evaluate('return document.getElementById("share-text").value');
    ok('Valg af en uge viser kun den uge, med bedste-listen — og passer i én besked (Discords 2.000 tegn)',
        weekText.includes('WEEK 41') && !weekText.includes('WEEK 40')
        && weekText.includes('5.10 UPPER B') && weekText.includes('7.10 LOWER B')
        && weekText.includes('🏆 Best ever') && weekText.length <= 2000,
        `${weekText.length} tegn`);
    await evaluate('document.getElementById("share-copy").click(); return true;');
    await sleep(400);
    const sharedState = await evaluate(`return (() => {
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return { shared: w.filter(x => x.sharedAt).length, onlyWeek41: w.filter(x => x.sharedAt).every(x => x.date >= "2026-10-05") };
    })()`);
    ok('Kopiering markerer kun den valgte uges 2 træninger som delt', sharedState.shared === 2
        && sharedState.onlyWeek41 === true, JSON.stringify(sharedState));

    // ─── 12. Programmet er dagens træning, uanset historik ────────
    console.log('\n── 12. Programmet er dagens træning, uanset historik');
    await evaluate('localStorage.clear(); return true;');
    await evaluate(`localStorage.setItem("gym_tracker_workouts", JSON.stringify([{ id: "u_fil", date: "2026-09-28", day: "upper", variant: "A", exercises: [
        { exerciseId: "bench_press",  sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
        { exerciseId: "lat_pulldown", sets: [{ weight: 59, reps: 10 }, { weight: 59, reps: 10 }] }] }])); return true;`);
    await load(URL_UNDER_TEST);
    await openSession('upperA');
    const progA = await evaluate('return getProgram("upper","A").length');
    ok('Dagens træning er programmets øvelser, ikke kun dem med historik', (await cardCount()) === progA,
        JSON.stringify({ cards: await cardCount(), progA }));
    const prefill = await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "bench_press");
        return { entered: card.querySelector(".set-weight").value,
            recommended: card.querySelector(".exercise-target").textContent,
            plan: programItems("upper", "A").find(i => i.exerciseId === "bench_press") };
    })()`);
    ok('Kortet åbner med sidste uges vægt, og programmets anbefaling står ved siden af',
        prefill.entered === '60' && String(prefill.plan.weight) !== prefill.entered
        && prefill.recommended.includes(`Recommended: ${prefill.plan.sets} × ${prefill.plan.reps} @ ${prefill.plan.weight} kg`),
        JSON.stringify(prefill));

    // ─── 13. Eksempeldata ─────────────────────────────────────────
    console.log('\n── 13. Eksempeldata til preview og test');
    await fresh();
    await evaluate('document.getElementById("sample-btn").click(); return true;');
    await sleep(450);
    const seeded = await evaluate(`return (() => {
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        return { count: w.length, allSample: w.every(x => x.sample === true), btn: document.getElementById("sample-btn").textContent };
    })()`);
    ok('Eksempeldata lægges ind (12 træninger, begge dage), og knappen kan rydde igen',
        seeded.count === 12 && seeded.allSample === true && /Clear sample data/.test(seeded.btn),
        JSON.stringify(seeded));
    await evaluate(`return (() => {
        localStorage.setItem("gym_tracker_workouts", JSON.stringify([{ id: "rigtig_1", date: "2026-09-28", day: "upper", variant: "A", exercises: [{ exerciseId: "bench_press", sets: [{ weight: 60, reps: 8 }] }] }]));
        return true; })()`);
    await load(URL_UNDER_TEST);
    await evaluate('document.getElementById("sample-btn").click(); return true;');
    await sleep(300);
    ok('Med en rigtig træning er knappen deaktiveret, og et klik ændrer ikke dataene', (await evaluate(`return (() => {
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return document.getElementById("sample-btn").disabled === true && w.length === 1 && w[0].id === "rigtig_1" && !w[0].sample; })()`)) === true);

    // ─── 14. Bytte-listerne for hele programmet ───────────────────
    console.log('\n── 14. Bytte-listerne og kortene for hele programmet');
    await fresh();
    const sweepResults = [];
    for (const day of ['upper', 'lower']) {
        for (const variant of ['A', 'B']) {
            await openSession(`${day}${variant}`);
            sweepResults.push(await evaluate(`return (() => {
                const day = ${JSON.stringify(day)}; const variant = ${JSON.stringify(variant)};
                const items = getProgram(day, variant);
                const out = { items: items.map(i => i.exerciseId), cards: [], rows: [] };
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
                for (const id of items.map(i => i.exerciseId)) {
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
                            id: o.dataset.swapId,
                            muscle: (ALL_EXERCISES[day].find(e => e.id === o.dataset.swapId) || {}).muscle }));
                        cardById(id).querySelector(".exercise-name-btn").click();
                    }
                    out.rows.push({ id, muscle: ex.muscle, hasButton: !!btn, opts, expected });
                }
                return out;
            })()`));
        }
    }
    ok('Alle fire pas: hvert kort viser sin cue, sin opvarmning og programmets anbefaling, og bytte-listen er hele muskelgruppen (minus dagens træning, aldrig Romanian Deadlift)',
        sweepResults.every(s => {
            const badCards = s.cards.filter(c => !c.id || c.cue !== c.expectedCue
                || JSON.stringify(c.shownWarmup) !== JSON.stringify(c.expectedWarmup)
                || !/^🎯 Recommended: \d+ × \d+/.test(c.plan));
            const badRows = s.rows.filter(r => r.hasButton !== (r.expected.length > 1)
                || (r.hasButton && (r.opts.map(o => o.id).join(',') !== r.expected.join(',')
                    || !r.opts.every(o => String(o.muscle).split('/').map(x => x.trim()).some(g => r.muscle.split('/').map(x => x.trim()).includes(g)))
                    || r.opts.some(o => o.id === 'romanian_deadlift'))));
            return s.rows.map(r => r.id).join(',') === s.items.join(',') && badCards.length === 0 && badRows.length === 0;
        }),
        JSON.stringify(sweepResults.map(s => ({
            items: s.items,
            badCards: s.cards.filter(c => !c.id || c.cue !== c.expectedCue || JSON.stringify(c.shownWarmup) !== JSON.stringify(c.expectedWarmup) || !/^🎯 Recommended: \d+ × \d+/.test(c.plan)).map(c => c.id),
            badRows: s.rows.filter(r => r.hasButton !== (r.expected.length > 1) || (r.hasButton && r.opts.map(o => o.id).join(',') !== r.expected.join(','))).map(r => r.id),
        }))));

    // Antallet af øvelser pr. dag er loftet, ikke et mål: programmet fylder ikke op selv
    await fresh();
    ok('Dagens træning har højst MAX_PER_DAY øvelser', (await evaluate(`
        let worst = 0;
        for (const day of ["upper", "lower"]) { for (const variant of ["A", "B"]) worst = Math.max(worst, getProgram(day, variant).length); }
        return worst <= MAX_PER_DAY && worst > 0;`)) === true);

    // ─── 15. Programmet husker vægte fra sidste gang ──────────────
    console.log('\n── 15. Programmet husker vægte og sæt fra sidste gang');
    await fresh('lowerB');
    const templateCount = await cardCount();
    ok('Uden historik vises skabelonens tal, og huske-linjen er skjult', (await evaluate(`
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_curl");
        const plan = programItems("lower", "B").find(i => i.exerciseId === "leg_curl");
        const memory = document.getElementById("program-memory");
        return card.querySelector(".exercise-target").textContent.includes("Recommended: " + plan.sets + " × " + plan.reps + " @ " + plan.weight + " kg")
            && memory.classList.contains("hidden");`)) === true);
    await skipLastExercise();
    await skriv('#exercise-list .exercise-card .set-weight', '99');
    await sleep(300);
    await saveBtn(450);
    await load(URL_UNDER_TEST);
    await openSession('lowerB');
    ok('Næste gang er hele skabelonen der, den rettede vægt (99 kg) er husket, og den oversprungne øvelse var ikke med i gemmen',
        (await cardCount()) === templateCount
        && (await evaluate('return document.querySelector("#exercise-list .exercise-card .set-weight").value')) === '99'
        && (await evaluate('return document.getElementById("program-memory").classList.contains("hidden")')) === false
        && (await evaluate(`${readWorkouts} return w.length === 1 && w[0].variant === "B" && w[0].exercises.length === ${templateCount - 1};`)) === true,
        JSON.stringify({ cards: await cardCount() }));

    // ─── 16. Ugen: status, næste pas og låsen ─────────────────────
    console.log('\n── 16. Ugen: status, næste pas og låsen');
    await fresh();
    ok('Ugebjælken viser fire pas i træningsordenen; med tom log er intet klaret', (await evaluate(`
        const chips = [...document.querySelectorAll("#week-strip .week-chip")];
        return chips.length === 4 && /Week \\d+/.test(document.querySelector("#week-strip .week-label").textContent)
            && chips.map(c => c.textContent.replace(/✓|next/g, "").trim()).join(",") === "Upper A,Lower A,Upper B,Lower B"
            && chips.every(c => !c.classList.contains("done"))
            && document.querySelector("#week-strip .week-chip.next").dataset.session === "upperA";`)) === true);
    await saveBtn(450);
    ok('Det gemte pas står som klaret i ugen, og næste pas er et ben-pas', (await evaluate(`
        const chip = document.querySelector('#week-strip .week-chip[data-session="upperA"]');
        const next = document.querySelector("#week-strip .week-chip.next");
        return chip.classList.contains("done") && !!next && next.dataset.session.indexOf("lower") === 0;`)) === true);
    // Låsen: et pas fra en anden dag i samme uge må ikke gemmes igen
    await evaluate(`return (() => {
        const t = new Date(); const d = mondayOf(t);
        if (isoDate(d) === isoDate(t)) d.setDate(d.getDate() + 1);
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        w.push({ id: "w_week_dupe", date: isoDate(d), day: "upper", variant: "B", exercises: [
            { exerciseId: "chest_supported_row", sets: [{ weight: 24, reps: 12 }] }] });
        localStorage.setItem("gym_tracker_workouts", JSON.stringify(w));
        return true;
    })()`);
    await load(URL_UNDER_TEST);
    await openSession('upperB');
    const countBefore = await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length');
    await saveBtn(400);
    ok('Et låst pas kan ikke gemmes (ingen ny træning), og advarslen står ved passet', (await evaluate('return JSON.parse(localStorage.getItem("gym_tracker_workouts")).length')) === countBefore
        && !((await evaluate('return document.getElementById("session-warning").classList.contains("hidden")')) === true)
        && /Upper B is already logged this week/.test(await evaluate('return document.getElementById("session-warning").textContent')));
    await evaluate(`return (() => { const b = document.getElementById("btn-log-anyway"); if (!b) return false; b.click(); return true; })()`);
    await sleep(300);
    // Datoen læses præcis som appen skriver den (UTC-dato, ikke lokal).
    const gemDato = await evaluate('return new Date().toISOString().split("T")[0]');
    await saveBtn(450);
    ok('"Log anyway" gør det muligt at gemme alligevel, og advarslen er væk bagefter', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts"));
        return w.some(x => x.date === "${gemDato}" && x.day === "upper" && x.variant === "B")
            && document.getElementById("session-warning").classList.contains("hidden");`)) === true);

    // ─── 17. Coach notes-panelet ──────────────────────────────────
    console.log('\n── 17. Coach notes-panelet');
    await load(URL_UNDER_TEST);
    // Netværket stubbes, så testen ikke afhænger af at gisten svarer.
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
    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(400);
    ok('Panelet henter fra gist-API\'et (ikke raw-linket) med cache-omgåelse ved åbning — ikke ved indlæsning — og viser markdown som liste',
        (await evaluate('return window.__notesCalls.length')) === 1
        && /^https:\/\/api\.github\.com\/gists\/[0-9a-f]+$/.test((await evaluate('return window.__notesCalls[0].url')) || '')
        && (await evaluate('return window.__notesCalls[0].cache')) === 'no-store'
        && (await evaluate(`return (() => { const c = document.getElementById("notes-content");
            return c.textContent.includes("Week 41 · 5–11 Oct 2026") && document.querySelectorAll("#notes-content .notes-list li").length === 1; })()`)) === true,
        JSON.stringify(await evaluate('return window.__notesCalls')));
    await evaluate('window.fetch = () => Promise.reject(new Error("offline")); return true;');
    await evaluate('document.getElementById("btn-notes").click(); return true;');
    await sleep(400);
    ok('Død forbindelse giver en besked i panelet, ikke en tom rude — og ingen JS-fejl',
        (await evaluate('return document.getElementById("notes-content").textContent')).includes('Could not load the notes')
        && pageErrors.length === 0,
        await evaluate('return document.getElementById("notes-content").textContent.slice(0, 80)'));
    await evaluate('document.getElementById("close-notes").click(); return true;');

    // ─── 18. Byt en øvelse mens en gemt træning redigeres ─────────
    console.log('\n── 18. Bytte under redigering af en gemt træning');
    await fresh('lowerB');
    await saveBtn();
    await evaluate('document.getElementById("btn-history").click(); return true;');
    await sleep(250);
    await evaluate('document.querySelector("#history-content .history-edit-btn").click(); return true;');
    await sleep(350);
    const editSwap = await evaluate(`return (() => {
        const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press");
        if (!card) return false;
        card.querySelector(".exercise-name-btn").click();
        const after = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press");
        return after && [...after.querySelectorAll(".swap-option")].some(o => o.dataset.swapId === "bulgarian_split");
    })()`);
    await sleep(250);
    await evaluate(`return (() => { const card = [...document.querySelectorAll("#exercise-list .exercise-card")].find(c => c.dataset.exerciseId === "leg_press"); const btn = card && card.querySelector(".exercise-name-btn"); if (btn) btn.click(); return true; })()`);
    ok('Leg Press har stadig en bytte-knap under redigering, med Bulgarian Split Squat i listen', editSwap === true, JSON.stringify(await cardIds()));
    await pickSwap('leg_press', 'bulgarian_split');
    await sleep(300);
    await saveBtn(400);
    ok('Opdateringen gemmer den byttede øvelse i den gemte træning', (await evaluate(`${readWorkouts} return w.length === 1 && w[0].exercises.some(e => e.exerciseId === "bulgarian_split") && !w[0].exercises.some(e => e.exerciseId === "leg_press");`)) === true,
        await evaluate('return JSON.stringify((JSON.parse(localStorage.getItem("gym_tracker_workouts")||"[]")[0]||{}).exercises?.map(e=>e.exerciseId))'));

    // ─── 19. Det tastede huskes hvis appen genindlæses ────────────
    console.log('\n── 19. Det tastede huskes hvis appen genindlæses');
    await fresh();
    const firstWeight = '#exercise-list .exercise-card:first-child .set-weight';
    const firstReps = '#exercise-list .exercise-card:first-child .set-reps';
    await skriv(firstWeight, '87.5');
    await skriv(firstReps, '9');
    await sleep(700); // debouncen skal have skrevet ned
    const draftEfterTastning = await evaluate('return localStorage.getItem("gym_tracker_draft")');
    ok('Det tastede skrives ned i localStorage mens man taster, før man gemmer',
        !!draftEfterTastning
        && JSON.parse(draftEfterTastning).upperA
        && JSON.parse(draftEfterTastning).upperA.exercises[0].sets[0].weight === 87.5
        && JSON.parse(draftEfterTastning).upperA.exercises[0].sets[0].reps === 9,
        String(draftEfterTastning).slice(0, 180));
    // Genindlæsningen — det er her tallene forsvandt før
    await load(URL_UNDER_TEST);
    ok('Det tastede står der igen efter genindlæsning, med hele passet og uændret anbefaling', (await evaluate(`return document.querySelector("${firstWeight}").value;`)) === '87.5'
        && (await evaluate(`return document.querySelector("${firstReps}").value;`)) === '9'
        && (await cardCount()) === (await evaluate('return programItems("upper", "A").length'))
        && (await evaluate(`return (() => {
            const card = document.querySelector("#exercise-list .exercise-card"); const plan = programItems("upper", "A")[0];
            return card.querySelector(".exercise-target").textContent.includes("Recommended: " + plan.sets + " × " + plan.reps + " @ " + plan.weight + " kg"); })()`)) === true,
        JSON.stringify({ w: await evaluate(`return document.querySelector("${firstWeight}").value;`) }));
    // Siden kan forsvinde uden varsel: så skrives der med det samme, uden at vente på debouncen.
    await evaluate('localStorage.removeItem("gym_tracker_draft"); return true;');
    await skriv(firstWeight, '92.5');
    await evaluate('window.dispatchEvent(new Event("pagehide")); return true;');
    const draftVedPagehide = await evaluate('return localStorage.getItem("gym_tracker_draft")');
    ok('Når siden forsvinder, skrives det tastede ned med det samme',
        !!draftVedPagehide && JSON.parse(draftVedPagehide).upperA.exercises[0].sets[0].weight === 92.5,
        String(draftVedPagehide).slice(0, 180));
    // Et pas der er gemt, er ikke længere et udkast
    await saveBtn(500);
    ok('Træningen blev gemt med det tastede tal, og udkastet ligger ikke længere på passet', (await evaluate(`
        const w = JSON.parse(localStorage.getItem("gym_tracker_workouts") || "[]");
        const drafts = JSON.parse(localStorage.getItem("gym_tracker_draft") || "{}");
        return w.length === 1 && w[0].exercises[0].sets[0].weight === 92.5 && !drafts.upperA;`)) === true,
        String(await storage('gym_tracker_workouts')).slice(0, 160));

    // ─── 20. Klap en færdig øvelse sammen ─────────────────────────
    console.log('\n── 20. Klap en færdig øvelse sammen');
    await evaluate('localStorage.clear(); return true;');
    await load(URL_UNDER_TEST);
    await evaluate('localStorage.removeItem("gym_tracker_draft"); loadProgram(); restoreDraft(); renderAll(); return true;');

    const kort = i => `#exercise-list .exercise-card[data-index="${i}"]`;
    const antalKlappede = () => evaluate('return document.querySelectorAll("#exercise-list .exercise-card.collapsed").length');
    const klap = async i => {
        await evaluate(`document.querySelector(${JSON.stringify(kort(i) + ' .collapse-btn')}).click(); return true;`);
        await sleep(250);
    };
    const viser = expr => evaluate(`const c = document.querySelector(${JSON.stringify(kort(0))}); return ${expr};`);

    await skriv(`${kort(0)} .set-weight`, '77.5');
    await skriv(`${kort(0)} .set-reps`, '6');
    await sleep(700);
    await klap(0);
    ok('Et tryk klapper kortet sammen: sæt-felterne er væk, og der står et sammendrag af sættene',
        (await viser(`c.classList.contains("collapsed") && c.querySelectorAll(".set-weight").length === 0
            && !!c.querySelector(".collapsed-summary") && /sets/.test(c.querySelector(".collapsed-summary").textContent)`)) === true,
        String(await viser('(c.querySelector(".collapsed-summary") || {}).textContent || "intet sammendrag"')));
    ok('Kun det ene kort er klappet sammen — de andre er urørt',
        (await antalKlappede()) === 1 && (await evaluate('return document.querySelectorAll("#exercise-list .sets-table").length')) > 0);
    await load(URL_UNDER_TEST);
    ok('Genindlæsningen folder ikke kortet ud igen', (await antalKlappede()) === 1);
    await klap(0);
    ok('Samme knap folder ud igen, med tallene i behold',
        (await viser(`(() => { const f = c.querySelector(".set-weight"); if (!f) return false;
            return !c.classList.contains("collapsed") && f.value === "77.5"; })()`)) === true);
    await openSession('upperB');
    ok('Et andet pas starter foldet ud', (await antalKlappede()) === 0);
    await openSession('upperA');

    // ── Bytte på et klappet kort ──────────────────────────────────
    const kortTilstand = i => evaluate(`return (() => { const c = document.querySelector(${JSON.stringify(kort(i))});
        if (!c) return null;
        return { klappet: c.classList.contains("collapsed"),
            menu: !!c.querySelector(".swap-menu"), valg: c.querySelectorAll(".swap-option").length,
            felter: c.querySelectorAll(".set-weight").length }; })()`);
    const bytteKort = await evaluate('return [...document.querySelectorAll("#exercise-list .exercise-card")].findIndex(c => c.querySelector(".exercise-name-btn"));');
    const bytteNavn = kort(bytteKort) + ' .exercise-name-btn';
    await klap(bytteKort);
    await vent(`!!document.querySelector(${JSON.stringify(kort(bytteKort))}).classList.contains("collapsed")`);
    await evaluate(`document.querySelector(${JSON.stringify(bytteNavn)}).click(); return true;`);
    await sleep(300);
    const efterNavn = await kortTilstand(bytteKort);
    ok('Et tryk på navnet på et klappet kort folder kortet ud og viser bytte-listen',
        !!efterNavn && efterNavn.klappet === false && efterNavn.menu === true && efterNavn.valg > 1 && efterNavn.felter > 0,
        JSON.stringify(efterNavn));

    // ── Animationerne ────────────────────────────────────────────
    // Overgangene måles som serier af skærmbilleder inde i siden, så maskinens fart
    // ikke afgør om der ER en overgang. Ved foldet hentes kortet på ny hver frame.
    const foldSerie = (klik, ms) => evaluate(`return new Promise(resolve => {
        const vaelger = ${JSON.stringify(kort(0))};
        const andre = [...document.querySelectorAll("#exercise-list .exercise-card")].filter(c => !c.matches(vaelger));
        andre.forEach((c, i) => { c.dataset.urort = String(i); });
        const samples = [];
        const t0 = performance.now();
        ${klik}
        const tick = () => {
            const c = document.querySelector(vaelger);
            samples.push({
                hojde: Math.round(c.getBoundingClientRect().height),
                klappet: c.classList.contains("collapsed"),
                krop: !!c.querySelector(".exercise-card-body"),
                urorte: [...document.querySelectorAll("#exercise-list .exercise-card")]
                    .filter(x => !x.matches(vaelger)).every(x => x.dataset.urort !== undefined)
            });
            if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick);
            else resolve(samples);
        };
        requestAnimationFrame(tick);
    })`);
    const klik = `document.querySelector(vaelger).querySelector(".collapse-btn").click();`;
    const nedSerie = await foldSerie(klik, 500);
    const opSerie = await foldSerie(klik, 500);
    const trin = serie => [...new Set(serie.map(s => s.hojde))].length;
    ok('Kortet folder i højden i begge retninger — mange mellemtrin, ikke et hop — og de andre kort tegnes ikke om',
        trin(nedSerie) >= 5 && trin(opSerie) >= 5
        && nedSerie[0].hojde > nedSerie.at(-1).hojde && opSerie.at(-1).hojde > opSerie[0].hojde
        && nedSerie.at(-1).klappet === true && !nedSerie.at(-1).krop
        && opSerie.at(-1).klappet === false && opSerie.at(-1).krop
        && nedSerie.every(s => s.urorte) && opSerie.every(s => s.urorte),
        JSON.stringify({ trin: { ned: trin(nedSerie), op: trin(opSerie) }, slut: { ned: nedSerie.at(-1), op: opSerie.at(-1) } }));

    // Bytte-listen folder i højden i stedet for at stå der med det samme.
    const menuSerie = klik => evaluate(`return new Promise(resolve => {
        const vaelger = ${JSON.stringify(kort(bytteKort))};
        const samples = [];
        const t0 = performance.now();
        ${klik}
        const tick = () => {
            const m = document.querySelector(vaelger + ' .swap-menu');
            samples.push(m ? { hojde: Math.round(m.getBoundingClientRect().height), findes: true } : { hojde: null, findes: false });
            if (performance.now() - t0 < 450) requestAnimationFrame(tick);
            else resolve(samples);
        };
        requestAnimationFrame(tick);
    })`);
    const navnKlik = `document.querySelector(vaelger + ' .exercise-name-btn').click();`;
    const aabneMenu = await menuSerie(navnKlik);
    const lukkeMenu = await menuSerie(navnKlik);
    const menuTrin = serie => [...new Set(serie.filter(x => x.findes).map(x => x.hojde))].length;
    ok('Bytte-listen folder ud og sammen i højden i stedet for at stå der med det samme',
        menuTrin(aabneMenu) >= 4 && menuTrin(lukkeMenu) >= 4
        && !!aabneMenu.at(-1) && aabneMenu.at(-1).findes === true && aabneMenu.at(-1).hojde > 0
        && !!lukkeMenu.at(-1) && lukkeMenu.at(-1).findes === false,
        JSON.stringify({ aabneTrin: menuTrin(aabneMenu), lukkeTrin: menuTrin(lukkeMenu) }));

    // Har man slået bevægelse fra i systemet, sker skiftet med det samme.
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
