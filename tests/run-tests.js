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
    getElementById: id => makeEl(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeEl('new'),
    addEventListener() {},
};

const ctx = { document, localStorage, console, setTimeout, Date, Math, JSON, Set, Array, Object, parseInt, parseFloat, isNaN };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(
    script + `
    globalThis.__app = { EXERCISES, ALL_EXERCISES, PROGRAMS, getProgram, getSuggestedVariant,
        getCurrentVariant, calculateProgressiveOverload, programKey, formatDate, saveWorkouts, loadWorkouts,
        applyWorkoutEdit, isoWeekKey, weekLabel, groupByWeek, formatSets, generateShareText,
    markShareScopeAsShared, CHAR_LIMIT, getTrainedExerciseIds, filterTrained, hasVariantHistory,
        isBodyweightExercise };
    `,
    ctx
);

const {
    EXERCISES, ALL_EXERCISES, PROGRAMS, getProgram, getSuggestedVariant, getCurrentVariant,
    calculateProgressiveOverload, programKey, applyWorkoutEdit,
    isoWeekKey, weekLabel, groupByWeek, formatSets, generateShareText, markShareScopeAsShared, CHAR_LIMIT,
    getTrainedExerciseIds, filterTrained, hasVariantHistory, isBodyweightExercise,
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

console.log('\n── 2. A/B-rotation (foreslået variant)');
store['gym_tracker_workouts'] = JSON.stringify([]);
ok('Ingen historik → foreslår A', getSuggestedVariant('upper') === 'A');
ok('Ingen historik (lower) → foreslår A', getSuggestedVariant('lower') === 'A');

store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [] },
]);
ok('Efter Upper A → foreslår Upper B', getSuggestedVariant('upper') === 'B');

store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [] },
    { id: 'w2', date: '2026-09-03', day: 'upper', variant: 'B', exercises: [] },
]);
ok('Efter Upper A+B → foreslår A igen', getSuggestedVariant('upper') === 'A');
ok('Lower påvirkes ikke af upper-historik', getSuggestedVariant('lower') === 'A');

// Rotationen skal bruge den NYESTE dato, ikke rækkefølgen i arrayet
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w2', date: '2026-09-05', day: 'upper', variant: 'B', exercises: [] },
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [] },
]);
ok('Nyeste dato afgør rotationen (B → A)', getSuggestedVariant('upper') === 'A');

store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', variant: 'A', exercises: [] },
    { id: 'w2', date: '2026-09-05', day: 'lower', variant: 'B', exercises: [] },
]);
ok('Upper-rotation ser kun upper-træninger', getSuggestedVariant('upper') === 'B');
ok('Lower-rotation ser kun lower-træninger', getSuggestedVariant('lower') === 'A');

// Træninger uden variant-felt (gamle data) må ikke crashe
store['gym_tracker_workouts'] = JSON.stringify([
    { id: 'w1', date: '2026-09-01', day: 'upper', exercises: [] },
]);
ok('Gamle træninger uden variant → A (ingen crash)', getSuggestedVariant('upper') === 'A');

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

console.log('\n── 6. Redskabsvarianter');
const allEx = [...EXERCISES.upper, ...EXERCISES.lower];
ok('Alle øvelser har et redskab angivet', allEx.every(e => typeof e.equipment === 'string' && e.equipment.length > 0));
ok('Ingen øvelser deler navn', new Set(allEx.map(e => e.name)).size === allEx.length);
const curls = allEx.filter(e => e.name.startsWith('Bicep Curl'));
ok('Bicep Curl findes i tre redskabsvarianter', curls.length === 3, `fik ${curls.length}: ${curls.map(c => c.name).join(', ')}`);
ok('De tre curl-varianter har hvert sit id', new Set(curls.map(c => c.id)).size === 3);
ok('Curl-varianterne er stang, EZ-bar og håndvægte',
    curls.map(c => c.equipment).sort().join(',') === 'Barbell,Dumbbell,EZ-bar', curls.map(c => c.equipment).join(', '));
ok('Håndvægt-curl er markeret per hånd', curls.find(c => c.equipment === 'Dumbbell').loadNote === 'per hånd');
ok('Chest Supported Row findes nu', !!allEx.find(e => e.id === 'chest_supported_row'));
ok('Chest Supported Row er en sammensat rygøvelse',
    allEx.find(e => e.id === 'chest_supported_row').muscle === 'Ryg' && allEx.find(e => e.id === 'chest_supported_row').compound === true);
ok('Alle håndvægtøvelser med enkelt-side belastning har loadNote',
    allEx.filter(e => e.equipment === 'Dumbbell' && /Dumbbell|Hammer|Fly|Raise|Reverse/.test(e.name))
         .every(e => e.loadNote === 'per hånd'));
ok('Bulgarian Split Squat og Lunges er markeret per ben',
    allEx.filter(e => ['bulgarian_split', 'lunges'].includes(e.id)).every(e => e.loadNote === 'per ben'));
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
ok('Ugelabel viser interval med dansk datoformat', weekLabel('2026-W40') === 'Uge 40 (28.9–4.10)', weekLabel('2026-W40'));

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
ok('En uge-eksport nævner kun den uge', text40.includes('UGE 40') && !text40.includes('UGE 41'), text40.split('\n')[0]);
ok('En uge-eksport indeholder ugens træninger', text40.includes('28.9 UPPER A') && text40.includes('29.9 LOWER A'));
ok('En uge-eksport udelader andre ugers træninger', !text40.includes('5.10'));
ok('Eksporten har uge-overskrift med antal og volumen', /2 træninger · 1 Upper · 1 Lower/.test(text40), text40.split('\n')[1]);

const text41 = generateShareText('week:2026-W41');
ok('En anden uge giver en anden eksport', text41 !== text40 && text41.includes('UGE 41'));
ok('All-time-bedste følger med i en uge-eksport (trenden bevares)', text40.includes('🏆 Bedste nogensinde'));
ok('All-time-bedste dækker også øvelser uden for den viste uge', text40.includes('Squat') && text40.includes('Bench Press'));
ok('Fremgang vises som headline, ikke én linje pr. øvelse', /📈 Fremgang: \d+ op/.test(text40), text40.match(/📈 Fremgang:.*/)?.[0]);

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
ok('"Kun nyt" viser antallet i overskriften', textNew.includes('NYT SIDEN SIDST (4)'), textNew.split('\n')[0]);

const marked = markShareScopeAsShared('week:2026-W40');
ok('Deling markerer ugens træninger som delt', marked === 2, `markerede ${marked}`);
ok('Markeringen gemmes i localStorage', JSON.parse(store['gym_tracker_workouts']).filter(w => w.sharedAt).length === 2);
ok('En allerede delt træning markeres ikke igen', markShareScopeAsShared('week:2026-W40') === 0);

const textNewAfter = generateShareText('new');
ok('"Kun nyt" indeholder kun det endnu ikke delte', !textNewAfter.includes('28.9 UPPER A') && textNewAfter.includes('5.10 UPPER B'));
ok('"Kun nyt" fortæller hvor mange der mangler', textNewAfter.includes('NYT SIDEN SIDST (2)'), textNewAfter.split('\n')[0]);

store['gym_tracker_workouts'] = JSON.stringify([{ ...week40[0], sharedAt: 'x' }, week40[1]]);
ok('En tom visning giver en forklarende tekst', generateShareText('week:2026-W99').includes('Ingen træninger i det valgte tidsrum'));
store['gym_tracker_workouts'] = JSON.stringify([]);
ok('Ingen træninger giver den gamle venlige besked', generateShareText('new').includes('Ingen træninger gemt endnu'));

// ─── 9. Filtrering: kun øvelser man har udført ────────────────────
// Formålet er at listerne ikke skal fyldes med øvelser man aldrig laver. Reglen er
// "nogensinde udført for den dag", og filtreringen slår kun til når der ER noget at
// filtrere efter — ellers ville en ny bruger stå med tomme lister.
console.log('\n── 9. Filtrering: kun øvelser man har udført');

const ex = (id, sets = 3) => ({ exerciseId: id, sets: Array.from({ length: sets }, () => ({ weight: 60, reps: 8 })) });
const asDone = list => JSON.stringify(list);

store['gym_tracker_workouts'] = asDone([]);
const noHistory = filterTrained(ALL_EXERCISES.upper, 'upper', e => e.id, false);
ok('Uden historik er ingen øvelser markeret som udført', getTrainedExerciseIds('upper').size === 0);
ok('Uden historik filtreres der ikke', noHistory.visible.length === ALL_EXERCISES.upper.length);
ok('Uden historik skjules intet', noHistory.hidden.length === 0);
ok('Uden historik markeres resultatet som ufiltreret', noHistory.filtered === false);
ok('Uden historik kan der slet ikke filtreres', noHistory.canFilter === false);

store['gym_tracker_workouts'] = asDone([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [ex('bench_press'), ex('lat_pulldown')] },
]);
ok('Kun de udførte øvelser tælles med', getTrainedExerciseIds('upper').size === 2);
ok('En udført øvelse er med', getTrainedExerciseIds('upper').has('bench_press'));
ok('En øvelse man aldrig har lavet er ikke med', !getTrainedExerciseIds('upper').has('shoulder_press'));
ok('Historik for lower smitter ikke af på upper', getTrainedExerciseIds('lower').size === 0);
ok('Varianten med historik kendes', hasVariantHistory('upper', 'A') === true);
ok('Den anden variant tæller ikke som kendt', hasVariantHistory('upper', 'B') === false);

// En øvelse man tilføjede men aldrig førte tal ind i, er ikke "udført"
store['gym_tracker_workouts'] = asDone([
    { id: 'u2', date: '2026-09-29', day: 'upper', variant: 'A', exercises: [ex('bench_press', 0)] },
]);
ok('Tom sæt-liste tæller ikke som udført', getTrainedExerciseIds('upper').size === 0);

store['gym_tracker_workouts'] = asDone([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [ex('bench_press'), ex('lat_pulldown')] },
]);
const filtered = filterTrained(ALL_EXERCISES.upper, 'upper', e => e.id, false);
const filteredIds = filtered.visible.map(e => e.id);
ok('Udførte øvelser bliver synlige', filteredIds.includes('bench_press') && filteredIds.includes('lat_pulldown'));
ok('En aldrig udført øvelse er ikke i den synlige liste', !filteredIds.includes('shoulder_press'));
// Relation frem for hardcodede tal: de synlige er de udførte PLUS kropsvægtøvelserne,
// og synlige + skjulte skal tilsammen give hele listen.
ok('Resten af databasen skjules', filtered.hidden.length === ALL_EXERCISES.upper.length - filteredIds.length, `${filteredIds.length} synlige, ${filtered.hidden.length} skjulte af ${ALL_EXERCISES.upper.length}`);
ok('Synlige og skjulte udgør tilsammen hele listen', filteredIds.length + filtered.hidden.length === ALL_EXERCISES.upper.length);
ok('Resultatet markeres som filtreret', filtered.filtered === true);

const shownAll = filterTrained(ALL_EXERCISES.upper, 'upper', e => e.id, true);
ok('"Vis alle" viser hele listen', shownAll.visible.length === ALL_EXERCISES.upper.length);
ok('"Vis alle" er ikke længere filtreret', shownAll.filtered === false);
// Hvis den skjulte mængde blev tømt her, ville knappen skjule sig selv i det øjeblik
// man trykkede på den — og der var ingen vej tilbage til den filtrerede visning.
ok('"Vis alle" husker hvad der er skjult, så knappen kan skifte tilbage', shownAll.hidden.length === filtered.hidden.length, `${shownAll.hidden.length} skjulte`);
ok('Den skjulte mængde er den samme som da filtret var slået til', shownAll.hidden.length === filtered.hidden.length);

// Kernen i vagten: man må ikke kunne tømme en variant man bare ikke har kørt endnu
const untouchedVariant = filterTrained(ALL_EXERCISES.upper, 'upper', e => e.id, false, hasVariantHistory('upper', 'B'));
ok('En variant uden historik vises i fuld længde', untouchedVariant.visible.length === ALL_EXERCISES.upper.length);
ok('Derfor skjules intet i den variant', untouchedVariant.hidden.length === 0);
ok('En variant MED historik filtreres stadig', filterTrained(ALL_EXERCISES.upper, 'upper', e => e.id, false, hasVariantHistory('upper', 'A')).visible.length === filteredIds.length);

// Kropsvægtøvelser kan slet ikke føre vægthistorik: saveWorkout gemmer kun sæt med
// vægt > 0, så plank og pull-up optræder aldrig i en gemt træning. Uden denne
// undtagelse ville de forsvinde fra programmet for bestandigt efter første gem.
ok('Plank er kropsvægtøvelse', isBodyweightExercise('lower', 'plank') === true);
ok('Pull-up er kropsvægtøvelse', isBodyweightExercise('upper', 'pull_up') === true);
ok('En øvelse med vægt er ikke kropsvægt', isBodyweightExercise('lower', 'squat') === false);
ok('Opslaget er afgrænset til den rigtige dag', isBodyweightExercise('upper', 'plank') === false);

store['gym_tracker_workouts'] = asDone([
    { id: 'l1', date: '2026-09-29', day: 'lower', variant: 'A',
      exercises: ['squat', 'romanian_deadlift', 'leg_press', 'hip_thrust', 'leg_curl'].map(id => ex(id)) },
]);
const lowerSaved = filterTrained(getProgram('lower', 'A'), 'lower', i => i.exerciseId, false);
ok('Plank overlever i programmet trods ingen historik', lowerSaved.visible.some(i => i.exerciseId === 'plank'), JSON.stringify(lowerSaved.visible.map(i => i.exerciseId)));
ok('Plank tælles ikke som skjult', !lowerSaved.hidden.some(i => i.exerciseId === 'plank'));
const lowerDb = filterTrained(ALL_EXERCISES.lower, 'lower', e => e.id, false);
ok('Plank er også synlig i Næste uge-listen', lowerDb.visible.some(e => e.id === 'plank'));
ok('Øvelser uden historik og med vægt filtreres stadig', !lowerDb.visible.some(e => e.id === 'leg_extension'));

// Programmet filtreres efter samme regel som databasen
store['gym_tracker_workouts'] = asDone([
    { id: 'u1', date: '2026-09-28', day: 'upper', variant: 'A', exercises: [ex('bench_press'), ex('lat_pulldown')] },
]);
const progA = getProgram('upper', 'A');
const progFiltered = filterTrained(progA, 'upper', i => i.exerciseId, false);
ok('Programmet filtreres (7 skabelon-øvelser → 2)', progA.length === 7 && progFiltered.visible.length === 2, `${progFiltered.visible.length} af ${progA.length}`);
ok('Netop de udførte programøvelser står tilbage', progFiltered.visible.every(i => ['bench_press', 'lat_pulldown'].includes(i.exerciseId)));
ok('shoulder_press er skjult i programmet', !progFiltered.visible.some(i => i.exerciseId === 'shoulder_press'));
ok('De skjulte er dem man ikke laver', progFiltered.hidden.length === 5 && progFiltered.hidden.some(i => i.exerciseId === 'shoulder_press'));

// Upper B er et stærkt tilfælde: ingen af øvelserne er udført, men pull-up skal
// alligevel overleve, fordi den ikke kan føre vægthistorik.
const progB = getProgram('upper', 'B');
const progBFiltered = filterTrained(progB, 'upper', i => i.exerciseId, false);
ok('Upper B indeholder pull-up', progB.some(i => i.exerciseId === 'pull_up'));
ok('Pull-up overlever i et program hvor intet er udført', progBFiltered.visible.length === 1 && progBFiltered.visible[0].exerciseId === 'pull_up', JSON.stringify(progBFiltered.visible.map(i => i.exerciseId)));

store['gym_tracker_workouts'] = asDone([]);

console.log('\n── 10. Filopdeling (index.html + styles.css + app.js)');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
ok('index.html linker til styles.css', html.includes('<link rel="stylesheet" href="styles.css">'));
ok('index.html loader app.js', html.includes('<script src="app.js"></script>'));
ok('index.html har ingen inline <style>-blok tilbage', !/<style[\s>]/.test(html));
ok('index.html har ingen inline <script>-kode tilbage', !/<script(?![^>]*src=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html));
ok('styles.css er ikke tom', css.trim().length > 1000);
ok('app.js er ikke tom', script.trim().length > 1000);
ok('CSS-variablerne ligger i styles.css', css.includes(':root') && css.includes('--accent'));
ok('HTML-strukturen er stadig i index.html', html.includes('id="program-content"') && html.includes('id="exercise-list"'));
ok('Alle id\'er som app.js bruger findes i index.html', (() => {
    const used = new Set([...script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]));
    return [...used].every(id => html.includes(`id="${id}"`));
})());
ok('Alle klasser app.js slår op findes i styles.css eller index.html', (() => {
    const used = new Set([...script.matchAll(/querySelector(?:All)?\(['"`]\.([a-z-]+)/g)].map(m => m[1]));
    return [...used].every(c => css.includes('.' + c) || html.includes('class="' + c));
})());

console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);
process.exit(fail === 0 ? 0 : 1);