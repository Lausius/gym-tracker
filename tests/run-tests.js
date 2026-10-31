// Testharness for gym-tracker: kører appens JS uden browser og verificerer
// hver features kontrakt (virker / gemmes / ryddes / gammel adfærd væk).
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
// fetch-stub: noterne hentes fra nettet i browseren.
let notesFetchImpl = () => Promise.reject(new Error('offline'));
const fetch = (...args) => notesFetchImpl(...args);
const ctx = { document, localStorage, console, setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, parseInt, parseFloat, isNaN, fetch, scrollTo() {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(
    script + `
    globalThis.__app = {EXERCISES, ALL_EXERCISES, PROGRAMS, getProgram, getSuggestedVariant, getCurrentVariant,
        calculateProgressiveOverload, programKey, applyWorkoutEdit, isoWeekKey, weekLabel,
        groupByWeek, formatSets, generateShareText, markShareScopeAsShared, CHAR_LIMIT,
        buildSampleWorkouts, isSampleWorkout, realWorkouts, lastWorkoutFor, programItems,
        swapCandidates, setSwap, sessionEntryFor, slotForExercise, planFor, SESSION_FOCUS,
        SESSION_ORDER, weekDone, isDoneThisWeek, nextSessionInWeek, weekConflict,
        missingExerciseCount, restoreMissingExercises, loadProgram, addExerciseToSession,
        swapExercise, state, MAX_PER_DAY, startEditWorkout, cancelEdit, saveWorkout, updateSet,
        warmupSets, renderWarmupBlock, CUES, exerciseCue, renderCueLine, NOTES_URL, NOTES_FILE,
        escapeHtml, renderNotesMarkdown, loadCoachNotes, DRAFT_KEY, DRAFT_DEBOUNCE, loadDrafts,
        persistDraft, restoreDraft, draftIsDirty, COLLAPSE_KEY, loadCollapsed, collapsedIds,
        isCollapsed, toggleCollapsed, collapsedSummary, renderExerciseList};
    `,
    ctx
);
const {
EXERCISES, ALL_EXERCISES, PROGRAMS, getProgram, getSuggestedVariant, getCurrentVariant,
    calculateProgressiveOverload, programKey, applyWorkoutEdit, isoWeekKey, weekLabel,
    groupByWeek, formatSets, generateShareText, markShareScopeAsShared, CHAR_LIMIT,
    buildSampleWorkouts, isSampleWorkout, realWorkouts, lastWorkoutFor, programItems,
    swapCandidates, setSwap, sessionEntryFor, slotForExercise, planFor, SESSION_FOCUS,
    SESSION_ORDER, weekDone, isDoneThisWeek, nextSessionInWeek, weekConflict,
    missingExerciseCount, restoreMissingExercises, loadProgram, addExerciseToSession,
    swapExercise, state, MAX_PER_DAY, startEditWorkout, cancelEdit, saveWorkout, updateSet,
    warmupSets, renderWarmupBlock, CUES, exerciseCue, renderCueLine, NOTES_URL, NOTES_FILE,
    escapeHtml, renderNotesMarkdown, loadCoachNotes, DRAFT_KEY, DRAFT_DEBOUNCE, loadDrafts,
    persistDraft, restoreDraft, draftIsDirty, COLLAPSE_KEY, loadCollapsed, collapsedIds,
    isCollapsed, toggleCollapsed, collapsedSummary, renderExerciseList
} = ctx.__app;
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const TODAY = '2026-10-08'; // torsdag i uge 41
const seed = workouts => { store['gym_tracker_workouts'] = JSON.stringify(workouts); };
const w = (id, date, day, variant) => ({ id, date, day, variant, exercises: [] });
const idsOf = list => list.map(i => i.exerciseId).join(',');

console.log('\n── 1. Program-integritet (alle øvelses-IDer findes på den rigtige dag)');
ok('Hver programrække peger på en øvelse i dagens database, med sæt, reps, vægt og ingen dubletter',
    Object.entries(PROGRAMS).every(([key, list]) => {
        const day = key.startsWith('upper') ? 'upper' : 'lower';
        return list.length <= MAX_PER_DAY &&
            list.every(i => ALL_EXERCISES[day].some(e => e.id === i.exerciseId) &&
                i.sets > 0 && i.reps > 0 && typeof i.weight === 'number' && i.weight >= 0) &&
            new Set(list.map(i => i.exerciseId)).size === list.length;
    }));
ok('Ingen skabelon byder Romanian Deadlift (hans lænd)',
    !Object.values(PROGRAMS).flat().some(i => i.exerciseId === 'romanian_deadlift'));

console.log('\n── 2. Ugen: hvilke pas der er klaret, og hvad der foreslås');
// Datoerne er uge 41 (man 5. – søn 11. okt 2026).
ok('Ugens fire pas står i træningsrækkefølge (upperA, lowerA, upperB, lowerB)',
    SESSION_ORDER.join(',') === 'upperA,lowerA,upperB,lowerB', SESSION_ORDER.join(','));
seed([]);
ok('Ingen historik → foreslår A, og ugen er tom',
    getSuggestedVariant('upper', TODAY) === 'A' && getSuggestedVariant('lower', TODAY) === 'A' &&
    Object.keys(weekDone(TODAY)).length === 0);
seed([w('u1', '2026-10-05', 'upper', 'A')]);
ok('Upper A klaret i ugen: Upper B mangler, foreslås som næste, og næste pas i ugen er ben',
    isDoneThisWeek('upper', 'A', TODAY) === true && isDoneThisWeek('upper', 'B', TODAY) === false &&
    getSuggestedVariant('upper', TODAY) === 'B' && nextSessionInWeek(TODAY) === 'lowerA');
seed([w('u1', '2026-10-05', 'upper', 'A'), w('u2', '2026-10-07', 'upper', 'B')]);
ok('Begge upper-pas klaret → foreslår A igen, lower-historikken urørt',
    getSuggestedVariant('upper', TODAY) === 'A' && getSuggestedVariant('lower', TODAY) === 'A' &&
    nextSessionInWeek(TODAY) === 'lowerA');
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
ok('Låsen: Upper A i ugen er låst, Upper B ikke, samme dag må overskrives, "log anyway" og redigering lukker op',
    !!weekConflict(TODAY) && weekConflict(TODAY).date === '2026-10-05' &&
    (state.programVariant = 'B', weekConflict(TODAY) === null) &&
    (state.programVariant = 'A', seed([w('u1', '2026-10-08', 'upper', 'A')]), weekConflict(TODAY) === null) &&
    (seed([w('u1', '2026-10-05', 'upper', 'A')]), state.allowDuplicateWeek = true, weekConflict(TODAY) === null) &&
    (state.allowDuplicateWeek = false, state.editing = { id: 'u1', date: '2026-10-05', day: 'upper' },
        weekConflict(TODAY) === null));
state.editing = null;
state.allowDuplicateWeek = false;
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
ok('Ingen historik → status "new"', calculateProgressiveOverload('bench_press', 'upper').status === 'new');
const oneSession = (id, day, variant, weight, reps) => ({
    id, date: '2026-09-01', day, variant, exercises: [
        { exerciseId: 'bench_press', sets: Array.from({ length: 3 }, () => ({ weight, reps })) },
    ],
});
const sug = (list) => {
    store['gym_tracker_workouts'] = JSON.stringify(list);
    return calculateProgressiveOverload('bench_press', 'upper');
};
ok('60×8 → 62.5×8, 60×5 → 60×6 (vægt-op eller flere reps)',
    sug([oneSession('w1', 'upper', 'A', 60, 8)]).suggestion === '62.5 kg × 8 reps' &&
    sug([oneSession('w1', 'upper', 'A', 60, 5)]).suggestion === '60 kg × 6 reps');
ok('3 sessioner på 60 kg → stagnation med rep-fokus; 2 sessioner → stadig vægt-op',
    sug([oneSession('w1', 'upper', 'A', 60, 8),
         { ...oneSession('w2', 'upper', 'B', 60, 8), date: '2026-09-03' },
         { ...oneSession('w3', 'upper', 'A', 60, 8), date: '2026-09-05' }]).suggestion === '10 reps med 60 kg' &&
    sug([oneSession('w1', 'upper', 'A', 60, 8),
         { ...oneSession('w2', 'upper', 'B', 60, 8), date: '2026-09-03' }]).suggestion === '62.5 kg × 8 reps');
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'lower', variant: 'A', exercises: [
        { exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }] },
]);
ok('Lower-historik påvirker ikke upper-beregning',
    calculateProgressiveOverload('squat', 'upper').status === 'new');
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'B', exercises: [
        { exerciseId: 'pull_up', sets: [{ weight: 0, reps: 8 }] }] },
]);
const bwProg = calculateProgressiveOverload('pull_up', 'upper');
ok('Kropsvægt (0 kg) giver et brugbart forslag', typeof bwProg.suggestion === 'string' && !bwProg.suggestion.includes('NaN'), `fik "${bwProg.suggestion}"`);

console.log('\n── 4. Øvelsesdatabase');
const allEx = [...EXERCISES.upper, ...EXERCISES.lower];
ok('Central øvelser findes hvor de bruges, og ingen deler navn',
    !!allEx.find(e => e.id === 'dumbbell_shoulder_press') && !!allEx.find(e => e.id === 'deadlift') &&
    new Set(allEx.map(e => e.name)).size === allEx.length);

console.log('\n── 5. De fem cable-øvelser');
const CABLE_IDS = ['cable_lateral_raise', 'cable_row_per_hand', 'dual_bicep_cable_curl', 'lat_extension', 'cable_reverse_fly'];
ok('Alle fem cable-øvelser findes i upper med navn, muskel, type, er cable, og kun row-varianten er per hånd',
    CABLE_IDS.every(id => {
        const e = ALL_EXERCISES.upper.find(x => x.id === id);
        return e && typeof e.name === 'string' && typeof e.muscle === 'string' && typeof e.compound === 'boolean' &&
            e.equipment === 'Cable' && (e.loadNote === undefined || id === 'cable_row_per_hand');
    }),
    CABLE_IDS.filter(id => !ALL_EXERCISES.upper.find(x => x.id === id)).join(', '));
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
ok('Bicep Curl findes i tre varianter med hvert sit id, håndvægt-curl er per hånd, split squat og lunges per ben',
    curls.length === 3 && new Set(curls.map(c => c.id)).size === 3 &&
    curls.map(c => c.equipment).sort().join(',') === 'Barbell,Dumbbell,EZ-bar' &&
    curls.find(c => c.equipment === 'Dumbbell').loadNote === 'per hand' &&
    allEx.filter(e => ['bulgarian_split', 'lunges'].includes(e.id)).every(e => e.loadNote === 'per leg'),
    curls.map(c => `${c.name}=${c.equipment}`).join(', '));
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [
        { exerciseId: 'ez_bar_curl', sets: [{ weight: 19, reps: 12 }] },
        { exerciseId: 'dumbbell_curl', sets: [{ weight: 12, reps: 12 }] }] },
]);
const ez = calculateProgressiveOverload('ez_bar_curl', 'upper');
const db = calculateProgressiveOverload('dumbbell_curl', 'upper');
ok('EZ-bar-curl (19 → 21,5 kg) og håndvægt-curl (12 → 14,5 kg) blander ikke deres historik',
    ez.suggestion === '21.5 kg × 12 reps' && db.suggestion === '14.5 kg × 12 reps',
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
ok('Redigering opdaterer i stedet for at oprette: samme id/dag/variant, den nye øvelse tilføjet, rapporterer +1, andre urørte',
    addOne.ok === true && addOne.workouts.length === 2 && addOne.workouts[0].id === 'w1' &&
    addOne.workouts[0].day === 'upper' && addOne.workouts[0].variant === 'A' &&
    addOne.workouts[0].exercises.length === 3 && addOne.workouts[0].exercises[2].exerciseId === 'ez_bar_curl' &&
    addOne.added === 1 && addOne.removed === 0 &&
    addOne.workouts[1].id === 'w2' && addOne.workouts[1].exercises.length === 1);
ok('Fjernelse rapporteres uden at give en ny træning, ombytning ændrer kun rækkefølgen',
    (() => {
        const rm = applyWorkoutEdit(savedList(), 'w1', [
            { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] }]);
        const reorder = applyWorkoutEdit(savedList(), 'w1', [
            { exerciseId: 'cable_row', sets: [{ weight: 40, reps: 12 }] },
            { exerciseId: 'bench_press', sets: [{ weight: 60, reps: 8 }] }]);
        return rm.removed === 1 && rm.added === 0 && rm.workouts.length === 2 &&
            reorder.added === 0 && reorder.removed === 0 &&
            reorder.workouts[0].exercises[0].exerciseId === 'cable_row';
    })());
ok('Ukendt id fejler i stedet for at oprette, og original-listen muteres ikke',
    (() => {
        const missing = applyWorkoutEdit(savedList(), 'findes-ikke', []);
        const untouched = savedList();
        applyWorkoutEdit(untouched, 'w1', [{ exerciseId: 'bench_press', sets: [{ weight: 99, reps: 1 }] }]);
        return missing.ok === false && missing.workouts.length === 2 &&
            untouched[0].exercises[1].exerciseId === 'cable_row';
    })());

console.log('\n── 8. Uge-opdelt deling med tegnbudget');
// ISO-ugenumre verificeret mod python3 datetime.date.isocalendar(), inkl. årsskifter.
ok('ISO-uge: mandag–søndag er samme uge, årsskiftet ruller korrekt, og labelen viser interval',
    isoWeekKey('2026-09-28') === '2026-W40' && isoWeekKey('2026-10-04') === '2026-W40' &&
    isoWeekKey('2026-10-05') === '2026-W41' &&
    isoWeekKey('2026-01-01') === '2026-W01' && isoWeekKey('2025-12-29') === '2026-W01' &&
    isoWeekKey('2026-12-31') === '2026-W53' && isoWeekKey('2027-01-01') === '2026-W53' &&
    weekLabel('2026-W40') === 'Week 40 (28.9–4.10)');
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
ok('Uger grupperes nyeste først, mandag og lørdag lægges sammen, "delt" kræver at ALLE ugens træninger er delt',
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
ok('En uge-eksport nævner kun den uge, med ugens træninger, overskrift, volumen og all-time-bedste',
    text40.includes('WEEK 40') && !text40.includes('WEEK 41') && !text40.includes('5.10') &&
    text40.includes('28.9 UPPER A') && text40.includes('29.9 LOWER A') &&
    /2 workouts · 1 Upper · 1 Lower/.test(text40) &&
    text40.includes('🏆 Best ever') && /📈 Progress: \d+ up/.test(text40),
    text40.split('\n')[0]);
ok('En anden uge giver en anden eksport', generateShareText('week:2026-W41') !== text40);
// Det vigtigste krav: en uge skal kunne sendes som ÉN Discord-besked (2.000 tegn).
const heavyWeek = [weekFixture(0, 'upper', 'A'), weekFixture(0, 'lower', 'A'), weekFixture(0, 'upper', 'B'), weekFixture(0, 'lower', 'B')];
store['gym_tracker_workouts'] = JSON.stringify([...heavyWeek, ...week41]);
const heavyText = generateShareText('week:2026-W40');
ok('En fuld uge (4 træninger) passer i én Discord-besked, og historikkens længde ændrer ikke ugens eksport',
    heavyText.length <= CHAR_LIMIT && Math.abs(heavyText.length - generateShareText('week:2026-W40').length) < 30,
    `${heavyText.length} tegn (limit ${CHAR_LIMIT})`);
store['gym_tracker_workouts'] = JSON.stringify([...week40, ...week41]);
const textNew = generateShareText('new');
ok('"Kun nyt" tager ikke-delte træninger med og viser antallet i overskriften',
    textNew.includes('28.9 UPPER A') && textNew.includes('5.10 UPPER B') && textNew.includes('NEW SINCE LAST (4)'),
    textNew.split('\n')[0]);
const marked = markShareScopeAsShared('week:2026-W40');
ok('Deling markerer ugens træninger som delt i localStorage, deler ikke igen, og "kun nyt" følger med',
    marked === 2 && markShareScopeAsShared('week:2026-W40') === 0 &&
    (() => {
        const t = generateShareText('new');
        return !t.includes('28.9 UPPER A') && t.includes('5.10 UPPER B') && t.includes('NEW SINCE LAST (2)');
    })(), `markerede ${marked}`);
store['gym_tracker_workouts'] = JSON.stringify([{ ...week40[0], sharedAt: 'x' }, week40[1]]);
ok('En tom visning giver en forklarende tekst',
    generateShareText('week:2026-W99').includes('No workouts in the selected period'));
store['gym_tracker_workouts'] = JSON.stringify([]);
ok('Ingen træninger giver den gamle venlige besked', generateShareText('new').includes('No workouts saved yet'));

console.log('\n── 9. Sidste træning for en dag+variant');
const ex = (id, sets = 3) => ({ exerciseId: id, sets: Array.from({ length: sets }, () => ({ weight: 60, reps: 8 })) });
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [ex('bench_press'), ex('lat_pulldown')] },
    { id: 'u2', date: '2026-10-05', day: 'upper', variant: 'A', exercises: [ex('bench_press')] },
]);
ok('Den nyeste træning for dag+variant bruges; andre varianter og dage smitter ikke',
    (lastWorkoutFor('upper', 'A') || {}).id === 'u2' && lastWorkoutFor('upper', 'B') === null &&
    lastWorkoutFor('lower', 'A') === null);
store['gym_tracker_workouts'] = JSON.stringify([]);
// Kropsvægtøvelser har ingen vægt på stangen: Back Extension har et mærke (1), så
// den ikke falder ud af loggen når der gemmes.
const bwIn = key => {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    return PROGRAMS[key].filter(i => (ALL_EXERCISES[day].find(e => e.id === i.exerciseId) || {}).equipment === 'Bodyweight');
};
const bodyweightIds = new Set(Object.keys(PROGRAMS).flatMap(bwIn).map(i => i.exerciseId));
ok('Kropsvægtøvelsen står i skabelonen med et vægt-mærke over 0, så den bliver gemt',
    bodyweightIds.size > 0 && Object.keys(PROGRAMS).flatMap(bwIn).every(i => i.weight > 0),
    [...bodyweightIds].join(', '));

console.log('\n── 10. Eksempeldata (til at prøve appen uden at taste data ind)');
const samples = buildSampleWorkouts(new Date(2026, 9, 2)); // fredag 2. oktober 2026
const sampleVariant = k => samples.filter(x => x.day === (k.startsWith('upper') ? 'upper' : 'lower') && x.variant === k.slice(-1));
ok('Tre hele uger (12 træninger, 4 varianter × 3) fordelt på tre ISO-uger omkring den givne dato, markeret som eksempel, øvelser og sæt følger programmet',
    samples.length === 12 && ['upperA', 'upperB', 'lowerA', 'lowerB'].every(k => sampleVariant(k).length === 3) &&
    new Set(samples.map(x => isoWeekKey(x.date))).size === 3 &&
    isoWeekKey(samples[samples.length - 1].date) === isoWeekKey('2026-10-02') &&
    samples.every(isSampleWorkout) && samples.every(x => !x.sharedAt) &&
    samples.every(x => x.exercises.every(e => getProgram(x.day, x.variant).some(item => item.exerciseId === e.exerciseId) &&
        e.sets.every(s => s.weight > 0 && s.reps > 0))),
    `${samples.length}, ${[...new Set(samples.map(x => isoWeekKey(x.date)))].join(', ')}`);
const weightOf = (x, id) => x.exercises.find(e => e.exerciseId === id).sets[0].weight;
const firstUpperA = sampleVariant('upperA')[0], lastUpperA = sampleVariant('upperA').slice(-1)[0];
const firstLowerA = sampleVariant('lowerA')[0], lastLowerA = sampleVariant('lowerA').slice(-1)[0];
ok('Vægten stiger fra første til sidste uge, og ben stiger hurtigere end overkrop',
    weightOf(lastUpperA, 'bench_press') > weightOf(firstUpperA, 'bench_press') &&
    (weightOf(lastLowerA, 'leg_press') - weightOf(firstLowerA, 'leg_press')) >
    (weightOf(lastUpperA, 'bench_press') - weightOf(firstUpperA, 'bench_press')));
ok('realWorkouts filtrerer eksempeldata fra og tæller rigtige træninger',
    realWorkouts(samples).length === 0 &&
    realWorkouts([{ id: 'rigtig', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [] }, ...samples]).length === 1);
store['gym_tracker_workouts'] = JSON.stringify([]);

console.log('\n── 11. Programmet er dagens træning (husk + byt)');
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
    JSON.parse(store['gym_tracker_program_swaps'] || '{}').upperA.bench_press === 'dumbbell_press' &&
    idsOf(programItems('upper', 'B')) === idsOf(getProgram('upper', 'B')),
    swapped[0].exerciseId);
setSwap('upper', 'A', 'bench_press', 'bench_press');
ok('Bytte tilbage til skabelon-øvelsen fjerner overriden helt',
    !JSON.parse(store['gym_tracker_program_swaps'] || '{}').upperA &&
    programItems('upper', 'A')[0].exerciseId === 'bench_press');
// Byttelisterne: kun samme muskelgruppe, øvelsen selv øverst, aldrig stang-RDL.
const allRows = Object.entries(PROGRAMS).flatMap(([key, list]) => {
    const day = key.startsWith('upper') ? 'upper' : 'lower';
    return list.map(item => ({ day, item }));
});
const groupsOf = m => String(m).split('/').map(s => s.trim()).filter(Boolean);
const swapProblems = [], noAlternative = [];
for (const { day, item } of allRows) {
    const exo = ALL_EXERCISES[day].find(e => e.id === item.exerciseId);
    const cands = swapCandidates(day, item.exerciseId);
    if (cands.some(c => !groupsOf(c.muscle).some(g => groupsOf(exo.muscle).includes(g))) ||
        !cands.some(c => c.id === item.exerciseId) || (cands[0] || {}).id !== item.exerciseId ||
        cands.some(c => c.id === 'romanian_deadlift')) swapProblems.push(item.exerciseId);
    if (cands.length < 2) noAlternative.push(item.exerciseId);
}
ok('Bytte-listerne: kun fælles muskelgruppe, øvelsen selv øverst, aldrig stang-RDL, og hver øvelse har mindst ét alternativ',
    swapProblems.length === 0 && noAlternative.length === 0,
    swapProblems.concat(noAlternative).join(', '));
const dbRdl = ALL_EXERCISES.lower.find(e => e.id === 'dumbbell_rdl');
ok('Dumbbell RDL findes (per hånd, hofte-hinge) og kan vælges som bytte for leg curl og cable pull-through',
    !!dbRdl && dbRdl.equipment === 'Dumbbell' && dbRdl.loadNote === 'per hand' && dbRdl.compound === true &&
    swapCandidates('lower', 'leg_curl').some(c => c.id === 'dumbbell_rdl') &&
    swapCandidates('lower', 'cable_pull_through').some(c => c.id === 'dumbbell_rdl') &&
    swapCandidates('lower', 'leg_press').some(c => c.id === 'bulgarian_split'),
    JSON.stringify(dbRdl));
// Byttet får sine egne tal fra skabelonen (ikke rækkens 225 kg), og den variant
// man står i bestemmer (Leg Curl vejer 41 kg i A og 45 kg i B).
store['gym_tracker_program_swaps'] = JSON.stringify({ lowerA: { leg_press: 'leg_extension' } });
const swappedRow = programItems('lower', 'A').find(i => i.exerciseId === 'leg_extension');
const extRow = getProgram('lower', 'B').find(rw => rw.exerciseId === 'leg_extension');
ok('En byttet øvelse får sine egne tal fra skabelonen, husker hvad den blev byttet fra, og den aktive variant bestemmer',
    swappedRow.weight === extRow.weight && swappedRow.weight !== 225 && swappedRow.sets === extRow.sets &&
    swappedRow.reps === extRow.reps && swappedRow.swappedFrom === 'leg_press' &&
    planFor('lower', 'leg_curl', 'A').weight === 41 && planFor('lower', 'leg_curl', 'B').weight === 45,
    JSON.stringify(swappedRow));
// Dagens træning: samme vægt og sæt som sidst, ellers skabelonens anbefaling
const lpItem = getProgram('lower', 'A').find(i => i.exerciseId === 'leg_press');
const fresh = sessionEntryFor(lpItem, null);
const progWorkout = (id, date, day, variant, exs) => ({ id, date, day, variant, exercises: exs.map(e => ({ exerciseId: e[0], sets: e[1] })) });
const remembered = sessionEntryFor(lpItem, progWorkout('lp', '2026-10-05', 'lower', 'A',
    [['leg_press', [{ weight: 200, reps: 10 }, { weight: 225, reps: 10 }, { weight: 230, reps: 8 }]]]));
ok('Dagens træning: uden historik skabelonens tal, med historik det bedste sæt og antallet af sæt, anbefalingen ved siden af',
    fresh.sets.length === lpItem.sets && fresh.sets.every(s => s.weight === lpItem.weight && s.reps === lpItem.reps) &&
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
ok('Hele programmet lægges ind med anbefaling pr. kort, og ingen dag overstiger MAX_PER_DAY',
    programFits && state.exercises.every(e => e.plan && e.plan.sets > 0 && e.plan.reps > 0));
// En fuld dag afviser flere øvelser; et bytte holder antallet og huskes for passet
state.currentDay = 'lower';
state.programVariant = 'A';
loadProgram();
state.exercises = Array.from({ length: MAX_PER_DAY }, () => ({ exerciseId: 'bench_press', plan: null, sets: [], targetReps: 8 }));
const rejected = addExerciseToSession('dips');
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
const beforeSwap = state.exercises.map(e => e.exerciseId);
swapExercise('calf_raise', 'calf_raise_leg_press');
ok('En fuld dag afviser flere øvelser, og et bytte sætter den nye øvelse på pladsen, huskes for passet, rammer ikke det andet',
    rejected === false && state.exercises.length === MAX_PER_DAY &&
    state.exercises[beforeSwap.indexOf('calf_raise')].exerciseId === 'calf_raise_leg_press' &&
    JSON.parse(store['gym_tracker_program_swaps'] || '{}').lowerA.calf_raise === 'calf_raise_leg_press' &&
    idsOf(programItems('lower', 'B')) === idsOf(getProgram('lower', 'B')));
// Bytte til en øvelse der allerede står i dagens træning afvises (ingen dubletter)
swapExercise('hip_thrust', 'leg_press');
ok('Bytte til en øvelse der allerede er i dagens træning afvises',
    state.exercises.filter(e => e.exerciseId === 'leg_press').length === 1 &&
    state.exercises.some(e => e.exerciseId === 'hip_thrust'));
// Slotten findes ud fra øvelsen — også efter et bytte.
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
const slotOk = slotForExercise('leg_press') === 'leg_press';
setSwap('lower', 'A', 'calf_raise', 'calf_raise_leg_press');
loadProgram();
ok('Slotten findes ud fra øvelsen også efter et bytte (begge veje), og en øvelse uden for programmet har ingen række',
    slotOk && slotForExercise('calf_raise_leg_press') === 'calf_raise' && slotForExercise('calf_raise') === 'calf_raise' &&
    slotForExercise('dips') === null);
setSwap('lower', 'A', 'calf_raise', 'calf_raise');
// Fjerner man en række fra dagens træning, kan den hentes tilbage på sin plads.
store['gym_tracker_program_swaps'] = JSON.stringify({});
loadProgram();
const fullSession = state.exercises.map(e => e.exerciseId);
state.exercises = state.exercises.filter(e => e.exerciseId !== 'hip_thrust');
ok('Én fjernet række tælles og hentes tilbage på programmets plads, ikke til sidst',
    missingExerciseCount() === 1 &&
    (restoreMissingExercises(), idsOf(state.exercises) === fullSession.join(',')),
    idsOf(state.exercises));
// En øvelse uden programrække: dens egen historik er det eneste holdepunkt.
store['gym_tracker_workouts'] = JSON.stringify([progWorkout('bs', '2026-10-05', 'lower', 'A',
    [['bulgarian_split', Array.from({ length: 3 }, () => ({ weight: 20, reps: 10 }))]])]);
setSwap('lower', 'A', 'leg_press', 'bulgarian_split');
ok('Uden programrække bruges øvelsens egen historik (20 kg × 10 → 22,5 kg)',
    programItems('lower', 'A').find(i => i.exerciseId === 'bulgarian_split')?.weight === 22.5);
store['gym_tracker_workouts'] = JSON.stringify([]);
const freshPlan = planFor('lower', 'hack_squat');
ok('Uden række og historik er svaret et rent startpunkt',
    freshPlan.sets === 3 && freshPlan.reps === 8 && freshPlan.weight === 20, JSON.stringify(freshPlan));
// Hele vejen igennem: byttet på kortet giver de nye tal i felterne.
store['gym_tracker_program_swaps'] = JSON.stringify({});
state.currentDay = 'lower';
state.programVariant = 'A';
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
ok('index.html linker til styles.css og app.js, uden inline style/script, struktur og CSS-variabler i filerne, og dag-vælger/A-B-knapper/velkomsttekst fjernet',
    html.includes('<link rel="stylesheet" href="styles.css">') && html.includes('<script src="app.js"></script>') &&
    !/<style[\s>]/.test(html) && css.includes(':root') && css.includes('--accent') &&
    html.includes('id="session-bar"') && html.includes('id="exercise-list"') &&
    !html.includes('day-selector') && !html.includes('day-btn') &&
    !html.includes('variant-selector') && !html.includes('variant-btn') &&
    !html.includes('first-use-banner') && !html.includes('Welcome!'));
ok('Alle id\'er og klasser app.js slår op findes i index.html eller styles.css',
    [...new Set([...script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]))]
        .every(id => html.includes(`id="${id}"`)) &&
    [...new Set([...script.matchAll(/querySelector(?:All)?\(['"`]\.([a-z-]+)/g)].map(m => m[1]))]
        .every(c => css.includes('.' + c) || html.includes('class="' + c)));

console.log('\n── 13. Opvarmningssæt og teknik-cues');
const exById = (day, id) => ALL_EXERCISES[day].find(e => e.id === id);
const fmtWarmup = sets => sets.map(s => `${s.weight}×${s.reps}`).join(' ');
ok('Opvarmningen følger arbejdsvægten og redskabet: bar-ramp, EZ-bar som 10 kg, maskine/kabel, isolation ét let sæt',
    fmtWarmup(warmupSets(60, exById('upper', 'bench_press'))) === '20×10 30×8 42.5×5 50×3' &&
    fmtWarmup(warmupSets(21, exById('upper', 'ez_bar_curl'))) === '12.5×12' &&
    fmtWarmup(warmupSets(21, { compound: true, equipment: 'EZ-bar' })) === '10×10 15×5 17.5×3' &&
    fmtWarmup(warmupSets(250, exById('lower', 'leg_press'))) === '125×10 187.5×6' &&
    fmtWarmup(warmupSets(62, exById('upper', 'lat_pulldown'))) === '30×10 47.5×6' &&
    fmtWarmup(warmupSets(10, exById('upper', 'dumbbell_curl'))) === '6×12');
ok('Ingen arbejdsvægt, ukendt øvelse eller kropsvægt → ingen opvarmning, og rampen ligger altid under arbejdsvægten',
    warmupSets(0, exById('upper', 'bench_press')).length === 0 && warmupSets(60, null).length === 0 &&
    warmupSets(0, exById('upper', 'pull_up')).length === 0 &&
    warmupSets(20, exById('upper', 'bench_press')).every(s => s.weight < 20));
ok('renderWarmupBlock viser tallene og er tom uden vægt',
    renderWarmupBlock(exById('upper', 'bench_press'), 60).includes('42.5 × 5') &&
    renderWarmupBlock(exById('upper', 'bench_press'), 0) === '');
// Datadrevet: reglerne skal holde for HELE databasen på én gang.
const ALL_DB = [...EXERCISES.upper.map(e => ({ ...e, day: 'upper' })), ...EXERCISES.lower.map(e => ({ ...e, day: 'lower' }))];
const w100 = e => warmupSets(100, e);
ok('Hele databasen: unikke id\'er, navn/muskel/type/redskab udfyldt, gyldigt redskab, loadNote kun per hand/leg, og hver øvelse har en cue',
    new Set(ALL_DB.map(e => e.id)).size === ALL_DB.length &&
    ALL_DB.every(e => typeof e.name === 'string' && e.name.length > 0 &&
        typeof e.muscle === 'string' && e.muscle.length > 0 && typeof e.compound === 'boolean' &&
        ['Barbell', 'EZ-bar', 'Dumbbell', 'Cable', 'Machine', 'Machine/Dumbbell', 'Bodyweight'].includes(e.equipment) &&
        (e.loadNote === undefined || ['per hand', 'per leg'].includes(e.loadNote)) &&
        (CUES[e.id] || '').length > 0),
    ALL_DB.filter(e => !CUES[e.id]).map(e => e.id).join(', '));
const warmupProblem = ALL_DB.filter(e => {
    const s = w100(e);
    if (e.equipment === 'Bodyweight') return s.length !== 0;
    if (!e.compound) return s.length !== 1 || s[0].reps !== 12;
    if (['Barbell', 'EZ-bar'].includes(e.equipment)) return s.length !== 4 || s.map(x => x.reps).join(',') !== '10,8,5,3';
    return s.length !== 2 || s.map(x => x.reps).join(',') !== '10,6';
}).concat(ALL_DB.filter(e => !w100(e).every((x, i, a) => x.weight > 0 && x.weight < 100 && (i === 0 || x.weight > a[i - 1].weight))));
ok('Opvarmningsreglerne gælder hele databasen: kropsvægt ingen, isolation ét let sæt, bar-ramp 10/8/5/3, maskine 10/6, altid stigende under arbejdsvægten',
    warmupProblem.length === 0, warmupProblem.map(e => e.id).join(', '));
const allIds = new Set(allEx.map(e => e.id));
ok('Cue findes for Bench Press; ukendt øvelse giver ingen cue, og renderCueLine sætter linjen på kortet',
    /Shoulder blades/.test(exerciseCue(exById('upper', 'bench_press'))) &&
    exerciseCue({ id: 'findes_ikke' }) === '' && exerciseCue(null) === '' &&
    renderCueLine(exById('upper', 'bench_press')).includes('💡') &&
    renderCueLine({ id: 'findes_ikke' }) === '');

console.log('\n── 15. Sprogværn: engelsk i UI\'et, dansk kun i kommentarer');
// Metoden er bevidst grov: fjern kommentarer, og se om der er dansk tilbage.
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
// Ord uden æ/ø/å fanges ikke af tegn-tjekket, så de listes eksplicit.
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
ok('Ingen danske tegn eller ord i app.js uden for kommentarer eller i index.html, og siden er erklæret engelsk',
    appHits.length === 0 && htmlHits.length === 0 && /<html lang="en">/.test(html),
    appHits.concat(htmlHits).join(' | '));
ok('Sprogværnet ser skarpt nok ud (fanger en indsat dansk streng)', (() => {
    const probe = stripComments("showToast('Øvelsen er tilføjet', 'info');\nconst x = 1; // dansk kommentar");
    return DA_CHARS.test(probe) && !/kommentar/.test(probe);
})());

console.log('\n── 16. Coach notes (hentet fra nettet, ikke fra localStorage)');
async function notesTests() {
    ok('NOTES_URL er https og peger på gist-API\'et, filnavnet er det gisten indeholder, og escapeHtml lukker alle fem tegn',
        /^https:\/\/api\.github\.com\/gists\/[0-9a-f]+$/.test(NOTES_URL) && NOTES_FILE === 'weekly-notes.md' &&
        escapeHtml(`<a href="x">'&'</a>`) === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const md = [
        '# Coach notes',
        '',
        '## Week 41 · 5–11 Oct 2026',
        '',
        '**Load up**',
        '- Bench Press 65×8×3 → 67.5×6-8',
        '- Lat Pulldown 66×10 → next pin',
        '',
        'Worth knowing: RDL stays out.',
    ].join('\n');
    const notesHtml = renderNotesMarkdown(md);
    ok('Markdown bliver til overskrift, titel, fed tekst og punkter; tom/manglende tekst giver en forklarende linje',
        notesHtml.includes('<div class="notes-week">Week 41 · 5–11 Oct 2026</div>') &&
        notesHtml.includes('<div class="notes-title">Coach notes</div>') &&
        notesHtml.includes('<div class="notes-line"><strong>Load up</strong></div>') &&
        /<ul class="notes-list"><li>Bench Press 65×8×3 → 67\.5×6-8<\/li><li>Lat Pulldown 66×10 → next pin<\/li><\/ul>/.test(notesHtml) &&
        /class="notes-status"/.test(renderNotesMarkdown('   ')) && renderNotesMarkdown(null).includes('notes-status'));
    // Filen kommer fra nettet — HTML i den må aldrig slippe igennem
    const evil = renderNotesMarkdown('# Title <script>alert(1)</script>\n- <img src=x onerror=alert(1)>');
    ok('En hentet fil kan ikke injicere HTML — tegnene kommer med som tekst',
        !/<script|<img/.test(evil) && evil.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
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
    // Et afkortet svar henter den rå fil i stedet for at vise halve noter
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
    // samme besked i panelet i stedet for et crash; manglende fil giver sin egen.
    const errorPaths = [
        () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
        () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) }),
        () => Promise.reject(new Error('offline')),
    ];
    let allErrorsHandled = true;
    for (const impl of errorPaths) {
        notesFetchImpl = impl;
        const out = await loadCoachNotes();
        if (!(out === '' && /Could not load the notes/.test(captured['notes-content'].innerHTML))) allErrorsHandled = false;
    }
    notesFetchImpl = () => jsonReply({ files: { 'other.md': { content: '# Something else' } } });
    const missingFile = await loadCoachNotes();
    if (!(missingFile === '' && /No notes yet/.test(captured['notes-content'].innerHTML) &&
        !captured['notes-content'].innerHTML.includes('Something else'))) allErrorsHandled = false;
    if (!((await loadCoachNotes(null)) === '')) allErrorsHandled = false;
    ok('Alle fejlveje (HTTP-fejl, ugyldigt JSON, offline, manglende fil, intet fetch) giver besked i panelet, ikke et crash', allErrorsHandled);
    document.getElementById = realGetById;
    notesFetchImpl = () => Promise.reject(new Error('offline'));
}

console.log('\n── 17. Udkast: det man har tastet, huskes hvis appen genindlæses ──────');
// Tallene skal ligge i localStorage mens man taster, og lægges tilbage ved næste
// åbning hvis træningen aldrig blev gemt.
function draftTests() {
const A0 = programItems('upper', 'A')[0].exerciseId;
const fieldOf = (exId, si = 0) => state.exercises.find(e => e.exerciseId === exId).sets[si];
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
ok('Et urørt program giver ikke et udkast; et tastet tal gør det beskidt og skriver det ned på det pas man står i',
    draftIsDirty() === false && persistDraft(TODAY) === false && !loadDrafts().upperA &&
    (updateSet(0, 0, 'weight', '62.5'), updateSet(0, 0, 'reps', '6'),
        draftIsDirty() === true && persistDraft(TODAY) === true));
const draft = loadDrafts().upperA;
ok('Udkastet husker ugen, rummer hele passet og det tastede tal — uden afledte felter',
    draft && draft.week === isoWeekKey(TODAY) &&
    draft.exercises.length === programItems('upper', 'A').length &&
    draft.exercises.find(e => e.exerciseId === A0).sets[0].weight === 62.5 &&
    draft.exercises.find(e => e.exerciseId === A0).sets[0].reps === 6 &&
    draft.editingId === null && !('plan' in draft.exercises[0]) && !('targetReps' in draft.exercises[0]),
    JSON.stringify(draft && { week: draft.week, n: draft.exercises.length }));
// "Genindlæsning": programmet indlæses forfra, og udkastet lægges ovenpå
loadProgram();
ok('Udkastet lægges tilbage ved åbning, med det tastede tal og hele passet i programmets rækkefølge',
    restoreDraft(TODAY) === true && fieldOf(A0).weight === 62.5 && fieldOf(A0).reps === 6 &&
    state.exercises.map(e => e.exerciseId).join(',') === programItems('upper', 'A').map(i => i.exerciseId).join(','),
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
    restoreDraft(TODAY) === false && !!loadDrafts().upperA &&
    (state.currentDay = 'upper', loadProgram(), restoreDraft(TODAY) === true && fieldOf(A0).weight === 62.5));
// Gem træningen: udkastet er væk, og man flytter sig til ugens næste pas
freshSession();
updateSet(0, 0, 'weight', '62.5');
persistDraft(TODAY);
saveWorkout();
ok('Efter et gem er træningen gemt og udkastet væk, og man står på ugens næste pas (Upper A → Lower A)',
    JSON.parse(store['gym_tracker_workouts'] || '[]').length === 1 && Object.keys(loadDrafts()).length === 0 &&
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
updateSet(0, 0, 'weight', '57.5');
persistDraft(TODAY);
loadProgram();
ok('Udkastet markerer hvilken træning man retter, og rettedata kommer tilbage ved åbning',
    restoreDraft(TODAY) === true && !!state.editing && state.editing.id === 'w_old' &&
    state.exercises[0].sets[0].weight === 57.5 && state.exercises[0].plan === undefined &&
    weekConflict(TODAY) === null);
// En opgivet rettelse gemmes ikke som udkast
freshSession();
seedOld();
startEditWorkout('w_old');
updateSet(0, 0, 'weight', '57.5');
persistDraft(TODAY);
cancelEdit();
ok('En opgivet rettelse gemmes ikke som udkast, og man er ude af rettetilstanden',
    !loadDrafts().upperA && state.editing === null);
// Udkast der ikke kan bruges: træningen findes ikke, eller øvelsen er væk
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
// Regression: et urørt pas må ikke blive et udkast bare fordi loggen ændrer sig
freshSession();
store['gym_tracker_workouts'] = JSON.stringify([w('u_ny', '2026-10-06', 'upper', 'A')]);
ok('Et urørt pas bliver ikke et udkast fordi historikken ændrer sig; et tastet tal gør det stadig',
    draftIsDirty() === false && persistDraft(TODAY) === false && !loadDrafts().upperA &&
    (updateSet(0, 0, 'weight', '61'), draftIsDirty() === true && persistDraft(TODAY) === true &&
        loadDrafts().upperA.exercises[0].sets[0].weight === 61));
store[DRAFT_KEY] = JSON.stringify({});
Object.keys(store).forEach(k => delete store[k]);
state.exercises = [];
state.editing = null;
}

// ─── 18. Klap en færdig øvelse sammen ────────────────────────────────
// Den man er færdig med skal kunne klappes sammen, og det hører til passet og
// overlever at telefonen genindlæser siden.
function collapseTests() {
const A1 = programItems('upper', 'A')[1].exerciseId;
const REAL_WEEK = isoWeekKey(new Date().toISOString().split('T')[0]);
function freshSession() {
    Object.keys(store).forEach(k => delete store[k]);
    state.currentDay = 'upper'; state.programVariant = 'A'; state.sessionVariant = null;
    state.editing = null; state.openSwap = null; state.collapsed = [];
    loadProgram();
}
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
ok('Hvert kort har en klap-knap, ingen ✕ tilbage, og intet kort er klappet fra starten',
    (liste0.split('class="collapse-btn"').length - 1) === state.exercises.length && !liste0.includes('remove-btn') &&
    !liste0.includes('collapsed-summary'));
toggleCollapsed(A1);
// Facit står på det klappede kort — det er den eneste status man har, mens det er klappet
const i1 = state.exercises.findIndex(e => e.exerciseId === A1);
state.exercises[i1].sets.forEach((_, si) => { updateSet(i1, si, 'weight', '70'); updateSet(i1, si, 'reps', '8'); });
const kortA1 = kortet(A1);
ok('Klappen gemmer tilstanden på passet med ugen, kortet mister sine sæt-felter og viser facit 3/3 sets',
    isCollapsed(A1) && !kortA1.includes('set-weight') && kortA1.includes('collapsed-summary') &&
    !kortA1.includes('kg') && kortA1.includes('3/3 sets') &&
    String((loadCollapsed().upperA || {}).ids) === A1 && (loadCollapsed().upperA || {}).week === REAL_WEEK,
    JSON.stringify(loadCollapsed()));
updateSet(i1, 2, 'reps', '0');
ok('Facitten tæller kun sæt med reps (2/3 sets)', collapsedSummary(state.exercises[i1]) === '2/3 sets');
ok('Man kan folde ud igen, og listen ryddes i browseren',
    toggleCollapsed(A1) && !isCollapsed(A1) && !loadCollapsed().upperA && kortet(A1).includes('set-weight'));
// Genindlæsning: det klappede skal stå klappet igen, men ikke arves af andre pas
freshSession();
toggleCollapsed(A1);
state.collapsed = []; // som en ny side: state er tom, localStorage er ikke
loadProgram();
ok('En genindlæsning lægger sammenklapningen tilbage; et andet pas arver ikke listen, og et fra en tidligere uge smides væk',
    isCollapsed(A1) && kortet(A1).includes('collapsed') &&
    (state.currentDay = 'lower', state.programVariant = null, loadProgram(),
        state.collapsed.length === 0 && !!loadCollapsed().upperA) &&
    (state.currentDay = 'upper', state.programVariant = 'A', loadProgram(),
        (store[COLLAPSE_KEY] = JSON.stringify({ upperA: { week: '2020-W01', ids: [A1] } }),
            collapsedIds().length === 0 && !loadCollapsed().upperA)));
freshSession();
toggleCollapsed(A1);
updateSet(0, 0, 'weight', '70');
saveWorkout();
ok('Et gem rydder listen, så næste pas åbner foldet ud',
    JSON.parse(store['gym_tracker_workouts'] || '[]').length === 1 && !loadCollapsed().upperA && state.collapsed.length === 0);
Object.keys(store).forEach(k => delete store[k]);
state.exercises = []; state.collapsed = []; state.editing = null;
}
notesTests().then(draftTests).then(collapseTests).then(() => {
    console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);
    process.exit(fail === 0 ? 0 : 1);
});
