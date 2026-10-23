// Testharness for gym-tracker: kører appens JS uden browser og verificerer
// A/B-rotationen, program-integriteten og progressiv overload.
// Kør: node tests/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// ─── Minimal DOM/localStorage-stub ────────────────────────────────
function makeEl(id) {
    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        setSelectionRange() {},
        select() {},
        appendChild() {},
    };
}

const store = {};
const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
};

const document = {
    body: makeEl('body'),
    getElementById: id => makeEl(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeEl('new'),
    addEventListener() {},
};

// fetch-stub: noterne hentes fra nettet i browseren. Testene bestemmer svaret,
// så de kan dække både et gyldigt svar, en HTTP-fejl og en død forbindelse.
let notesFetchImpl = () => Promise.reject(new Error('offline'));
const fetch = (...args) => notesFetchImpl(...args);

const ctx = { document, localStorage, console, setTimeout, Date, Math, JSON, Set, Array, Object, parseInt, parseFloat, isNaN, fetch };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(
    script + `
    globalThis.__app = { EXERCISES, ALL_EXERCISES, PROGRAMS, getProgram, getSuggestedVariant,
        getCurrentVariant, calculateProgressiveOverload, programKey, formatDate, saveWorkouts, loadWorkouts,
        applyWorkoutEdit, isoWeekKey, weekLabel, groupByWeek, formatSets, generateShareText,
    markShareScopeAsShared, CHAR_LIMIT,
        buildSampleWorkouts, isSampleWorkout, realWorkouts, mondayOf,
        lastWorkoutFor, programItems, swapCandidates, setSwap, loadSwaps, sessionEntryFor, slotForExercise, planFor,
        SESSION_FOCUS, SESSION_ORDER, weekDone, isDoneThisWeek, nextSessionInWeek, weekConflict,
        sessionLabel, parseKey, missingExerciseCount, restoreMissingExercises,
        loadProgram, addExerciseToSession, swapExercise, removeSet, state, MAX_PER_DAY,
        warmupSets, formatWarmupSets, renderWarmupBlock, CUES, exerciseCue, renderCueLine,
        NOTES_URL, NOTES_FILE, escapeHtml, renderNotesMarkdown, loadCoachNotes };
    `,
    ctx
);

const {
    EXERCISES, ALL_EXERCISES, PROGRAMS, getProgram, getSuggestedVariant, getCurrentVariant,
    calculateProgressiveOverload, programKey, applyWorkoutEdit,
    isoWeekKey, weekLabel, groupByWeek, formatSets, generateShareText, markShareScopeAsShared, CHAR_LIMIT,
    buildSampleWorkouts, isSampleWorkout, realWorkouts, mondayOf,
    lastWorkoutFor, programItems, swapCandidates, setSwap, loadSwaps, sessionEntryFor, slotForExercise, planFor,
    SESSION_FOCUS, SESSION_ORDER, weekDone, isDoneThisWeek, nextSessionInWeek, weekConflict,
    sessionLabel, parseKey, missingExerciseCount, restoreMissingExercises,
    loadProgram, addExerciseToSession, swapExercise, removeSet, state, MAX_PER_DAY,
    warmupSets, formatWarmupSets, renderWarmupBlock, CUES, exerciseCue, renderCueLine,
    NOTES_URL, NOTES_FILE, escapeHtml, renderNotesMarkdown, loadCoachNotes,
} = ctx.__app;

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

console.log('\n── 1. Program-integritet (alle øvelses-IDer findes på den rigtige dag)');
for (const key of Object.keys(PROGRAMS)) {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    const variant = key.slice(-1);
    ok(`getProgram('${day}','${variant}') returnerer ${PROGRAMS[key].length} øvelser`,
        getProgram(day, variant).length === PROGRAMS[key].length);
    for (const item of PROGRAMS[key]) {
        const found = ALL_EXERCISES[day].find(e => e.id === item.exerciseId);
        ok(`${key}: '${item.exerciseId}' findes i ${day}-databasen`, !!found);
    }
}
ok('programKey mapper korrekt', programKey('upper', 'B') === 'upperB' && programKey('lower', 'A') === 'lowerA');
ok(`Ingen dag har mere end ${MAX_PER_DAY} øvelser`,
    Object.values(PROGRAMS).every(list => list.length <= MAX_PER_DAY),
    Object.entries(PROGRAMS).filter(([, l]) => l.length > MAX_PER_DAY).map(([k, l]) => `${k}=${l.length}`).join(', '));
ok('Hver programrække har sæt, reps og vægt',
    Object.values(PROGRAMS).flat().every(i => i.sets > 0 && i.reps > 0 && typeof i.weight === 'number' && i.weight >= 0));
ok('Samme øvelse står ikke to gange i samme program',
    Object.values(PROGRAMS).every(list => new Set(list.map(i => i.exerciseId)).size === list.length));
ok('Ingen skabelon byder Romanian Deadlift (hans lænd)',
    !Object.values(PROGRAMS).flat().some(i => i.exerciseId === 'romanian_deadlift'));

console.log('\n── 2. Ugen: hvilke pas der er klaret, og hvad der foreslås');
// Ugen er enheden: fire pas (SESSION_ORDER), og et pas tæller kun hvis det ligger
// i den aktuelle ISO-uge. Datoerne nedenfor er uge 41 (man 5. – søn 11. okt 2026).
const TODAY = '2026-10-08'; // torsdag i uge 41
const seed = workouts => { store['gym_tracker_workouts'] = JSON.stringify(workouts); };
const w = (id, date, day, variant) => ({ id, date, day, variant, exercises: [] });

seed([]);
ok('Ingen historik → foreslår A', getSuggestedVariant('upper', TODAY) === 'A');
ok('Ingen historik (lower) → foreslår A', getSuggestedVariant('lower', TODAY) === 'A');
ok('Ugen er tom', Object.keys(weekDone(TODAY)).length === 0);

seed([w('u1', '2026-10-05', 'upper', 'A')]);
ok('Upper A er klaret i ugen', isDoneThisWeek('upper', 'A', TODAY) === true);
// Rækkefølgen er den man træner i: overkrop og ben skiftevis, A før B for hver dag.
// Den er også rækkefølgen i ugebjælken, så felterne står som pas man tager dem.
ok('Ugens fire pas står i træningsrækkefølge (upperA, lowerA, upperB, lowerB)',
    SESSION_ORDER.join(',') === 'upperA,lowerA,upperB,lowerB', SESSION_ORDER.join(','));
ok('Rækkefølgen skifter mellem overkrop og ben for hvert pas',
    SESSION_ORDER.every((k, i) => i === 0 || (k.startsWith('upper') !== SESSION_ORDER[i - 1].startsWith('upper'))),
    SESSION_ORDER.join(','));

ok('Upper B mangler', isDoneThisWeek('upper', 'B', TODAY) === false);
ok('Efter Upper A → foreslår Upper B', getSuggestedVariant('upper', TODAY) === 'B');
ok('Næste pas i ugen er ben (sidste pas var overkrop)', nextSessionInWeek(TODAY) === 'lowerA',
    String(nextSessionInWeek(TODAY)));

seed([w('u1', '2026-10-05', 'upper', 'A'), w('u2', '2026-10-07', 'upper', 'B')]);
ok('Begge upper-pas klaret → foreslår A igen (rotationen)', getSuggestedVariant('upper', TODAY) === 'A');
ok('Lower er stadig A (upper-historik smitter ikke)', getSuggestedVariant('lower', TODAY) === 'A');
ok('Næste pas er stadig ben', nextSessionInWeek(TODAY) === 'lowerA');

// Ugen nulstilles: sidste uges pas må ikke tælle med
seed([w('u1', '2026-09-29', 'upper', 'A'), w('u2', '2026-10-01', 'upper', 'B')]);
ok('Sidste uges træninger tæller ikke med', Object.keys(weekDone(TODAY)).length === 0);
ok('… og foreslår derfor A igen', getSuggestedVariant('upper', TODAY) === 'A');

seed([w('l1', '2026-10-06', 'lower', 'A')]);
ok('Efter et ben-pas foreslås et overkrops-pas', nextSessionInWeek(TODAY) === 'upperA',
    String(nextSessionInWeek(TODAY)));

seed([w('u1', '2026-10-05', 'upper', 'A'), w('l1', '2026-10-06', 'lower', 'A'),
      w('u2', '2026-10-07', 'upper', 'B'), w('l2', '2026-10-10', 'lower', 'B')]);
ok('Alle fire pas klaret → intet næste pas', nextSessionInWeek(TODAY) === null);
ok('Ugen tæller fire klarede pas', Object.keys(weekDone(TODAY)).length === 4);

// Låsen: samme dag+variant må ikke gemmes to gange i samme uge
state.currentDay = 'upper';
state.programVariant = 'A';
state.allowDuplicateWeek = false;
state.editing = null;
seed([w('u1', '2026-10-05', 'upper', 'A')]);
ok('Låst: Upper A ligger allerede i ugen', !!weekConflict(TODAY));
ok('Låsen peger på den dag passet blev lavet', weekConflict(TODAY).date === '2026-10-05');
state.programVariant = 'B';
ok('Upper B er ikke låst (det er det pas der mangler)', weekConflict(TODAY) === null);
state.programVariant = 'A';
seed([w('u1', '2026-10-08', 'upper', 'A')]);
ok('Samme dag må overskrives — det er den træning man retter', weekConflict(TODAY) === null);
seed([w('u1', '2026-10-05', 'upper', 'A')]);
state.allowDuplicateWeek = true;
ok('"Log anyway" lukker låsen op', weekConflict(TODAY) === null);
state.allowDuplicateWeek = false;
state.editing = { id: 'u1', date: '2026-10-05', day: 'upper' };
ok('Redigering af en gemt træning er aldrig låst', weekConflict(TODAY) === null);
state.editing = null;

ok('sessionLabel giver pasnavnet', sessionLabel('lowerB') === 'Lower B' && sessionLabel('upperA') === 'Upper A');
ok('parseKey deler nøglen i dag og variant',
    parseKey('upperA').day === 'upper' && parseKey('upperA').variant === 'A' && parseKey('lowerB').label === 'Lower B');
ok('Alle fire pas har et fokus (det er det der gør A og B forskellige)',
    SESSION_ORDER.every(k => typeof SESSION_FOCUS[k] === 'string' && SESSION_FOCUS[k].length > 3),
    SESSION_ORDER.map(k => `${k}=${SESSION_FOCUS[k]}`).join(' '));
seed([]);

// Træninger uden variant-felt (gamle data) må ikke crashe
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', exercises: [] },
]);
ok('Gamle træninger uden variant → A (ingen crash)', getSuggestedVariant('upper', TODAY) === 'A');
ok('Gamle træninger uden variant tælles ikke som et klaret pas', Object.keys(weekDone(TODAY)).length === 0);

console.log('\n── 3. Progressiv overload');
store['gym_tracker_workouts'] = JSON.stringify([]);
let r = calculateProgressiveOverload('bench_press', 'upper');
ok('Ingen historik → status "new"', r.status === 'new');

store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
    ] },
]);
r = calculateProgressiveOverload('bench_press', 'upper');
ok('60 kg × 8 reps → foreslår 62.5 kg', r.suggestion === '62.5 kg × 8 reps', `fik "${r.suggestion}"`);

store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 5 }, { weight: 60, reps: 5 }, { weight: 60, reps: 5 }] },
    ] },
]);
r = calculateProgressiveOverload('bench_press', 'upper');
ok('60 kg × 5 reps → holder vægten, flere reps', r.suggestion === '60 kg × 6 reps', `fik "${r.suggestion}"`);

// Stagnation: samme vægt i 3 unikke sessioner. Sæt tælles som én session pr. dag.
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] },
    { id: 'w2', date: '2026-09-03', day: 'upper', variant: 'B', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] },
    { id: 'w3', date: '2026-09-05', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] },
]);
r = calculateProgressiveOverload('bench_press', 'upper');
ok('3 sessioner på 60 kg → rep-fokus (ikke 3 sæt = 3 sessioner)', r.status === 'stagnant', `fik status "${r.status}"`);
ok('Rep-fokus foreslår 10 reps på samme vægt', r.suggestion === '10 reps med 60 kg', `fik "${r.suggestion}"`);

// Kun 2 sessioner → ingen stagnation
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] },
    { id: 'w2', date: '2026-09-03', day: 'upper', variant: 'B', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] },
]);
r = calculateProgressiveOverload('bench_press', 'upper');
ok('2 sessioner på 60 kg → stadig vægt-op', r.suggestion === '62.5 kg × 8 reps', `fik "${r.suggestion}"`);

// Historik for andre dage må ikke blande sig
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'lower', variant: 'A', exercises: [
        { exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }] },
]);
r = calculateProgressiveOverload('squat', 'upper');
ok('Lower-historik påvirker ikke upper-beregning', r.status === 'new', `fik status "${r.status}"`);

// Kropsvægt (0 kg) må ikke give NaN
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'B', exercises: [
        { exerciseId: 'pull_up', sets: [{ weight: 0, reps: 8 }] }] },
]);
r = calculateProgressiveOverload('pull_up', 'upper');
ok('Kropsvægt (0 kg) giver et brugbart forslag', typeof r.suggestion === 'string' && !r.suggestion.includes('NaN'), `fik "${r.suggestion}"`);

console.log('\n── 4. Øvelsesdatabase');
ok('Dumbbell Shoulder Press findes i upper (bruges i upperB)', !!ALL_EXERCISES.upper.find(e => e.id === 'dumbbell_shoulder_press'));
ok('Deadlift findes i lower (bruges i lowerB)', !!ALL_EXERCISES.lower.find(e => e.id === 'deadlift'));
const ids = [...EXERCISES.upper, ...EXERCISES.lower].map(e => e.id);
ok('Ingen dublerede øvelses-IDer', new Set(ids).size === ids.length);
ok('Hver øvelse har navn, muskel og compound-flag', [...EXERCISES.upper, ...EXERCISES.lower].every(e => e.name && e.muscle && typeof e.compound === 'boolean'));

console.log('\n── 5. De fem nye cable-øvelser');
// Rækkefølge: navn, muskelgruppe, compound-flag. Alle er cable, og kun row-varianten
// er markeret "per hånd" — de øvrige skal læses som én samlet belastning.
const NEW_CABLE = {
    cable_lateral_raise:   { name: 'Cable Lateral Raise',   muscle: 'Shoulders',   compound: false },
    cable_row_per_hand:    { name: 'Cable Row',            muscle: 'Back',        compound: true },
    dual_bicep_cable_curl: { name: 'Dual Bicep Cable Curl', muscle: 'Biceps',      compound: false },
    lat_extension:         { name: 'Lat Extension',         muscle: 'Back',        compound: false },
    cable_reverse_fly:     { name: 'Cable Reverse Fly',     muscle: 'Shoulders/Back', compound: false },
};
for (const [id, want] of Object.entries(NEW_CABLE)) {
    const e = ALL_EXERCISES.upper.find(x => x.id === id);
    ok(`"${want.name}" findes i upper`, !!e, 'mangler');
    if (!e) continue;
    ok(`"${want.name}" har navn, muskel og type som aftalt`,
        e.name === want.name && e.muscle === want.muscle && e.compound === want.compound,
        JSON.stringify({ name: e.name, muscle: e.muscle, compound: e.compound }));
    ok(`"${want.name}" er en cable-øvelse`, e.equipment === 'Cable', e.equipment);
}
const newIds = Object.keys(NEW_CABLE);
ok('Kun row-varianten er markeret per hånd',
    ALL_EXERCISES.upper.filter(e => newIds.includes(e.id) && e.loadNote).map(e => e.id).join(',') === 'cable_row_per_hand',
    ALL_EXERCISES.upper.filter(e => newIds.includes(e.id) && e.loadNote).map(e => `${e.id}=${e.loadNote}`).join(', '));

// Cable og håndvægt skal have hver sin progression, ellers giver forslaget ingen mening
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] },
        { exerciseId: 'cable_lateral_raise', sets: [{ weight: 7, reps: 12 }] }] },
]);
const cableProg = calculateProgressiveOverload('cable_lateral_raise', 'upper');
const dbProg = calculateProgressiveOverload('lateral_raise', 'upper');
ok('Cable lateral raise foreslår ud fra sin egen historik (7 → 9,5 kg)', cableProg.suggestion === '9.5 kg × 12 reps', `fik "${cableProg.suggestion}"`);
ok('Den blander ikke historik med håndvægt-versionen', dbProg.status === 'new' && cableProg.status !== 'new', `${cableProg.status} / ${dbProg.status}`);
store['gym_tracker_workouts'] = JSON.stringify([]);

console.log('\n── 6. Redskabsvarianter');
const allEx = [...EXERCISES.upper, ...EXERCISES.lower];
ok('Alle øvelser har et redskab angivet', allEx.every(e => typeof e.equipment === 'string' && e.equipment.length > 0));
ok('Ingen øvelser deler navn', new Set(allEx.map(e => e.name)).size === allEx.length);
const curls = allEx.filter(e => e.name.startsWith('Bicep Curl'));
ok('Bicep Curl findes i tre redskabsvarianter', curls.length === 3, `fik ${curls.length}: ${curls.map(c => c.name).join(', ')}`);
ok('De tre curl-varianter har hvert sit id', new Set(curls.map(c => c.id)).size === 3);
ok('Curl-varianterne er stang, EZ-bar og håndvægte',
    curls.map(c => c.equipment).sort().join(',') === 'Barbell,Dumbbell,EZ-bar', curls.map(c => c.equipment).join(', '));
ok('Håndvægt-curl er markeret per hånd', curls.find(c => c.equipment === 'Dumbbell').loadNote === 'per hand');
ok('Chest Supported Row findes nu', !!allEx.find(e => e.id === 'chest_supported_row'));
ok('Chest Supported Row er en sammensat rygøvelse',
    allEx.find(e => e.id === 'chest_supported_row').muscle === 'Back' && allEx.find(e => e.id === 'chest_supported_row').compound === true);
ok('Alle håndvægtøvelser med enkelt-side belastning har loadNote',
    allEx.filter(e => e.equipment === 'Dumbbell' && /Dumbbell|Hammer|Fly|Raise|Reverse/.test(e.name))
         .every(e => e.loadNote === 'per hand'));
ok('Bulgarian Split Squat og Lunges er markeret per ben',
    allEx.filter(e => ['bulgarian_split', 'lunges'].includes(e.id)).every(e => e.loadNote === 'per leg'));
// Varianter skal kunne have hver sin progression — ellers giver forslaget ingen mening
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'ez_bar_curl', sets: [{ weight: 19, reps: 12 }] },
        { exerciseId: 'dumbbell_curl', sets: [{ weight: 12, reps: 12 }] }] },
]);
const ez = calculateProgressiveOverload('ez_bar_curl', 'upper');
const db = calculateProgressiveOverload('dumbbell_curl', 'upper');
ok('EZ-bar-curl foreslår ud fra EZ-bar-historik (19 → 21,5 kg)', ez.suggestion === '21.5 kg × 12 reps', `fik "${ez.suggestion}"`);
ok('Håndvægt-curl foreslår ud fra håndvægt-historik (12 → 14,5 kg)', db.suggestion === '14.5 kg × 12 reps', `fik "${db.suggestion}"`);
ok('De to curl-varianter blander ikke deres historik', ez.suggestion !== db.suggestion);

console.log('\n── 7. Redigering af en gemt træning');
const savedList = () => ([
    { id: 'w1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] },
        { exerciseId: 'cable_row', sets: [{ weight: 40, reps: 12 }] }] },
    { id: 'w2', date: '2026-09-29', day: 'lower', variant: 'A', exercises: [
        { exerciseId: 'squat', sets: [{ weight: 80, reps: 8 }] }] },
]);

const addOne = applyWorkoutEdit(savedList(), 'w1', [
    { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] },
    { exerciseId: 'cable_row', sets: [{ weight: 40, reps: 12 }] },
    { exerciseId: 'ez_bar_curl', sets: [{ weight: 19, reps: 12 }] },
]);
ok('Redigering finder træningen', addOne.ok === true);
ok('Redigering opdaterer i stedet for at oprette', addOne.workouts.length === 2);
ok('Den redigerede træning har fået den nye øvelse', addOne.workouts[0].exercises.length === 3);
ok('Den nye øvelse er den rigtige', addOne.workouts[0].exercises[2].exerciseId === 'ez_bar_curl');
ok('Datoen er uændret efter redigering', addOne.workouts[0].date === '2026-09-28');
ok('Dag og variant er uændret', addOne.workouts[0].day === 'upper' && addOne.workouts[0].variant === 'A');
ok('Id er uændret, så historikken ikke får en dublet', addOne.workouts[0].id === 'w1');
ok('Andre træninger er urørte', addOne.workouts[1].id === 'w2' && addOne.workouts[1].exercises.length === 1);
ok('Antal tilføjede øvelser rapporteres', addOne.added === 1 && addOne.removed === 0);

const removeOne = applyWorkoutEdit(savedList(), 'w1', [
    { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] }]);
ok('Fjernelse af en øvelse rapporteres', removeOne.removed === 1 && removeOne.added === 0);
ok('Fjernelse giver ikke en ny træning', removeOne.workouts.length === 2);

const reorder = applyWorkoutEdit(savedList(), 'w1', [
    { exerciseId: 'cable_row', sets: [{ weight: 40, reps: 12 }] },
    { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] }]);
ok('Kun ombytning giver hverken tilføjet eller fjernet', reorder.added === 0 && reorder.removed === 0);
ok('Rækkefølgen følger redigeringen', reorder.workouts[0].exercises[0].exerciseId === 'cable_row');

const missing = applyWorkoutEdit(savedList(), 'findes-ikke', []);
ok('Ukendt id fejler i stedet for at oprette en træning', missing.ok === false && missing.workouts.length === 2);

const untouched = savedList();
applyWorkoutEdit(untouched, 'w1', [{ exerciseId: 'bench_press', sets: [{ weight: 99, reps: 1 }] }]);
ok('Original-listen muteres ikke (ingen utilsigtet sidereffekt)', untouched[0].exercises[1].exerciseId === 'cable_row');

// Redigering må ikke smitte af på nabo-træningens historik i progressionsforslaget
const overloadWorkouts = addOne.workouts;
store['gym_tracker_workouts'] = JSON.stringify(overloadWorkouts);
const curlAfterEdit = calculateProgressiveOverload('ez_bar_curl', 'upper');
ok('Progressionsforslaget bruger den redigerede træning (19 kg → 21,5 kg)', curlAfterEdit.suggestion === '21.5 kg × 12 reps', `fik "${curlAfterEdit.suggestion}"`);
const squatUnaffected = calculateProgressiveOverload('squat', 'lower');
ok('Andre øvelsers forslag er upåvirket af redigeringen', squatUnaffected.suggestion.startsWith('82.5 kg'), `fik "${squatUnaffected.suggestion}"`);

console.log('\n── 8. Uge-opdelt deling med tegnbudget');
// ISO-ugenumre er verificeret mod python3 datetime.date.isocalendar() — ikke
// mod min egen implementering — inkl. årsskifterne.
ok('ISO-uge: 2026-09-28 (mandag) er uge 40', isoWeekKey('2026-09-28') === '2026-W40');
ok('ISO-uge: 2026-10-04 (søndag) er samme uge som mandagen', isoWeekKey('2026-10-04') === '2026-W40');
ok('ISO-uge: 2026-10-05 (næste mandag) er uge 41', isoWeekKey('2026-10-05') === '2026-W41');
ok('ISO-uge: 2026-01-01 (torsdag) er uge 1', isoWeekKey('2026-01-01') === '2026-W01');
ok('ISO-uge: 2025-12-29 hører til uge 1 i 2026', isoWeekKey('2025-12-29') === '2026-W01');
ok('ISO-uge: 2026-12-31 er uge 53', isoWeekKey('2026-12-31') === '2026-W53');
ok('ISO-uge: 2027-01-01 hører til uge 53 i 2026', isoWeekKey('2027-01-01') === '2026-W53');
ok('Ugelabel viser interval og ugenummer', weekLabel('2026-W40') === 'Week 40 (28.9–4.10)', weekLabel('2026-W40'));

const weekFixture = (weekOffset, day, variant, shared) => {
    const base = new Date(2026, 8, 28); // mandag i uge 40
    base.setDate(base.getDate() + weekOffset * 7 + (day === 'lower' ? 1 : 0));
    const date = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    const w = {
        id: `w${weekOffset}${day}`,
        date, day, variant,
        exercises: getProgram(day, variant).map((item, idx) => ({
            exerciseId: item.exerciseId,
            sets: [0, 1, 2].map(() => ({ weight: 60 + idx * 5, reps: 8 })),
        })),
    };
    if (shared) w.sharedAt = '2026-10-01T08:00:00.000Z';
    return w;
};

const week40 = [weekFixture(0, 'upper', 'A'), weekFixture(0, 'lower', 'A')];
const week41 = [weekFixture(1, 'upper', 'B'), weekFixture(1, 'lower', 'B')];

const grouped = groupByWeek([...week41, ...week40]);
ok('Uger grupperes, nyeste først', grouped.length === 2 && grouped[0].key === '2026-W41', JSON.stringify(grouped.map(g => g.key)));
ok('Mandag og lørdag i samme uge lægges sammen', grouped[1].workouts.length === 2);
ok('Ugen markeres som delt når alle dens træninger er delt', groupByWeek(week40.map(w => ({ ...w, sharedAt: 'x' })))[0].shared === true);
ok('Ugen markeres ikke som delt når kun én er delt', groupByWeek([{ ...week40[0], sharedAt: 'x' }, week40[1]])[0].shared === false);

ok('Ens sæt komprimeres til ×3', formatSets([{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }]) === '60×8 ×3', formatSets([{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }]));
ok('Forskellige sæt komprimeres ikke', formatSets([{ weight: 60, reps: 8 }, { weight: 62.5, reps: 7 }]) === '60×8 62.5×7');
ok('To ens efterfulgt af et tredje forskelligt', formatSets([{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 62.5, reps: 7 }]) === '60×8 ×2 62.5×7');

store['gym_tracker_workouts'] = JSON.stringify([...week40, ...week41]);

const text40 = generateShareText('week:2026-W40');
ok('En uge-eksport nævner kun den uge', text40.includes('WEEK 40') && !text40.includes('WEEK 41'), text40.split('\n')[0]);
ok('En uge-eksport indeholder ugens træninger', text40.includes('28.9 UPPER A') && text40.includes('29.9 LOWER A'));
ok('En uge-eksport udelader andre ugers træninger', !text40.includes('5.10'));
ok('Eksporten har uge-overskrift med antal og volumen', /2 workouts · 1 Upper · 1 Lower/.test(text40), text40.split('\n')[1]);

const text41 = generateShareText('week:2026-W41');
ok('En anden uge giver en anden eksport', text41 !== text40 && text41.includes('WEEK 41'));
ok('All-time-bedste følger med i en uge-eksport (trenden bevares)', text40.includes('🏆 Best ever'));
ok('All-time-bedste dækker også øvelser uden for den viste uge', text40.includes('Leg Press') && text40.includes('Bench Press'));
ok('Fremgang vises som headline, ikke én linje pr. øvelse', /📈 Progress: \d+ up/.test(text40), text40.match(/📈 Progress:.*/)?.[0]);

// Det vigtigste krav: en uge skal kunne sendes som ÉN Discord-besked (2.000 tegn).
const heavyWeek = [weekFixture(0, 'upper', 'A'), weekFixture(0, 'lower', 'A'), weekFixture(0, 'upper', 'B'), weekFixture(0, 'lower', 'B')];
store['gym_tracker_workouts'] = JSON.stringify(heavyWeek);
const heavyText = generateShareText('week:2026-W40');
ok('En uge med 4 træninger (begge varianter) passer i én Discord-besked', heavyText.length <= 2000, `${heavyText.length} tegn`);
ok('Tegnbudgettet holder sig under CHAR_LIMIT', heavyText.length <= CHAR_LIMIT, `${heavyText.length} > ${CHAR_LIMIT}`);

// Og eksporten må ikke vokse med hvor lang historikken er — kun med ugens indhold.
store['gym_tracker_workouts'] = JSON.stringify([...heavyWeek, ...week41]);
const heavyWithHistory = generateShareText('week:2026-W40');
ok('Historikkens længde påvirker ikke ugens eksport', Math.abs(heavyWithHistory.length - heavyText.length) < 30, `${heavyText.length} vs ${heavyWithHistory.length}`);

// 'new' = kun det der ikke er delt endnu
store['gym_tracker_workouts'] = JSON.stringify([...week40, ...week41]);
const textNew = generateShareText('new');
ok('"Kun nyt" tager ikke-delte træninger med', textNew.includes('28.9 UPPER A') && textNew.includes('5.10 UPPER B'));
ok('"Kun nyt" viser antallet i overskriften', textNew.includes('NEW SINCE LAST (4)'), textNew.split('\n')[0]);

const marked = markShareScopeAsShared('week:2026-W40');
ok('Deling markerer ugens træninger som delt', marked === 2, `markerede ${marked}`);
ok('Markeringen gemmes i localStorage', JSON.parse(store['gym_tracker_workouts']).filter(w => w.sharedAt).length === 2);
ok('En allerede delt træning markeres ikke igen', markShareScopeAsShared('week:2026-W40') === 0);

const textNewAfter = generateShareText('new');
ok('"Kun nyt" indeholder kun det endnu ikke delte', !textNewAfter.includes('28.9 UPPER A') && textNewAfter.includes('5.10 UPPER B'));
ok('"Kun nyt" fortæller hvor mange der mangler', textNewAfter.includes('NEW SINCE LAST (2)'), textNewAfter.split('\n')[0]);

store['gym_tracker_workouts'] = JSON.stringify([{ ...week40[0], sharedAt: 'x' }, week40[1]]);
ok('En tom visning giver en forklarende tekst', generateShareText('week:2026-W99').includes('No workouts in the selected period'));
store['gym_tracker_workouts'] = JSON.stringify([]);
ok('Ingen træninger giver den gamle venlige besked', generateShareText('new').includes('No workouts saved yet'));

// ─── 9. Sidste træning for en dag+variant ─────────────────────────
// Grundlaget for at programmet kan åbne med sidste gangs vægte: den nyeste gemte
// træning for netop den dag OG variant.
console.log('\n── 9. Sidste træning for en dag+variant');

const ex = (id, sets = 3) => ({ exerciseId: id, sets: Array.from({ length: sets }, () => ({ weight: 60, reps: 8 })) });
const asDone = list => JSON.stringify(list);

store['gym_tracker_workouts'] = asDone([]);
ok('Uden historik findes ingen sidste træning', lastWorkoutFor('upper', 'A') === null);

store['gym_tracker_workouts'] = asDone([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [ex('bench_press'), ex('lat_pulldown')] },
]);
ok('Sidste træning for varianten kan findes', (lastWorkoutFor('upper', 'A') || {}).id === 'u1');
ok('En variant uden træninger giver ingen sidste træning', lastWorkoutFor('upper', 'B') === null);
ok('Historik for lower smitter ikke af på upper', lastWorkoutFor('lower', 'A') === null);

store['gym_tracker_workouts'] = asDone([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [ex('bench_press')] },
    { id: 'u2', date: '2026-10-05', day: 'upper', variant: 'A', exercises: [ex('bench_press')] },
]);
ok('Den nyeste af flere træninger for samme dag+variant bruges', (lastWorkoutFor('upper', 'A') || {}).id === 'u2');

store['gym_tracker_workouts'] = asDone([]);

// Kropsvægtøvelser har ingen vægt på stangen. Reglen læses af øvelsesdatabasen
// (equipment), ikke af om skabelonen tilfældigvis står på 0: Back Extension har et
// mærke (1), så den ikke falder ud af loggen når der gemmes.
const bodyweightIds = new Set(Object.entries(PROGRAMS).flatMap(([key, list]) => {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    return list.filter(i => (ALL_EXERCISES[day].find(e => e.id === i.exerciseId) || {}).equipment === 'Bodyweight')
        .map(i => i.exerciseId);
}));
ok('Der findes en kropsvægtøvelse i programmerne (ellers tester vi reglen nedenfor)',
    bodyweightIds.size > 0, [...bodyweightIds].join(', '));
ok('Kropsvægtøvelsen har et vægt-mærke over 0, så den bliver gemt',
    Object.entries(PROGRAMS).flatMap(([key, list]) => {
        const day = key.startsWith('upper') ? 'upper' : 'lower';
        return list.filter(i => bodyweightIds.has(i.exerciseId) &&
            (ALL_EXERCISES[day].find(e => e.id === i.exerciseId) || {}).equipment === 'Bodyweight');
    }).every(i => i.weight > 0));

// ─── 10. Eksempeldata ─────────────────────────────────────────────
// Eksempeldata skal ligne RIGTIGE data: samme sæt-regel som saveWorkout (kun sæt
// med vægt > 0), så en preview ikke kan skjule en fejl ved at have en anden form.
console.log('\n── 10. Eksempeldata (til at prøve appen uden at taste data ind)');

const sampleToday = new Date(2026, 9, 2); // fredag 2. oktober 2026
const samples = buildSampleWorkouts(sampleToday);
const sampleVariant = k => {
    const day = k.startsWith('upper') ? 'upper' : 'lower';
    return samples.filter(w => w.day === day && w.variant === k.slice(-1));
};

ok('Der bygges tre hele uger (12 træninger)', samples.length === 12, `${samples.length}`);
ok('Alle eksempeltræninger er markeret som eksempeldata', samples.every(isSampleWorkout));
ok('Ingen eksempeltræning er markeret som delt', samples.every(w => !w.sharedAt));
ok('Alle fire varianter er med tre gange', ['upperA', 'upperB', 'lowerA', 'lowerB'].every(k => sampleVariant(k).length === 3),
    ['upperA', 'upperB', 'lowerA', 'lowerB'].map(k => `${k}=${sampleVariant(k).length}`).join(' '));
ok('Træningerne fordeler sig på tre ISO-uger', new Set(samples.map(w => isoWeekKey(w.date))).size === 3,
    [...new Set(samples.map(w => isoWeekKey(w.date)))].join(', '));
ok('Den nyeste uge er ugen omkring den givne dato', isoWeekKey(samples[samples.length - 1].date) === isoWeekKey('2026-10-02'), isoWeekKey(samples[samples.length - 1].date));
ok('Ugedagene rammer rotationen (man, tir, tor, fre)', ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02'].every(d => samples.some(w => w.date === d)),
    samples.slice(-4).map(w => w.date).join(', '));

// Øvelserne kommer fra appens egne programmer, så id'er og sæt-antal ikke kan drive
ok('Hver trænings øvelser findes i dens program', samples.every(w =>
    w.exercises.every(e => getProgram(w.day, w.variant).some(item => item.exerciseId === e.exerciseId))));
ok('Hvert gemte sæt har vægt over 0 og reps', samples.every(w => w.exercises.every(e => e.sets.every(s => s.weight > 0 && s.reps > 0))));
// Kropsvægtøvelsen har et vægt-mærke, så den gemmes som en helt normal række
ok('Kropsvægtøvelsen står i loggen med sit mærke (den har en vægt i skabelonen)',
    Object.entries(PROGRAMS).every(([key, list]) => {
        const day = key.startsWith('upper') ? 'upper' : 'lower';
        const variant = key.slice(-1);
        const bw = list.filter(i => bodyweightIds.has(i.exerciseId)).length;
        const sample = samples.find(w => w.day === day && w.variant === variant);
        return sample && sample.exercises.filter(e => bodyweightIds.has(e.exerciseId)).length === bw;
    }), [...bodyweightIds].join(', '));
ok('En træning har derfor lige så mange øvelser som skabelonen minus rækker uden vægt',
    Object.entries(PROGRAMS).every(([key, list]) => {
        const day = key.startsWith('upper') ? 'upper' : 'lower';
        const variant = key.slice(-1);
        const bw = list.filter(i => !(i.weight > 0)).length;
        const sample = samples.find(w => w.day === day && w.variant === variant);
        return sample && sample.exercises.length === list.length - bw;
    }));

// Fremgang: samme variant skal være tungere i uge 3 end i uge 1
const weightOf = (w, id) => w.exercises.find(e => e.exerciseId === id).sets[0].weight;
const firstUpperA = sampleVariant('upperA')[0];
const lastUpperA = sampleVariant('upperA').slice(-1)[0];
ok('Vægten stiger fra første til sidste uge', weightOf(lastUpperA, 'bench_press') > weightOf(firstUpperA, 'bench_press'),
    `${weightOf(firstUpperA, 'bench_press')} → ${weightOf(lastUpperA, 'bench_press')}`);
const firstLowerA = sampleVariant('lowerA')[0];
const lastLowerA = sampleVariant('lowerA').slice(-1)[0];
ok('Ben stiger hurtigere end overkrop', (weightOf(lastLowerA, 'leg_press') - weightOf(firstLowerA, 'leg_press')) > (weightOf(lastUpperA, 'bench_press') - weightOf(firstUpperA, 'bench_press')),
    `leg press +${weightOf(lastLowerA, 'leg_press') - weightOf(firstLowerA, 'leg_press')} vs bench +${weightOf(lastUpperA, 'bench_press') - weightOf(firstUpperA, 'bench_press')}`);

// Sikkerheden: rigtige træninger må ikke kunne rammes
ok('realWorkouts filtrerer eksempeldata fra', realWorkouts(samples).length === 0);
ok('Én rigtig træning tæller som rigtige data', realWorkouts([{ id: 'rigtig', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [] }, ...samples]).length === 1);
ok('En tom log giver ingen rigtige data', realWorkouts([]).length === 0);
ok('En tilfældig post uden flaget tælles som rigtig', realWorkouts([{ id: 'x' }]).length === 1);

store['gym_tracker_workouts'] = JSON.stringify([]);

// ─── 11. Programmet er dagens træning ────────────────────────────
// Kernen i ønsket: programmet ligger klart når man åbner appen — man bygger det
// ikke op ved at klikke øvelser ind. Hver dag har højst MAX_PER_DAY øvelser, og en
// øvelse kan byttes til en anden i samme muskelgruppe. Byttet huskes for netop den
// dag+variant.
console.log('\n── 11. Programmet er dagens træning (husk + byt)');

const set = (w, r) => Array.from({ length: 3 }, () => ({ weight: w, reps: r }));
const progWorkout = (id, date, day, variant, exs) => ({ id, date, day, variant, exercises: exs.map(e => ({ exerciseId: e[0], sets: e[1] })) });
const idsOf = list => list.map(i => i.exerciseId).join(',');

store['gym_tracker_workouts'] = JSON.stringify([]);
store['gym_tracker_program_swaps'] = JSON.stringify({});
state.exercises = [];

// Uden bytter er programmet skabelonen, række for række
ok('Uden bytter er programmet skabelonen', idsOf(programItems('upper', 'A')) === idsOf(getProgram('upper', 'A')));
ok('Ingen række er markeret som byttet', programItems('upper', 'A').every(i => !i.swappedFrom));

// Et bytte: Bench Press → Dumbbell Bench Press (samme muskelgruppe: Chest)
setSwap('upper', 'A', 'bench_press', 'dumbbell_press');
const swapped = programItems('upper', 'A');
ok('Byttet slår igennem i programmet', swapped[0].exerciseId === 'dumbbell_press', swapped[0].exerciseId);
ok('Rækken husker hvad den blev byttet fra (så nøglen er stabil)', swapped[0].swappedFrom === 'bench_press');
ok('Resten af programmet er urørt', idsOf(swapped.slice(1)) === idsOf(getProgram('upper', 'A').slice(1)));
ok('Byttet gemmes i localStorage', JSON.parse(store['gym_tracker_program_swaps']).upperA.bench_press === 'dumbbell_press');
ok('Byttet gælder kun den dag+variant det blev lavet i',
    idsOf(programItems('upper', 'B')) === idsOf(getProgram('upper', 'B')) && idsOf(programItems('lower', 'A')) === idsOf(getProgram('lower', 'A')));

// Tilbage til skabelon-øvelsen: overriden fjernes helt
setSwap('upper', 'A', 'bench_press', 'bench_press');
ok('Bytte tilbage til skabelon-øvelsen fjerner overriden', !JSON.parse(store['gym_tracker_program_swaps']).upperA);
ok('Programmet er skabelonen igen', programItems('upper', 'A')[0].exerciseId === 'bench_press');

// Byttelisterne: kun samme muskelgruppe, og aldrig Romanian Deadlift
const allRows = Object.entries(PROGRAMS).flatMap(([key, list]) => {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    return list.map(item => ({ day, item }));
});
const groupsOf = m => String(m).split('/').map(s => s.trim()).filter(Boolean);
const offMuscle = [];
const noSelf = [];
const offersRdl = [];
const noAlternative = [];
for (const { day, item } of allRows) {
    const ex = ALL_EXERCISES[day].find(e => e.id === item.exerciseId);
    const cands = swapCandidates(day, item.exerciseId);
    // Delvis match er nok: 'Quads' og 'Quads/Glutes' hører sammen.
    if (cands.some(c => !groupsOf(c.muscle).some(g => groupsOf(ex.muscle).includes(g)))) offMuscle.push(item.exerciseId);
    if (!cands.some(c => c.id === item.exerciseId)) noSelf.push(item.exerciseId);
    if (cands.some(c => c.id === 'romanian_deadlift')) offersRdl.push(item.exerciseId);
    if (cands.length < 2) noAlternative.push(`${item.exerciseId} (${ex.muscle})`);
}
ok('Bytte-listerne rummer kun øvelser der deler en muskelgruppe', offMuscle.length === 0, offMuscle.join(', '));
ok('Bytte-listen rummer altid øvelsen selv (man kan se hvad der står)', noSelf.length === 0, noSelf.join(', '));
ok('Romanian Deadlift bliver aldrig tilbudt som bytte', offersRdl.length === 0, offersRdl.join(', '));
ok('Hver øvelse i programmet har mindst ét reelt alternativ', noAlternative.length === 0, noAlternative.join(', '));
ok('Den nuværende øvelse står øverst i bytte-listen',
    allRows.every(({ day, item }) => swapCandidates(day, item.exerciseId)[0].id === item.exerciseId));
ok('Fuld muskelmatch rangeres før delvis match',
    allRows.every(({ day, item }) => {
        const ex = ALL_EXERCISES[day].find(e => e.id === item.exerciseId);
        const flags = swapCandidates(day, item.exerciseId)
            .filter(c => c.id !== item.exerciseId)
            .map(c => (c.muscle === ex.muscle ? 0 : 1));
        return flags.every((f, i) => i === 0 || flags[i - 1] <= f);
    }));
// De tre klager: Bulgarian Split Squat skal kunne vælges, og leg curl / back
// extension skal have alternativer på trods af en snæver muskelgruppe.
ok('Leg Press kan byttes til Bulgarian Split Squat',
    swapCandidates('lower', 'leg_press').some(c => c.id === 'bulgarian_split'),
    swapCandidates('lower', 'leg_press').map(c => c.id).join(', '));
ok('Leg curl har alternativer selv om muskelgruppen er smal',
    swapCandidates('lower', 'leg_curl').length > 1,
    swapCandidates('lower', 'leg_curl').map(c => c.id).join(', '));
ok('Back extension har alternativer',
    swapCandidates('lower', 'back_extension').length > 1,
    swapCandidates('lower', 'back_extension').map(c => c.id).join(', '));
ok('Leg curl kan byttes til Nordic Hamstring Curl og Seated Leg Curl',
    ['nordic_curl', 'seated_leg_curl'].every(id => swapCandidates('lower', 'leg_curl').some(c => c.id === id)));
// Håndvægt-RDL er tilføjet på hans egen anmodning og skal kunne vælges. Stang-RDL
// er stadig udelukket, fordi den belaster lænden.
const dbRdl = ALL_EXERCISES.lower.find(e => e.id === 'dumbbell_rdl');
ok('Dumbbell Romanian Deadlift findes som håndvægtøvelse per hånd',
    !!dbRdl && dbRdl.equipment === 'Dumbbell' && dbRdl.loadNote === 'per hand', JSON.stringify(dbRdl));
ok('Dumbbell RDL er en hofte-hinge med hamstrings/glutes',
    !!dbRdl && dbRdl.compound === true && dbRdl.muscle.split('/').includes('Hamstrings'));
ok('Dumbbell RDL kan vælges som bytte',
    swapCandidates('lower', 'cable_pull_through').some(c => c.id === 'dumbbell_rdl') &&
    swapCandidates('lower', 'leg_curl').some(c => c.id === 'dumbbell_rdl'),
    swapCandidates('lower', 'leg_curl').map(c => c.id).join(', '));
ok('Stang-RDL bliver stadig ikke tilbudt ved siden af håndvægt-RDL',
    swapCandidates('lower', 'cable_pull_through').some(c => c.id === 'dumbbell_rdl') &&
    !swapCandidates('lower', 'cable_pull_through').some(c => c.id === 'romanian_deadlift'));

// En øvelse der allerede står i dagens træning tilbydes ikke igen
state.exercises = [{ exerciseId: 'dumbbell_press', plan: null, sets: [], targetReps: 8 }];
const withSession = swapCandidates('upper', 'bench_press');
ok('Bytte-listen udelader det der allerede står i dagens træning',
    !withSession.some(c => c.id === 'dumbbell_press') && withSession.some(c => c.id === 'bench_press'),
    withSession.map(c => c.id).join(', '));
state.exercises = [];

// Dagens træning: samme vægt og sæt som sidst, ellers skabelonens anbefaling
const lpItem = getProgram('lower', 'A').find(i => i.exerciseId === 'leg_press');
const fresh = sessionEntryFor(lpItem, null);
ok('Uden historik bruges skabelonens tal',
    fresh.sets.length === lpItem.sets && fresh.sets.every(s => s.weight === lpItem.weight && s.reps === lpItem.reps));
ok('Anbefalingen følger med som plan (den vises på kortet)',
    fresh.plan.sets === lpItem.sets && fresh.plan.weight === lpItem.weight && fresh.plan.reps === lpItem.reps);

const remembered = sessionEntryFor(lpItem, progWorkout('lp', '2026-10-05', 'lower', 'A',
    [['leg_press', [{ weight: 200, reps: 10 }, { weight: 225, reps: 10 }, { weight: 230, reps: 8 }]]]));
ok('Med historik huskes det bedste sæt', remembered.sets.every(s => s.weight === 230 && s.reps === 8),
    JSON.stringify(remembered.sets[0]));
ok('Antallet af sæt huskes også', remembered.sets.length === 3);
ok('Anbefalingen står stadig ved siden af de huskede tal', remembered.plan.weight === lpItem.weight);

// loadProgram: hele dagen lægges ind, for enhver dag+variant
let programFits = true;
for (const [key, list] of Object.entries(PROGRAMS)) {
    state.currentDay = key.startsWith('upper') ? 'upper' : 'lower';
    state.programVariant = key.slice(-1);
    loadProgram();
    if (state.exercises.length !== list.length || state.exercises.length > MAX_PER_DAY) programFits = false;
}
ok(`Hele programmet lægges ind, og ingen dag overstiger ${MAX_PER_DAY} øvelser`, programFits);

state.currentDay = 'upper';
state.programVariant = null;
loadProgram();
ok('Dagens træning er programmets øvelser i programmets rækkefølge',
    idsOf(state.exercises) === idsOf(getProgram('upper', 'A')));
// sessionVariant er den variant træningen gemmes med; programVariant er "brugeren har
// selv valgt". Uden et valg følger visningen rotationens forslag, og de to er derfor
// kun ens så længe forslaget står ved magt.
ok('Sessionen kender sin variant (den gemmes med træningen)',
    state.sessionVariant === 'A' && !!state.sessionVariant,
    JSON.stringify({ sessionVariant: state.sessionVariant, programVariant: state.programVariant }));
ok('Uden et selvvalgt variant følger visningen forslaget (programVariant forbliver null)',
    state.programVariant === null);
state.programVariant = 'B';
loadProgram();
ok('Et selvvalgt variant vinder over forslaget, og sessionsvarianten følger med',
    state.sessionVariant === 'B' && state.programVariant === 'B');
state.programVariant = null;
loadProgram();
ok('Hver øvelse i dagens træning har en anbefaling at vise på kortet',
    state.exercises.every(e => e.plan && e.plan.sets > 0 && e.plan.reps > 0));

// Taget: en fuld dag afviser flere øvelser i stedet for at vokse
state.exercises = Array.from({ length: MAX_PER_DAY }, () => ({ exerciseId: 'bench_press', plan: null, sets: [], targetReps: 8 }));
const before = state.exercises.length;
const rejected = addExerciseToSession('dips');
ok(`En dag med ${MAX_PER_DAY} øvelser afviser flere`, rejected === false && state.exercises.length === before);
state.exercises = [];

// Et bytte holder antallet: den nye øvelse overtager pladsen
store['gym_tracker_program_swaps'] = JSON.stringify({});
state.currentDay = 'lower';
state.programVariant = 'A';
loadProgram();
const beforeSwap = state.exercises.map(e => e.exerciseId);
swapExercise('calf_raise', 'calf_raise_leg_press');
ok('Et bytte ændrer ikke antallet af øvelser', state.exercises.length === beforeSwap.length);
ok('Den nye øvelse står på den byttede øvelses plads',
    state.exercises[beforeSwap.indexOf('calf_raise')].exerciseId === 'calf_raise_leg_press',
    idsOf(state.exercises));
ok('Byttet huskes for Lower A', JSON.parse(store['gym_tracker_program_swaps']).lowerA.calf_raise === 'calf_raise_leg_press');
ok('Lower B er urørt af byttet', idsOf(programItems('lower', 'B')) === idsOf(getProgram('lower', 'B')));

// Et bytte til en øvelse der allerede står i dagens træning afvises (ingen dubletter)
swapExercise('hip_thrust', 'leg_press');
ok('Bytte til en øvelse der allerede er i dagens træning afvises',
    state.exercises.filter(e => e.exerciseId === 'leg_press').length === 1 &&
    state.exercises.some(e => e.exerciseId === 'hip_thrust'));

// Har man fjernet en række fra dagens træning, bliver den ikke lagt ind igen af et bytte
state.exercises = state.exercises.filter(e => e.exerciseId !== 'hip_thrust');
swapExercise('hip_thrust', 'glute_bridge');
ok('Et bytte genopliver ikke en række man har fjernet', !state.exercises.some(e => e.exerciseId === 'glute_bridge'));
ok('Men programmet viser den nye øvelse', programItems('lower', 'A').some(i => i.exerciseId === 'glute_bridge'));

// Øvelseskortet kan sætte samme bytte i gang som programrækken: slotten findes ud
// fra øvelsen, så kortet ved hvilken række det hører til — også efter et bytte.
state.currentDay = 'lower';
state.programVariant = 'A';
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
ok('En programøvelse peger på sin egen række', slotForExercise('leg_press') === 'leg_press');
setSwap('lower', 'A', 'calf_raise', 'calf_raise_leg_press');
loadProgram();
ok('Efter et bytte peger den byttede øvelse stadig på den oprindelige række',
    slotForExercise('calf_raise_leg_press') === 'calf_raise');
// Den øvelse der blev byttet væk skal stadig pege på rækken: en ældre gemt træning
// indeholder den, og kortet skal kunne byttes videre derfra.
ok('Den øvelse der blev byttet væk peger stadig på sin række', slotForExercise('calf_raise') === 'calf_raise');
state.exercises = [];
ok('Den byttede-væk-øvelse har stadig en bytte-liste med alternativer',
    swapCandidates('lower', 'calf_raise').length > 1, swapCandidates('lower', 'calf_raise').map(c => c.id).join(', '));
// Og et bytte sat i gang fra den øvelse rammer det kort der står på skærmen, også
// når kortet viser den øvelse rækken blev byttet væk fra (ældre gemt træning)
state.exercises = [{ exerciseId: 'calf_raise', plan: null, sets: [{ weight: 100, reps: 12 }], targetReps: 12 }];
swapExercise('calf_raise', 'calf_raise_leg_press');
ok('Et bytte fra en ældre trænings kort skifter kortet på skærmen',
    state.exercises.length === 1 && state.exercises[0].exerciseId === 'calf_raise_leg_press',
    JSON.stringify(state.exercises.map(e => e.exerciseId)));
state.exercises = [];

ok('En øvelse uden for programmet har ingen række at bytte på', slotForExercise('dips') === null);
ok('Opslaget følger den viste dag', slotForExercise('bench_press') === null);

// Fjerner man en øvelse fra dagens træning, kan den hentes tilbage på sin plads i
// programmet — det var programlistens klik der gjorde det før.
state.currentDay = 'lower';
state.programVariant = 'A';
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
const fullSession = state.exercises.map(e => e.exerciseId);
ok('Ingen rækker mangler når programmet lige er indlæst', missingExerciseCount() === 0);
state.exercises = state.exercises.filter(e => e.exerciseId !== 'hip_thrust');
ok('Én fjernet række tælles', missingExerciseCount() === 1);
ok('Hentes tilbage på programmets plads, ikke til sidst',
    (restoreMissingExercises(), state.exercises.map(e => e.exerciseId).join(',') === fullSession.join(',')),
    state.exercises.map(e => e.exerciseId).join(','));
ok('Der mangler ikke noget bagefter', missingExerciseCount() === 0);

// Tallene hører til øvelsen, ikke til rækken. Et bytte arvede før den byttede
// øvelses tal, så Leg Press' 225 kg blev hængende på Leg Extension (70 kg).
store['gym_tracker_workouts'] = JSON.stringify([]);
store['gym_tracker_program_swaps'] = JSON.stringify({ lowerA: { leg_press: 'leg_extension' } });
const swappedRow = programItems('lower', 'A').find(i => i.exerciseId === 'leg_extension');
const extRow = getProgram('lower', 'B').find(r => r.exerciseId === 'leg_extension');
ok('En byttet øvelse får sin egen vægt fra skabelonen (ikke rækkens 225 kg)',
    swappedRow.weight === extRow.weight && swappedRow.weight !== 225, JSON.stringify(swappedRow));
ok('En byttet øvelse får også sine egne sæt og reps',
    swappedRow.sets === extRow.sets && swappedRow.reps === extRow.reps, JSON.stringify(swappedRow));
ok('Rækken husker stadig hvad den blev byttet fra', swappedRow.swappedFrom === 'leg_press');
// Står øvelsen i begge varianter, er det den variant man er i der gælder
// (Leg Curl vejer 41 kg i A og 45 kg i B).
ok('Den variant man står i bestemmer tallene',
    planFor('lower', 'leg_curl', 'A').weight === 41 && planFor('lower', 'leg_curl', 'B').weight === 45,
    JSON.stringify([planFor('lower', 'leg_curl', 'A'), planFor('lower', 'leg_curl', 'B')]));

// En øvelse uden programrække: dens egen historik er det eneste holdepunkt.
store['gym_tracker_workouts'] = JSON.stringify([progWorkout('bs', '2026-10-05', 'lower', 'A',
    [['bulgarian_split', set(20, 10)]])]);
setSwap('lower', 'A', 'leg_press', 'bulgarian_split');
ok('Uden programrække bruges øvelsens egen historik (20 kg × 10 → 22,5 kg)',
    programItems('lower', 'A').find(i => i.exerciseId === 'bulgarian_split').weight === 22.5,
    JSON.stringify(planFor('lower', 'bulgarian_split')));

// Helt uden række og historik: et rent startpunkt, aldrig rækkens vægt.
store['gym_tracker_workouts'] = JSON.stringify([]);
const freshPlan = planFor('lower', 'hack_squat');
ok('Uden række og historik er svaret et rent startpunkt',
    freshPlan.sets === 3 && freshPlan.reps === 8 && freshPlan.weight === 20, JSON.stringify(freshPlan));

// Og hele vejen igennem: byttet på kortet giver de nye tal i felterne.
state.currentDay = 'lower';
state.programVariant = 'A';
store['gym_tracker_program_swaps'] = JSON.stringify({});
store['gym_tracker_workouts'] = JSON.stringify([]);
loadProgram();
swapExercise('leg_press', 'leg_extension');
const extCard = state.exercises.find(e => e.exerciseId === 'leg_extension');
ok('Efter byttet står den nye øvelses vægt og reps i felterne',
    !!extCard && extCard.sets.every(s => s.weight === 70 && s.reps === 12), JSON.stringify(extCard && extCard.sets));
ok('Anbefalingen på kortet er den nye øvelses, ikke Leg Press\'',
    !!extCard && extCard.plan.weight === 70 && extCard.plan.reps === 12, JSON.stringify(extCard && extCard.plan));
ok('Den gamle øvelses vægt er ikke tilbage i dagens træning',
    !state.exercises.some(e => e.sets.some(s => s.weight === 225)));

store['gym_tracker_workouts'] = JSON.stringify([]);
store['gym_tracker_program_swaps'] = JSON.stringify({});
state.exercises = [];
state.programVariant = null;
state.currentDay = 'upper';


console.log('\n── 12. Filopdeling (index.html + styles.css + app.js)');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
ok('index.html linker til styles.css', html.includes('<link rel="stylesheet" href="styles.css">'));
ok('index.html loader app.js', html.includes('<script src="app.js"></script>'));
ok('index.html har ingen inline <style>-blok tilbage', !/<style[\s>]/.test(html));
ok('index.html har ingen inline <script>-kode tilbage', !/<script(?![^>]*src=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html));
ok('styles.css er ikke tom', css.trim().length > 1000);
ok('app.js er ikke tom', script.trim().length > 1000);
ok('CSS-variablerne ligger i styles.css', css.includes(':root') && css.includes('--accent'));
ok('HTML-strukturen er stadig i index.html', html.includes('id="session-bar"') && html.includes('id="exercise-list"'));
// Ugebjælkens felter er det eneste pas-valg: dag-vælger, A/B-knapper og velkomsttekst
// blev fjernet med vilje, og de skal ikke snige sig ind igen.
ok('Dag-vælgeren er væk fra markup', !html.includes('day-selector') && !html.includes('day-btn'));
ok('A/B-knapperne er væk fra markup', !html.includes('variant-selector') && !html.includes('variant-btn'));
ok('Velkomstteksten er væk fra markup', !html.includes('first-use-banner') && !html.includes('Welcome!'));
ok('Alle id\'er som app.js bruger findes i index.html', (() => {
    const used = new Set([...script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]));
    return [...used].every(id => html.includes(`id="${id}"`));
})());
ok('Alle klasser app.js slår op findes i styles.css eller index.html', (() => {
    const used = new Set([...script.matchAll(/querySelector(?:All)?\(['"`]\.([a-z-]+)/g)].map(m => m[1]));
    return [...used].every(c => css.includes('.' + c) || html.includes('class="' + c));
})());

console.log('\n── 13. Opvarmningssæt (beregnet ud fra arbejdsvægten)');
const exById = (day, id) => ALL_EXERCISES[day].find(e => e.id === id);
const fmtWarmup = sets => sets.map(s => `${s.weight}×${s.reps}`).join(' ');

ok('Bench 60 kg → stang 20×10, 30×8, 42.5×5, 50×3',
    fmtWarmup(warmupSets(60, exById('upper', 'bench_press'))) === '20×10 30×8 42.5×5 50×3',
    fmtWarmup(warmupSets(60, exById('upper', 'bench_press'))));
ok('Bench 65 kg → rampen følger vægten (32.5×8, 55×3)',
    fmtWarmup(warmupSets(65, exById('upper', 'bench_press'))) === '20×10 32.5×8 45×5 55×3');
ok('Isolation med EZ-bar får ét let sæt (curl 21 kg → 12.5×12)',
    fmtWarmup(warmupSets(21, exById('upper', 'ez_bar_curl'))) === '12.5×12',
    fmtWarmup(warmupSets(21, exById('upper', 'ez_bar_curl'))));
ok('EZ-bar regnes som 10 kg stang når øvelsen er sammensat',
    fmtWarmup(warmupSets(21, { compound: true, equipment: 'EZ-bar' })) === '10×10 15×5 17.5×3',
    fmtWarmup(warmupSets(21, { compound: true, equipment: 'EZ-bar' })));
ok('Maskine: Leg Press 250 → 125×10 187.5×6',
    fmtWarmup(warmupSets(250, exById('lower', 'leg_press'))) === '125×10 187.5×6');
ok('Kabel: Lat Pulldown 62 → 30×10 47.5×6',
    fmtWarmup(warmupSets(62, exById('upper', 'lat_pulldown'))) === '30×10 47.5×6');
ok('Isolation: Lateral Raise 8 → ét sæt 5×12',
    fmtWarmup(warmupSets(8, exById('upper', 'lateral_raise'))) === '5×12');
ok('Håndvægte rundes til 1 kg (DB curl 10 → 6×12)',
    fmtWarmup(warmupSets(10, exById('upper', 'dumbbell_curl'))) === '6×12');
ok('Ingen arbejdsvægt → ingen opvarmning', warmupSets(0, exById('upper', 'bench_press')).length === 0);
ok('Ukendt øvelse → ingen opvarmning', warmupSets(60, null).length === 0);
ok('Kropsvægtøvelse → ingen tal at rampe efter', warmupSets(0, exById('upper', 'pull_up')).length === 0);
ok('Rampen ligger altid under arbejdsvægten',
    warmupSets(20, exById('upper', 'bench_press')).every(s => s.weight < 20));
ok('Rampen er stigende uden dubletter', (() => {
    const s = warmupSets(100, exById('lower', 'squat'));
    return s.length > 1 && s.every((x, i) => i === 0 || x.weight > s[i - 1].weight);
})());
ok('renderWarmupBlock viser tallene', renderWarmupBlock(exById('upper', 'bench_press'), 60).includes('42.5 × 5'));
ok('renderWarmupBlock er tom uden vægt', renderWarmupBlock(exById('upper', 'bench_press'), 0) === '');
ok('Kun ét opvarmningsforslag pr. vægt (ingen dubletter ved runde tal)',
    fmtWarmup(warmupSets(100, exById('lower', 'squat'))) === '20×10 50×8 70×5 85×3');

console.log('\n── 14. Teknik-cues på øvelseskortet');
const allIds = new Set([...EXERCISES.upper, ...EXERCISES.lower].map(e => e.id));

ok('Cue findes for Bench Press', /Shoulder blades/.test(exerciseCue(exById('upper', 'bench_press'))));
ok('Ukendt id → ingen cue', exerciseCue({ id: 'findes_ikke' }) === '');
ok('Tom/manglende øvelse → ingen cue', exerciseCue(null) === '' && exerciseCue({}) === '');
ok('Alle cue-nøgler peger på en øvelse i databasen (ingen døde opslag)',
    Object.keys(CUES).every(id => allIds.has(id)),
    Object.keys(CUES).filter(id => !allIds.has(id)).join(', '));
ok('Hver øvelse i A/B-programmerne har en cue', (() => {
    const progIds = new Set(Object.values(PROGRAMS).flat().map(item => item.exerciseId));
    return [...progIds].every(id => (CUES[id] || '').length > 0);
})(), [...new Set(Object.values(PROGRAMS).flat().map(i => i.exerciseId))].filter(id => !CUES[id]).join(', '));
ok('Cues er korte nok til mobilen (maks 130 tegn)',
    Object.values(CUES).every(c => c.length <= 130),
    Object.entries(CUES).filter(([, c]) => c.length > 130).map(([id]) => id).join(', '));
ok('Cues er rene tekststrenge uden HTML',
    Object.values(CUES).every(c => typeof c === 'string' && !/[<>]/.test(c)));
ok('renderCueLine sætter linjen på kortet', (() => {
    const html = renderCueLine(exById('upper', 'bench_press'));
    return html.includes('class="cue-line"') && html.includes('💡') && html.includes('Shoulder blades');
})());
ok('renderCueLine er tom for en øvelse uden cue', renderCueLine({ id: 'findes_ikke' }) === '');
ok('RDL-cue nævner det vigtigste (hofterne tilbage)', /Hips back/.test(exerciseCue(exById('lower', 'romanian_deadlift'))));
ok('Lateral Raise-cue holder den let', /Light is the point/.test(exerciseCue(exById('upper', 'lateral_raise'))));
ok('Skull Crusher og Tricep Pushdown deler samme cue (samme bevægelse)',
    exerciseCue(exById('upper', 'skull_crusher')) === exerciseCue(exById('upper', 'tricep_pushdown')));

// ─── 14b. Hele øvelsesdatabasen — generelle krav ──────────────────
// Datadrevet med vilje: hvert krav gælder ALLE øvelser, så en ny øvelse kun kræver
// en række i EXERCISES + en cue. Skriv ikke en ny ok(...) pr. øvelse — udvid et løb
// over databasen i stedet. (Det var præcis den boilerplate vi ville væk fra.)
console.log('\n── 14b. Hele øvelsesdatabasen (generelle krav)');

const ALL_DB = [...EXERCISES.upper.map(e => ({ ...e, day: 'upper' })), ...EXERCISES.lower.map(e => ({ ...e, day: 'lower' }))];
const w100 = e => warmupSets(100, e);
const fmt = sets => sets.map(s => `${s.weight}×${s.reps}`).join(' ');

ok('Øvelses-id\'er er unikke',
    new Set(ALL_DB.map(e => e.id)).size === ALL_DB.length,
    ALL_DB.map(e => e.id).filter((id, i, a) => a.indexOf(id) !== i).join(', '));
ok('Hver øvelse har navn, muskelgruppe, compound-flag og redskab',
    ALL_DB.every(e => typeof e.name === 'string' && e.name.length > 0
        && typeof e.muscle === 'string' && e.muscle.length > 0
        && typeof e.compound === 'boolean'
        && typeof e.equipment === 'string' && e.equipment.length > 0));
ok('Redskabet er et af dem vi har regler for',
    ALL_DB.every(e => ['Barbell', 'EZ-bar', 'Dumbbell', 'Cable', 'Machine', 'Machine/Dumbbell', 'Bodyweight'].includes(e.equipment)),
    [...new Set(ALL_DB.filter(e => !['Barbell', 'EZ-bar', 'Dumbbell', 'Cable', 'Machine', 'Machine/Dumbbell', 'Bodyweight'].includes(e.equipment)).map(e => `${e.id}=${e.equipment}`))].join(', '));
ok('loadNote er kun "per hand" eller "per leg"',
    ALL_DB.every(e => e.loadNote === undefined || ['per hand', 'per leg'].includes(e.loadNote)),
    ALL_DB.filter(e => e.loadNote && !['per hand', 'per leg'].includes(e.loadNote)).map(e => `${e.id}=${e.loadNote}`).join(', '));
ok('Navnet gentager ikke noten (fx "Cable Row (per hand) (per hand)")',
    ALL_DB.every(e => !/\(per (hand|leg)\)/i.test(e.name)),
    ALL_DB.filter(e => /\(per (hand|leg)\)/i.test(e.name)).map(e => e.id).join(', '));

// Cue-dækning: hver øvelse i databasen skal have en linje at vise på kortet
ok('Hver øvelse i databasen har en cue',
    ALL_DB.every(e => (CUES[e.id] || '').length > 0),
    ALL_DB.filter(e => !(CUES[e.id] || '').length).map(e => e.id).join(', '));
ok('exerciseCue slår op på id (ukendt id giver tom streng)',
    ALL_DB.every(e => exerciseCue(e) === CUES[e.id]) && exerciseCue({ id: 'findes_ikke' }) === '');

// Opvarmning: reglerne pr. redskab skal holde for hele databasen på én gang.
// 100 kg som arbejdsvægt gør tallene runde, så vi kan skrive forventningen direkte.
const bodyweight = ALL_DB.filter(e => e.equipment === 'Bodyweight');
const isolation = ALL_DB.filter(e => !e.compound && e.equipment !== 'Bodyweight');
const barCompound = ALL_DB.filter(e => e.compound && ['Barbell', 'EZ-bar'].includes(e.equipment));
const machineCompound = ALL_DB.filter(e => e.compound && !['Barbell', 'EZ-bar', 'Bodyweight'].includes(e.equipment));

ok('Kropsvægtøvelser får ingen opvarmning (der er ingen tal at rampe efter)',
    bodyweight.length > 0 && bodyweight.every(e => w100(e).length === 0),
    bodyweight.map(e => `${e.id}=${fmt(w100(e))}`).join(', '));
ok('Isolation får præcis ét let sæt på 12 reps under arbejdsvægten',
    isolation.length > 0 && isolation.every(e => w100(e).length === 1 && w100(e)[0].reps === 12 && w100(e)[0].weight < 100 && w100(e)[0].weight > 0),
    isolation.map(e => `${e.id}=${fmt(w100(e))}`).join(', '));
ok('Stang- og EZ-bar-øvelser får stang ×10 først og tre ramp-sæt (10/8/5/3 reps)',
    barCompound.length > 0 && barCompound.every(e => {
        const s = w100(e);
        const bar = e.equipment === 'EZ-bar' ? 10 : 20;
        return s.length === 4 && s[0].weight === bar && s[0].reps === 10
            && s.map(x => x.reps).join(',') === '10,8,5,3';
    }),
    barCompound.map(e => `${e.id}=${fmt(w100(e))}`).join(', '));
ok('Maskine/kabel/håndvægt-sammensatte får to ramp-sæt (10/6 reps)',
    machineCompound.length > 0 && machineCompound.every(e => {
        const s = w100(e);
        return s.length === 2 && s.map(x => x.reps).join(',') === '10,6';
    }),
    machineCompound.map(e => `${e.id}=${fmt(w100(e))}`).join(', '));
ok('Enhver rampe er stigende, uden dubletter, og holder sig under arbejdsvægten',
    ALL_DB.every(e => {
        const s = w100(e);
        return s.every((x, i) => x.weight > 0 && x.weight < 100
            && (i === 0 || x.weight > s[i - 1].weight));
    }),
    ALL_DB.filter(e => {
        const s = w100(e);
        return !s.every((x, i) => x.weight > 0 && x.weight < 100 && (i === 0 || x.weight > s[i - 1].weight));
    }).map(e => `${e.id}=${fmt(w100(e))}`).join(', '));
ok('renderWarmupBlock viser rampen for enhver øvelse med en arbejdsvægt',
    ALL_DB.filter(e => e.equipment !== 'Bodyweight').every(e => {
        const html = renderWarmupBlock(e, 100);
        return html.includes('🔥 Warm-up') && w100(e).every(s => html.includes(`${s.weight} × ${s.reps}`));
    }),
    ALL_DB.filter(e => e.equipment !== 'Bodyweight' && !renderWarmupBlock(e, 100).includes('🔥 Warm-up')).map(e => e.id).join(', '));
ok('Cue-linjen bygges for enhver øvelse (ingen tom linje uden cue)',
    ALL_DB.every(e => renderCueLine(e).includes('💡') && renderCueLine(e).includes(CUES[e.id])));

console.log('\n── 15. Sprogværn: engelsk i UI\'et, dansk kun i kommentarer');
// Kommentarer er ikke bruger-vendte og må gerne være danske — resten skal være engelsk.
// Uden denne test er en glemt streng usynlig: browser-testene tjekker adfærd, ikke sprog.
// Metoden er bevidst grov: fjern kommentarer, og se om der er dansk tilbage nogen steder.
const stripComments = src => src.split('\n').map(line => {
    let quote = null, res = '';
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
            res += c;
            if (c === '\\') { res += line[i + 1] || ''; i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '/' && line[i + 1] === '/') break;
        if (c === "'" || c === '"' || c === '`') quote = c;
        res += c;
    }
    return res;
}).join('\n');

const DA_CHARS = /[æøåÆØÅ]/;
// Ord uden æ/ø/å — de fanges ikke af tegn-tjekket, så de listes eksplicit. Listen er et
// net, ikke en garanti: kun danske ord der ikke også findes i engelsk tekst (derfor ikke
// fx "for", "over", "under", "med", "se"). Tegn-tjekket ovenfor fanger alt med æ/ø/å.
const DA_WORDS = /\b(uge|uger|vis|skjul|gem|gemt|volumen|fremgang|husker|rampe|antal|historik|eksempeldata|delt|sidst|totalt|tegn|beskeder|markeret|sprunget|skjult|filtreringen|kun|nyt|bedste|nogensinde|stang|dag|dage|mave|ryg|bryst|rumpe|kalve|skulder|op|ned|ingen|vaelg|annuller|kopier|fjern|ryd|fyld|samlet|tilfoej|sammensat|intet|fundet|udklip|udklipsholderen|kopieret|endnu|ikke|eller|bliver|bruger|dato|gennem|havde|hvordan|kan|komme|kunne|meget|skal|sammen|sin|som|stor|til|viser|nederst|sidste|nye|gamle|hurtig|langsom|mellem|uden|hvis|selv|noget|nogen|mange|lidt|gerne|altid|aldrig|igen|snart|alle|fra|rediger|redigerer|anbefaling)\b/i;

const appCode = stripComments(script);
const htmlCode = html.replace(/<!--[\s\S]*?-->/g, '');

function danishHits(text, label) {
    const hits = [];
    text.split('\n').forEach((line, i) => {
        const chars = line.match(DA_CHARS);
        const words = line.match(new RegExp(DA_WORDS, 'gi'));
        if (chars || words) hits.push(`${label}:${i + 1} ${[...new Set([...(chars || []), ...(words || [])])].join(',')} → ${line.trim().slice(0, 70)}`);
    });
    return hits;
}

const appHits = danishHits(appCode, 'app.js');
const htmlHits = danishHits(htmlCode, 'index.html');
ok('Ingen danske tegn i app.js uden for kommentarer', appHits.length === 0, appHits.join(' | '));
ok('Ingen danske tegn i index.html', htmlHits.length === 0, htmlHits.join(' | '));
ok('Siden er erklæret engelsk (<html lang="en">)', /<html lang="en">/.test(html));
ok('Sprogværnet ser skarpt nok ud (fanger en indsat dansk streng)', (() => {
    const probe = stripComments("showToast('Øvelsen er tilføjet', 'info');\nconst x = 1; // dansk kommentar");
    return DA_CHARS.test(probe) && !/kommentar/.test(probe);
})());

// ─── 16. Coach notes (ugentlige noter hentet fra nettet) ────────────
// Noterne ligger ikke i localStorage, men hentes fra en gist. Derfor er der tre
// ting der skal holdes fast: at markdown bliver til sikker HTML, at et svar fra
// nettet ikke kan injicere kode, og at en død forbindelse giver en besked i
// panelet i stedet for et crash (appen skal kunne bruges uden net).
async function notesTests() {
    console.log('\n── 16. Coach notes (hentet fra nettet, ikke fra localStorage)');

    // API'et og ikke raw-links: raw-URL'en til den nyeste revision kan hænge i
    // CDN-cachen og vise den forrige uges noter (målt: stadig gammel efter 5 min).
    ok('NOTES_URL er https og peger på gist-API\'et',
        /^https:\/\/api\.github\.com\/gists\/[0-9a-f]+$/.test(NOTES_URL),
        NOTES_URL);
    ok('Filnavnet der læses i svaret er det gisten indeholder', NOTES_FILE === 'weekly-notes.md', NOTES_FILE);
    ok('escapeHtml lukker alle fem tegn',
        escapeHtml(`<a href="x">'&'</a>`) === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
        escapeHtml(`<a href="x">'&'</a>`));

    const md = [
        '# Coach notes',
        '',
        '## Week 41 · 5–11 Oct 2026',
        '',
        '4 sessions · 52 sets · 43338 kg',
        '',
        '**Load up**',
        '- Bench Press 65×8×3 → 67.5×6-8',
        '- Lat Pulldown 66×10 → next pin',
        '',
        'Worth knowing: RDL stays out.',
    ].join('\n');
    const notesHtml = renderNotesMarkdown(md);

    ok('Ugen bliver en overskrift med klasse', notesHtml.includes('<div class="notes-week">Week 41 · 5–11 Oct 2026</div>'));
    ok('Dokumentets titel bliver den lille titel', notesHtml.includes('<div class="notes-title">Coach notes</div>'));
    ok('Fed markdown bliver <strong>', notesHtml.includes('<div class="notes-line"><strong>Load up</strong></div>'));
    ok('Punkter bliver en liste med ét <li> pr. linje',
        /<ul class="notes-list"><li>Bench Press 65×8×3 → 67\.5×6-8<\/li><li>Lat Pulldown 66×10 → next pin<\/li><\/ul>/.test(notesHtml));
    ok('Listen lukkes før næste afsnit', notesHtml.includes('</ul><div class="notes-line">Worth knowing: RDL stays out.</div>'));
    ok('Rene linjer bliver afsnit', notesHtml.includes('<div class="notes-line">4 sessions · 52 sets · 43338 kg</div>'));
    ok('En tom fil giver en forklarende linje, ikke et tomt panel', /class="notes-status"/.test(renderNotesMarkdown('   ')));
    ok('Tom/manglende tekst crasher ikke', renderNotesMarkdown('').includes('notes-status') && renderNotesMarkdown(null).includes('notes-status'));

    // Filen kommer fra nettet — HTML i den må aldrig slippe igennem
    const evil = renderNotesMarkdown('# Title <script>alert(1)</script>\n- <img src=x onerror=alert(1)>');
    ok('En hentet fil kan ikke injicere HTML', !/<script|<img/.test(evil), evil.slice(0, 90));
    ok('Tegnene kommer i stedet med som tekst', evil.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    ok('Ingen rå vinkelparenteser ud over de tags vi selv laver', !/<(?!\/?(div|ul|li|strong|code)\b)/.test(evil));

    // loadCoachNotes skal fylde panelet — og fejle pænt
    const captured = {};
    const realGetById = document.getElementById;
    document.getElementById = id => (captured[id] = captured[id] || makeEl(id));

    let calls = [];
    const RAW_URL = 'https://gist.githubusercontent.com/Lausius/x/raw/weekly-notes.md';
    const jsonReply = payload => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
    const textReply = text => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(text) });

    notesFetchImpl = (url, opts) => {
        calls.push({ url, opts });
        return jsonReply({ files: { 'weekly-notes.md': { content: md, truncated: false } } });
    };
    const loaded = await loadCoachNotes();
    ok('Noterne hentes fra den aftalte URL', calls[0].url === NOTES_URL, String(calls[0].url));
    ok('Hentningen omgår browserens cache (ny uge skal ikke gemmes bag en gammel)',
        !!calls[0].opts && calls[0].opts.cache === 'no-store', JSON.stringify(calls[0].opts));
    ok('Panelet fyldes med de hentede noter', captured['notes-content'].innerHTML.includes('Week 41'));
    ok('loadCoachNotes returnerer den viste HTML', loaded.includes('notes-week'));

    // Svar uden den fil vi leder efter må ikke give et tomt panel uden forklaring
    calls = [];
    notesFetchImpl = (url, opts) => {
        calls.push({ url, opts });
        return jsonReply({ files: { 'other.md': { content: '# Something else' } } });
    };
    await loadCoachNotes();
    ok('Mangler filen i svaret, siges det i panelet',
        /No notes yet/.test(captured['notes-content'].innerHTML) && !captured['notes-content'].innerHTML.includes('Something else'));

    // Afkortede svar: hent den rå fil i stedet for at vise halve noter
    calls = [];
    notesFetchImpl = (url, opts) => {
        calls.push({ url, opts });
        if (url === NOTES_URL) {
            return jsonReply({ files: { 'weekly-notes.md': { content: '# Coach notes', truncated: true, raw_url: RAW_URL } } });
        }
        return textReply(md);
    };
    const truncated = await loadCoachNotes();
    ok('Et afkortet API-svar henter den rå fil i stedet',
        truncated.includes('Week 41') && calls.length === 2 && calls[0].url === NOTES_URL && calls[1].url === RAW_URL,
        JSON.stringify(calls.map(c => c.url)));

    notesFetchImpl = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    ok('HTTP-fejl giver en besked i panelet, ikke et crash',
        (await loadCoachNotes()) === '' && /Could not load the notes/.test(captured['notes-content'].innerHTML));

    // HTTP 200 med ugyldigt JSON er den fejl der er lettest at overse
    notesFetchImpl = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) });
    ok('Ugyldigt JSON-svar giver samme besked i stedet for et crash',
        (await loadCoachNotes()) === '' && /Could not load the notes/.test(captured['notes-content'].innerHTML));

    notesFetchImpl = () => Promise.reject(new Error('offline'));
    ok('Død forbindelse giver samme besked',
        (await loadCoachNotes()) === '' && /Could not load the notes/.test(captured['notes-content'].innerHTML));

    ok('Miljø uden fetch siger det samme i stedet for at kaste',
        (await loadCoachNotes(null)) === '' && /Could not load the notes/.test(captured['notes-content'].innerHTML));

    document.getElementById = realGetById;
}

notesTests().then(() => {
    console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);
    process.exit(fail === 0 ? 0 : 1);
});