// Testharness for gym-tracker: kører appens JS uden browser og verificerer
// A/B-rotationen, program-integriteten og progressiv overload.
// Kør: node tests/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

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
        getCurrentVariant, calculateProgressiveOverload, programKey, formatDate, saveWorkouts, loadWorkouts };
    `,
    ctx
);

const {
    EXERCISES, ALL_EXERCISES, PROGRAMS, getProgram, getSuggestedVariant, getCurrentVariant,
    calculateProgressiveOverload, programKey,
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

console.log(`\n═══ ${pass} bestået, ${fail} fejlet ═══\n`);
process.exit(fail === 0 ? 0 : 1);