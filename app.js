    // ============================================================
    //  GYM TRACKER — Full Application
    // ============================================================

    // ─── Exercise Database ────────────────────────────────────────
    // Hver redskabsvariant er sin egen post. Grunden er teknisk, ikke kosmetisk:
    // 20 kg på en EZ-bar og 20 kg i hver hånd er ikke samme belastning, og
    // progressiv overload sammenligner tal — slås de sammen, bliver forslaget
    // forkert (fx "læg 2,5 kg på" baseret på en helt anden øvelse).
    //   equipment: hvilket redskab
    //   loadNote:  'per hand' / 'per leg' når vægten angives pr. side, ikke total
    const EXERCISES = {
        upper: [
            { id: 'bench_press',       name: 'Bench Press',              muscle: 'Chest',           compound: true,  equipment: 'Barbell' },
            { id: 'dumbbell_press',    name: 'Dumbbell Bench Press',     muscle: 'Chest',           compound: true,  equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'chest_press_machine', name: 'Chest Press (Machine)', muscle: 'Chest',           compound: true,  equipment: 'Machine' },
            { id: 'incline_dumbbell',  name: 'Incline Dumbbell Press',   muscle: 'Chest',           compound: true,  equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'dumbbell_fly',      name: 'Dumbbell Fly',             muscle: 'Chest',           compound: false, equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'cable_crossover',   name: 'Cable Crossover',          muscle: 'Chest',           compound: false, equipment: 'Cable' },
            { id: 'shoulder_press',    name: 'Shoulder Press',           muscle: 'Shoulders',       compound: true,  equipment: 'Barbell' },
            { id: 'dumbbell_shoulder_press', name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', compound: true,  equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'lateral_raise',     name: 'Lateral Raise',            muscle: 'Shoulders',       compound: false, equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'cable_lateral_raise', name: 'Cable Lateral Raise',    muscle: 'Shoulders',       compound: false, equipment: 'Cable' },
            { id: 'front_raise',       name: 'Front Raise',              muscle: 'Shoulders',       compound: false, equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'reverse_fly',       name: 'Reverse Fly',              muscle: 'Shoulders/Back',  compound: false, equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'cable_reverse_fly', name: 'Cable Reverse Fly',        muscle: 'Shoulders/Back',  compound: false, equipment: 'Cable' },
            { id: 'pull_up',           name: 'Pull-Up',                  muscle: 'Back',            compound: true,  equipment: 'Bodyweight' },
            { id: 'chin_up',           name: 'Chin-Up',                  muscle: 'Back/Biceps',     compound: true,  equipment: 'Bodyweight' },
            { id: 'lat_pulldown',      name: 'Lat Pulldown',             muscle: 'Back',            compound: true,  equipment: 'Cable' },
            { id: 'lat_extension',     name: 'Lat Extension',            muscle: 'Back',            compound: false, equipment: 'Cable' },
            { id: 'cable_row',         name: 'Seated Cable Row',         muscle: 'Back',            compound: true,  equipment: 'Cable' },
            { id: 'cable_row_per_hand', name: 'Cable Row',               muscle: 'Back',            compound: true,  equipment: 'Cable', loadNote: 'per hand' },
            { id: 'barbell_row',       name: 'Barbell Row',              muscle: 'Back',            compound: true,  equipment: 'Barbell' },
            { id: 'chest_supported_row', name: 'Chest Supported Row',    muscle: 'Back',            compound: true,  equipment: 'Machine/Dumbbell' },
            { id: 'face_pull',         name: 'Face Pull',                muscle: 'Shoulders/Back',  compound: false, equipment: 'Cable' },
            { id: 'bicep_curl',        name: 'Bicep Curl (Barbell)',     muscle: 'Biceps',          compound: false, equipment: 'Barbell' },
            { id: 'ez_bar_curl',       name: 'Bicep Curl (EZ-bar)',      muscle: 'Biceps',          compound: false, equipment: 'EZ-bar' },
            { id: 'dumbbell_curl',     name: 'Bicep Curl (Dumbbell)',    muscle: 'Biceps',          compound: false, equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'hammer_curl',       name: 'Hammer Curl',              muscle: 'Biceps',          compound: false, equipment: 'Dumbbell', loadNote: 'per hand' },
            { id: 'dual_bicep_cable_curl', name: 'Dual Bicep Cable Curl', muscle: 'Biceps',         compound: false, equipment: 'Cable' },
            { id: 'tricep_pushdown',   name: 'Tricep Pushdown',          muscle: 'Triceps',         compound: false, equipment: 'Cable' },
            { id: 'skull_crusher',     name: 'Skull Crusher',            muscle: 'Triceps',         compound: false, equipment: 'EZ-bar' },
            { id: 'overhead_tricep',   name: 'Overhead Tricep Extension', muscle: 'Triceps',        compound: false, equipment: 'Cable' },
            { id: 'dips',              name: 'Dips',                     muscle: 'Chest/Triceps',   compound: true,  equipment: 'Bodyweight' },
        ],
        lower: [
            { id: 'squat',             name: 'Squat',                    muscle: 'Quads/Glutes',    compound: true,  equipment: 'Barbell' },
            { id: 'deadlift',          name: 'Deadlift',                 muscle: 'Back/Hips',       compound: true,  equipment: 'Barbell' },
            { id: 'front_squat',       name: 'Front Squat',              muscle: 'Quads',           compound: true,  equipment: 'Barbell' },
            { id: 'leg_press',         name: 'Leg Press',                muscle: 'Quads',           compound: true,  equipment: 'Machine' },
            { id: 'hack_squat',        name: 'Hack Squat',               muscle: 'Quads',           compound: true,  equipment: 'Machine' },
            { id: 'bulgarian_split',   name: 'Bulgarian Split Squat',    muscle: 'Quads/Glutes',    compound: true,  equipment: 'Dumbbell', loadNote: 'per leg' },
            { id: 'lunges',            name: 'Lunges',                   muscle: 'Quads/Glutes',    compound: true,  equipment: 'Dumbbell', loadNote: 'per leg' },
            { id: 'romanian_deadlift', name: 'Romanian Deadlift',        muscle: 'Hamstrings/Glutes', compound: true, equipment: 'Barbell' },
            { id: 'cable_pull_through', name: 'Cable Pull-Through',       muscle: 'Hamstrings/Glutes', compound: true, equipment: 'Cable' },
            { id: 'back_extension',    name: 'Back Extension',           muscle: 'Lower back',      compound: false, equipment: 'Bodyweight' },
            { id: 'good_morning',      name: 'Good Morning',              muscle: 'Hamstrings/Lower back', compound: true, equipment: 'Barbell' },
            { id: 'leg_curl',          name: 'Leg Curl',                 muscle: 'Hamstrings',      compound: false, equipment: 'Machine' },
            { id: 'nordic_curl',       name: 'Nordic Hamstring Curl',     muscle: 'Hamstrings',      compound: false, equipment: 'Bodyweight' },
            { id: 'seated_leg_curl',   name: 'Seated Leg Curl',           muscle: 'Hamstrings',      compound: false, equipment: 'Machine' },
            { id: 'leg_extension',     name: 'Leg Extension',            muscle: 'Quads',           compound: false, equipment: 'Machine' },
            { id: 'hip_thrust',        name: 'Hip Thrust',               muscle: 'Glutes',          compound: true,  equipment: 'Barbell' },
            { id: 'glute_bridge',      name: 'Glute Bridge',             muscle: 'Glutes',          compound: false, equipment: 'Barbell' },
            { id: 'calf_raise',        name: 'Calf Raise',               muscle: 'Calves',          compound: false, equipment: 'Machine' },
            { id: 'calf_raise_leg_press', name: 'Calf Raise (Leg Press)', muscle: 'Calves',          compound: false, equipment: 'Machine' },
            { id: 'plank',             name: 'Plank',                    muscle: 'Abs',             compound: false, equipment: 'Bodyweight' },
            { id: 'cable_crunch',      name: 'Cable Crunch',             muscle: 'Abs',             compound: false, equipment: 'Cable' },
            { id: 'hanging_leg_raise', name: 'Hanging Leg Raise',        muscle: 'Abs',             compound: false, equipment: 'Bodyweight' },
        ]
    };

    // ─── Teknik-cues ──────────────────────────────────────────────
    // Én linje pr. øvelse, skrevet til at blive læst mens man står med vægten:
    // den vigtigste ting ved løftet, ikke en hel teknikbeskrivelse. Cues er på
    // engelsk som resten af UI'et; den længere tekst ligger i
    // ~/.hermes/Documents/gym-tracker/warmup-and-cues.md og holdes i sync i hånden.
    // Øvelser uden en cue viser ingen linje — det er ikke en fejl.
    const CUES = {
        // Chest
        bench_press:        'Shoulder blades tucked down and back, feet planted — same bar path every rep.',
        chest_press_machine: 'Handles at chest height, shoulder blades back and down, press to just short of lockout — no shrug.',
        dumbbell_press:     'Shoulder blades back, dumbbells at chest height, press up and slightly together.',
        incline_dumbbell:   'Bench slightly inclined, dumbbells over the chest — press up and together, stop before the elbows lock.',
        dumbbell_fly:       'Soft elbows, wide arc, stretch across the chest — no lower than shoulder height.',
        cable_crossover:    'Slight forward lean, elbows softly bent, cross in front of the chest and squeeze 1 s.',
        dips:               'Slight forward lean, elbows about 45° out — down until the upper arm is horizontal.',
        // Shoulders
        shoulder_press:     'Ribs down, bar from the front delts, press straight up, head through at lockout. If the lower back arches, it is too heavy.',
        dumbbell_shoulder_press: 'Ribs down, dumbbells over the shoulders, press up and slightly together. If the lower back arches, it is too heavy.',
        lateral_raise:      'Lead with the elbows, stop at shoulder height, no shrug, 2-3 s down. Light is the point.',
        cable_lateral_raise: 'Lead with the elbows, stop at shoulder height — the cable tempts you into too much weight.',
        front_raise:        'Lift to shoulder height with softly bent elbows, no swing from the torso.',
        reverse_fly:        'Slight forward lean, lift out to the sides with the elbows, stop at shoulder height — light is the point.',
        cable_reverse_fly:  'Slight forward lean, elbows out to the sides, squeeze between the shoulder blades.',
        face_pull:          'Pull toward the forehead, elbows high, external rotation at the top.',
        // Back
        pull_up:            'Full hang at the bottom, shoulders down, pull the chest to the bar — no swinging.',
        chin_up:            'Full hang at the bottom, elbows down to the pocket, chin over the bar — no swinging.',
        lat_pulldown:       'Chest up, 10-15° lean, drive the elbows to the hips — do not yank with the hands.',
        lat_extension:      'Elbows close to the body, stretch the lats, control the return.',
        cable_row:          'Chest tall, pull to the navel, squeeze 1 s. If you have to rock the torso, it is too heavy.',
        cable_row_per_hand: 'Chest tall, pull to the hip, no rotation in the torso.',
        barbell_row:        'Neutral spine, torso about 45°, pull the bar to the navel — no jerking with the lower back.',
        chest_supported_row: 'Chest supported the whole set, drive the elbows down and back, squeeze 1 s.',
        // Biceps
        bicep_curl:         'Elbows pinned at the sides, full stretch at the bottom, squeeze at the top — no swinging.',
        ez_bar_curl:        'Elbows pinned at the sides, full stretch at the bottom — no swinging from the torso.',
        dumbbell_curl:      'Elbows pinned at the sides, supinate on the way up, control the way down.',
        hammer_curl:        'Neutral wrist throughout, elbows pinned — no swinging.',
        dual_bicep_cable_curl: 'Elbows pinned, squeeze at the top, slow return.',
        // Triceps
        tricep_pushdown:    'Elbows locked in place pointing the same way — only the forearms move.',
        skull_crusher:      'Elbows locked in place pointing the same way — only the forearms move.',
        overhead_tricep:    'Elbows close to the head, full stretch at the bottom — only the forearms move.',
        // Legs
        squat:              'Bar over mid-foot, knees tracking out over the toes, same depth every rep.',
        front_squat:        'Elbows high, ribs down, torso upright — knees forward.',
        hack_squat:         'Back against the pad, whole foot down, knees over the toes — stop before the lower back rounds.',
        leg_press:          'Whole foot on the platform, knees over the toes, stop before the lower back rounds — no slamming into lockout.',
        bulgarian_split:    'Front foot far enough forward that the knee tracks over mid-foot, slight forward lean, back knee straight down.',
        lunges:             'Step so the knee tracks over mid-foot, torso upright, back knee down toward the floor.',
        romanian_deadlift:  'Hips back, bar close to the legs, stop when the hamstrings run out of stretch — not at the floor. 2-3 s down.',
        cable_pull_through: 'Hips back, rope close between the legs, glutes finish the rep — the spine stays still. A hinge, not a squat.',
        deadlift:           'Bar close to the legs, neutral spine, push the floor away — lock the hips, not the lower back.',
        leg_curl:           'Hips still, full stretch at the bottom, control the return.',
        nordic_curl:        'Knees on a pad, ankles anchored, lower as slowly as you can — hips stay open, no piking.',
        seated_leg_curl:    'Back against the pad, hips still, full stretch at the top of the movement, control the return.',
        good_morning:       'Bar on the upper back, soft knees, hips back until the hamstrings stretch — the back stays flat, the weight is light.',
        leg_extension:      'Knees still, squeeze at the top, control the way down — no swinging.',
        hip_thrust:         'Chin tucked, ribs down, posterior pelvic tilt at the top, push through the heels, 1 s squeeze.',
        glute_bridge:       'Heels in the floor, posterior pelvic tilt at the top, 1 s squeeze.',
        back_extension:     'Movement at the hip, neutral spine, squeeze the glutes at the top.',
        calf_raise:         'Full stretch at the bottom, 1 s pause, 1 s at the top — no bouncing.',
        calf_raise_leg_press: 'Same as the stack: full stretch, 1 s pause, 1 s at the top — the leg press tempts you into short reps.',
        // Abs
        plank:              'Ribs down, abs and glutes tight — straight line from shoulder to heel.',
        cable_crunch:       'Hips still, crunch with the abs not the arms, slow return.',
        hanging_leg_raise:  'No swinging, lift with the abs, control the way down.',
    };

    const ALL_EXERCISES = { upper: EXERCISES.upper, lower: EXERCISES.lower };

    // ─── Træningsprogrammer (A/B Split) ───────────────────────────────
    // Højst så mange øvelser pr. dag. Programmet ER dagens træning: appen indlæser
    // det ved åbning og ved skift af dag/variant — man bygger det ikke op selv.
    const MAX_PER_DAY = 6;

    // Hvad de fire pas er til. Fokus står i øverste bjælke, så man ikke skal gætte
    // hvad forskellen på A og B er: A er de tunge, få gentagelser med stang/maskine,
    // B er volumen med kabel og maskine, og benene er delt i bagkæde og forlår.
    const SESSION_FOCUS = {
        upperA: 'Heavy press · vertical pull',
        upperB: 'Volume · delts, arms & cables',
        lowerA: 'Hamstrings, glutes & hinge',
        lowerB: 'Quads, glutes & calves',
    };

    // Rækkefølgen de fire pas lægges i. Bruges til at se hvad der mangler i ugen, og
    // til at foreslå det næste pas (se nextSessionInWeek).
    // Ugens fire pas i den rækkefølge de trænes: overkrop og ben skiftevis, og A før B
    // for hver dag. Rækkefølgen er den man ser i ugebjælken — og den "næste pas"-logikken
    // læser, så forslaget følger træningsrækkefølgen og ikke A/B-parret.
    const SESSION_ORDER = ['upperA', 'lowerA', 'upperB', 'lowerB'];

    // Programmerne er bygget ud fra det han faktisk løfter (uge 41), og vægtene er
    // næste målsætning efter dobbelt-progression: 3 sæt over 8 gentagelser giver
    // mere vægt (2,5 kg overkrop / 5 kg ben), ellers tages gentagelserne først.
    // Har man historik for varianten, bruges *den* til tallene på kortet (se
    // sessionEntryFor) — skabelonens vægt er det man skal løfte, ikke det man løftede.
    //
    // Romanian Deadlift er bevidst ude: den belaster lænden. Cable Pull-Through står
    // i stedet i Lower A som hofte-hinge med kabel (lav aksial belastning), så
    // bevægelsesmønsteret ikke er væk.
    const PROGRAMS = {
        upperA: [
            { exerciseId: 'bench_press',        sets: 3, reps: 8,  weight: 67.5, note: 'Chest' },
            { exerciseId: 'shoulder_press',     sets: 3, reps: 8,  weight: 40,   note: 'Shoulders' },
            { exerciseId: 'lat_pulldown',       sets: 3, reps: 10, weight: 66,   note: 'Back' },
            { exerciseId: 'chest_supported_row', sets: 3, reps: 12, weight: 15,  note: 'Back' },
            { exerciseId: 'overhead_tricep',    sets: 3, reps: 10, weight: 27.5, note: 'Triceps' },
            { exerciseId: 'ez_bar_curl',        sets: 3, reps: 10, weight: 27.5, note: 'Biceps' },
        ],
        upperB: [
            { exerciseId: 'chest_supported_row', sets: 3, reps: 12, weight: 24,  note: 'Back' },
            { exerciseId: 'cable_lateral_raise', sets: 3, reps: 12, weight: 8,   note: 'Shoulders' },
            { exerciseId: 'face_pull',          sets: 3, reps: 12, weight: 15,   note: 'Shoulders/Back' },
            { exerciseId: 'cable_crossover',    sets: 3, reps: 10, weight: 12.5, note: 'Chest' },
            { exerciseId: 'dual_bicep_cable_curl', sets: 3, reps: 12, weight: 10, note: 'Biceps' },
            { exerciseId: 'tricep_pushdown',    sets: 3, reps: 10, weight: 30,   note: 'Triceps' },
        ],
        lowerA: [
            { exerciseId: 'cable_pull_through', sets: 3, reps: 12, weight: 20,  note: 'Hinge' },
            { exerciseId: 'leg_curl',           sets: 3, reps: 15, weight: 41,  note: 'Hamstrings' },
            { exerciseId: 'back_extension',     sets: 3, reps: 12, weight: 1,   note: 'Lower back' },
            { exerciseId: 'leg_press',          sets: 3, reps: 12, weight: 225, note: 'Quads' },
            { exerciseId: 'hip_thrust',         sets: 3, reps: 10, weight: 90,  note: 'Glutes' },
            { exerciseId: 'calf_raise',         sets: 3, reps: 15, weight: 130, note: 'Calves' },
        ],
        lowerB: [
            { exerciseId: 'leg_curl',           sets: 3, reps: 15, weight: 45,  note: 'Hamstrings' },
            { exerciseId: 'leg_extension',      sets: 3, reps: 12, weight: 70,  note: 'Quads' },
            { exerciseId: 'leg_press',          sets: 3, reps: 12, weight: 225, note: 'Quads' },
            { exerciseId: 'hip_thrust',         sets: 3, reps: 12, weight: 90,  note: 'Glutes' },
            { exerciseId: 'calf_raise_leg_press', sets: 3, reps: 15, weight: 215, note: 'Calves' },
        ],
    };

    // ─── Program rotation (A/B Split) ──────────────────────────────
    function programKey(day, variant) {
        return day + variant; // 'upperA' | 'upperB' | 'lowerA' | 'lowerB'
    }

    function getProgram(day, variant) {
        return PROGRAMS[programKey(day, variant)] || [];
    }

    // Foreslår næste variant ud fra hvad der mangler i den aktuelle uge, og ellers
    // ud fra rotationen. Ugen er delt i fire pas (SESSION_ORDER), og et pas tælles
    // som klaret hvis der ligger en gemt træning med samme dag+variant i ugen.
    function weekDone(today = getTodayStr()) {
        const key = isoWeekKey(today);
        const done = {};
        for (const w of loadWorkouts()) {
            if (!w.variant || isoWeekKey(w.date) !== key) continue;
            const k = programKey(w.day, w.variant);
            if (!SESSION_ORDER.includes(k)) continue;
            if (!done[k] || w.date > done[k].date) done[k] = { date: w.date, id: w.id };
        }
        return done;
    }

    function isDoneThisWeek(day, variant, today = getTodayStr()) {
        return !!weekDone(today)[programKey(day, variant)];
    }

    // Det næste pas der mangler i ugen, med skift mellem overkrop og ben, så man
    // ikke kommer til at køre to overkrops-pas i træk. null = ugen er fuld.
    function nextSessionInWeek(today = getTodayStr()) {
        const done = weekDone(today);
        const pending = SESSION_ORDER.filter(k => !done[k]);
        if (pending.length === 0) return null;
        const performed = loadWorkouts().filter(w => w.variant).sort((a, b) => a.date.localeCompare(b.date));
        const lastDay = performed.length ? performed[performed.length - 1].day : null;
        if (lastDay) {
            const other = pending.find(k => !k.startsWith(lastDay));
            if (other) return other;
        }
        return pending[0];
    }

    function getSuggestedVariant(day, today = getTodayStr()) {
        // 1. Det pas for dagen der ikke er klaret i ugen endnu.
        const done = weekDone(today);
        const pending = SESSION_ORDER.filter(k => k.startsWith(day) && !done[k]);
        if (pending.length) return pending[0].slice(-1);
        // 2. Begge pas for dagen er klaret: fald tilbage til rotationen, så man kan
        //    se den anden variant uden at skulle tænke over det.
        const workouts = loadWorkouts().filter(w => w.day === day && w.variant);
        if (workouts.length === 0) return 'A';
        workouts.sort((a, b) => a.date.localeCompare(b.date));
        return workouts[workouts.length - 1].variant === 'A' ? 'B' : 'A';
    }

    function getCurrentVariant() {
        return state.programVariant || getSuggestedVariant(state.currentDay);
    }

    // ─── State ────────────────────────────────────────────────────
    const state = {
        currentDay: 'upper',
        exercises: [], // { exerciseId, plan, sets: [{weight, reps}], targetReps }
        savedWorkouts: [], // loaded from localStorage
        programVariant: null, // null = brug foreslået variant, ellers 'A' | 'B'
        sessionVariant: null, // varianten programmet blev indlæst fra (gemmes med træningen)
        editing: null, // { id, date, day } når en gemt træning redigeres i stedet for at gemme ny
        openSwap: null, // skabelon-id på den øvelse hvis bytte-liste er åben
        allowDuplicateWeek: false, // sat når man bevidst gemmer samme pas to gange i ugen
    };

    // ─── Storage ──────────────────────────────────────────────────
    const STORAGE_KEY = 'gym_tracker_workouts';
    const DAY_KEY = 'gym_tracker_current_day';
    const SETTINGS_KEY = 'gym_tracker_settings';

    function loadWorkouts() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch { return []; }
    }

    function saveWorkouts(workouts) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
    }

    // Opdaterer en gemt træning på plads. Dato, dag og variant bevares — kun
    // øvelserne skiftes — så en træning man kommer tilbage til senere stadig
    // hører til den dag den blev lavet.
    function applyWorkoutEdit(workouts, id, exercises) {
        const idx = workouts.findIndex(w => w.id === id);
        if (idx < 0) return { ok: false, workouts, added: 0, removed: 0 };
        const before = workouts[idx].exercises.length;
        const next = workouts.slice();
        next[idx] = { ...workouts[idx], exercises };
        return {
            ok: true,
            workouts: next,
            added: Math.max(0, exercises.length - before),
            removed: Math.max(0, before - exercises.length),
        };
    }

    function loadCurrentDay() {
        return localStorage.getItem(DAY_KEY) || 'upper';
    }

    function saveCurrentDay(day) {
        localStorage.setItem(DAY_KEY, day);
    }

    function loadSettings() {
        try {
            const data = localStorage.getItem(SETTINGS_KEY);
            return data ? JSON.parse(data) : {};
        } catch { return {}; }
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    // ─── Toast System ─────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ─── Utility ──────────────────────────────────────────────────
    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    }

    function getTodayStr() {
        return new Date().toISOString().split('T')[0];
    }

    function getExerciseById(day, id) {
        return ALL_EXERCISES[day].find(e => e.id === id);
    }

    function getBestSet(workoutExercises, exerciseId) {
        const ex = workoutExercises.find(e => e.exerciseId === exerciseId);
        if (!ex || !ex.sets.length) return null;
        return ex.sets.reduce((best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) ? s : best, null);
    }

    // ─── Progressive Overload Engine ──────────────────────────────
    function calculateProgressiveOverload(exerciseId, day) {
        const workouts = loadWorkouts();
        const history = [];

        // Collect all sets for this exercise across all workouts
        for (const workout of workouts) {
            // Only look at workouts for the requested day
            if (workout.day !== day) continue;
            const dayExercises = workout.exercises || [];
            const exData = dayExercises.find(e => e.exerciseId === exerciseId);
            if (exData) {
                for (const set of exData.sets) {
                    history.push({
                        weight: set.weight,
                        reps: set.reps,
                        date: workout.date,
                        workoutId: workout.id,
                    });
                }
            }
        }

        if (history.length === 0) {
            return {
                suggestion: 'Start with 3 sets × 8 reps',
                detail: 'No history yet. Pick a weight you can do 8 clean reps with.',
                status: 'new',
            };
        }

        // Sort by weight desc, then reps desc
        history.sort((a, b) => b.weight - a.weight || b.reps - a.reps);
        const best = history[0];

        // Find most recent session
        const recent = history.slice().sort((a, b) => b.date.localeCompare(a.date))[0];

        // Double progression logic:
        // If you hit your target reps with current weight, increase weight by smallest increment
        // Smallest increment: 2.5 kg for upper, 5 kg for lower (or based on weight magnitude)
        const targetReps = recent.reps; // Use recent session's reps as the "target" to beat
        const currentWeight = recent.weight;

        // Calculate suggested overload
        let newWeight, newReps, strategy;

        // Check if we've been stagnant (same weight for 3+ unique sessions/days)
        const uniqueDates = new Set(history.map(h => h.date));
        const sameWeightSessions = [...uniqueDates].filter(date =>
            history.some(h => h.date === date && h.weight === currentWeight)
        ).length;

        if (sameWeightSessions >= 3 && currentWeight > 0) {
            // Stagnant — try increasing reps first, then weight
            strategy = 'rep_focus';
            newWeight = currentWeight;
            newReps = Math.min(targetReps + 2, 15);
            if (newReps > targetReps) {
                return {
                    suggestion: `${newReps} reps med ${currentWeight} kg`,
                    detail: `You have used ${currentWeight} kg across ${sameWeightSessions} sessions. Focus on more reps before adding weight.`,
                    status: 'stagnant',
                };
            }
        }

        // Standard double progression
        if (targetReps >= 8 && currentWeight >= 40) {
            // Heavy weight — smaller increments
            newWeight = Math.round((currentWeight + 2.5) * 2) / 2; // 2.5 kg increments
            newReps = targetReps;
            strategy = 'weight_up';
        } else if (targetReps >= 8) {
            newWeight = Math.round((currentWeight + 2.5) * 2) / 2;
            newReps = targetReps;
            strategy = 'weight_up';
        } else if (currentWeight > 0) {
            // Under 8 reps — focus on getting to 8 first
            newWeight = currentWeight;
            newReps = Math.min(targetReps + 1, 12);
            strategy = 'rep_up';
        } else {
            newWeight = 20;
            newReps = 8;
            strategy = 'start';
        }

        // Cap reasonable limits
        newWeight = Math.min(newWeight, 200);
        newReps = Math.min(newReps, 20);

        const lastBest = history.reduce((best, h) => (!best || h.weight > best.weight) ? h : best, null);

        return {
            suggestion: `${newWeight} kg × ${newReps} reps`,
            detail: lastBest
                ? `Bedst: ${lastBest.weight} kg × ${lastBest.reps} reps (${formatDate(lastBest.date)})`
                : `Seneste: ${currentWeight} kg × ${targetReps} reps`,
            status: strategy,
            lastWeight: currentWeight,
            lastReps: targetReps,
            bestWeight: lastBest ? lastBest.weight : null,
            bestReps: lastBest ? lastBest.reps : null,
        };
    }

    // ─── Opvarmningssæt ───────────────────────────────────────────
    // Rampen regnes ud fra arbejdsvægten (det tungeste sæt i øvelsen).
    //   Sammensat med stang:  stang → 50% → 70% → 85%
    //   Maskine/kabel:        50% → 75%
    //   Isolation:            ét let sæt (~60%)
    //   Kropsvægt:            ingen tal at rampe efter
    // Der rundes til 2,5 kg (stang/maskine), men til 1 kg for håndvægte —
    // hans center har 1 kg's spring i det område (derfor 3,5 og 5,5 kg).
    const WARMUP_BAR = { Barbell: 20, 'EZ-bar': 10 };
    const WARMUP_COMPOUND = [[0.5, 8], [0.7, 5], [0.85, 3]];
    const WARMUP_MACHINE = [[0.5, 10], [0.75, 6]];

    function roundToStep(value, step) {
        return Math.round(value / step) * step;
    }

    function warmupSets(workingWeight, exercise) {
        const weight = parseFloat(workingWeight) || 0;
        if (!exercise || weight <= 0 || exercise.equipment === 'Bodyweight') return [];

        const step = exercise.equipment === 'Dumbbell' ? 1 : 2.5;
        const out = [];
        const push = (w, reps) => {
            const rounded = roundToStep(w, step);
            if (rounded > 0 && rounded < weight && !out.some(s => s.weight === rounded)) {
                out.push({ weight: rounded, reps });
            }
        };

        if (!exercise.compound) {
            push(weight * 0.6, 12);
            return out;
        }

        const bar = WARMUP_BAR[exercise.equipment];
        if (bar) {
            if (bar < weight) out.push({ weight: bar, reps: 10 });
            for (const [pct, reps] of WARMUP_COMPOUND) push(weight * pct, reps);
        } else {
            for (const [pct, reps] of WARMUP_MACHINE) push(weight * pct, reps);
        }
        return out;
    }

    function formatWarmupSets(sets) {
        return sets.map(s => `${s.weight} × ${s.reps}`).join(' · ');
    }

    // Slår op i CUES på øvelsens id. Ukendt id eller manglende cue giver '' —
    // så en ny øvelse i databasen bare står uden linje i stedet for at fejle.
    function exerciseCue(exercise) {
        if (!exercise || !exercise.id) return '';
        return CUES[exercise.id] || '';
    }

    // Cue-linjen er ren tekst fra konstanten ovenfor (ingen brugerinput), så den
    // indsættes direkte — som resten af kortets markup.
    function renderCueLine(exercise) {
        const cue = exerciseCue(exercise);
        if (!cue) return '';
        return `<div class="cue-line">💡 ${cue}</div>`;
    }

    function renderWarmupBlock(exercise, workingWeight) {
        const sets = warmupSets(workingWeight, exercise);
        if (sets.length === 0) return '';

        const note = exercise.compound
            ? 'Ramp up to the working weight — never to failure, 60-90 s rest. Already warm from an earlier exercise? One light set is enough.'
            : 'One light set to prepare — not to failure.';

        return `
            <details class="warmup-block">
                <summary>
                    <span class="warmup-title">🔥 Warm-up</span>
                    <span class="warmup-count">${sets.length} sets · working weight ${workingWeight} kg</span>
                </summary>
                <div class="warmup-sets">
                    ${sets.map(s => `<span class="warmup-set">${s.weight} × ${s.reps}</span>`).join('')}
                </div>
                <div class="warmup-note">${note}</div>
            </details>
        `;
    }

    // Arbejdsvægten er det tungeste sæt i øvelsen lige nu. Er intet tastet endnu,
    // bruges den seneste vægt fra historikken, så rampen er der fra første sekund.
    function workingWeightFor(ex) {
        const max = Math.max(0, ...ex.sets.map(s => parseFloat(s.weight) || 0));
        if (max > 0) return max;
        const prog = calculateProgressiveOverload(ex.exerciseId, state.currentDay);
        return (prog && prog.lastWeight) || 0;
    }

    // ─── Husk sidste træning for en dag+variant ───────────────────
    // Den nyeste gemte træning for netop den dag og variant, eller null.
    function lastWorkoutFor(day, variant) {
        const mine = loadWorkouts().filter(w => w.day === day && w.variant === variant);
        if (mine.length === 0) return null;
        return mine.reduce((a, b) => (a.date >= b.date ? a : b));
    }

    // ─── Programmet for en dag+variant ────────────────────────────
    // Programmet ER dagens træning. Har man byttet en øvelse, huskes byttet for
    // netop den dag+variant. Nøglen er skabelon-øvelsens id, så en senere rettelse
    // i skabelonen ikke bliver overskrevet af et gammelt bytte.
    const SWAP_KEY = 'gym_tracker_program_swaps';

    function loadSwaps() {
        try {
            const data = localStorage.getItem(SWAP_KEY);
            return data ? JSON.parse(data) : {};
        } catch { return {}; }
    }

    function saveSwaps(swaps) {
        localStorage.setItem(SWAP_KEY, JSON.stringify(swaps));
    }

    // Programmet som det ser ud for mig: skabelonen med mine bytter lagt ind.
    function programItems(day, variant) {
        const swaps = loadSwaps()[programKey(day, variant)] || {};
        return getProgram(day, variant).slice(0, MAX_PER_DAY).map(item => {
            const wanted = swaps[item.exerciseId];
            const replacement = wanted && wanted !== item.exerciseId ? getExerciseById(day, wanted) : null;
            return replacement
                ? { ...item, exerciseId: replacement.id, swappedFrom: item.exerciseId }
                : { ...item };
        });
    }

    // Hvad en øvelse kan byttes til: samme muskelgruppe, og ikke en der allerede står
    // i dagens træning. Reglen læser muskelgruppen i EXERCISES, så en ny øvelse
    // kommer med i listerne af sig selv.
    // Øvelser der ikke må tilbydes som alternativ, selv om de deler muskelgruppe.
    // Romanian Deadlift belaster hans lænd, og skal ikke kunne vælges ved et uheld.
    const NEVER_OFFERED = ['romanian_deadlift'];

    // Muskelgrupperne står som 'Quads/Glutes', så et bytte matches på de enkelte
    // grupper og ikke på hele strengen: ellers fik fx Leg Press ('Quads') ingen
    // alternativer, selv om Bulgarian Split Squat ('Quads/Glutes') deler Quads med
    // den. Fuld match rangeres før delvis match, så listen bliver ved med at føles
    // som samme øvelse først.
    function muscleGroups(ex) {
        return String(ex.muscle || '').split('/').map(s => s.trim()).filter(Boolean);
    }

    function sharesMuscle(a, b) {
        const mine = muscleGroups(a);
        return muscleGroups(b).some(g => mine.includes(g));
    }

    function swapCandidates(day, exerciseId) {
        const ex = getExerciseById(day, exerciseId);
        if (!ex) return [];
        const inSession = new Set(state.exercises.map(e => e.exerciseId));
        const usable = ALL_EXERCISES[day].filter(e =>
            sharesMuscle(e, ex) && !NEVER_OFFERED.includes(e.id) &&
            (e.id === exerciseId || !inSession.has(e.id)));
        // Den nuværende øverst, derefter fuld muskelmatch, derefter delvis match.
        return usable.sort((a, b) => {
            if (a.id === exerciseId) return -1;
            if (b.id === exerciseId) return 1;
            const af = a.muscle === ex.muscle ? 0 : 1;
            const bf = b.muscle === ex.muscle ? 0 : 1;
            return af - bf;
        });
    }

    // Hvilken programrække en øvelse hører til i dag. Et bytte kan sættes i gang både
    // fra programrækken og fra øvelseskortet, så begge steder skal kunne finde slotten.
    // Er øvelsen ikke en del af programmet (fx hentet ind i hånden), er der intet at bytte.
    function slotForExercise(exerciseId) {
        const item = programItems(state.currentDay, getCurrentVariant())
            .find(i => i.exerciseId === exerciseId);
        return item ? (item.swappedFrom || item.exerciseId) : null;
    }

    // Gemmer byttet for dag+variant. Bytter man tilbage til skabelon-øvelsen,
    // fjernes overriden igen.
    function setSwap(day, variant, slotId, exerciseId) {
        const key = programKey(day, variant);
        const swaps = loadSwaps();
        const forKey = { ...(swaps[key] || {}) };
        if (exerciseId === slotId) delete forKey[slotId];
        else forKey[slotId] = exerciseId;
        if (Object.keys(forKey).length === 0) delete swaps[key];
        else swaps[key] = forKey;
        saveSwaps(swaps);
    }

    // Dagens træning ud fra programmet: samme vægt og antal sæt som sidst, ellers
    // skabelonens anbefaling. `plan` er anbefalingen og bliver vist på kortet, uanset
    // hvad man selv retter tallene til.
    function sessionEntryFor(item, last) {
        const remembered = last && (last.exercises || []).find(e =>
            e.exerciseId === item.exerciseId && e.sets.some(s => s.weight > 0 && s.reps > 0));
        const best = remembered ? remembered.sets.reduce((b, s) =>
            (!b || s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps)) ? s : b, null) : null;
        const reps = best ? best.reps : item.reps;
        return {
            exerciseId: item.exerciseId,
            plan: { sets: item.sets, reps: item.reps, weight: item.weight },
            sets: Array.from({ length: best ? remembered.sets.length : item.sets },
                () => ({ weight: best ? best.weight : item.weight, reps })),
            targetReps: reps,
        };
    }

    // Indlæser dagens program som dagens træning. Kaldes ved åbning og hver gang
    // dag eller variant skifter — der er ingen "tilføj"-knap mere.
    function loadProgram() {
        const variant = getCurrentVariant();
        const last = lastWorkoutFor(state.currentDay, variant);
        state.exercises = programItems(state.currentDay, variant).map(item => sessionEntryFor(item, last));
        // BEMÆRK: state.programVariant røres ikke her. Den betyder "brugeren har selv
        // valgt", og er den null, følger visningen rotationens forslag (getCurrentVariant).
        // Sættes den her til den udregnede variant, står der "chosen" i UI'et fra første
        // sekund, og forslaget kan ikke længere skifte af sig selv.
        state.sessionVariant = variant;
        state.editing = null;
        state.openSwap = null;
    }

    // ─── Eksempeldata (til at prøve appen uden at taste data ind) ──
    // Bruges fx i en preview på et andet domæne, hvor localStorage er tom: dér ville
    // filtreringen ikke kunne vise noget, fordi reglen er "vis alt når der ingen
    // historik er". Knappen tilbydes derfor KUN når loggen er tom eller udelukkende
    // indeholder eksempeldata — den kan altså aldrig overskrive rigtige træninger.
    function isSampleWorkout(w) {
        return !!w && w.sample === true;
    }

    function realWorkouts(workouts) {
        return workouts.filter(w => !isSampleWorkout(w));
    }

    // Mandag i den uge datoen ligger i (ISO-ugen starter mandag)
    function mondayOf(date) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d;
    }

    // Tre hele uger med A/B-historik. Ugens fire træninger rammer de ugedage
    // rotationen selv foreslår (Upper A → Lower A → Upper B → Lower B), og vægten
    // stiger lidt for hver uge, så progression, filtrering og uge-deling alle har
    // noget at vise. Øvelserne kommer fra appens egne programmer, så id'er og
    // sæt-antal ikke kan drive fra virkeligheden.
    function buildSampleWorkouts(today = new Date()) {
        const monday = mondayOf(today);
        const slots = [
            { day: 'upper', variant: 'A', offset: 0 },
            { day: 'lower', variant: 'A', offset: 1 },
            { day: 'upper', variant: 'B', offset: 3 },
            { day: 'lower', variant: 'B', offset: 4 },
        ];
        const out = [];
        for (let back = 2; back >= 0; back--) {
            const gained = 2 - back; // 0, 1 eller 2 ugers fremgang
            for (const slot of slots) {
                const d = new Date(monday);
                d.setDate(monday.getDate() - back * 7 + slot.offset);
                const step = slot.day === 'lower' ? 5 : 2.5;
                out.push({
                    id: `sample-${isoDate(d)}-${slot.day}${slot.variant}`,
                    date: isoDate(d),
                    day: slot.day,
                    variant: slot.variant,
                    sample: true,
                    exercises: getProgram(slot.day, slot.variant).map(item => ({
                        exerciseId: item.exerciseId,
                        // Samme regel som saveWorkout: kun sæt med vægt over 0 gemmes.
                        // Kropsvægtøvelser (plank, pull-up) falder derfor ud af loggen
                        // her — præcis som de ville i virkeligheden. At de så stadig
                        // står i programmet er kropsvægt-undtagelsen, ikke held.
                        sets: Array.from({ length: item.sets }, () => ({
                            weight: item.weight > 0 ? item.weight + gained * step : 0,
                            reps: item.reps,
                        })).filter(s => s.weight > 0 && s.reps > 0),
                    })).filter(ex => ex.sets.length > 0),
                });
            }
        }
        return out;
    }

    function renderSampleControls() {
        const section = document.getElementById('sample-section');
        const btn = document.getElementById('sample-btn');
        const note = document.getElementById('sample-note');
        if (!section || !btn) return;

        const workouts = loadWorkouts();

        // Hele blokken vises KUN når loggen er tom eller udelukkende indeholder
        // eksempeldata. Så snart der ligger én rigtig træning, forsvinder den —
        // ikke bare knappen. Ellers stod overskriften og teksten tilbage uden
        // nogen knap, og så ser det ud som om noget mangler.
        if (realWorkouts(workouts).length > 0) {
            section.classList.add('hidden');
            btn.disabled = true;
            return;
        }

        section.classList.remove('hidden');
        btn.disabled = false;
        if (workouts.length > 0) {
            btn.textContent = `Clear sample data (${workouts.length} workouts)`;
            if (note) note.textContent = 'The log holds sample data only — you can remove it again here.';
        } else {
            btn.textContent = 'Load sample data';
            if (note) note.textContent = 'Writes three weeks of A/B history so rotation, the program and sharing can be tried right away.';
        }
    }

    function toggleSampleData() {
        const workouts = loadWorkouts();
        if (realWorkouts(workouts).length > 0) {
            showToast('Sample data does not touch your real workouts', 'info');
            renderSampleControls();
            return;
        }
        if (workouts.length > 0) {
            saveWorkouts([]);
            showToast('Sample data cleared', 'info');
        } else {
            const samples = buildSampleWorkouts();
            saveWorkouts(samples);
            showToast(`${samples.length} sample workouts loaded`, 'success');
        }
        renderAll();
    }

    // ─── Render Functions ─────────────────────────────────────────
    // Øverste bjælke: hvad passet er, hvilke af ugens fire pas der er klaret, og en
    // advarsel hvis man er ved at gemme det samme pas to gange i samme uge.
    // Selve øvelserne står kun ét sted: på kortene i listen nedenfor.
    function sessionHasKey(key) { return SESSION_ORDER.indexOf(key) !== -1; }

    // 'upperA' → { day: 'upper', variant: 'A', label: 'Upper A' }
    function parseKey(key) {
        return { day: key.slice(0, -1), variant: key.slice(-1), label: sessionLabel(key) };
    }

    function sessionLabel(key) {
        const day = key.slice(0, -1);
        return `${day === 'upper' ? 'Upper' : 'Lower'} ${key.slice(-1)}`;
    }

    function renderSessionBar() {
        const variant = getCurrentVariant();
        const key = programKey(state.currentDay, variant);
        const dayLabel = state.currentDay === 'upper' ? 'Upper' : 'Lower';
        const label = document.getElementById('session-label');
        const focusEl = document.getElementById('session-focus');
        const hint = document.getElementById('variant-hint');
        const memory = document.getElementById('program-memory');
        const strip = document.getElementById('week-strip');
        const warning = document.getElementById('session-warning');
        const last = lastWorkoutFor(state.currentDay, variant);

        if (label) label.textContent = `${dayLabel} ${variant}`;
        if (focusEl) focusEl.textContent = SESSION_FOCUS[key] || '';
        if (hint) hint.textContent = state.programVariant ? 'chosen' : 'suggested';

        // Ugen: ét felt pr. pas, med ✓ og dato for dem der allerede ligger der.
        const done = weekDone();
        const next = nextSessionInWeek();
        const week = isoWeekInfo(getTodayStr());
        if (strip) {
            strip.innerHTML = `<span class="week-label">Week ${week.week}</span>` + SESSION_ORDER.map(k => {
                const info = parseKey(k);
                const d = done[k];
                const cls = ['week-chip', d ? 'done' : '', k === key ? 'current' : '', next === k ? 'next' : '']
                    .filter(Boolean).join(' ');
                const tail = d ? '✓' : (next === k ? 'next' : '');
                return `<button class="${cls}" data-session="${k}">${info.label}${tail ? ' ' + tail : ''}</button>`;
            }).join('');
        }

        // Hvor tallene kommer fra.
        if (memory) {
            memory.classList.remove('hidden');
            memory.textContent = last
                ? `↩︎ Same exercises and weights as your ${dayLabel} ${variant} on ${formatDate(last.date)}.`
                : `Your ${dayLabel} ${variant} program — ready to go.`;
        }

        // Lås: samme dag+variant to gange i samme uge. Man kan se passet, men ikke
        // gemme det, før man enten skifter pas eller siger "log anyway".
        const conflict = weekConflict();
        if (warning) {
            if (!conflict) {
                warning.classList.add('hidden');
                warning.innerHTML = '';
            } else {
                warning.classList.remove('hidden');
                const nextLabel = next ? sessionLabel(next) : null;
                warning.innerHTML = `
                    <span class="session-warn-text">⚠️ ${dayLabel} ${variant} is already logged this week (${weekdayOf(conflict.date)} ${shortDate(conflict.date)})${nextLabel ? ` — ${nextLabel} is next` : ''}.</span>
                    ${nextLabel ? `<button class="btn-next-session" id="btn-next-session">Go to ${nextLabel}</button>` : ''}
                    <button class="btn-log-anyway" id="btn-log-anyway">Log anyway</button>
                `;
            }
        }
    }

    // Bytte-listen under øvelsesnavnet. Kun øvelser i samme muskelgruppe (se
    // swapCandidates), med den nuværende øverst markeret.
    function renderSwapMenu(slotId, ex, candidates) {
        return `
            <div class="swap-menu" data-swap-slot="${slotId}">
                ${candidates.map(c => `
                    <button class="swap-option${c.id === ex.id ? ' current' : ''}"
                            data-swap-slot="${slotId}" data-swap-id="${c.id}">
                        <span class="swap-option-name">${escapeHtml(c.name)}</span>
                        <span class="swap-option-meta">${c.equipment || ''}${c.loadNote ? ' · ' + c.loadNote : ''}</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    function renderExerciseList() {
        const list = document.getElementById('exercise-list');
        const count = document.getElementById('exercise-count');
        const hint = document.getElementById('exercise-hint');

        if (state.exercises.length === 0) {
            list.innerHTML = `
                <div class="no-exercises-msg">
                    <span class="emoji">🏋️</span>
                    <p>No exercises in today's program</p>
                    <p style="font-size:0.8rem; margin-top:4px;">Pick another day above, or swap an exercise on the program list</p>
                </div>
            `;
            count.textContent = '0';
            if (hint) hint.textContent = '';
            const restoreEmpty = document.getElementById('exercise-restore');
            if (restoreEmpty) { restoreEmpty.classList.add('hidden'); restoreEmpty.innerHTML = ''; }
            return;
        }

        count.textContent = state.exercises.length;

        // Hvorfor navnene kan trykkes på: det er ikke alle kort der har noget at bytte
        // til (Leg Curl er alene i sin muskelgruppe), så hintet vises kun når mindst ét
        // kort faktisk har en bytte-liste.
        const swappable = state.exercises.some(ex => {
            const slot = slotForExercise(ex.exerciseId);
            return slot && swapCandidates(state.currentDay, ex.exerciseId).length > 1;
        });
        if (hint) hint.textContent = swappable ? 'Tap a name to swap' : '';

        // Er der fjernet noget fra dagens træning, kan det hentes tilbage her —
        // det var før programlisten der gjorde det.
        const removed = missingExerciseCount();
        const restore = document.getElementById('exercise-restore');
        if (restore) {
            restore.classList.toggle('hidden', removed === 0);
            restore.innerHTML = removed === 0 ? '' : `
                <button class="btn-restore" id="btn-restore">
                    ↩︎ ${removed === 1 ? '1 exercise removed' : removed + ' exercises removed'} — restore
                </button>`;
        }

        list.innerHTML = state.exercises.map((ex, idx) => {
            const exercise = getExerciseById(state.currentDay, ex.exerciseId);
            if (!exercise) return '';

            const totalVolume = ex.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
            const maxVolume = Math.max(...ex.sets.map(s => s.weight * s.reps), 0);
            // Anbefalingen fra programmet. Den bliver stående, også når man retter
            // antal sæt, vægt eller reps — det er hele pointen med den.
            const plan = ex.plan
                ? `${ex.plan.sets} × ${ex.plan.reps}${ex.plan.weight > 0 ? ' @ ' + ex.plan.weight + ' kg' : ''}`
                : '';

            // Navnet er et bytte, hvis øvelsen har noget at bytte til: samme
            // muskelgruppe, minus det der allerede står i dagens træning. Samme liste
            // som programrækken bruger, så de to steder altid viser det samme.
            const slot = slotForExercise(ex.exerciseId);
            const candidates = slot ? swapCandidates(state.currentDay, ex.exerciseId) : [];
            const swapOpen = !!slot && state.openSwap === slot;
            const nameMarkup = candidates.length > 1
                ? `<button class="exercise-name-btn${swapOpen ? ' open' : ''}" data-swap-slot="${slot}"
                           aria-expanded="${swapOpen}" title="Change exercise">${exercise.name}<span class="swap-caret">▾</span></button>`
                : `<div class="exercise-name">${exercise.name}</div>`;

            return `
                <div class="exercise-card" data-index="${idx}" data-exercise-id="${ex.exerciseId}">
                    <div class="exercise-card-header">
                        <div class="exercise-card-main">
                            ${nameMarkup}
                            <div class="exercise-meta">
                                <span class="tag ${exercise.compound ? 'compound' : 'isolation'}">
                                    ${exercise.compound ? '⨯ Compound' : '⊕ Isolation'}
                                </span>
                                <span class="tag equip">${exercise.equipment || ''}</span>
                                <span>${exercise.muscle}</span>
                                ${exercise.loadNote ? `<span class="tag load">${exercise.loadNote}</span>` : ''}
                            </div>
                        </div>
                        <button class="remove-btn" data-index="${idx}" aria-label="Remove exercise">✕</button>
                    </div>
                    ${plan ? `<div class="exercise-target">🎯 Recommended: ${plan}</div>` : ''}
                    ${swapOpen ? renderSwapMenu(slot, exercise, candidates) : ''}
                    ${renderCueLine(exercise)}
                    <div class="warmup-holder">${renderWarmupBlock(exercise, workingWeightFor(ex))}</div>
                    <table class="sets-table">
                        <thead>
                            <tr>
                                <th style="width:32px">#</th>
                                <th>Weight (kg)</th>
                                <th>Reps</th>
                                <th style="text-align:right">Volume (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ex.sets.map((set, si) => `
                                <tr>
                                    <td class="set-num">${si + 1}</td>
                                    <td>
                                        <input type="number"
                                               class="set-weight"
                                               data-ex-index="${idx}"
                                               data-set-index="${si}"
                                               value="${set.weight}"
                                               min="0"
                                               step="0.5"
                                               placeholder="0">
                                    </td>
                                    <td>
                                        <input type="number"
                                               class="set-reps"
                                               data-ex-index="${idx}"
                                               data-set-index="${si}"
                                               value="${set.reps}"
                                               min="0"
                                               step="1"
                                               placeholder="0">
                                    </td>
                                    <td class="volume-cell ${maxVolume > 0 && (set.weight * set.reps) === maxVolume ? 'high' : ''}">
                                        ${set.weight > 0 && set.reps > 0 ? (set.weight * set.reps).toFixed(0) : '—'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="set-actions">
                        <button class="add-set-btn" data-ex-index="${idx}">
                            ＋ Add set
                        </button>
                        <button class="remove-set-btn" data-ex-index="${idx}" ${ex.sets.length <= 1 ? 'disabled' : ''}>
                            − Remove set
                        </button>
                    </div>
                    <div class="exercise-volume">
                        <span>Total volume</span>
                        <span class="total">${totalVolume.toFixed(0)} kg</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderSaveBar() {
        const info = document.getElementById('save-info');
        const btn = document.getElementById('save-btn');
        const banner = document.getElementById('edit-banner');

        // Redigeringstilstand: vis hvilken træning der opdateres, og skift knappens tekst
        if (state.editing) {
            banner.classList.remove('hidden');
            document.getElementById('edit-banner-text').textContent =
                `✏️ Editing ${state.editing.day === 'upper' ? 'Upper' : 'Lower'} from ${formatDate(state.editing.date)}`;
            btn.textContent = '💾 Update workout';
            document.body.classList.add('editing');
        } else {
            banner.classList.add('hidden');
            btn.textContent = '💾 Save workout';
            document.body.classList.remove('editing');
        }

        const exerciseCount = state.exercises.length;
        const hasSets = state.exercises.some(ex => ex.sets.some(s => s.weight > 0 && s.reps > 0));
        // Låst pas: samme dag+variant ligger allerede i ugen. Knappen er aktiv, så
        // man kan se hvorfor den ikke virker — den viser fejlen i stedet for at gemme.
        const conflict = weekConflict();

        if (exerciseCount === 0) {
            info.innerHTML = 'No exercises in today&#39;s program';
            btn.disabled = true;
        } else if (!hasSets) {
            info.innerHTML = `<strong>${exerciseCount}</strong> of ${MAX_PER_DAY} exercises · fill in the sets`;
            btn.disabled = true;
        } else {
            const totalVolume = state.exercises.reduce((sum, ex) =>
                sum + ex.sets.reduce((s, set) => s + (set.weight * set.reps), 0), 0
            );
            info.innerHTML = `<strong>${exerciseCount}</strong> of ${MAX_PER_DAY} exercises · <strong>${totalVolume.toFixed(0)} kg</strong> total`;
            btn.disabled = false;
        }

        if (conflict && btn.disabled === false) {
            info.innerHTML = `🔒 ${state.currentDay === 'upper' ? 'Upper' : 'Lower'} ${getCurrentVariant()} is already logged this week · tap Save to see the options`;
        }
    }

    function renderAll() {
        renderSessionBar();
        renderExerciseList();
        renderSaveBar();
        renderSampleControls();
    }

    // ─── Ugen: hvad der er klaret, og hvad der mangler ────────────
    // Låsen: man kan ikke gemme samme dag+variant to gange i samme uge. Man kan
    // stadig se passet og rette tallene; det er først ved gem at det bremser, og
    // "Log anyway" i bjælken lukker op hvis man bevidst vil køre et pas igen.
    function weekConflict(today = getTodayStr()) {
        if (state.editing || state.allowDuplicateWeek) return null;
        const variant = getCurrentVariant();
        const found = weekDone(today)[programKey(state.currentDay, variant)];
        if (!found) return null;
        // Samme dag: det er den træning man er ved at overskrive/rette (den adfærd er
        // bekræftet ønsket). Låsen gælder kun et pas fra en anden dag i ugen.
        if (found.date === today) return null;
        return found;
    }

    // Henter de programrækker tilbage man har fjernet fra dagens træning, på deres
    // plads i programmet, uden at røre de tal der allerede er skrevet ind.
    function restoreMissingExercises() {
        const variant = getCurrentVariant();
        const items = programItems(state.currentDay, variant);
        let restored = 0;
        items.forEach((item, idx) => {
            if (restored + state.exercises.length >= MAX_PER_DAY) return;
            if (state.exercises.some(e => e.exerciseId === item.exerciseId)) return;
            const entry = sessionEntryFor(item, lastWorkoutFor(state.currentDay, variant));
            // Læg den på programmets plads, så rækkefølgen følger programmet.
            const at = Math.min(idx, state.exercises.length);
            state.exercises.splice(at, 0, entry);
            restored++;
        });
        renderAll();
        showToast(restored === 1 ? '1 exercise restored' : `${restored} exercises restored`, 'success');
        return restored;
    }

    // Antal programrækker der mangler i dagens træning (til "hent tilbage"-linjen).
    function missingExerciseCount() {
        const variant = getCurrentVariant();
        return programItems(state.currentDay, variant)
            .filter(item => !state.exercises.some(e => e.exerciseId === item.exerciseId)).length;
    }

    // ─── Program handling (A/B) ───────────────────────────────────
    // Lægger en øvelse ind i dagens træning: bruges når man henter en fjernet
    // programrække tilbage, og fra "Næste uge"-listen. Der kan højst stå
    // MAX_PER_DAY øvelser pr. dag — vil man have en anden, bytter man i stedet.
    function addExerciseToSession(exerciseId) {
        if (state.exercises.some(e => e.exerciseId === exerciseId)) {
            showToast('Exercise is already in today\'s workout', 'info');
            return false;
        }
        if (state.exercises.length >= MAX_PER_DAY) {
            showToast(`Max ${MAX_PER_DAY} exercises a day — swap one instead`, 'info');
            return false;
        }
        const exercise = getExerciseById(state.currentDay, exerciseId);
        if (!exercise) return false;

        const variant = getCurrentVariant();
        const item = programItems(state.currentDay, variant).find(i => i.exerciseId === exerciseId);
        if (item) {
            // Står øvelsen i programmet, er det programmets tal der gælder.
            state.exercises.push(sessionEntryFor(item, lastWorkoutFor(state.currentDay, variant)));
        } else {
            const prog = calculateProgressiveOverload(exerciseId, state.currentDay);
            const weight = parseFloat((prog.suggestion.match(/([\d.]+)\s*kg/) || [])[1]) || prog.lastWeight || 20;
            const reps = parseInt((prog.suggestion.match(/(\d+)\s*reps/) || [])[1]) || 8;
            state.exercises.push({
                exerciseId,
                plan: { sets: 3, reps, weight },
                sets: Array.from({ length: 3 }, () => ({ weight, reps })),
                targetReps: reps,
            });
        }
        renderAll();
        showToast(`${exercise.name} added`, 'success');
        return true;
    }

    // Bytter øvelsen i en programrække. Byttet huskes for dag+variant, og den
    // øvelse der stod i rækken skiftes ud på samme plads i dagens træning — med
    // de tal der hører til den nye øvelse. Har man fjernet rækken fra dagens
    // træning, bliver den ikke lagt ind igen af et bytte.
    function swapExercise(slotId, exerciseId) {
        const variant = getCurrentVariant();
        const before = programItems(state.currentDay, variant)
            .find(i => (i.swappedFrom || i.exerciseId) === slotId);
        const previousId = before ? before.exerciseId : null;
        if (!previousId || previousId === exerciseId) {
            state.openSwap = null;
            renderAll();
            return;
        }
        // Ingen dubletter: en øvelse der allerede står i dagens træning kan ikke
        // byttes ind (bytte-listen tilbyder den heller ikke).
        if (state.exercises.some(e => e.exerciseId === exerciseId)) {
            state.openSwap = null;
            renderAll();
            showToast('That exercise is already in today\'s workout', 'info');
            return;
        }

        setSwap(state.currentDay, variant, slotId, exerciseId);

        const idx = state.exercises.findIndex(e => e.exerciseId === previousId);
        if (idx >= 0) {
            const item = programItems(state.currentDay, variant).find(i => i.exerciseId === exerciseId);
            if (item) {
                state.exercises[idx] = sessionEntryFor(item, lastWorkoutFor(state.currentDay, variant));
            }
        }
        state.openSwap = null;
        const ex = getExerciseById(state.currentDay, exerciseId);
        const dayLabel = state.currentDay === 'upper' ? 'Upper' : 'Lower';
        renderAll();
        showToast(`${ex ? ex.name : 'Exercise'} swapped in — remembered for ${dayLabel} ${variant}`, 'success');
    }

    function removeExercise(index) {
        const removed = state.exercises[index];
        state.exercises.splice(index, 1);
        renderAll();
        if (removed) {
            const exercise = getExerciseById(state.currentDay, removed.exerciseId);
            showToast(`${exercise ? exercise.name : 'Exercise'} removed`, 'info');
        }
    }

    function addSet(exIndex) {
        const ex = state.exercises[exIndex];
        if (!ex) return;
        const lastSet = ex.sets[ex.sets.length - 1];
        ex.sets.push({
            weight: lastSet ? lastSet.weight : 20,
            reps: lastSet ? lastSet.reps : 8,
        });
        renderAll();
    }

    // Man må gerne løfte færre sæt end programmet anbefaler — anbefalingen blir
    // stående på kortet, mens antallet af sæt er ens eget.
    function removeSet(exIndex) {
        const ex = state.exercises[exIndex];
        if (!ex || ex.sets.length <= 1) return;
        ex.sets.pop();
        renderAll();
    }

    function updateSet(exIndex, setIndex, field, value) {
        const ex = state.exercises[exIndex];
        if (!ex || !ex.sets[setIndex]) return;
        const numValue = field === 'weight' ? parseFloat(value) || 0 : parseInt(value) || 0;
        ex.sets[setIndex][field] = numValue;
        renderSaveBar();
        // Update volume cell in real-time
        updateVolumeCell(exIndex, setIndex);
        // Opvarmningen hænger på arbejdsvægten og skal følge med, uden at kortet
        // tegnes forfra (det ville lukke ramp'en og stjæle fokus fra feltet)
        updateWarmupBlock(exIndex);
    }

    function updateWarmupBlock(exIndex) {
        const ex = state.exercises[exIndex];
        if (!ex) return;
        const card = document.querySelector(`.exercise-card[data-index="${exIndex}"]`);
        const holder = card && card.querySelector('.warmup-holder');
        if (!holder) return;
        const exercise = getExerciseById(state.currentDay, ex.exerciseId);
        if (!exercise) return;

        const existing = holder.querySelector('.warmup-block');
        const wasOpen = !!(existing && existing.open);
        holder.innerHTML = renderWarmupBlock(exercise, workingWeightFor(ex));
        if (wasOpen) {
            const details = holder.querySelector('.warmup-block');
            if (details) details.open = true;
        }
    }

    function updateVolumeCell(exIndex, setIndex) {
        const ex = state.exercises[exIndex];
        if (!ex) return;
        const card = document.querySelector(`.exercise-card[data-index="${exIndex}"]`);
        if (!card) return;
        const td = card.querySelectorAll('.volume-cell')[setIndex];
        if (!td) return;
        const weight = ex.sets[setIndex].weight;
        const reps = ex.sets[setIndex].reps;
        td.textContent = (weight > 0 && reps > 0) ? (weight * reps).toFixed(0) : '—';
        td.classList.toggle('high', false);
        // Update total
        const totalEl = card.querySelector('.exercise-volume .total');
        const total = ex.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
        totalEl.textContent = total.toFixed(0) + ' kg';
    }

    function saveWorkout() {
        const today = getTodayStr();
        let workouts = loadWorkouts();

        // Lås: samme dag+variant to gange i samme uge. Bremser her (efter tallene er
        // skrevet ind), så man får en forklaring i stedet for bare at kunne gemme.
        const conflict = weekConflict();
        if (conflict) {
            const next = nextSessionInWeek();
            showToast(
                `${state.currentDay === 'upper' ? 'Upper' : 'Lower'} ${getCurrentVariant()} is already logged ${weekdayOf(conflict.date)}` +
                (next ? ` — do ${sessionLabel(next)} instead (or tap "Log anyway")` : ' — tap "Log anyway" to save a second pass'),
                'info'
            );
            return;
        }

        const cleanExercises = state.exercises
            .map(ex => ({
                exerciseId: ex.exerciseId,
                sets: ex.sets.filter(s => s.weight > 0 && s.reps > 0).map(s => ({
                    weight: s.weight,
                    reps: s.reps,
                })),
            }))
            .filter(ex => ex.sets.length > 0);

        if (cleanExercises.length === 0) {
            showToast('No sets to save — fill in weight and reps', 'info');
            return;
        }

        // Redigering af en gemt træning: opdater den i stedet for at oprette en ny
        if (state.editing) {
            const res = applyWorkoutEdit(workouts, state.editing.id, cleanExercises);
            if (!res.ok) {
                showToast('Workout no longer exists', 'error');
                state.editing = null;
                renderAll();
                return;
            }
            saveWorkouts(res.workouts);
            state.editing = null;
            state.programVariant = null;
            state.sessionVariant = null;
            loadProgram();
            renderAll();
            if (res.added > 0) {
                showToast(`Workout updated — ${res.added} exercise${res.added === 1 ? '' : 's'} added`, 'success');
            } else if (res.removed > 0) {
                showToast(`Workout updated — ${res.removed} exercise${res.removed === 1 ? '' : 's'} removed`, 'success');
            } else {
                showToast('Workout updated', 'success');
            }
            return;
        }

        // Bevidst adfærd: gemmer man igen samme dag og dagstype, overskrives den
        // gemte træning frem for at der laves en ny. Det er bekræftet ønsket —
        // ret det ikke uden at spørge.
        const existingIdx = workouts.findIndex(w => w.date === today && w.day === state.currentDay);

        const workoutData = {
            id: existingIdx >= 0 ? workouts[existingIdx].id : `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            date: today,
            day: state.currentDay,
            variant: state.sessionVariant || getCurrentVariant(),
            exercises: cleanExercises,
        };

        if (existingIdx >= 0) {
            workouts[existingIdx] = workoutData;
            showToast('Workout updated', 'success');
        } else {
            workouts.push(workoutData);
            showToast('Workout saved!', 'success');
        }

        saveWorkouts(workouts);
        // Efter et gem er det næste variant i rotationen der er dagens program,
        // og den indlæses med det samme — programmet ER dagens træning.
        state.programVariant = null;
        state.sessionVariant = null;
        state.allowDuplicateWeek = false; // passet ligger nu i ugen; låsen gælder igen
        loadProgram();
        renderAll();
    }

    // ─── Redigering af gemte træninger ────────────────────────────
    function startEditWorkout(id) {
        const workout = loadWorkouts().find(w => w.id === id);
        if (!workout) {
            showToast('Could not find the workout', 'error');
            return;
        }

        state.currentDay = workout.day;
        saveCurrentDay(workout.day);
        state.editing = { id: workout.id, date: workout.date, day: workout.day };
        state.programVariant = workout.variant;
        state.sessionVariant = workout.variant;

        // Indlæs øvelserne i editoren. Ukendte id'er (fx en øvelse der er fjernet
        // fra databasen) springes over, så editoren ikke knækker.
        const loaded = [];
        const skipped = [];
        for (const ex of workout.exercises) {
            if (!getExerciseById(workout.day, ex.exerciseId)) {
                skipped.push(ex.exerciseId);
                continue;
            }
            const sets = ex.sets.map(s => ({ weight: s.weight, reps: s.reps }));
            loaded.push({
                exerciseId: ex.exerciseId,
                sets,
                targetReps: sets.length ? sets[sets.length - 1].reps : 8,
            });
        }
        state.exercises = loaded;

        closeHistory();
        renderAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const label = `${workout.day === 'upper' ? 'Upper' : 'Lower'} from ${formatDate(workout.date)}`;
        if (skipped.length > 0) {
            showToast(`Editing ${label} — ${skipped.length} unknown exercise skipped`, 'info');
        } else {
            showToast(`Editing ${label}`, 'info');
        }
    }

    function cancelEdit() {
        if (!state.editing) return;
        state.editing = null;
        state.programVariant = null;
        state.sessionVariant = null;
        loadProgram();
        renderAll();
        showToast('Edit cancelled — the workout is unchanged', 'info');
    }

    function showHistory() {
        const workouts = loadWorkouts();
        const content = document.getElementById('history-content');
        const overlay = document.getElementById('history-overlay');
        const panel = document.getElementById('history-panel');

        if (workouts.length === 0) {
            content.innerHTML = `
                <div class="history-empty">
                    <span class="emoji">📋</span>
                    <p>No workouts saved yet</p>
                    <p style="font-size:0.8rem;margin-top:4px;">Save your first workout to see history</p>
                </div>
            `;
        } else {
            // Grupper pr. dato, og inden for datoen pr. træning (upper/lower) —
            // så hver gemt træning har sin egen blok med sin egen Rediger-knap
            const grouped = new Map();
            for (const w of workouts) {
                if (!grouped.has(w.date)) grouped.set(w.date, []);
                grouped.get(w.date).push(w);
            }

            const sortedDates = [...grouped.keys()].sort().reverse();

            content.innerHTML = sortedDates.map(date => {
                const dayWorkouts = grouped.get(date).slice()
                    .sort((a, b) => a.day.localeCompare(b.day));

                return `
                    <div class="history-day">
                        <div class="history-day-header">
                            <span class="history-day-date">${formatDate(date)}</span>
                        </div>
                        ${dayWorkouts.map(w => {
                            const exCount = w.exercises.length;
                            const totalVol = w.exercises.reduce((sum, ex) =>
                                sum + ex.sets.reduce((s, set) => s + (set.weight * set.reps), 0), 0);
                            return `
                                <div class="history-workout">
                                    <div class="history-workout-header">
                                        <span class="history-day-type ${w.day}">${w.day === 'upper' ? 'Upper' : 'Lower'}</span>
                                        <span class="history-workout-meta">${exCount} exercise${exCount === 1 ? '' : 's'} · ${totalVol.toFixed(0)} kg total${w.sharedAt ? ' · <span class="shared-badge">shared</span>' : ''}</span>
                                        <button class="history-edit-btn" data-workout-id="${w.id}">✏️ Edit</button>
                                    </div>
                                    ${w.exercises.map(ex => {
                                        const exercise = getExerciseById(w.day, ex.exerciseId);
                                        if (!exercise) return '';
                                        const sets = ex.sets;
                                        const totalVol = sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
                                        const best = sets.reduce((b, s) => (!b || s.weight > b.weight) ? s : b, null);
                                        return `
                                            <div class="history-exercise">
                                                <div class="hist-ex-name">${exercise.name}</div>
                                                <div class="hist-ex-meta">${exercise.muscle}${exercise.equipment ? ' · ' + exercise.equipment : ''}${exercise.loadNote ? ' · ' + exercise.loadNote : ''} · ${sets.length} sets</div>
                                                <div class="hist-sets">
                                                    ${sets.map((s, i) => `
                                                        <span class="hist-set ${best && s.weight === best.weight && s.reps === best.reps ? 'best' : ''}"
                                                              title="${i + 1}. set">
                                                            ${s.weight} kg × ${s.reps} reps
                                                        </span>
                                                    `).join('')}
                                                </div>
                                                <div class="hist-volume">${totalVol.toFixed(0)} kg total</div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }).join('');
        }

        overlay.classList.add('open');
        panel.classList.add('open');
    }

    function closeHistory() {
        document.getElementById('history-overlay').classList.remove('open');
        document.getElementById('history-panel').classList.remove('open');
    }

    // ─── Coach notes (de ugentlige noter) ─────────────────────────
    // Noterne ligger i en gist og ikke i localStorage, af to grunde: de er ikke
    // træningsdata (de skal ikke kunne overskrives ved en fejl), og de skal kunne
    // opdateres hver uge uden en ny version af appen. Derfor hentes de ved åbning.
    // Gisten er "secret" = unlisted, ikke privat: URL'en virker uden login, og vi
    // viser derfor ingen hemmeligheder i filen — kun træningsnoter.
    //
    // Vi henter gennem API'et og ikke gennem gist.githubusercontent.com: raw-links
    // til den nyeste revision kan blive hængende i CDN'ens cache og vise den
    // FORRIGE uges noter, og så ser opdateringen ud som om den fejlede. API-svaret
    // er højst et minut gammelt, og filens indhold følger med i JSON'en.
    const NOTES_URL = 'https://api.github.com/gists/33bd4488e73c50f62617a8f96ffb208f';
    const NOTES_FILE = 'weekly-notes.md';
    const NOTES_UNAVAILABLE = 'Could not load the notes. Check your connection and try again.';
    const NOTES_EMPTY = 'No notes yet — they appear here after a weekly review.';

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Minimal markdown: overskrifter, punktopstilling, **fed** og `kode`.
    // Rækkefølgen er vigtig — der escapes FØRST, så en hentet fil aldrig kan
    // injicere HTML. Indholdet kommer fra nettet, ikke fra os selv.
    function renderNotesMarkdown(markdown) {
        if (!markdown || !markdown.trim()) {
            return `<div class="notes-status">${NOTES_EMPTY}</div>`;
        }

        const inline = text => escapeHtml(text)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');

        const out = [];
        let listOpen = false;
        const closeList = () => {
            if (listOpen) { out.push('</ul>'); listOpen = false; }
        };

        for (const rawLine of markdown.split('\n')) {
            const line = rawLine.trim();
            if (!line) { closeList(); continue; }

            if (line.startsWith('### ')) {
                closeList();
                out.push(`<div class="notes-sub">${inline(line.slice(4))}</div>`);
            } else if (line.startsWith('## ')) {
                closeList();
                out.push(`<div class="notes-week">${inline(line.slice(3))}</div>`);
            } else if (line.startsWith('# ')) {
                closeList();
                out.push(`<div class="notes-title">${inline(line.slice(2))}</div>`);
            } else if (/^[-*] /.test(line)) {
                if (!listOpen) { out.push('<ul class="notes-list">'); listOpen = true; }
                out.push(`<li>${inline(line.slice(2))}</li>`);
            } else {
                closeList();
                out.push(`<div class="notes-line">${inline(line)}</div>`);
            }
        }
        closeList();
        return out.join('');
    }

    // fetcher kan gives ind udefra, så testene kan bestemme svaret — og så den
    // gren der betyder "miljøet har ingen fetch" kan prøves af i stedet for at
    // ligge uverificeret hen.
    async function loadCoachNotes(fetcher = typeof fetch === 'function' ? fetch : null) {
        const content = document.getElementById('notes-content');
        if (!content) return '';

        content.innerHTML = '<div class="notes-status">Loading notes…</div>';

        if (!fetcher) {
            content.innerHTML = `<div class="notes-status">${NOTES_UNAVAILABLE}</div>`;
            return '';
        }

        try {
            const res = await fetcher(NOTES_URL, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            const file = data && data.files ? data.files[NOTES_FILE] : null;
            if (!file) {
                content.innerHTML = `<div class="notes-status">${NOTES_EMPTY}</div>`;
                return '';
            }

            // API'et afkorter meget store filer; så hentes den rå fil i stedet.
            let markdown = file.content;
            if (file.truncated && file.raw_url) {
                const raw = await fetcher(file.raw_url, { cache: 'no-store' });
                if (raw.ok) markdown = await raw.text();
            }

            const html = renderNotesMarkdown(markdown);
            content.innerHTML = html;
            return html;
        } catch {
            content.innerHTML = `<div class="notes-status">${NOTES_UNAVAILABLE}</div>`;
            return '';
        }
    }

    function openCoachNotes() {
        closeHistory();
        document.getElementById('notes-overlay').classList.add('open');
        document.getElementById('notes-panel').classList.add('open');
        loadCoachNotes();
    }

    function closeCoachNotes() {
        document.getElementById('notes-overlay').classList.remove('open');
        document.getElementById('notes-panel').classList.remove('open');
    }

    // ─── Bootstrap / Init ─────────────────────────────────────────
    function init() {
        // Dagen huskes mellem besøg. Den skiftes med ugebjælkens felter: der er ingen
        // særskilt dag- eller A/B-vælger mere — "Lower A" ER valget af dag og variant.
        state.currentDay = loadCurrentDay();

        // Event: ugebjælken. Felterne skifter pas, og advarslen kan sende en videre
        // til det pas der mangler — eller lukke op for at gemme alligevel.
        document.getElementById('session-bar').addEventListener('click', (e) => {
            const chip = e.target.closest('.week-chip');
            if (chip) {
                // Et tryk på det pas man allerede står på gør ingenting: det ville bare
                // skrive "valgt" på noget man ikke har valgt. Sammenlign med det viste
                // pas FØR dagen skiftes — ellers er det nye pas altid "det forslåede".
                if (chip.dataset.session === programKey(state.currentDay, getCurrentVariant())) return;
                const info = parseKey(chip.dataset.session);
                state.currentDay = info.day;
                saveCurrentDay(info.day);
                state.programVariant = info.variant;
                state.editing = null;
                state.allowDuplicateWeek = false;
                loadProgram();
                renderAll();
                return;
            }
            if (e.target.closest('#btn-next-session')) {
                const next = nextSessionInWeek();
                if (!next) return;
                const info = parseKey(next);
                state.currentDay = info.day;
                saveCurrentDay(info.day);
                state.programVariant = info.variant;
                state.editing = null;
                state.allowDuplicateWeek = false;
                loadProgram();
                renderAll();
                showToast(`${info.label} loaded`, 'success');
                return;
            }
            if (e.target.closest('#btn-log-anyway')) {
                state.allowDuplicateWeek = true;
                renderAll();
                showToast('Saving a second pass this week — tap Save', 'info');
            }
        });
        // Event: hent fjernede øvelser tilbage (linjen står lige over listen)
        document.getElementById('exercise-restore').addEventListener('click', (e) => {
            if (e.target.closest('#btn-restore')) restoreMissingExercises();
        });
        document.getElementById('sample-btn').addEventListener('click', toggleSampleData);


        // Event: Remove exercise (delegated)
        document.getElementById('exercise-list').addEventListener('click', (e) => {
            // Bytte-listen kan åbnes fra øvelseskortet, ikke kun fra programrækken.
            const swapOption = e.target.closest('.swap-option');
            if (swapOption) {
                swapExercise(swapOption.dataset.swapSlot, swapOption.dataset.swapId);
                return;
            }
            const nameBtn = e.target.closest('.exercise-name-btn');
            if (nameBtn) {
                const slot = nameBtn.dataset.swapSlot;
                state.openSwap = state.openSwap === slot ? null : slot;
                renderAll();
                return;
            }
            const removeBtn = e.target.closest('.remove-btn');
            if (removeBtn) {
                removeExercise(parseInt(removeBtn.dataset.index));
            }
            const addSetBtn = e.target.closest('.add-set-btn');
            if (addSetBtn) {
                addSet(parseInt(addSetBtn.dataset.exIndex));
            }
            const removeSetBtn = e.target.closest('.remove-set-btn');
            if (removeSetBtn && !removeSetBtn.disabled) {
                removeSet(parseInt(removeSetBtn.dataset.exIndex));
            }
        });

        // Event: Set inputs (delegated)
        document.getElementById('exercise-list').addEventListener('input', (e) => {
            const weightInput = e.target.closest('.set-weight');
            const repsInput = e.target.closest('.set-reps');
            if (weightInput) {
                const exIdx = parseInt(weightInput.dataset.exIndex);
                const setIdx = parseInt(weightInput.dataset.setIndex);
                updateSet(exIdx, setIdx, 'weight', weightInput.value);
            }
            if (repsInput) {
                const exIdx = parseInt(repsInput.dataset.exIndex);
                const setIdx = parseInt(repsInput.dataset.setIndex);
                updateSet(exIdx, setIdx, 'reps', repsInput.value);
            }
        });

        // Event: Save
        document.getElementById('save-btn').addEventListener('click', saveWorkout);
        document.getElementById('edit-cancel').addEventListener('click', cancelEdit);

        // Rediger en gemt træning direkte fra historikken
        document.getElementById('history-content').addEventListener('click', (e) => {
            const btn = e.target.closest('.history-edit-btn');
            if (!btn) return;
            startEditWorkout(btn.dataset.workoutId);
        });

        // Event: History
        document.getElementById('btn-history').addEventListener('click', showHistory);
        document.getElementById('close-history').addEventListener('click', closeHistory);
        document.getElementById('history-overlay').addEventListener('click', closeHistory);

        // Event: Coach notes
        document.getElementById('btn-notes').addEventListener('click', openCoachNotes);
        document.getElementById('close-notes').addEventListener('click', closeCoachNotes);
        document.getElementById('notes-overlay').addEventListener('click', closeCoachNotes);

        // Event: Share with trainer
        document.getElementById('btn-share').addEventListener('click', showShareModal);
        document.getElementById('share-modal-close').addEventListener('click', closeShareModal);
        document.getElementById('share-overlay').addEventListener('click', closeShareModal);
        document.getElementById('share-close').addEventListener('click', closeShareModal);
        document.getElementById('share-copy').addEventListener('click', copyShareText);
        document.getElementById('share-scope').addEventListener('change', (e) => updateSharePreview(e.target.value));

        // Keyboard shortcut: Escape to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeHistory();
                closeCoachNotes();
                closeShareModal();
            }
        });

        // Dagens program er dagens træning — det ligger klart ved åbning.
        loadProgram();

        // Initial render
        renderAll();
    }

    // ─── Del med AI-træner ─────────────────────────────────────────
    // Discords grænse er 2000 tegn pr. besked, og den gamle eksport ramte
    // ~8.000 tegn. Teksten bygges derfor uge for uge og holdes under CHAR_LIMIT,
    // så én uge altid kan deles i én besked. All-time-bedste-sæt følger altid
    // med i kompakt form, så trenden ikke går tabt når man kun deler én uge.
    const CHAR_LIMIT = 2000;

    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    function isoDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ISO-uge: mandag-søndag, samme ugenummer som i kalenderen.
    function isoWeekInfo(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const offset = (d.getDay() + 6) % 7; // 0 = mandag
        const thursday = new Date(d);
        thursday.setDate(d.getDate() - offset + 3);
        const year = thursday.getFullYear();
        const jan4 = new Date(year, 0, 4);
        const week1Monday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7));
        const week = Math.round((thursday - week1Monday) / 604800000) + 1;
        return { year, week };
    }

    function isoWeekKey(dateStr) {
        const { year, week } = isoWeekInfo(dateStr);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }

    function weekMonday(key) {
        const [year, w] = key.split('-W').map(Number);
        const jan4 = new Date(year, 0, 4);
        const monday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7));
        monday.setDate(monday.getDate() + (w - 1) * 7);
        return monday;
    }

    function shortDate(dateStr) {
        const [, m, d] = dateStr.split('-').map(Number);
        return `${d}.${m}`;
    }

    function weekdayOf(dateStr) {
        return WEEKDAYS[(new Date(dateStr + 'T00:00:00').getDay() + 6) % 7];
    }

    function weekLabel(key) {
        const mon = weekMonday(key);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        return `Week ${Number(key.split('-W')[1])} (${shortDate(isoDate(mon))}–${shortDate(isoDate(sun))})`;
    }

    // Grupperer træninger i ISO-uger, nyeste uge først.
    function groupByWeek(workouts) {
        const map = new Map();
        for (const w of workouts) {
            const key = isoWeekKey(w.date);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(w);
        }
        return [...map.entries()]
            .map(([key, list]) => ({
                key,
                workouts: list.slice().sort((a, b) => a.date.localeCompare(b.date)),
                shared: list.every(w => w.sharedAt),
            }))
            .sort((a, b) => b.key.localeCompare(a.key));
    }

    // Komprimerer gentagne sæt: "37.5×8 37.5×8 37.5×8" → "37.5×8 ×3".
    // Tegnbudgettet er stramt, og ens sæt er meget almindelige.
    function formatSets(sets) {
        const out = [];
        for (const s of sets) {
            const label = `${s.weight}×${s.reps}`;
            const prev = out[out.length - 1];
            if (prev && prev.label === label) prev.n++;
            else out.push({ label, n: 1 });
        }
        return out.map(o => (o.n > 1 ? `${o.label} ×${o.n}` : o.label)).join(' ');
    }

    // Alle sæt pr. øvelse i perioden, ældste først.
    function collectExerciseSets(workouts) {
        const map = new Map();
        for (const w of workouts) {
            for (const ex of (w.exercises || [])) {
                if (!map.has(ex.exerciseId)) map.set(ex.exerciseId, { day: w.day, sets: [] });
                for (const s of ex.sets) {
                    map.get(ex.exerciseId).sets.push({ weight: s.weight, reps: s.reps, date: w.date, week: isoWeekKey(w.date) });
                }
            }
        }
        for (const v of map.values()) v.sets.sort((a, b) => a.date.localeCompare(b.date));
        return map;
    }

    function exerciseName(day, exerciseId) {
        const info = getExerciseById(day, exerciseId) || getExerciseById('upper', exerciseId) || getExerciseById('lower', exerciseId);
        return info ? info.name : exerciseId;
    }

    // Hvilke træninger dækker den valgte visning? 'new' = ikke delt endnu.
    function shareScopeWorkouts(scope, workouts, weeks) {
        if (scope === 'all') return workouts.slice();
        if (scope && scope.startsWith('week:')) {
            const wk = weeks.find(w => w.key === scope.slice(5));
            return wk ? wk.workouts.slice() : [];
        }
        return workouts.filter(w => !w.sharedAt);
    }

    function shareScopeTitle(scope, selected) {
        if (scope === 'all') return 'ALL WEEKS';
        if (scope && scope.startsWith('week:')) return weekLabel(scope.slice(5)).toUpperCase();
        // "Kun nyt" kan dække flere uger, så ugerne nævnes i titlen — ellers
        // fremgår det ikke af eksporten hvilket tidsrum den dækker.
        const keys = groupByWeek(selected).map(w => w.key).sort();
        if (keys.length === 0) return `NEW SINCE LAST (${selected.length})`;
        const first = Number(keys[0].split('-W')[1]);
        const last = Number(keys[keys.length - 1].split('-W')[1]);
        const span = first === last ? `WEEK ${first}` : `WEEK ${first}–${last}`;
        return `NEW SINCE LAST (${selected.length}) · ${span}`;
    }

    function generateShareText(scope) {
        const workouts = loadWorkouts();
        if (workouts.length === 0) {
            return '📋 No workouts saved yet.\n\nCopy this text and send it to me once you have a few workouts — then I can help with feedback!';
        }

        const weeks = groupByWeek(workouts);
        const selected = shareScopeWorkouts(scope, workouts, weeks).sort((a, b) => a.date.localeCompare(b.date));

        if (selected.length === 0) {
            return '📋 No workouts in the selected period.\n\nPick another week in the list above.';
        }

        const lines = [];
        const upper = selected.filter(w => w.day === 'upper').length;
        const lower = selected.filter(w => w.day === 'lower').length;
        const sets = selected.reduce((n, w) => n + (w.exercises || []).reduce((s, e) => s + e.sets.length, 0), 0);
        const volume = selected.reduce((n, w) => n + (w.exercises || []).reduce((s, e) =>
            s + e.sets.reduce((sv, set) => sv + (set.weight * set.reps), 0), 0), 0);

        lines.push(`🏋️ GYM TRACKER — ${shareScopeTitle(scope, selected)}`);
        lines.push(`${selected.length} workout${selected.length === 1 ? '' : 's'} · ${upper} Upper · ${lower} Lower · ${sets} sets · ${volume.toFixed(0)} kg`);
        lines.push('');

        // "per hånd"/"per ben" er afgørende for at læse tallene rigtigt: 20 kg
        // pr. hånd er ikke 20 kg total. Noten står kun for de øvelser der er med.
        const loadNotes = new Map();
        for (const w of selected) {
            for (const ex of (w.exercises || [])) {
                const info = getExerciseById(w.day, ex.exerciseId);
                if (info && info.loadNote) {
                    if (!loadNotes.has(info.loadNote)) loadNotes.set(info.loadNote, new Set());
                    loadNotes.get(info.loadNote).add(info.name);
                }
            }
        }
        for (const [note, names] of loadNotes) {
            lines.push(`ℹ️ ${note} = kg per side: ${[...names].join(', ')}`);
        }

        // Træningslog, uge for uge
        const selectedWeeks = groupByWeek(selected).sort((a, b) => a.key.localeCompare(b.key));
        for (const wk of selectedWeeks) {
            if (selectedWeeks.length > 1) lines.push(`── ${weekLabel(wk.key).toUpperCase()} ──`);
            for (const w of wk.workouts) {
                lines.push(`${weekdayOf(w.date)} ${shortDate(w.date)} ${w.day === 'upper' ? 'UPPER' : 'LOWER'} ${w.variant}`);
                for (const ex of (w.exercises || [])) {
                    lines.push(`  ${exerciseName(w.day, ex.exerciseId)}: ${formatSets(ex.sets)}`);
                }
            }
        }

        // Kort headline i stedet for en linje pr. øvelse: loggen ovenfor indeholder
        // tallene, så fremgangen pr. øvelse kan regnes ud af den. En fuld liste
        // ville duplikere loggen og koste ~400 tegn af budgettet.
        const inScope = collectExerciseSets(selected);
        if (inScope.size > 0) {
            let up = 0, down = 0, flat = 0;
            for (const v of inScope.values()) {
                const delta = v.sets[v.sets.length - 1].weight - v.sets[0].weight;
                if (delta > 0) up++; else if (delta < 0) down++; else flat++;
            }
            const parts = [`${up} up`];
            if (flat > 0) parts.push(`${flat} unchanged`);
            if (down > 0) parts.push(`${down} down`);
            lines.push('');
            lines.push(`📈 Progress: ${parts.join(' · ')} (of ${inScope.size} exercises)`);
        }

        // All-time bedste sæt i kompakt form på så få linjer som muligt: uden
        // den ville en uge-eksport ikke kunne vise hvor man er henne over tid.
        const allTime = collectExerciseSets(workouts);
        const bests = [];
        for (const [id, v] of allTime) {
            const best = v.sets.reduce((b, s) => (s.weight > b.weight ? s : b), v.sets[0]);
            bests.push(`${exerciseName(v.day, id)} ${best.weight}×${best.reps}`);
        }
        if (bests.length > 0) {
            lines.push('');
            lines.push('🏆 Best ever (kg×reps)');
            lines.push(`  ${bests.join(' · ')}`);
        }

        return lines.join('\n');
    }

    // Den mest brugbare visning når vinduet åbnes: nyt hvis der er noget,
    // ellers indeværende uge, ellers den nyeste uge med træninger.
    function defaultShareScope(workouts, weeks) {
        if (workouts.some(w => !w.sharedAt)) return 'new';
        const current = isoWeekKey(isoDate(new Date()));
        if (weeks.some(w => w.key === current)) return `week:${current}`;
        return weeks.length > 0 ? `week:${weeks[0].key}` : 'all';
    }

    function renderShareScopeOptions(scope) {
        const workouts = loadWorkouts();
        const weeks = groupByWeek(workouts);
        const unshared = workouts.filter(w => !w.sharedAt);
        const current = isoWeekKey(isoDate(new Date()));
        const opts = [];

        if (unshared.length > 0) {
            opts.push({ value: 'new', label: `Only new since last (${unshared.length} workout${unshared.length === 1 ? '' : 's'})` });
        }
        for (const wk of weeks) {
            const mark = wk.shared ? ' ✓ shared' : '';
            const tag = wk.key === current ? ' ← this week' : '';
            opts.push({
                value: `week:${wk.key}`,
                label: `${weekLabel(wk.key)} · ${wk.workouts.length} workout${wk.workouts.length === 1 ? '' : 's'}${mark}${tag}`,
            });
        }
        if (workouts.length > 0) opts.push({ value: 'all', label: `All weeks (${workouts.length} workouts)` });

        const sel = document.getElementById('share-scope');
        sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        sel.value = opts.some(o => o.value === scope) ? scope : (opts[0] ? opts[0].value : 'all');
        return sel.value;
    }

    // Tegnbudgettet vises for brugeren: Discords grænse er 2.000 tegn, så en
    // eksport der er for lang opdages her og ikke først når beskeden afvises.
    function updateSharePreview(scope) {
        const text = generateShareText(scope);
        document.getElementById('share-text').value = text;

        const size = document.getElementById('share-size');
        const len = text.length;
        const over = len > CHAR_LIMIT;
        size.className = 'share-size' + (over ? ' over' : '');
        size.textContent = over
            ? `⚠️ ${len} characters — split into 2 messages (Discord's limit is 2,000)`
            : `${len} / 2,000 characters — fits in one message ✓`;
        return text;
    }

    function showShareModal() {
        const workouts = loadWorkouts();
        const weeks = groupByWeek(workouts);
        const scope = renderShareScopeOptions(defaultShareScope(workouts, weeks));
        updateSharePreview(scope);
        document.getElementById('share-overlay').classList.remove('hidden');
        document.getElementById('share-modal').classList.remove('hidden');
    }

    function closeShareModal() {
        document.getElementById('share-overlay').classList.add('hidden');
        document.getElementById('share-modal').classList.add('hidden');
    }

    // Markerer de viste træninger som delt, så "Kun nyt siden sidst" ved hvad
    // der er sendt. Markeringen er ufarlig: man kan altid vælge ugen igen.
    function markShareScopeAsShared(scope) {
        const workouts = loadWorkouts();
        const weeks = groupByWeek(workouts);
        const ids = new Set(shareScopeWorkouts(scope, workouts, weeks).map(w => w.id));
        if (ids.size === 0) return 0;

        const now = new Date().toISOString();
        let n = 0;
        for (const w of workouts) {
            if (ids.has(w.id) && !w.sharedAt) { w.sharedAt = now; n++; }
        }
        if (n > 0) saveWorkouts(workouts);
        return n;
    }

    function copyShareText() {
        const textarea = document.getElementById('share-text');
        const scope = document.getElementById('share-scope').value;
        const copied = () => showToast('Copied to clipboard!', 'success');

        textarea.select();
        textarea.setSelectionRange(0, 99999);
        try {
            navigator.clipboard.writeText(textarea.value).then(copied).catch(() => {
                document.execCommand('copy');
                copied();
            });
        } catch {
            document.execCommand('copy');
            copied();
        }

        // Marker først når teksten er kopieret, og fortæl hvad der skete
        const n = markShareScopeAsShared(scope);
        const next = renderShareScopeOptions(scope);
        if (next !== scope) updateSharePreview(next);
        if (n > 0) showToast(`${n} workout${n === 1 ? '' : 's'} marked as shared`, 'success');
    }

    // ─── Start ────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
    