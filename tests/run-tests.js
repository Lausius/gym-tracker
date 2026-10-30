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

const ctx = { document, localStorage, console, setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, parseInt, parseFloat, isNaN, fetch, scrollTo() {} };
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
        startEditWorkout, cancelEdit, saveWorkout, updateSet,
        warmupSets, formatWarmupSets, renderWarmupBlock, CUES, exerciseCue, renderCueLine,
        NOTES_URL, NOTES_FILE, escapeHtml, renderNotesMarkdown, loadCoachNotes,
        DRAFT_KEY, DRAFT_DEBOUNCE, loadDrafts, persistDraft, restoreDraft, draftIsDirty,
        draftKeyFor, clearDraft, scheduleDraftSave,
        COLLAPSE_KEY, loadCollapsed, collapsedIds, applyCollapsedState, isCollapsed,
        persistCollapsed, clearCollapsed, toggleCollapsed, collapsedSummary,
        renderExerciseList, removeExercise };
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
    startEditWorkout, cancelEdit, saveWorkout, updateSet,
    warmupSets, formatWarmupSets, renderWarmupBlock, CUES, exerciseCue, renderCueLine,
    NOTES_URL, NOTES_FILE, escapeHtml, renderNotesMarkdown, loadCoachNotes,
    DRAFT_KEY, DRAFT_DEBOUNCE, loadDrafts, persistDraft, restoreDraft, draftIsDirty,
    draftKeyFor, clearDraft, scheduleDraftSave,
    COLLAPSE_KEY, loadCollapsed, collapsedIds, applyCollapsedState, isCollapsed,
    persistCollapsed, clearCollapsed, toggleCollapsed, collapsedSummary,
    renderExerciseList, removeExercise,
} = ctx.__app;

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

console.log('\n── 1. Program-integritet (alle øvelses-IDer findes på den rigtige dag)');
for (const key of Object.keys(PROGRAMS)) {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    for (const item of PROGRAMS[key]) {
        ok(`${key}: '${item.exerciseId}' findes i ${day}-databasen`,
            !!ALL_EXERCISES[day].find(e => e.id === item.exerciseId));
    }
}
ok('Ingen dag har mere end MAX_PER_DAY øvelser, og hver række har sæt, reps og vægt',
    Object.values(PROGRAMS).every(list => list.length <= MAX_PER_DAY) &&
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

// Rækkefølgen er den man træner i: overkrop og ben skiftevis, A før B for hver dag.
ok('Ugens fire pas står i træningsrækkefølge (upperA, lowerA, upperB, lowerB)',
    SESSION_ORDER.join(',') === 'upperA,lowerA,upperB,lowerB', SESSION_ORDER.join(','));

seed([]);
ok('Ingen historik → foreslår A, og ugen er tom',
    getSuggestedVariant('upper', TODAY) === 'A' && getSuggestedVariant('lower', TODAY) === 'A' &&
    Object.keys(weekDone(TODAY)).length === 0);

seed([w('u1', '2026-10-05', 'upper', 'A')]);
ok('Upper A er klaret i ugen, Upper B mangler, og efter Upper A foreslås Upper B',
    isDoneThisWeek('upper', 'A', TODAY) === true && isDoneThisWeek('upper', 'B', TODAY) === false &&
    getSuggestedVariant('upper', TODAY) === 'B');
ok('Næste pas i ugen er ben (sidste pas var overkrop)', nextSessionInWeek(TODAY) === 'lowerA',
    String(nextSessionInWeek(TODAY)));

seed([w('u1', '2026-10-05', 'upper', 'A'), w('u2', '2026-10-07', 'upper', 'B')]);
ok('Begge upper-pas klaret → foreslår A igen, og lower-historikken er stadig urørt',
    getSuggestedVariant('upper', TODAY) === 'A' && getSuggestedVariant('lower', TODAY) === 'A' &&
    nextSessionInWeek(TODAY) === 'lowerA');

// Ugen nulstilles: sidste uges pas må ikke tælle med
seed([w('u1', '2026-09-29', 'upper', 'A'), w('u2', '2026-10-01', 'upper', 'B')]);
ok('Sidste uges træninger tæller ikke med, så der foreslås A igen',
    Object.keys(weekDone(TODAY)).length === 0 && getSuggestedVariant('upper', TODAY) === 'A');

seed([w('u1', '2026-10-05', 'upper', 'A'), w('l1', '2026-10-06', 'lower', 'A'),
      w('u2', '2026-10-07', 'upper', 'B'), w('l2', '2026-10-10', 'lower', 'B')]);
ok('Alle fire pas klaret → ugen tæller fire og intet næste pas',
    Object.keys(weekDone(TODAY)).length === 4 && nextSessionInWeek(TODAY) === null,
    String(nextSessionInWeek(TODAY)));

// Låsen: samme dag+variant må ikke gemmes to gange i samme uge
state.currentDay = 'upper';
state.programVariant = 'A';
state.allowDuplicateWeek = false;
state.editing = null;
seed([w('u1', '2026-10-05', 'upper', 'A')]);
ok('Låst: Upper A ligger allerede i ugen (på den dag passet blev lavet)',
    !!weekConflict(TODAY) && weekConflict(TODAY).date === '2026-10-05');
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
ok('Alle fire pas har et fokus (det er det der gør A og B forskellige)',
    SESSION_ORDER.every(k => typeof SESSION_FOCUS[k] === 'string' && SESSION_FOCUS[k].length > 3),
    SESSION_ORDER.map(k => `${k}=${SESSION_FOCUS[k]}`).join(' '));
seed([]);

// Træninger uden variant-felt (gamle data) må ikke crashe
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', exercises: [] },
]);
ok('Gamle træninger uden variant → A, og tælles ikke som et klaret pas',
    getSuggestedVariant('upper', TODAY) === 'A' && Object.keys(weekDone(TODAY)).length === 0);

console.log('\n── 3. Progressiv overload');
store['gym_tracker_workouts'] = JSON.stringify([]);
let r = calculateProgressiveOverload('bench_press', 'upper');
ok('Ingen historik → status "new"', r.status === 'new');

const oneSession = (id, day, variant, weight, reps) => ({
    id, date: '2026-09-01', day, variant, exercises: [
        { exerciseId: 'bench_press', sets: Array.from({ length: 3 }, () => ({ weight, reps })) },
    ],
});

store['gym_tracker_workouts'] = JSON.stringify([oneSession('w1', 'upper', 'A', 60, 8)]);
r = calculateProgressiveOverload('bench_press', 'upper');
ok('60 kg × 8 reps → foreslår 62.5 kg', r.suggestion === '62.5 kg × 8 reps', `fik "${r.suggestion}"`);

store['gym_tracker_workouts'] = JSON.stringify([oneSession('w1', 'upper', 'A', 60, 5)]);
r = calculateProgressiveOverload('bench_press', 'upper');
ok('60 kg × 5 reps → holder vægten, flere reps', r.suggestion === '60 kg × 6 reps', `fik "${r.suggestion}"`);

// Stagnation: samme vægt i 3 unikke sessioner. Sæt tælles som én session pr. dag.
store['gym_tracker_workouts'] = JSON.stringify([
    oneSession('w1', 'upper', 'A', 60, 8),
    { ...oneSession('w2', 'upper', 'B', 60, 8), date: '2026-09-03' },
    { ...oneSession('w3', 'upper', 'A', 60, 8), date: '2026-09-05' },
]);
r = calculateProgressiveOverload('bench_press', 'upper');
ok('3 sessioner på 60 kg → rep-fokus på samme vægt (ikke 3 sæt = 3 sessioner)',
    r.status === 'stagnant' && r.suggestion === '10 reps med 60 kg', `fik "${r.status}" / "${r.suggestion}"`);

// Kun 2 sessioner → ingen stagnation
store['gym_tracker_workouts'] = JSON.stringify([
    oneSession('w1', 'upper', 'A', 60, 8),
    { ...oneSession('w2', 'upper', 'B', 60, 8), date: '2026-09-03' },
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
const allEx = [...EXERCISES.upper, ...EXERCISES.lower];
ok('Central øvelser findes hvor de bruges, og ingen deler navn',
    !!allEx.find(e => e.id === 'dumbbell_shoulder_press') && !!allEx.find(e => e.id === 'deadlift') &&
    new Set(allEx.map(e => e.name)).size === allEx.length);

console.log('\n── 5. De fem cable-øvelser');
// Rækkefølge: navn, muskelgruppe, compound-flag. Alle er cable, og kun row-varianten
// er markeret "per hånd" — de øvrige skal læses som én samlet belastning.
const NEW_CABLE = {
    cable_lateral_raise:   { name: 'Cable Lateral Raise',   muscle: 'Shoulders',   compound: false },
    cable_row_per_hand:    { name: 'Cable Row',            muscle: 'Back',        compound: true },
    dual_bicep_cable_curl: { name: 'Dual Bicep Cable Curl', muscle: 'Biceps',      compound: false },
    lat_extension:         { name: 'Lat Extension',         muscle: 'Back',        compound: false },
    cable_reverse_fly:     { name: 'Cable Reverse Fly',     muscle: 'Shoulders/Back', compound: false },
};
ok('Alle fem cable-øvelser findes i upper med navn, muskel og type som aftalt',
    Object.entries(NEW_CABLE).every(([id, want]) => {
        const e = ALL_EXERCISES.upper.find(x => x.id === id);
        return e && e.name === want.name && e.muscle === want.muscle && e.compound === want.compound;
    }),
    JSON.stringify(Object.keys(NEW_CABLE).filter(id => !ALL_EXERCISES.upper.find(x => x.id === id))));
ok('Alle fem er cable, og kun row-varianten er markeret per hånd',
    Object.keys(NEW_CABLE).every(id => (ALL_EXERCISES.upper.find(x => x.id === id) || {}).equipment === 'Cable') &&
    ALL_EXERCISES.upper.filter(e => Object.keys(NEW_CABLE).includes(e.id) && e.loadNote).map(e => e.id).join(',') === 'cable_row_per_hand',
    ALL_EXERCISES.upper.filter(e => Object.keys(NEW_CABLE).includes(e.id) && e.loadNote).map(e => `${e.id}=${e.loadNote}`).join(', '));

// Cable og håndvægt skal have hver sin progression, ellers giver forslaget ingen mening
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] },
        { exerciseId: 'cable_lateral_raise', sets: [{ weight: 7, reps: 12 }] }] },
]);
const cableProg = calculateProgressiveOverload('cable_lateral_raise', 'upper');
const dbProg = calculateProgressiveOverload('lateral_raise', 'upper');
ok('Cable læser sin egen historik (7 → 9,5 kg) og blander den ikke med håndvægt-versionen',
    cableProg.suggestion === '9.5 kg × 12 reps' && dbProg.status === 'new' && cableProg.status !== 'new',
    `${cableProg.suggestion} / ${cableProg.status} / ${dbProg.status}`);
store['gym_tracker_workouts'] = JSON.stringify([]);

console.log('\n── 6. Redskabsvarianter');
const curls = allEx.filter(e => e.name.startsWith('Bicep Curl'));
ok('Bicep Curl findes i tre varianter med hvert sit id (stang, EZ-bar, håndvægte)',
    curls.length === 3 && new Set(curls.map(c => c.id)).size === 3 &&
    curls.map(c => c.equipment).sort().join(',') === 'Barbell,Dumbbell,EZ-bar',
    curls.map(c => `${c.name}=${c.equipment}`).join(', '));
ok('Belastningsnoter: håndvægt-curl per hånd, split squat og lunges per ben, og DB-øvelser med enkelt-side belastning har note',
    curls.find(c => c.equipment === 'Dumbbell').loadNote === 'per hand' &&
    allEx.filter(e => ['bulgarian_split', 'lunges'].includes(e.id)).every(e => e.loadNote === 'per leg') &&
    allEx.filter(e => e.equipment === 'Dumbbell' && /Dumbbell|Hammer|Fly|Raise|Reverse/.test(e.name))
         .every(e => e.loadNote === 'per hand'));
ok('Chest Supported Row findes som sammensat rygøvelse',
    (() => { const e = allEx.find(x => x.id === 'chest_supported_row'); return e && e.muscle === 'Back' && e.compound === true; })());

// Varianter skal kunne have hver sin progression — ellers giver forslaget ingen mening
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'ez_bar_curl', sets: [{ weight: 19, reps: 12 }] },
        { exerciseId: 'dumbbell_curl', sets: [{ weight: 12, reps: 12 }] }] },
]);
const ez = calculateProgressiveOverload('ez_bar_curl', 'upper');
const db = calculateProgressiveOverload('dumbbell_curl', 'upper');
ok('EZ-bar-curl (19 → 21,5 kg) og håndvægt-curl (12 → 14,5 kg) blander ikke deres historik',
    ez.suggestion === '21.5 kg × 12 reps' && db.suggestion === '14.5 kg × 12 reps' && ez.suggestion !== db.suggestion,
    `${ez.suggestion} / ${db.suggestion}`);

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
ok('Redigering opdaterer i stedet for at oprette: samme id og dato, den nye øvelse tilføjet, rapporterer +1',
    addOne.ok === true && addOne.workouts.length === 2 && addOne.workouts[0].id === 'w1' &&
    addOne.workouts[0].date === '2026-09-28' && addOne.workouts[0].day === 'upper' && addOne.workouts[0].variant === 'A' &&
    addOne.workouts[0].exercises.length === 3 && addOne.workouts[0].exercises[2].exerciseId === 'ez_bar_curl' &&
    addOne.added === 1 && addOne.removed === 0);
ok('Andre træninger er urørte', addOne.workouts[1].id === 'w2' && addOne.workouts[1].exercises.length === 1);

const removeOne = applyWorkoutEdit(savedList(), 'w1', [
    { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] }]);
ok('Fjernelse rapporteres uden at give en ny træning', removeOne.removed === 1 && removeOne.added === 0 && removeOne.workouts.length === 2);

const reorder = applyWorkoutEdit(savedList(), 'w1', [
    { exerciseId: 'cable_row', sets: [{ weight: 40, reps: 12 }] },
    { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] }]);
ok('Ombytning ændrer kun rækkefølgen', reorder.added === 0 && reorder.removed === 0 &&
    reorder.workouts[0].exercises[0].exerciseId === 'cable_row');

const missing = applyWorkoutEdit(savedList(), 'findes-ikke', []);
ok('Ukendt id fejler i stedet for at oprette en træning', missing.ok === false && missing.workouts.length === 2);

const untouched = savedList();
applyWorkoutEdit(untouched, 'w1', [{ exerciseId: 'bench_press', sets: [{ weight: 99, reps: 1 }] }]);
ok('Original-listen muteres ikke (ingen utilsigtet sidereffekt)', untouched[0].exercises[1].exerciseId === 'cable_row');

// Redigering må ikke smitte af på nabo-træningens historik i progressionsforslaget
store['gym_tracker_workouts'] = JSON.stringify(addOne.workouts);
const curlAfterEdit = calculateProgressiveOverload('ez_bar_curl', 'upper');
const squatUnaffected = calculateProgressiveOverload('squat', 'lower');
ok('Progressionsforslaget bruger den redigerede træning, og andre øvelser er upåvirket',
    curlAfterEdit.suggestion === '21.5 kg × 12 reps' && squatUnaffected.suggestion.startsWith('82.5 kg'),
    `${curlAfterEdit.suggestion} / ${squatUnaffected.suggestion}`);

console.log('\n── 8. Uge-opdelt deling med tegnbudget');
// ISO-ugenumre er verificeret mod python3 datetime.date.isocalendar() — ikke
// mod min egen implementering — inkl. årsskifterne.
ok('ISO-uge: mandag og søndag er samme uge, og næste mandag er en ny',
    isoWeekKey('2026-09-28') === '2026-W40' && isoWeekKey('2026-10-04') === '2026-W40' &&
    isoWeekKey('2026-10-05') === '2026-W41');
ok('ISO-uge: årsskiftet (2026-01-01 = uge 1; 2025-12-29 og 2027-01-01 = uge 1 resp. 53 i naboåret)',
    isoWeekKey('2026-01-01') === '2026-W01' && isoWeekKey('2025-12-29') === '2026-W01' &&
    isoWeekKey('2026-12-31') === '2026-W53' && isoWeekKey('2027-01-01') === '2026-W53');
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
ok('Uger grupperes nyeste først, mandag og lørdag lægges sammen, og "delt" kræver at ALLE ugens træninger er delt',
    grouped.length === 2 && grouped[0].key === '2026-W41' && grouped[1].workouts.length === 2 &&
    groupByWeek(week40.map(x => ({ ...x, sharedAt: 'x' })))[0].shared === true &&
    groupByWeek([{ ...week40[0], sharedAt: 'x' }, week40[1]])[0].shared === false,
    JSON.stringify(grouped.map(g => g.key)));

const sets = (...s) => s.map(([weight, reps]) => ({ weight, reps }));
ok('Ens sæt komprimeres til ×N, forskellige komprimeres ikke',
    formatSets(sets([60, 8], [60, 8], [60, 8])) === '60×8 ×3' &&
    formatSets(sets([60, 8], [62.5, 7])) === '60×8 62.5×7' &&
    formatSets(sets([60, 8], [60, 8], [62.5, 7])) === '60×8 ×2 62.5×7');

store['gym_tracker_workouts'] = JSON.stringify([...week40, ...week41]);

const text40 = generateShareText('week:2026-W40');
ok('En uge-eksport nævner kun den uge, med ugens træninger, overskrift og volumen',
    text40.includes('WEEK 40') && !text40.includes('WEEK 41') && !text40.includes('5.10') &&
    text40.includes('28.9 UPPER A') && text40.includes('29.9 LOWER A') &&
    /2 workouts · 1 Upper · 1 Lower/.test(text40),
    text40.split('\n')[0]);
const text41 = generateShareText('week:2026-W41');
ok('En anden uge giver en anden eksport', text41 !== text40 && text41.includes('WEEK 41'));
ok('All-time-bedste følger med (også øvelser uden for ugen), og fremgang vises som headline',
    text40.includes('🏆 Best ever') && text40.includes('Leg Press') && text40.includes('Bench Press') &&
    /📈 Progress: \d+ up/.test(text40), text40.match(/📈 Progress:.*/)?.[0]);

// Det vigtigste krav: en uge skal kunne sendes som ÉN Discord-besked (2.000 tegn).
const heavyWeek = [weekFixture(0, 'upper', 'A'), weekFixture(0, 'lower', 'A'), weekFixture(0, 'upper', 'B'), weekFixture(0, 'lower', 'B')];
store['gym_tracker_workouts'] = JSON.stringify(heavyWeek);
const heavyText = generateShareText('week:2026-W40');
ok('En uge med 4 træninger (begge varianter) passer i én Discord-besked (under CHAR_LIMIT)',
    heavyText.length <= 2000 && heavyText.length <= CHAR_LIMIT, `${heavyText.length} tegn (limit ${CHAR_LIMIT})`);

// Og eksporten må ikke vokse med hvor lang historikken er — kun med ugens indhold.
store['gym_tracker_workouts'] = JSON.stringify([...heavyWeek, ...week41]);
const heavyWithHistory = generateShareText('week:2026-W40');
ok('Historikkens længde påvirker ikke ugens eksport', Math.abs(heavyWithHistory.length - heavyText.length) < 30, `${heavyText.length} vs ${heavyWithHistory.length}`);

// 'new' = kun det der ikke er delt endnu
store['gym_tracker_workouts'] = JSON.stringify([...week40, ...week41]);
const textNew = generateShareText('new');
ok('"Kun nyt" tager ikke-delte træninger med og viser antallet i overskriften',
    textNew.includes('28.9 UPPER A') && textNew.includes('5.10 UPPER B') && textNew.includes('NEW SINCE LAST (4)'),
    textNew.split('\n')[0]);

const marked = markShareScopeAsShared('week:2026-W40');
ok('Deling markerer ugens træninger som delt i localStorage, og en allerede delt markeres ikke igen',
    marked === 2 && JSON.parse(store['gym_tracker_workouts']).filter(x => x.sharedAt).length === 2 &&
    markShareScopeAsShared('week:2026-W40') === 0, `markerede ${marked}`);

const textNewAfter = generateShareText('new');
ok('"Kun nyt" indeholder kun det endnu ikke delte, med antal',
    !textNewAfter.includes('28.9 UPPER A') && textNewAfter.includes('5.10 UPPER B') &&
    textNewAfter.includes('NEW SINCE LAST (2)'), textNewAfter.split('\n')[0]);

store['gym_tracker_workouts'] = JSON.stringify([{ ...week40[0], sharedAt: 'x' }, week40[1]]);
ok('En tom visning giver en forklarende tekst', generateShareText('week:2026-W99').includes('No workouts in the selected period'));
store['gym_tracker_workouts'] = JSON.stringify([]);
ok('Ingen træninger giver den gamle venlige besked', generateShareText('new').includes('No workouts saved yet'));

console.log('\n── 9. Sidste træning for en dag+variant');
// Grundlaget for at programmet kan åbne med sidste gangs vægte: den nyeste gemte
// træning for netop den dag OG variant.
const ex = (id, sets = 3) => ({ exerciseId: id, sets: Array.from({ length: sets }, () => ({ weight: 60, reps: 8 })) });
const asDone = list => JSON.stringify(list);

store['gym_tracker_workouts'] = asDone([]);
ok('Uden historik findes ingen sidste træning', lastWorkoutFor('upper', 'A') === null);

store['gym_tracker_workouts'] = asDone([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [ex('bench_press'), ex('lat_pulldown')] },
    { id: 'u2', date: '2026-10-05', day: 'upper', variant: 'A', exercises: [ex('bench_press')] },
]);
ok('Den nyeste træning for dag+variant bruges; andre varianter og dage smitter ikke',
    (lastWorkoutFor('upper', 'A') || {}).id === 'u2' && lastWorkoutFor('upper', 'B') === null &&
    lastWorkoutFor('lower', 'A') === null);
store['gym_tracker_workouts'] = asDone([]);

// Kropsvægtøvelser har ingen vægt på stangen. Reglen læses af øvelsesdatabasen
// (equipment), ikke af om skabelonen tilfældigvis står på 0: Back Extension har et
// mærke (1), så den ikke falder ud af loggen når der gemmes.
const bwIn = key => {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    return PROGRAMS[key].filter(i => (ALL_EXERCISES[day].find(e => e.id === i.exerciseId) || {}).equipment === 'Bodyweight');
};
const bodyweightIds = new Set(Object.keys(PROGRAMS).flatMap(bwIn).map(i => i.exerciseId));
ok('Kropsvægtøvelsen står i skabelonen med et vægt-mærke over 0, så den bliver gemt',
    bodyweightIds.size > 0 && Object.keys(PROGRAMS).flatMap(bwIn).every(i => i.weight > 0),
    [...bodyweightIds].join(', '));

console.log('\n── 10. Eksempeldata (til at prøve appen uden at taste data ind)');
// Eksempeldata skal ligne RIGTIGE data: samme sæt-regel som saveWorkout (kun sæt
// med vægt > 0), så en preview ikke kan skjule en fejl ved at have en anden form.
const samples = buildSampleWorkouts(new Date(2026, 9, 2)); // fredag 2. oktober 2026
const sampleVariant = k => {
    const day = k.startsWith('upper') ? 'upper' : 'lower';
    return samples.filter(x => x.day === day && x.variant === k.slice(-1));
};
ok('Der bygges tre hele uger (12 træninger), fire varianter × 3, fordelt på tre ISO-uger omkring den givne dato',
    samples.length === 12 && ['upperA', 'upperB', 'lowerA', 'lowerB'].every(k => sampleVariant(k).length === 3) &&
    new Set(samples.map(x => isoWeekKey(x.date))).size === 3 &&
    isoWeekKey(samples[samples.length - 1].date) === isoWeekKey('2026-10-02'),
    `${samples.length}, ${[...new Set(samples.map(x => isoWeekKey(x.date)))].join(', ')}`);
ok('Alle er markeret som eksempeldata (ikke delt), og deres øvelser og sæt følger programmets regler',
    samples.every(isSampleWorkout) && samples.every(x => !x.sharedAt) &&
    samples.every(x => x.exercises.every(e => getProgram(x.day, x.variant).some(item => item.exerciseId === e.exerciseId) &&
        e.sets.every(s => s.weight > 0 && s.reps > 0))));
ok('Kropsvægtøvelsen står i loggen med sit mærke, som en helt normal række',
    Object.entries(PROGRAMS).every(([key, list]) => {
        const day = key.startsWith('upper') ? 'upper' : 'lower';
        const variant = key.slice(-1);
        const bw = list.filter(i => bodyweightIds.has(i.exerciseId)).length;
        const sample = samples.find(x => x.day === day && x.variant === variant);
        return sample && sample.exercises.filter(e => bodyweightIds.has(e.exerciseId)).length === bw;
    }), [...bodyweightIds].join(', '));

// Fremgang: samme variant skal være tungere i uge 3 end i uge 1
const weightOf = (x, id) => x.exercises.find(e => e.exerciseId === id).sets[0].weight;
const firstUpperA = sampleVariant('upperA')[0], lastUpperA = sampleVariant('upperA').slice(-1)[0];
const firstLowerA = sampleVariant('lowerA')[0], lastLowerA = sampleVariant('lowerA').slice(-1)[0];
ok('Vægten stiger fra første til sidste uge, og ben stiger hurtigere end overkrop',
    weightOf(lastUpperA, 'bench_press') > weightOf(firstUpperA, 'bench_press') &&
    (weightOf(lastLowerA, 'leg_press') - weightOf(firstLowerA, 'leg_press')) >
    (weightOf(lastUpperA, 'bench_press') - weightOf(firstUpperA, 'bench_press')),
    `${weightOf(firstUpperA, 'bench_press')} → ${weightOf(lastUpperA, 'bench_press')}`);
ok('realWorkouts filtrerer eksempeldata fra og tæller rigtige træninger (også poster uden flaget)',
    realWorkouts(samples).length === 0 && realWorkouts([]).length === 0 &&
    realWorkouts([{ id: 'x' }]).length === 1 &&
    realWorkouts([{ id: 'rigtig', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [] }, ...samples]).length === 1);
store['gym_tracker_workouts'] = JSON.stringify([]);

console.log('\n── 11. Programmet er dagens træning (husk + byt)');
// Kernen i ønsket: programmet ligger klart når man åbner appen — man bygger det
// ikke op ved at klikke øvelser ind. En øvelse kan byttes til en anden i samme
// muskelgruppe, og byttet huskes for netop den dag+variant.
const idsOf = list => list.map(i => i.exerciseId).join(',');
store['gym_tracker_workouts'] = JSON.stringify([]);
store['gym_tracker_program_swaps'] = JSON.stringify({});
state.exercises = [];

ok('Uden bytter er programmet skabelonen, række for række',
    idsOf(programItems('upper', 'A')) === idsOf(getProgram('upper', 'A')) &&
    programItems('upper', 'A').every(i => !i.swappedFrom));

setSwap('upper', 'A', 'bench_press', 'dumbbell_press');
const swapped = programItems('upper', 'A');
ok('Byttet slår igennem, huskes i localStorage, og gælder kun den dag+variant det blev lavet i',
    swapped[0].exerciseId === 'dumbbell_press' && swapped[0].swappedFrom === 'bench_press' &&
    idsOf(swapped.slice(1)) === idsOf(getProgram('upper', 'A').slice(1)) &&
    JSON.parse(store['gym_tracker_program_swaps']).upperA.bench_press === 'dumbbell_press' &&
    idsOf(programItems('upper', 'B')) === idsOf(getProgram('upper', 'B')),
    swapped[0].exerciseId);
setSwap('upper', 'A', 'bench_press', 'bench_press');
ok('Bytte tilbage til skabelon-øvelsen fjerner overriden helt',
    !JSON.parse(store['gym_tracker_program_swaps']).upperA &&
    programItems('upper', 'A')[0].exerciseId === 'bench_press');

// Byttelisterne: kun samme muskelgruppe, og aldrig Romanian Deadlift
const allRows = Object.entries(PROGRAMS).flatMap(([key, list]) => {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    return list.map(item => ({ day, item }));
});
const groupsOf = m => String(m).split('/').map(s => s.trim()).filter(Boolean);
const offMuscle = [], noSelf = [], offersRdl = [], noAlternative = [], notOnTop = [], badRank = [];
for (const { day, item } of allRows) {
    const exo = ALL_EXERCISES[day].find(e => e.id === item.exerciseId);
    const cands = swapCandidates(day, item.exerciseId);
    // Delvis match er nok: 'Quads' og 'Quads/Glutes' hører sammen.
    if (cands.some(c => !groupsOf(c.muscle).some(g => groupsOf(exo.muscle).includes(g)))) offMuscle.push(item.exerciseId);
    if (!cands.some(c => c.id === item.exerciseId)) noSelf.push(item.exerciseId);
    if (cands.some(c => c.id === 'romanian_deadlift')) offersRdl.push(item.exerciseId);
    if (cands.length < 2) noAlternative.push(`${item.exerciseId} (${exo.muscle})`);
    if ((cands[0] || {}).id !== item.exerciseId) notOnTop.push(item.exerciseId);
    const flags = cands.filter(c => c.id !== item.exerciseId).map(c => (c.muscle === exo.muscle ? 0 : 1));
    if (!flags.every((f, i) => i === 0 || flags[i - 1] <= f)) badRank.push(item.exerciseId);
}
ok('Bytte-listerne: kun fælles muskelgruppe, øvelsen selv øverst, fuld match før delvis',
    offMuscle.length === 0 && noSelf.length === 0 && notOnTop.length === 0 && badRank.length === 0,
    [offMuscle, noSelf, notOnTop, badRank].flat().join(', '));
ok('Romanian Deadlift bliver aldrig tilbudt som bytte, og hver øvelse har mindst ét reelt alternativ',
    offersRdl.length === 0 && noAlternative.length === 0, [offersRdl, noAlternative].flat().join(', '));
// De tre klager: Bulgarian Split Squat skal kunne vælges, og leg curl / back
// extension skal have alternativer på trods af en snæver muskelgruppe.
ok('Leg Press kan byttes til Bulgarian Split Squat, og leg curl har alternativer',
    swapCandidates('lower', 'leg_press').some(c => c.id === 'bulgarian_split') &&
    swapCandidates('lower', 'leg_curl').length > 1 && swapCandidates('lower', 'back_extension').length > 1 &&
    ['nordic_curl', 'seated_leg_curl'].every(id => swapCandidates('lower', 'leg_curl').some(c => c.id === id)),
    swapCandidates('lower', 'leg_curl').map(c => c.id).join(', '));
// Håndvægt-RDL er tilføjet på hans egen anmodning og skal kunne vælges. Stang-RDL
// er stadig udelukket, fordi den belaster lænden.
const dbRdl = ALL_EXERCISES.lower.find(e => e.id === 'dumbbell_rdl');
ok('Dumbbell RDL findes (per hånd, hofte-hinge) og kan vælges som bytte — stang-RDL stadig ikke',
    !!dbRdl && dbRdl.equipment === 'Dumbbell' && dbRdl.loadNote === 'per hand' && dbRdl.compound === true &&
    dbRdl.muscle.split('/').includes('Hamstrings') &&
    swapCandidates('lower', 'cable_pull_through').some(c => c.id === 'dumbbell_rdl') &&
    swapCandidates('lower', 'leg_curl').some(c => c.id === 'dumbbell_rdl') &&
    !swapCandidates('lower', 'cable_pull_through').some(c => c.id === 'romanian_deadlift'),
    JSON.stringify(dbRdl));

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
ok('Uden historik bruges skabelonens tal, med anbefalingen som plan',
    fresh.sets.length === lpItem.sets && fresh.sets.every(s => s.weight === lpItem.weight && s.reps === lpItem.reps) &&
    fresh.plan.sets === lpItem.sets && fresh.plan.weight === lpItem.weight);

const set = (wt, rp) => Array.from({ length: 3 }, () => ({ weight: wt, reps: rp }));
const progWorkout = (id, date, day, variant, exs) => ({ id, date, day, variant, exercises: exs.map(e => ({ exerciseId: e[0], sets: e[1] })) });
const remembered = sessionEntryFor(lpItem, progWorkout('lp', '2026-10-05', 'lower', 'A',
    [['leg_press', [{ weight: 200, reps: 10 }, { weight: 225, reps: 10 }, { weight: 230, reps: 8 }]]]));
ok('Med historik huskes det bedste sæt og antallet af sæt, med anbefalingen ved siden af',
    remembered.sets.every(s => s.weight === 230 && s.reps === 8) && remembered.sets.length === 3 &&
    remembered.plan.weight === lpItem.weight, JSON.stringify(remembered.sets[0]));

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
// sessionVariant er den variant træningen gemmes med; programVariant er "brugeren har
// selv valgt". Uden et valg følger visningen rotationens forslag.
ok('Dagens træning er programmets øvelser i programmets rækkefølge, med en anbefaling pr. kort',
    idsOf(state.exercises) === idsOf(getProgram('upper', 'A')) &&
    state.exercises.every(e => e.plan && e.plan.sets > 0 && e.plan.reps > 0));
ok('Sessionen kender sin variant (den gemmes med træningen), programVariant forbliver null uden selvvalg',
    state.sessionVariant === 'A' && state.programVariant === null,
    JSON.stringify({ sessionVariant: state.sessionVariant, programVariant: state.programVariant }));
state.programVariant = 'B';
loadProgram();
ok('Et selvvalgt variant vinder over forslaget, og sessionsvarianten følger med',
    state.sessionVariant === 'B' && state.programVariant === 'B');
state.programVariant = null;

// Taget: en fuld dag afviser flere øvelser i stedet for at vokse
state.exercises = Array.from({ length: MAX_PER_DAY }, () => ({ exerciseId: 'bench_press', plan: null, sets: [], targetReps: 8 }));
const rejected = addExerciseToSession('dips');
ok('En fuld dag afviser flere øvelser', rejected === false && state.exercises.length === MAX_PER_DAY);
state.exercises = [];

// Et bytte holder antallet: den nye øvelse overtager pladsen
store['gym_tracker_program_swaps'] = JSON.stringify({});
state.currentDay = 'lower';
state.programVariant = 'A';
loadProgram();
const beforeSwap = state.exercises.map(e => e.exerciseId);
swapExercise('calf_raise', 'calf_raise_leg_press');
ok('Et bytte ændrer ikke antallet, sætter den nye øvelse på pladsen, huskes for Lower A og rammer ikke Lower B',
    state.exercises.length === beforeSwap.length &&
    state.exercises[beforeSwap.indexOf('calf_raise')].exerciseId === 'calf_raise_leg_press' &&
    JSON.parse(store['gym_tracker_program_swaps']).lowerA.calf_raise === 'calf_raise_leg_press' &&
    idsOf(programItems('lower', 'B')) === idsOf(getProgram('lower', 'B')),
    idsOf(state.exercises));

// Et bytte til en øvelse der allerede står i dagens træning afvises (ingen dubletter)
swapExercise('hip_thrust', 'leg_press');
ok('Bytte til en øvelse der allerede er i dagens træning afvises',
    state.exercises.filter(e => e.exerciseId === 'leg_press').length === 1 &&
    state.exercises.some(e => e.exerciseId === 'hip_thrust'));

// Har man fjernet en række fra dagens træning, bliver den ikke lagt ind igen af et bytte
state.exercises = state.exercises.filter(e => e.exerciseId !== 'hip_thrust');
swapExercise('hip_thrust', 'glute_bridge');
ok('Et bytte genopliver ikke en række man har fjernet (men programmet viser den)',
    !state.exercises.some(e => e.exerciseId === 'glute_bridge') &&
    programItems('lower', 'A').some(i => i.exerciseId === 'glute_bridge'));

// Øvelseskortet kan sætte samme bytte i gang som programrækken: slotten findes ud
// fra øvelsen, så kortet ved hvilken række det hører til — også efter et bytte.
// Den øvelse der blev byttet væk skal stadig pege på rækken: en ældre gemt træning
// indeholder den, og kortet skal kunne byttes videre derfra.
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
const slotOk = slotForExercise('leg_press') === 'leg_press';
setSwap('lower', 'A', 'calf_raise', 'calf_raise_leg_press');
loadProgram();
ok('Slotten findes ud fra øvelsen, også efter et bytte (begge veje)',
    slotOk && slotForExercise('calf_raise_leg_press') === 'calf_raise' &&
    slotForExercise('calf_raise') === 'calf_raise');
// Og et bytte sat i gang fra den øvelse rammer det kort der står på skærmen
state.exercises = [{ exerciseId: 'calf_raise', plan: null, sets: [{ weight: 100, reps: 12 }], targetReps: 12 }];
swapExercise('calf_raise', 'calf_raise_leg_press');
ok('Et bytte fra en ældre trænings kort skifter kortet på skærmen',
    state.exercises.length === 1 && state.exercises[0].exerciseId === 'calf_raise_leg_press',
    JSON.stringify(state.exercises.map(e => e.exerciseId)));
state.exercises = [];
ok('En øvelse uden for programmet har ingen række at bytte på', slotForExercise('dips') === null);

// Fjerner man en øvelse fra dagens træning, kan den hentes tilbage på sin plads i
// programmet — det var programlistens klik der gjorde det før.
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
const fullSession = state.exercises.map(e => e.exerciseId);
state.exercises = state.exercises.filter(e => e.exerciseId !== 'hip_thrust');
ok('Én fjernet række tælles og hentes tilbage på programmets plads, ikke til sidst',
    missingExerciseCount() === 1 &&
    (restoreMissingExercises(), idsOf(state.exercises) === fullSession.join(',')),
    idsOf(state.exercises));

// Tallene hører til øvelsen, ikke til rækken. Et bytte arvede før den byttede
// øvelses tal, så Leg Press' 225 kg blev hængende på Leg Extension (70 kg).
store['gym_tracker_program_swaps'] = JSON.stringify({ lowerA: { leg_press: 'leg_extension' } });
const swappedRow = programItems('lower', 'A').find(i => i.exerciseId === 'leg_extension');
const extRow = getProgram('lower', 'B').find(rw => rw.exerciseId === 'leg_extension');
ok('En byttet øvelse får sine egne tal fra skabelonen (ikke rækkens 225 kg) og husker hvad den blev byttet fra',
    swappedRow.weight === extRow.weight && swappedRow.weight !== 225 && swappedRow.sets === extRow.sets &&
    swappedRow.reps === extRow.reps && swappedRow.swappedFrom === 'leg_press', JSON.stringify(swappedRow));
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
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
swapExercise('leg_press', 'leg_extension');
const extCard = state.exercises.find(e => e.exerciseId === 'leg_extension');
ok('Efter byttet står den nye øvelses vægt og reps i felterne og i anbefalingen — ikke den gamles 225 kg',
    !!extCard && extCard.sets.every(s => s.weight === 70 && s.reps === 12) &&
    extCard.plan.weight === 70 && extCard.plan.reps === 12 &&
    !state.exercises.some(e => e.sets.some(s => s.weight === 225)),
    JSON.stringify(extCard && extCard.sets));

store['gym_tracker_workouts'] = JSON.stringify([]);
store['gym_tracker_program_swaps'] = JSON.stringify({});
state.exercises = [];
state.programVariant = null;
state.currentDay = 'upper';


console.log('\n── 12. Filopdeling (index.html + styles.css + app.js)');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
ok('index.html linker til styles.css og loader app.js, uden inline style eller script',
    html.includes('<link rel="stylesheet" href="styles.css">') && html.includes('<script src="app.js"></script>') &&
    !/<style[\s>]/.test(html) && !/<script(?![^>]*src=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html));
ok('styles.css og app.js er ikke tomme, og CSS-variablerne ligger i styles.css',
    css.trim().length > 1000 && script.trim().length > 1000 && css.includes(':root') && css.includes('--accent'));
ok('HTML-strukturen er stadig i index.html', html.includes('id="session-bar"') && html.includes('id="exercise-list"'));
// Ugebjælkens felter er det eneste pas-valg: dag-vælger, A/B-knapper og velkomsttekst
// blev fjernet med vilje, og de skal ikke snige sig ind igen.
ok('Dag-vælger, A/B-knapper og velkomsttekst er væk fra markup',
    !html.includes('day-selector') && !html.includes('day-btn') &&
    !html.includes('variant-selector') && !html.includes('variant-btn') &&
    !html.includes('first-use-banner') && !html.includes('Welcome!'));
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
    fmtWarmup(warmupSets(21, { compound: true, equipment: 'EZ-bar' })) === '10×10 15×5 17.5×3');
ok('Maskine: Leg Press 250 → 125×10 187.5×6', fmtWarmup(warmupSets(250, exById('lower', 'leg_press'))) === '125×10 187.5×6');
ok('Kabel: Lat Pulldown 62 → 30×10 47.5×6', fmtWarmup(warmupSets(62, exById('upper', 'lat_pulldown'))) === '30×10 47.5×6');
ok('Isolation: Lateral Raise 8 → ét sæt 5×12', fmtWarmup(warmupSets(8, exById('upper', 'lateral_raise'))) === '5×12');
ok('Håndvægte rundes til 1 kg (DB curl 10 → 6×12)', fmtWarmup(warmupSets(10, exById('upper', 'dumbbell_curl'))) === '6×12');
ok('Ingen arbejdsvægt, ukendt øvelse eller kropsvægt → ingen opvarmning',
    warmupSets(0, exById('upper', 'bench_press')).length === 0 && warmupSets(60, null).length === 0 &&
    warmupSets(0, exById('upper', 'pull_up')).length === 0);
ok('Rampen ligger under arbejdsvægten, er stigende uden dubletter (ingen dubletter ved runde tal)',
    warmupSets(20, exById('upper', 'bench_press')).every(s => s.weight < 20) &&
    fmtWarmup(warmupSets(100, exById('lower', 'squat'))) === '20×10 50×8 70×5 85×3');
ok('renderWarmupBlock viser tallene og er tom uden vægt',
    renderWarmupBlock(exById('upper', 'bench_press'), 60).includes('42.5 × 5') &&
    renderWarmupBlock(exById('upper', 'bench_press'), 0) === '');

console.log('\n── 14. Teknik-cues på øvelseskortet');
const allIds = new Set([...EXERCISES.upper, ...EXERCISES.lower].map(e => e.id));
ok('Cue findes for Bench Press; ukendt eller manglende øvelse giver ingen cue',
    /Shoulder blades/.test(exerciseCue(exById('upper', 'bench_press'))) &&
    exerciseCue({ id: 'findes_ikke' }) === '' && exerciseCue(null) === '' && exerciseCue({}) === '');
ok('Alle cue-nøgler peger på en øvelse, hver øvelse har en cue, de er korte (≤ 130 tegn) og rene strenge',
    Object.keys(CUES).every(id => allIds.has(id)) &&
    [...new Set(Object.values(PROGRAMS).flat().map(item => item.exerciseId))].every(id => (CUES[id] || '').length > 0) &&
    Object.values(CUES).every(c => typeof c === 'string' && c.length <= 130 && !/[<>]/.test(c)),
    Object.entries(CUES).filter(([, c]) => c.length > 130).map(([id]) => id).join(', '));
ok('renderCueLine sætter linjen på kortet og er tom for en øvelse uden cue',
    (() => { const h = renderCueLine(exById('upper', 'bench_press')); return h.includes('class="cue-line"') && h.includes('💡') && h.includes('Shoulder blades'); })() &&
    renderCueLine({ id: 'findes_ikke' }) === '');
ok('Skull Crusher og Tricep Pushdown deler samme cue (samme bevægelse)',
    exerciseCue(exById('upper', 'skull_crusher')) === exerciseCue(exById('upper', 'tricep_pushdown')));

console.log('\n── 14b. Hele øvelsesdatabasen (generelle krav)');
// Datadrevet med vilje: hvert krav gælder ALLE øvelser, så en ny øvelse kun kræver
// en række i EXERCISES + en cue. Skriv ikke en ny ok(...) pr. øvelse — udvid et løb
// over databasen i stedet.
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
ok('loadNote er kun "per hand" eller "per leg", og navnet gentager ikke noten',
    ALL_DB.every(e => (e.loadNote === undefined || ['per hand', 'per leg'].includes(e.loadNote)) &&
        !/\(per (hand|leg)\)/i.test(e.name)),
    ALL_DB.filter(e => e.loadNote && !['per hand', 'per leg'].includes(e.loadNote)).map(e => `${e.id}=${e.loadNote}`).join(', '));

// Cue-dækning: hver øvelse i databasen skal have en linje at vise på kortet
ok('Hver øvelse i databasen har en cue, slået op på id',
    ALL_DB.every(e => (CUES[e.id] || '').length > 0 && exerciseCue(e) === CUES[e.id]) &&
    exerciseCue({ id: 'findes_ikke' }) === '');

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
        const h = renderWarmupBlock(e, 100);
        return h.includes('🔥 Warm-up') && w100(e).every(s => h.includes(`${s.weight} × ${s.reps}`));
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

console.log('\n── 16. Coach notes (hentet fra nettet, ikke fra localStorage)');
// Noterne ligger ikke i localStorage, men hentes fra en gist. Derfor er der tre
// ting der skal holdes fast: at markdown bliver til sikker HTML, at et svar fra
// nettet ikke kan injicere kode, og at en død forbindelse giver en besked i
// panelet i stedet for et crash (appen skal kunne bruges uden net).
async function notesTests() {
    // API'et og ikke raw-links: raw-URL'en til den nyeste revision kan hænge i
    // CDN-cachen og vise den forrige uges noter (målt: stadig gammel efter 5 min).
    ok('NOTES_URL er https og peger på gist-API\'et, og filnavnet er det gisten indeholder',
        /^https:\/\/api\.github\.com\/gists\/[0-9a-f]+$/.test(NOTES_URL) && NOTES_FILE === 'weekly-notes.md',
        NOTES_URL);
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

    ok('Markdown bliver til overskrift, titel, fed tekst, punkter og afsnit',
        notesHtml.includes('<div class="notes-week">Week 41 · 5–11 Oct 2026</div>') &&
        notesHtml.includes('<div class="notes-title">Coach notes</div>') &&
        notesHtml.includes('<div class="notes-line"><strong>Load up</strong></div>') &&
        /<ul class="notes-list"><li>Bench Press 65×8×3 → 67\.5×6-8<\/li><li>Lat Pulldown 66×10 → next pin<\/li><\/ul>/.test(notesHtml) &&
        notesHtml.includes('</ul><div class="notes-line">Worth knowing: RDL stays out.</div>') &&
        notesHtml.includes('<div class="notes-line">4 sessions · 52 sets · 43338 kg</div>'));
    ok('Tom/manglende tekst giver en forklarende linje, ikke et tomt panel eller et crash',
        /class="notes-status"/.test(renderNotesMarkdown('   ')) && renderNotesMarkdown('').includes('notes-status') &&
        renderNotesMarkdown(null).includes('notes-status'));

    // Filen kommer fra nettet — HTML i den må aldrig slippe igennem
    const evil = renderNotesMarkdown('# Title <script>alert(1)</script>\n- <img src=x onerror=alert(1)>');
    ok('En hentet fil kan ikke injicere HTML — tegnene kommer med som tekst',
        !/<script|<img/.test(evil) && evil.includes('&lt;script&gt;alert(1)&lt;/script&gt;') &&
        !/<(?!\/?(div|ul|li|strong|code)\b)/.test(evil), evil.slice(0, 90));

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
    ok('Noterne hentes fra den aftalte URL, uden browserens cache, og panelet fyldes',
        calls[0].url === NOTES_URL && !!calls[0].opts && calls[0].opts.cache === 'no-store' &&
        captured['notes-content'].innerHTML.includes('Week 41') && loaded.includes('notes-week'),
        String(calls[0].url));

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

    // Alle fejlveje (HTTP-fejl, ugyldigt JSON, død forbindelse, intet fetch) giver
    // samme besked i panelet i stedet for et crash.
    const errorPaths = [
        () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
        () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) }),
        () => Promise.reject(new Error('offline')),
    ];
    for (const [i, impl] of errorPaths.entries()) {
        notesFetchImpl = impl;
        const out = await loadCoachNotes();
        ok(`Fejlvej ${i + 1} (HTTP-fejl / ugyldigt JSON / offline) giver besked i panelet, ikke et crash`,
            out === '' && /Could not load the notes/.test(captured['notes-content'].innerHTML));
    }
    ok('Miljø uden fetch siger det samme i stedet for at kaste',
        (await loadCoachNotes(null)) === '' && /Could not load the notes/.test(captured['notes-content'].innerHTML));

    document.getElementById = realGetById;
}

console.log('\n── 17. Udkast: det man har tastet, huskes hvis appen genindlæses ──────');
// Telefonen kan genindlæse siden midt i et sæt (fanen smides ud, eller man
// kommer til at trække nedad). Tallene skal derfor ligge i localStorage mens man
// taster, og lægges tilbage ved næste åbning hvis træningen aldrig blev gemt.
function draftTests() {
const A0 = programItems('upper', 'A')[0].exerciseId; // første række i Upper A
const fieldOf = (exId, si = 0) => state.exercises.find(e => e.exerciseId === exId).sets[si];

// Ren verden: tom log, intet byttet, programmet for Upper A indlæst
function freshSession() {
    Object.keys(store).forEach(k => delete store[k]);
    state.currentDay = 'upper';
    state.programVariant = 'A';
    state.sessionVariant = null;
    state.editing = null;
    state.allowDuplicateWeek = false;
    loadProgram();
}

freshSession();
ok('Et urørt program giver ikke et udkast (der er intet at huske)',
    draftIsDirty() === false && persistDraft(TODAY) === false && !loadDrafts().upperA);

// Man taster et tal ind: samme vej som feltet på kortet bruger
updateSet(0, 0, 'weight', '62.5');
updateSet(0, 0, 'reps', '6');
ok('Et tastet tal gør udkastet beskidt, og det skrives ned på det pas man står i',
    draftIsDirty() === true && persistDraft(TODAY) === true);

const draft = loadDrafts().upperA;
ok('Udkastet husker ugen, rummer hele passet og det tastede tal — uden afledte felter',
    draft && draft.week === isoWeekKey(TODAY) &&
    draft.exercises.length === programItems('upper', 'A').length &&
    draft.exercises.find(e => e.exerciseId === A0).sets[0].weight === 62.5 &&
    draft.exercises.find(e => e.exerciseId === A0).sets[0].reps === 6 &&
    draft.editingId === null && !('plan' in draft.exercises[0]) && !('targetReps' in draft.exercises[0]),
    JSON.stringify(draft && { week: draft.week, n: draft.exercises.length }));
ok('Debouncen skriver ikke ét udkast pr. tastetryk', DRAFT_DEBOUNCE >= 200 && DRAFT_DEBOUNCE <= 1000, String(DRAFT_DEBOUNCE));

// "Genindlæsning": programmet indlæses forfra, og udkastet lægges ovenpå
loadProgram();
ok('Udkastet lægges tilbage ved åbning, med det tastede tal og hele passet i programmets rækkefølge',
    restoreDraft(TODAY) === true && fieldOf(A0).weight === 62.5 && fieldOf(A0).reps === 6 &&
    state.exercises.map(e => e.exerciseId).join(',') === programItems('upper', 'A').map(i => i.exerciseId).join(',') &&
    state.exercises[0].plan && state.exercises[0].plan.weight === programItems('upper', 'A')[0].weight,
    String(fieldOf(A0).weight));

// Et udkast fra en tidligere uge hører til et pas der er begyndt forfra
const stale = loadDrafts();
stale.upperA.week = '2026-W40';
store[DRAFT_KEY] = JSON.stringify(stale);
loadProgram();
ok('Et udkast fra en tidligere uge lægges ikke tilbage og smides væk',
    restoreDraft(TODAY) === false && !loadDrafts().upperA && fieldOf(A0).weight !== 62.5);

// Udkastet hører til sit eget pas
freshSession();
updateSet(0, 0, 'weight', '62.5');
persistDraft(TODAY);
state.currentDay = 'lower';
loadProgram();
ok('Et udkast dukker ikke op i et andet pas, men ligger stadig på sit eget',
    restoreDraft(TODAY) === false && !!loadDrafts().upperA);
state.currentDay = 'upper';
loadProgram();
ok('Tilbage på passet lægges det tastede tilbage', restoreDraft(TODAY) === true && fieldOf(A0).weight === 62.5);

// Et pas der allerede er gemt i ugen: udkastet skal stadig lægges tilbage. Man kan
// være i gang med et ekstra pas (appen advarer selv om låsen), og det man har tastet
// må ikke forsvinde ved en genindlæsning.
freshSession();
updateSet(0, 0, 'weight', '70');
persistDraft(TODAY);
store['gym_tracker_workouts'] = JSON.stringify([w('u9', '2026-10-06', 'upper', 'A')]);
loadProgram();
ok('Et pas der er gemt i ugen får stadig sit udkast tilbage, med det tastede tal',
    restoreDraft(TODAY) === true && fieldOf(A0).weight === 70 && !!weekConflict(TODAY) && !!loadDrafts().upperA);

// Gem træningen: udkastet er ikke længere noget man er i gang med
freshSession();
updateSet(0, 0, 'weight', '62.5');
persistDraft(TODAY);
saveWorkout();
ok('Efter et gem er træningen gemt og udkastet væk — uden et nyt af det friske program',
    JSON.parse(store['gym_tracker_workouts']).length === 1 && !loadDrafts().upperA &&
    Object.keys(loadDrafts()).length === 0);
// Og man flytter sig til ugens næste pas. Det var her appen sprang et pas over: Upper A
// pegede på Upper B (samme dag, næste variant) i stedet for Lower A, så ugebjælkens
// "next" og det pas man stod på viste to forskellige ting.
ok('Efter et gem står man på ugens næste pas (Upper A → Lower A, ikke samme dags variant)',
    state.currentDay === 'lower' && programKey(state.currentDay, getCurrentVariant()) === nextSessionInWeek(),
    `${programKey(state.currentDay, getCurrentVariant())} vs ${nextSessionInWeek()}`);

// Rettelse af en gemt træning: udkastet husker at man var i gang med at rette
const oldWorkout = {
    id: 'w_old', date: '2026-10-06', day: 'upper', variant: 'A',
    exercises: [{ exerciseId: A0, sets: [{ weight: 55, reps: 8 }] }],
};
const seedOld = () => { store['gym_tracker_workouts'] = JSON.stringify([oldWorkout]); };

freshSession();
seedOld();
startEditWorkout('w_old');
ok('Man står i rettetilstand af den gemte træning', !!state.editing && state.editing.id === 'w_old');
updateSet(0, 0, 'weight', '57.5');
persistDraft(TODAY);
const editDraft = loadDrafts().upperA;
ok('Udkastet markerer hvilken træning man retter, og indeholder rettelsen',
    editDraft && editDraft.editingId === 'w_old' && editDraft.exercises[0].sets[0].weight === 57.5);

state.editing = null;
state.programVariant = null;
loadProgram();
ok('Rettetilstanden og rettelsen kommer tilbage ved åbning — uden anbefalingslinje og uden ugen-lås',
    restoreDraft(TODAY) === true && !!state.editing && state.editing.id === 'w_old' &&
    state.exercises[0].sets[0].weight === 57.5 && state.exercises[0].plan === undefined &&
    weekConflict(TODAY) === null);

// En opgivet rettelse skal ikke dukke op igen
freshSession();
seedOld();
startEditWorkout('w_old');
updateSet(0, 0, 'weight', '57.5');
persistDraft(TODAY);
cancelEdit();
ok('En opgivet rettelse gemmes ikke som udkast, og man er ude af rettetilstanden',
    !loadDrafts().upperA && state.editing === null);

// Udkast der ikke kan bruges: træningen findes ikke, eller øvelsen er væk fra appen
freshSession();
updateSet(0, 0, 'weight', '44');
persistDraft(TODAY);
const orphan = loadDrafts();
orphan.upperA.editingId = 'w_findes_ikke';
store[DRAFT_KEY] = JSON.stringify(orphan);
loadProgram();
ok('Et udkast til en træning der ikke findes lægges ikke tilbage og slettes',
    restoreDraft(TODAY) === false && !loadDrafts().upperA);

freshSession();
updateSet(0, 0, 'weight', '44');
persistDraft(TODAY);
const goneEx = loadDrafts();
goneEx.upperA.exercises = goneEx.upperA.exercises
    .map(e => (e.exerciseId === A0 ? { ...e, exerciseId: 'findes_ikke' } : e));
store[DRAFT_KEY] = JSON.stringify(goneEx);
loadProgram();
ok('En øvelse der er fjernet fra appen springes over, og resten af passet lægges tilbage',
    restoreDraft(TODAY) === true && !state.exercises.some(e => e.exerciseId === 'findes_ikke') &&
    state.exercises.length === goneEx.upperA.exercises.length - 1, String(state.exercises.length));

// Udkastet ryddes ikke af et bytte eller en rettelse af sæt-antal
freshSession();
updateSet(0, 0, 'weight', '62.5');
persistDraft(TODAY);
addExerciseToSession('lat_pulldown');
ok('En ekstra øvelse kommer med i udkastet',
    loadDrafts().upperA.exercises.some(e => e.exerciseId === 'lat_pulldown'));

// Regression: et urørt pas må ikke blive et udkast bare fordi loggen ændrer sig under
// det (fx en træning gemt i en anden fane). Ellers kunne programmets tal blive lagt
// tilbage oveni historikkens tal ved næste åbning — med en besked om at man havde
// tastet noget, hvilket man ikke havde.
freshSession();
store['gym_tracker_workouts'] = JSON.stringify([w('u_ny', '2026-10-06', 'upper', 'A')]);
ok('Et urørt pas bliver ikke et udkast fordi historikken ændrer sig',
    draftIsDirty() === false && persistDraft(TODAY) === false && !loadDrafts().upperA);
updateSet(0, 0, 'weight', '61');
ok('Men et tastet tal gør det stadig, og det står i udkastet',
    draftIsDirty() === true && persistDraft(TODAY) === true &&
    loadDrafts().upperA.exercises[0].sets[0].weight === 61);

// Nægter browseren at gemme (privat browsing, fuld kvote), må tastningen ikke vælte —
// og svaret er at det ikke blev gemt.
freshSession();
updateSet(0, 0, 'weight', '58');
const rigtigeSetItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error('quota'); };
let kastede = false;
let gemte = null;
try { gemte = persistDraft(TODAY); } catch { kastede = true; }
localStorage.setItem = rigtigeSetItem;
ok('En browser der nægter at gemme vælter ikke tastningen, og svaret er at det ikke blev gemt',
    kastede === false && gemte === false);

store[DRAFT_KEY] = JSON.stringify({});
Object.keys(store).forEach(k => delete store[k]);
state.exercises = [];
state.editing = null;
}

// ─── 18. Klap en færdig øvelse sammen ────────────────────────────────
// Man er ikke altid færdig med øvelserne i den rækkefølge programmet stiller dem i: den
// man er færdig med skal kunne klappes sammen, så de resterende er til at finde. Det er
// visningstilstand, men den hører til passet og overlever at telefonen genindlæser siden.
function collapseTests() {
console.log('\n── 18. Klap en færdig øvelse sammen (man træner ikke altid i rækkefølge)');

const A1 = programItems('upper', 'A')[1].exerciseId;
const REAL_WEEK = isoWeekKey(new Date().toISOString().split('T')[0]);

function freshSession() {
    Object.keys(store).forEach(k => delete store[k]);
    state.currentDay = 'upper'; state.programVariant = 'A'; state.sessionVariant = null;
    state.editing = null; state.openSwap = null; state.collapsed = [];
    loadProgram();
}
// renderExerciseList skriver til #exercise-list, og stubbens elementer kastes væk — fang dem.
// Kortet starter sin egen div (også med "collapsed" på), mens dets indre div'er ikke gør.
function liste() {
    const captured = {};
    const realGetById = document.getElementById;
    document.getElementById = i => (captured[i] = captured[i] || makeEl(i));
    renderExerciseList();
    document.getElementById = realGetById;
    return captured['exercise-list'].innerHTML;
}
const kortet = id => liste().split(/(?=<div class="exercise-card[" ])/)
    .find(c => c.includes(`data-exercise-id="${id}"`)) || '';

freshSession();
const liste0 = liste();
ok('Hvert kort har en klap-knap, og der er ingen ✕ tilbage',
    (liste0.split('class="collapse-btn"').length - 1) === state.exercises.length && !liste0.includes('remove-btn'));
ok('Intet kort er klappet sammen fra starten', !liste0.includes('collapsed-summary'));

toggleCollapsed(A1);
const kortA1 = kortet(A1);
ok('Klap-knappen klapper øvelsen sammen: ingen sæt-felter på kortet',
    isCollapsed(A1) && !kortA1.includes('set-weight') && kortA1.includes('collapsed-summary'));
ok('De andre kort har stadig deres felter',
    (liste().split('sets-table').length - 1) === state.exercises.length - 1);
const skrevet = loadCollapsed().upperA || {};
ok('Det skrives ned på passet med den uge det hører til',
    String(skrevet.ids) === A1 && skrevet.week === REAL_WEEK, JSON.stringify(loadCollapsed()));

// Facit står på det klappede kort — det er den eneste status man har, mens det er klappet
const i1 = state.exercises.findIndex(e => e.exerciseId === A1);
state.exercises[i1].sets.forEach((_, si) => { updateSet(i1, si, 'weight', '70'); updateSet(i1, si, 'reps', '8'); });
ok('Det klappede kort viser hvor mange sæt der har tal, og hvor mange kg',
    kortet(A1).includes('3/3 sets · 1680 kg'));
updateSet(i1, 2, 'reps', '0');
ok('Et sæt uden reps tæller ikke med', collapsedSummary(state.exercises[i1]) === '2/3 sets · 1120 kg');
ok('Man kan folde ud igen, og listen ryddes i browseren',
    toggleCollapsed(A1) && !isCollapsed(A1) && !loadCollapsed().upperA && kortet(A1).includes('set-weight'));

// Genindlæsning: telefonen smider siden væk midt i passet — det klappede skal stå klappet igen
freshSession();
toggleCollapsed(A1);
state.collapsed = []; // som en ny side: state er tom, localStorage er ikke
loadProgram();
ok('En genindlæsning lægger sammenklapningen tilbage', isCollapsed(A1) && kortet(A1).includes('collapsed'));

state.currentDay = 'lower'; state.programVariant = null;
loadProgram();
ok('Et andet pas arver ikke listen (og det første har den stadig)',
    state.collapsed.length === 0 && !!loadCollapsed().upperA);
state.currentDay = 'upper'; state.programVariant = 'A';
loadProgram();
store[COLLAPSE_KEY] = JSON.stringify({ upperA: { week: '2020-W01', ids: [A1] } });
ok('Et klappet pas fra en tidligere uge bruges ikke, og smides væk',
    collapsedIds().length === 0 && !loadCollapsed().upperA);

freshSession();
toggleCollapsed(A1);
updateSet(0, 0, 'weight', '70');
saveWorkout();
ok('Et gem rydder listen, så næste pas åbner foldet ud',
    JSON.parse(store['gym_tracker_workouts']).length === 1 && !loadCollapsed().upperA && state.collapsed.length === 0);

Object.keys(store).forEach(k => delete store[k]);
state.exercises = []; state.collapsed = []; state.editing = null;
}

notesTests().then(draftTests).then(collapseTests).then(() => {
    console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);
    process.exit(fail === 0 ? 0 : 1);
});
