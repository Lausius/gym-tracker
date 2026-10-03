    // ============================================================
    //  GYM TRACKER — Full Application
    // ============================================================

    // ─── Exercise Database ────────────────────────────────────────
    // Hver redskabsvariant er sin egen post. Grunden er teknisk, ikke kosmetisk:
    // 20 kg på en EZ-bar og 20 kg i hver hånd er ikke samme belastning, og
    // progressiv overload sammenligner tal — slås de sammen, bliver forslaget
    // forkert (fx "læg 2,5 kg på" baseret på en helt anden øvelse).
    //   equipment: hvilket redskab
    //   loadNote:  'per hånd' / 'per ben' når vægten angives pr. side, ikke total
    const EXERCISES = {
        upper: [
            { id: 'bench_press',       name: 'Bench Press',              muscle: 'Bryst',      compound: true,  equipment: 'Barbell' },
            { id: 'dumbbell_press',    name: 'Dumbbell Bench Press',     muscle: 'Bryst',      compound: true,  equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'incline_dumbbell',  name: 'Incline Dumbbell Press',   muscle: 'Bryst',      compound: true,  equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'dumbbell_fly',      name: 'Dumbbell Fly',             muscle: 'Bryst',      compound: false, equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'cable_crossover',   name: 'Cable Crossover',          muscle: 'Bryst',      compound: false, equipment: 'Cable' },
            { id: 'shoulder_press',    name: 'Shoulder Press',           muscle: 'Skulder',    compound: true,  equipment: 'Barbell' },
            { id: 'dumbbell_shoulder_press', name: 'Dumbbell Shoulder Press', muscle: 'Skulder', compound: true, equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'lateral_raise',     name: 'Lateral Raise',            muscle: 'Skulder',    compound: false, equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'front_raise',       name: 'Front Raise',              muscle: 'Skulder',    compound: false, equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'reverse_fly',       name: 'Reverse Fly',              muscle: 'Skulder/rug',compound: false, equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'pull_up',           name: 'Pull-Up',                  muscle: 'Ryg',        compound: true,  equipment: 'Bodyweight' },
            { id: 'chin_up',           name: 'Chin-Up',                  muscle: 'Ryg/biceps', compound: true,  equipment: 'Bodyweight' },
            { id: 'lat_pulldown',      name: 'Lat Pulldown',             muscle: 'Ryg',        compound: true,  equipment: 'Cable' },
            { id: 'cable_row',         name: 'Seated Cable Row',         muscle: 'Ryg',        compound: true,  equipment: 'Cable' },
            { id: 'barbell_row',       name: 'Barbell Row',              muscle: 'Ryg',        compound: true,  equipment: 'Barbell' },
            { id: 'chest_supported_row', name: 'Chest Supported Row',    muscle: 'Ryg',        compound: true,  equipment: 'Machine/Dumbbell' },
            { id: 'face_pull',         name: 'Face Pull',                muscle: 'Skulder/rug',compound: false, equipment: 'Cable' },
            { id: 'bicep_curl',        name: 'Bicep Curl (Barbell)',     muscle: 'Biceps',     compound: false, equipment: 'Barbell' },
            { id: 'ez_bar_curl',       name: 'Bicep Curl (EZ-bar)',      muscle: 'Biceps',     compound: false, equipment: 'EZ-bar' },
            { id: 'dumbbell_curl',     name: 'Bicep Curl (Dumbbell)',    muscle: 'Biceps',     compound: false, equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'hammer_curl',       name: 'Hammer Curl',              muscle: 'Biceps',     compound: false, equipment: 'Dumbbell', loadNote: 'per hånd' },
            { id: 'tricep_pushdown',   name: 'Tricep Pushdown',          muscle: 'Triceps',    compound: false, equipment: 'Cable' },
            { id: 'skull_crusher',     name: 'Skull Crusher',            muscle: 'Triceps',    compound: false, equipment: 'EZ-bar' },
            { id: 'overhead_tricep',   name: 'Overhead Tricep Extension',muscle: 'Triceps',    compound: false, equipment: 'Cable' },
            { id: 'dips',              name: 'Dips',                     muscle: 'Bryst/triceps',compound: true, equipment: 'Bodyweight' },
        ],
        lower: [
            { id: 'squat',             name: 'Squat',                    muscle: 'Lår/rumpe',  compound: true,  equipment: 'Barbell' },
            { id: 'deadlift',          name: 'Deadlift',                 muscle: 'Ryg/hofter', compound: true,  equipment: 'Barbell' },
            { id: 'front_squat',       name: 'Front Squat',              muscle: 'Lår',        compound: true,  equipment: 'Barbell' },
            { id: 'leg_press',         name: 'Leg Press',                muscle: 'Lår',        compound: true,  equipment: 'Machine' },
            { id: 'bulgarian_split',   name: 'Bulgarian Split Squat',    muscle: 'Lår/rumpe',  compound: true,  equipment: 'Dumbbell', loadNote: 'per ben' },
            { id: 'lunges',            name: 'Lunges',                   muscle: 'Lår/rumpe',  compound: true,  equipment: 'Dumbbell', loadNote: 'per ben' },
            { id: 'romanian_deadlift', name: 'Romanian Deadlift',        muscle: 'Lår/rumpe',  compound: true,  equipment: 'Barbell' },
            { id: 'leg_curl',          name: 'Leg Curl',                 muscle: 'Lår',        compound: false, equipment: 'Machine' },
            { id: 'leg_extension',     name: 'Leg Extension',            muscle: 'Lår',        compound: false, equipment: 'Machine' },
            { id: 'hip_thrust',        name: 'Hip Thrust',               muscle: 'Rumpe',      compound: true,  equipment: 'Barbell' },
            { id: 'glute_bridge',      name: 'Glute Bridge',             muscle: 'Rumpe',      compound: false, equipment: 'Barbell' },
            { id: 'calf_raise',        name: 'Calf Raise',               muscle: 'Kalve',      compound: false, equipment: 'Machine' },
            { id: 'plank',             name: 'Plank',                    muscle: 'Mave',       compound: false, equipment: 'Bodyweight' },
            { id: 'cable_crunch',      name: 'Cable Crunch',             muscle: 'Mave',       compound: false, equipment: 'Cable' },
            { id: 'hanging_leg_raise', name: 'Hanging Leg Raise',        muscle: 'Mave',       compound: false, equipment: 'Bodyweight' },
        ]
    };

    const ALL_EXERCISES = { upper: EXERCISES.upper, lower: EXERCISES.lower };

    // ─── Træningsprogrammer (A/B Split) ───────────────────────────────
    const PROGRAMS = {
        upperA: [
            { exerciseId: 'bench_press',       sets: 3, reps: 8,  weight: 60, note: 'Bryst' },
            { exerciseId: 'lat_pulldown',      sets: 3, reps: 10, weight: 59, note: 'Ryg' },
            { exerciseId: 'shoulder_press',    sets: 3, reps: 8,  weight: 30, note: 'Skulder' },
            { exerciseId: 'cable_row',         sets: 3, reps: 12, weight: 40, note: 'Ryg' },
            { exerciseId: 'lateral_raise',     sets: 3, reps: 12, weight: 7,  note: 'Skulder' },
            { exerciseId: 'tricep_pushdown',   sets: 3, reps: 12, weight: 19, note: 'Triceps' },
            { exerciseId: 'ez_bar_curl',       sets: 3, reps: 12, weight: 19, note: 'Biceps (EZ-bar)' },
        ],
        upperB: [
            { exerciseId: 'incline_dumbbell',  sets: 3, reps: 8,  weight: 25, note: 'Bryst øverst' },
            { exerciseId: 'pull_up',           sets: 3, reps: 8,  weight: 0,  note: 'Ryg (kropsvægt)' },
            { exerciseId: 'dumbbell_shoulder_press', sets: 3, reps: 10, weight: 15, note: 'Skulder' },
            { exerciseId: 'barbell_row',       sets: 3, reps: 8,  weight: 50, note: 'Ryg' },
            { exerciseId: 'reverse_fly',       sets: 3, reps: 12, weight: 8,  note: 'Skulder/rug' },
            { exerciseId: 'skull_crusher',     sets: 3, reps: 12, weight: 19, note: 'Triceps' },
            { exerciseId: 'hammer_curl',       sets: 3, reps: 10, weight: 15, note: 'Biceps' },
        ],
        lowerA: [
            { exerciseId: 'squat',             sets: 3, reps: 8,  weight: 60, note: 'Lår' },
            { exerciseId: 'romanian_deadlift', sets: 3, reps: 8,  weight: 50, note: 'Hoftebroantagelse' },
            { exerciseId: 'leg_press',         sets: 3, reps: 10, weight: 80, note: 'Lår' },
            { exerciseId: 'hip_thrust',        sets: 3, reps: 12, weight: 50, note: 'Rumpe' },
            { exerciseId: 'leg_curl',          sets: 3, reps: 12, weight: 40, note: 'Lår' },
            { exerciseId: 'plank',             sets: 3, reps: 1,  weight: 0,  note: 'Mave - hold 30-60 sekunder' },
        ],
        lowerB: [
            { exerciseId: 'front_squat',       sets: 3, reps: 8,  weight: 40, note: 'Lår (fremfokus)' },
            { exerciseId: 'deadlift',          sets: 3, reps: 6,  weight: 70, note: 'Ryg/hofter' },
            { exerciseId: 'bulgarian_split',   sets: 3, reps: 8,  weight: 20, note: 'Lår/rumpe (per ben)' },
            { exerciseId: 'glute_bridge',      sets: 3, reps: 12, weight: 40, note: 'Rumpe' },
            { exerciseId: 'leg_extension',    sets: 3, reps: 12, weight: 40, note: 'Lår isolering' },
            { exerciseId: 'cable_crunch',      sets: 3, reps: 15, weight: 30, note: 'Mave' },
        ],
    };

    // ─── Program rotation (A/B Split) ──────────────────────────────
    function programKey(day, variant) {
        return day + variant; // 'upperA' | 'upperB' | 'lowerA' | 'lowerB'
    }

    function getProgram(day, variant) {
        return PROGRAMS[programKey(day, variant)] || [];
    }

    // Foreslår næste variant ud fra seneste gemte træning for den pågældende dag
    function getSuggestedVariant(day) {
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
        exercises: [], // { exerciseId, sets: [{weight, reps}], targetReps }
        savedWorkouts: [], // loaded from localStorage
        programVariant: null, // null = brug foreslået variant, ellers 'A' | 'B'
        sessionVariant: null, // varianten programmet blev indlæst fra (gemmes med træningen)
        editing: null, // { id, date, day } når en gemt træning redigeres i stedet for at gemme ny
        showAllProgressive: false, // "Vis alle" i Næste uge-listen (nulstilles ved dagskift)
        showAllProgram: false, // "Vis alle" i Dagens program (nulstilles ved dagskift)
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
        return d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' });
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
                suggestion: 'Start med 3 sæt × 8 reps',
                detail: 'Ingen historik endnu. Vælg en vægt du kan udføre 8 reps med god form.',
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
                    detail: `Du har brugt ${currentWeight} kg i ${sameWeightSessions} sammenhænge. Fokus på flere reps før vægtophedning.`,
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

    // ─── Filtrering: kun øvelser man faktisk laver ────────────────
    // Øvelser der nogensinde er udført — dvs. optræder med mindst ét sæt i en gemt
    // træning for den pågældende dag (upper/lower). Et tomt sæt-liste tæller ikke:
    // en øvelse man tilføjede men aldrig førte tal ind i, er ikke "udført".
    function getTrainedExerciseIds(day) {
        const ids = new Set();
        for (const workout of loadWorkouts()) {
            if (workout.day !== day) continue;
            for (const ex of (workout.exercises || [])) {
                if (ex.sets && ex.sets.length) ids.add(ex.exerciseId);
            }
        }
        return ids;
    }

    // Kropsvægtøvelser (fx plank og pull-up) kan ikke føre vægthistorik: saveWorkout
    // gemmer kun sæt med vægt > 0, så de optræder aldrig i en gemt træning. De må
    // derfor ikke filtreres væk på "har du udført den før" — det ville skjule dem
    // permanent, selv om de står i programmet. Tjekker alle varianter for dagen, så
    // det er dataen der afgør det og ikke en hardcoded liste.
    function isBodyweightExercise(day, id) {
        return Object.keys(PROGRAMS).some(key =>
            key.startsWith(day) && PROGRAMS[key].some(item => item.exerciseId === id && !(item.weight > 0))
        );
    }

    // Er netop denne variant nogensinde trænet? Uden historik for varianten er der
    // intet at filtrere efter, så vi viser hele skabelonen. Ellers ville Lower B
    // stå helt tom fordi man hidtil kun har kørt Lower A — filtreringen skal skjule
    // de øvelser man har valgt fra, ikke hele den anden variant.
    function hasVariantHistory(day, variant) {
        return loadWorkouts().some(w => w.day === day && w.variant === variant);
    }

    // Deler en liste i "har historik" og "har ikke". Tre ting holder listen brugbar:
    //
    // 1. Uden historik for dagen filtreres der ikke. Ellers ville alt blive skjult,
    //    og en ny bruger (eller en dag man aldrig har trænet) ville stå med tomme
    //    lister — og "Tilføj alle" ville ikke tilføje noget.
    // 2. Er varianten aldrig trænet, filtreres der heller ikke (se hasVariantHistory).
    // 3. Øvelser der allerede er i dagens session holdes synlige, også uden historik,
    //    så man ikke mister dem af syne midt i en træning.
    // 4. Kropsvægtøvelser holdes altid synlige: de kan ikke føre vægthistorik (se
    //    isBodyweightExercise), så et historikfilter ville skjule dem for bestandigt.
    //
    // `hidden` udregnes også når filtreringen er slået fra. Ellers ville "Vis alle"
    // give en tom skjult-mængde, knappen ville skjule sig selv i samme øjeblik man
    // trykkede på den, og der var ingen vej tilbage til den filtrerede visning.
    function filterTrained(list, day, getId, showAll, variantKnown = true) {
        const trained = getTrainedExerciseIds(day);
        const canFilter = trained.size > 0 && variantKnown;
        if (!canFilter) {
            return { visible: list, hidden: [], trained, canFilter: false, filtered: false };
        }
        const inSession = new Set(state.exercises.map(e => e.exerciseId));
        const hidden = list.filter(item => {
            const id = getId(item);
            if (trained.has(id) || inSession.has(id)) return false;
            return !isBodyweightExercise(day, id);
        });
        if (showAll) {
            return { visible: list, hidden, trained, canFilter: true, filtered: false };
        }
        return { visible: list.filter(item => !hidden.includes(item)), hidden, trained, canFilter: true, filtered: true };
    }

    // Knappen skjules helt når der ikke er noget skjult, så den ikke fylder i
    // den normale visning.
    function renderFilterToggle(id, showAll, hiddenCount) {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (hiddenCount === 0) {
            btn.classList.add('hidden');
            btn.textContent = '';
            return;
        }
        btn.classList.remove('hidden');
        btn.textContent = showAll ? `Skjul (${hiddenCount})` : `Vis alle (${hiddenCount})`;
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
        const btn = document.getElementById('sample-btn');
        const note = document.getElementById('sample-note');
        if (!btn) return;

        const workouts = loadWorkouts();
        const real = realWorkouts(workouts);

        if (real.length > 0) {
            // Der ligger rigtige træninger: knappen fjernes helt, så den ikke kan
            // rammes ved et uheld. Det er hele sikkerheden i funktionen.
            btn.classList.add('hidden');
            btn.disabled = true;
            if (note) {
                note.textContent = `Ikke tilgængelig: der ligger ${real.length} ` +
                    `rigtig${real.length === 1 ? '' : 'e'} træning${real.length === 1 ? '' : 'er'}. ` +
                    'Funktionen rører aldrig dine egne data.';
            }
            return;
        }

        btn.classList.remove('hidden');
        btn.disabled = false;
        if (workouts.length > 0) {
            btn.textContent = `🧪 Ryd eksempeldata (${workouts.length} træninger)`;
            if (note) note.textContent = 'Loggen indeholder kun eksempeldata — de kan fjernes igen her.';
        } else {
            btn.textContent = '🧪 Fyld med eksempeldata';
            if (note) note.textContent = 'Skriver 3 ugers A/B-historik, så alt kan prøves med det samme.';
        }
    }

    function toggleSampleData() {
        const workouts = loadWorkouts();
        if (realWorkouts(workouts).length > 0) {
            showToast('Eksempeldata rører ikke dine rigtige træninger', 'info');
            renderSampleControls();
            return;
        }
        if (workouts.length > 0) {
            saveWorkouts([]);
            showToast('Eksempeldata ryddet', 'info');
        } else {
            const samples = buildSampleWorkouts();
            saveWorkouts(samples);
            showToast(`${samples.length} eksempeltræninger lagt ind`, 'success');
        }
        renderAll();
    }

    // ─── Render Functions ─────────────────────────────────────────
    function renderProgram() {
        const variant = getCurrentVariant();
        const full = getProgram(state.currentDay, variant);
        const content = document.getElementById('program-content');
        const hint = document.getElementById('variant-hint');

        document.querySelectorAll('.variant-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.variant === variant);
        });
        if (hint) hint.textContent = state.programVariant ? 'valgt' : 'foreslået';

        if (full.length === 0) {
            content.innerHTML = '<div class="program-ex-meta">Intet program fundet</div>';
            renderFilterToggle('program-toggle', false, 0);
            return;
        }

        // Programmet er en skabelon. Øvelser man aldrig har udført skjules, så
        // programmet afspejler det man faktisk laver — i stedet for at blive ved
        // med at foreslå noget man har valgt fra.
        const { visible, hidden } = filterTrained(full, state.currentDay, i => i.exerciseId, state.showAllProgram,
            hasVariantHistory(state.currentDay, variant));
        renderFilterToggle('program-toggle', state.showAllProgram, hidden.length);

        if (visible.length === 0) {
            content.innerHTML = '<div class="program-ex-meta">Ingen af programmets øvelser har historik endnu.</div>';
            return;
        }

        content.innerHTML = visible.map(item => {
            const ex = getExerciseById(state.currentDay, item.exerciseId);
            if (!ex) return '';
            const added = state.exercises.some(e => e.exerciseId === item.exerciseId);
            const plan = `${item.sets} × ${item.reps}${item.weight > 0 ? ' @ ' + item.weight + ' kg' : ''}`;
            return `
                <div class="program-exercise" data-exercise-id="${item.exerciseId}">
                    <div style="flex:1; min-width:0;">
                        <div class="program-ex-name">${ex.name}</div>
                        <div class="program-ex-meta">${ex.muscle}${ex.equipment ? ' · ' + ex.equipment : ''}${ex.loadNote ? ' · ' + ex.loadNote : ''}</div>
                        ${item.note ? `<div class="program-ex-note">${item.note}</div>` : ''}
                    </div>
                    ${added ? '<span class="program-ex-added">✓ Tilføjet</span>' : `<span class="program-ex-planned">${plan}</span>`}
                </div>
            `;
        }).join('');
    }

    function renderDaySelector() {
        const btns = document.querySelectorAll('.day-btn');
        btns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.day === state.currentDay);
        });
    }

    function renderExerciseList() {
        const list = document.getElementById('exercise-list');
        const count = document.getElementById('exercise-count');

        if (state.exercises.length === 0) {
            list.innerHTML = `
                <div class="no-exercises-msg">
                    <span class="emoji">🏋️</span>
                    <p> ingen øvelser tilføjet endnu</p>
                    <p style="font-size:0.8rem; margin-top:4px;">Vælg en øvelse nedenfor for at starte</p>
                </div>
            `;
            count.textContent = '0';
            return;
        }

        count.textContent = state.exercises.length;

        list.innerHTML = state.exercises.map((ex, idx) => {
            const exercise = getExerciseById(state.currentDay, ex.exerciseId);
            if (!exercise) return '';

            const totalVolume = ex.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
            const maxVolume = Math.max(...ex.sets.map(s => s.weight * s.reps), 0);

            return `
                <div class="exercise-card" data-index="${idx}">
                    <div class="exercise-card-header">
                        <div class="exercise-card-main">
                            <div class="exercise-name">${exercise.name}</div>
                            <div class="exercise-meta">
                                <span class="tag ${exercise.compound ? 'compound' : 'isolation'}">
                                    ${exercise.compound ? '⨯ Sammensat' : '⊕ Isolation'}
                                </span>
                                <span class="tag equip">${exercise.equipment || ''}</span>
                                <span>${exercise.muscle}</span>
                                ${exercise.loadNote ? `<span class="tag load">${exercise.loadNote}</span>` : ''}
                            </div>
                        </div>
                        <button class="remove-btn" data-index="${idx}" aria-label="Fjern øvelse">✕</button>
                    </div>
                    <table class="sets-table">
                        <thead>
                            <tr>
                                <th style="width:32px">#</th>
                                <th>Vægt (kg)</th>
                                <th>Reps</th>
                                <th style="text-align:right">Volumen (kg)</th>
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
                    <button class="add-set-btn" data-ex-index="${idx}">
                        ＋ Tilføj sæt
                    </button>
                    <div class="exercise-volume">
                        <span>Total volumen</span>
                        <span class="total">${totalVolume.toFixed(0)} kg</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderProgressiveOverload() {
        const list = document.getElementById('progressive-list');
        const all = ALL_EXERCISES[state.currentDay];

        // Kun øvelser man har historik på. Ellers ville listen bestå af hele
        // databasen, hvor de fleste poster bare siger "Ingen historik endnu" —
        // langt og ubrugeligt.
        const { visible, hidden } = filterTrained(all, state.currentDay, ex => ex.id, state.showAllProgressive);
        renderFilterToggle('progressive-toggle', state.showAllProgressive, hidden.length);

        if (visible.length === 0) {
            list.innerHTML = '<div class="list-empty-note">Ingen øvelser har historik endnu. Gem en træning først — eller tryk “Vis alle”.</div>';
            return;
        }

        list.innerHTML = visible.map(ex => {
            const prog = calculateProgressiveOverload(ex.id, state.currentDay);
            const added = state.exercises.some(e => e.exerciseId === ex.id);
            return `
                <div class="progressive-item ${added ? 'already-added' : ''}" data-exercise-id="${ex.id}">
                    <div class="progressive-main">
                        <div class="progressive-info">
                            <div class="progressive-ex-name">
                                ${ex.name}
                                ${added ? '<span class="added-badge">✓ Tilføjet</span>' : ''}
                            </div>
                            <div class="progressive-ex-meta">${ex.muscle}</div>
                        </div>
                        <div class="progressive-suggestion">
                            <div class="suggestion-text">${prog.suggestion}</div>
                            <div class="suggestion-detail">${prog.detail}</div>
                        </div>
                    </div>
                    <button class="add-from-prog-btn" data-exercise-id="${ex.id}" title="Tilføj øvelse">
                        ＋
                    </button>
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
                `✏️ Redigerer ${state.editing.day === 'upper' ? 'Upper' : 'Lower'} fra ${formatDate(state.editing.date)}`;
            btn.textContent = '💾 Opdater træning';
            document.body.classList.add('editing');
        } else {
            banner.classList.add('hidden');
            btn.textContent = '💾 Gem træning';
            document.body.classList.remove('editing');
        }

        const exerciseCount = state.exercises.length;
        const hasSets = state.exercises.some(ex => ex.sets.some(s => s.weight > 0 && s.reps > 0));

        if (exerciseCount === 0) {
            info.innerHTML = 'Ingen øvelser tilføjet';
            btn.disabled = true;
        } else if (!hasSets) {
            info.innerHTML = `<strong>${exerciseCount}</strong> øvelser · udfyld sættene`;
            btn.disabled = true;
        } else {
            const totalVolume = state.exercises.reduce((sum, ex) =>
                sum + ex.sets.reduce((s, set) => s + (set.weight * set.reps), 0), 0
            );
            info.innerHTML = `<strong>${exerciseCount}</strong> øvelser · <strong>${totalVolume.toFixed(0)} kg</strong> totalt`;
            btn.disabled = false;
        }
    }

    function renderAddExerciseDropdown() {
        const select = document.getElementById('exercise-select');
        const currentIds = new Set(state.exercises.map(e => e.exerciseId));
        const available = ALL_EXERCISES[state.currentDay].filter(e => !currentIds.has(e.id));

        // Grupperet efter muskelgruppe — listen vokser med redskabsvarianter
        const groups = new Map();
        for (const e of available) {
            if (!groups.has(e.muscle)) groups.set(e.muscle, []);
            groups.get(e.muscle).push(e);
        }
        select.innerHTML = '<option value="">— Vælg øvelse —</option>' +
            [...groups.entries()].map(([muscle, list]) =>
                `<optgroup label="${muscle}">` +
                list.map(e => `<option value="${e.id}">${e.name}${e.loadNote ? ' (' + e.loadNote + ')' : ''}</option>`).join('') +
                '</optgroup>'
            ).join('');

        // Show/hide the whole add section
        const section = document.getElementById('add-exercise-section');
        const banner = document.getElementById('first-use-banner');

        if (available.length === 0) {
            section.classList.add('empty-state');
            section.querySelector('.add-exercise-title').textContent = '✅ Alle øvelser tilføjet';
            section.querySelector('#add-exercise-btn').disabled = true;
            section.querySelector('#add-exercise-btn').textContent = '✓ Færdig for i dag';
        } else {
            section.classList.remove('empty-state');
            section.querySelector('.add-exercise-title').textContent = '＋ Tilføj øvelse';
            section.querySelector('#add-exercise-btn').disabled = false;
            section.querySelector('#add-exercise-btn').textContent = '＋ Tilføj til dagens træning';
        }

        if (state.exercises.length === 0 && available.length > 0) {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }

    function renderAll() {
        renderDaySelector();
        renderProgram();
        renderExerciseList();
        renderProgressiveOverload();
        renderSaveBar();
        renderAddExerciseDropdown();
        renderSampleControls();
    }

    // ─── Program handling (A/B) ───────────────────────────────────
    function addExerciseWithPlan(exerciseId, sets, reps, weight) {
        if (state.exercises.some(e => e.exerciseId === exerciseId)) return false;
        const exercise = getExerciseById(state.currentDay, exerciseId);
        if (!exercise) return false;
        state.exercises.push({
            exerciseId,
            sets: Array.from({ length: sets }, () => ({ weight, reps })),
            targetReps: reps,
        });
        return true;
    }

    function loadProgramAll() {
        const variant = getCurrentVariant();
        const full = getProgram(state.currentDay, variant);
        // Kun de synlige øvelser. Ellers ville "Tilføj alle" lægge præcis de
        // øvelser ind i sessionen, som filtreringen lige har skjult.
        const { visible, hidden } = filterTrained(full, state.currentDay, i => i.exerciseId, state.showAllProgram,
            hasVariantHistory(state.currentDay, variant));
        const list = visible;
        state.editing = null; // Indlæsning af programmet erstatter sessionen
        let added = 0;
        for (const item of list) {
            if (addExerciseWithPlan(item.exerciseId, item.sets, item.reps, item.weight)) added++;
        }
        state.programVariant = variant;
        state.sessionVariant = variant;
        renderAll();
        const label = `${state.currentDay === 'upper' ? 'Upper' : 'Lower'} ${variant}`;
        if (added > 0) {
            const skipped = hidden.length > 0 ? ` (${hidden.length} skjult af filtreringen)` : '';
            showToast(`${label} indlæst — ${added} øvelser tilføjet${skipped}`, 'success');
        } else {
            showToast('Alle øvelser fra programmet er allerede tilføjet', 'info');
        }
    }

    function toggleProgramVariant() {
        state.programVariant = getCurrentVariant() === 'A' ? 'B' : 'A';
        renderProgram();
        showToast(`Viser ${state.currentDay === 'upper' ? 'Upper' : 'Lower'} ${state.programVariant}`, 'info');
    }

    function openRules() {
        renderSampleControls(); // afhænger af om loggen indeholder rigtige træninger
        document.getElementById('rules-overlay').classList.remove('hidden');
        document.getElementById('rules-modal').classList.remove('hidden');
    }

    function closeRules() {
        document.getElementById('rules-overlay').classList.add('hidden');
        document.getElementById('rules-modal').classList.add('hidden');
    }

    // ─── Actions ──────────────────────────────────────────────────
    function addExercise(exerciseId) {
        if (state.exercises.some(e => e.exerciseId === exerciseId)) {
            showToast('Øvelsen er allerede tilføjet', 'info');
            return;
        }
        const exercise = getExerciseById(state.currentDay, exerciseId);
        if (!exercise) return;

        const setsNumber = parseInt(document.getElementById('sets-number').value) || 3;
        const startWeight = parseFloat(document.getElementById('start-weight').value) || 20;
        const targetReps = parseInt(document.getElementById('start-reps').value) || 8;

        state.exercises.push({
            exerciseId,
            sets: Array.from({ length: setsNumber }, () => ({ weight: startWeight, reps: targetReps })),
            targetReps,
        });

        renderAll();
        showToast(`${exercise.name} tilføjet`, 'success');
    }

    function addExerciseFromSuggestion(exerciseId) {
        // Check if already added
        if (state.exercises.some(e => e.exerciseId === exerciseId)) {
            showToast('Øvelsen er allerede tilføjet', 'info');
            return;
        }

        const exercise = getExerciseById(state.currentDay, exerciseId);
        if (!exercise) return;

        // Get progressive overload recommendation
        const prog = calculateProgressiveOverload(exerciseId, state.currentDay);

        // Parse suggestion: "62.5 kg × 8 reps" or "10 reps med 65 kg"
        let suggestedWeight = 20;
        let suggestedReps = 8;

        const weightMatch = prog.suggestion.match(/([\d.]+)\s*kg/);
        const repsMatch = prog.suggestion.match(/([\d]+)\s*reps/);

        if (weightMatch) suggestedWeight = parseFloat(weightMatch[1]);
        if (repsMatch) suggestedReps = parseInt(repsMatch[1]);

        // If it's a rep-focused suggestion, use the suggested reps as target
        if (prog.status === 'rep_focus' || prog.status === 'rep_up') {
            suggestedWeight = suggestedWeight || 20;
            suggestedReps = suggestedReps || 8;
        }

        // Add with 3 sets of the suggested values
        state.exercises.push({
            exerciseId,
            sets: Array.from({ length: 3 }, () => ({ weight: suggestedWeight, reps: suggestedReps })),
            targetReps: suggestedReps,
        });

        renderAll();
        showToast(`${exercise.name} tilføjet — ${suggestedWeight} kg × ${suggestedReps} reps`, 'success');
    }

    function removeExercise(index) {
        const removed = state.exercises[index];
        state.exercises.splice(index, 1);
        renderAll();
        if (removed) {
            const exercise = getExerciseById(state.currentDay, removed.exerciseId);
            showToast(`${exercise ? exercise.name : 'Øvelse'} fjernet`, 'info');
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

    function updateSet(exIndex, setIndex, field, value) {
        const ex = state.exercises[exIndex];
        if (!ex || !ex.sets[setIndex]) return;
        const numValue = field === 'weight' ? parseFloat(value) || 0 : parseInt(value) || 0;
        ex.sets[setIndex][field] = numValue;
        renderSaveBar();
        // Update volume cell in real-time
        updateVolumeCell(exIndex, setIndex);
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
            showToast('Ingen sæt at gemme — udfyld vægt og reps', 'info');
            return;
        }

        // Redigering af en gemt træning: opdater den i stedet for at oprette en ny
        if (state.editing) {
            const res = applyWorkoutEdit(workouts, state.editing.id, cleanExercises);
            if (!res.ok) {
                showToast('Træningen findes ikke længere', 'error');
                state.editing = null;
                renderAll();
                return;
            }
            saveWorkouts(res.workouts);
            state.editing = null;
            state.exercises = [];
            state.sessionVariant = null;
            state.programVariant = null;
            renderAll();
            if (res.added > 0) {
                showToast(`Træning opdateret — ${res.added} øvelse${res.added === 1 ? '' : 'r'} tilføjet`, 'success');
            } else if (res.removed > 0) {
                showToast(`Træning opdateret — ${res.removed} øvelse${res.removed === 1 ? '' : 'r'} fjernet`, 'success');
            } else {
                showToast('Træning opdateret', 'success');
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
            showToast('Træning opdateret', 'success');
        } else {
            workouts.push(workoutData);
            showToast('Træning gemt!', 'success');
        }

        saveWorkouts(workouts);
        state.exercises = [];
        state.sessionVariant = null;
        state.programVariant = null;
        renderAll();
    }

    // ─── Redigering af gemte træninger ────────────────────────────
    function startEditWorkout(id) {
        const workout = loadWorkouts().find(w => w.id === id);
        if (!workout) {
            showToast('Kunne ikke finde træningen', 'error');
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

        const label = `${workout.day === 'upper' ? 'Upper' : 'Lower'} fra ${formatDate(workout.date)}`;
        if (skipped.length > 0) {
            showToast(`Redigerer ${label} — ${skipped.length} ukendt øvelse sprunget over`, 'info');
        } else {
            showToast(`Redigerer ${label}`, 'info');
        }
    }

    function cancelEdit() {
        if (!state.editing) return;
        state.editing = null;
        state.exercises = [];
        state.sessionVariant = null;
        state.programVariant = null;
        renderAll();
        showToast('Redigering annulleret — træningen er uændret', 'info');
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
                    <p>Ingen træninger gemt endnu</p>
                    <p style="font-size:0.8rem;margin-top:4px;">Gem din første træning for at se historik</p>
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
                                        <span class="history-workout-meta">${exCount} øvelse${exCount === 1 ? '' : 'r'} · ${totalVol.toFixed(0)} kg totalt${w.sharedAt ? ' · <span class="shared-badge">delt</span>' : ''}</span>
                                        <button class="history-edit-btn" data-workout-id="${w.id}">✏️ Rediger</button>
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
                                                <div class="hist-ex-meta">${exercise.muscle}${exercise.equipment ? ' · ' + exercise.equipment : ''}${exercise.loadNote ? ' · ' + exercise.loadNote : ''} · ${sets.length} sæt</div>
                                                <div class="hist-sets">
                                                    ${sets.map((s, i) => `
                                                        <span class="hist-set ${best && s.weight === best.weight && s.reps === best.reps ? 'best' : ''}"
                                                              title="${i + 1}. sæt">
                                                            ${s.weight} kg × ${s.reps} reps
                                                        </span>
                                                    `).join('')}
                                                </div>
                                                <div class="hist-volume">${totalVol.toFixed(0)} kg totalt</div>
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

    // ─── Bootstrap / Init ─────────────────────────────────────────
    function init() {
        // Restore current day
        state.currentDay = loadCurrentDay();

        // Set day selector
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.day === state.currentDay);
        });

        // Event: Day selector
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.currentDay = btn.dataset.day;
                saveCurrentDay(state.currentDay);
                state.exercises = []; // Clear exercises when switching day
                state.programVariant = null; // Følg forslået A/B-variant for den nye dag
                state.sessionVariant = null;
                state.editing = null; // En anden dags træning kan ikke redigeres herfra
                state.showAllProgressive = false; // Filtreringen er pr. dag — start forfra
                state.showAllProgram = false;
                renderAll();
            });
        });

        // Event: Program (A/B)
        document.getElementById('program-load').addEventListener('click', loadProgramAll);
        document.getElementById('program-refresh').addEventListener('click', toggleProgramVariant);
        document.getElementById('program-toggle').addEventListener('click', () => {
            state.showAllProgram = !state.showAllProgram;
            renderProgram();
        });
        document.getElementById('progressive-toggle').addEventListener('click', () => {
            state.showAllProgressive = !state.showAllProgressive;
            renderProgressiveOverload();
        });
        document.getElementById('variant-selector').addEventListener('click', (e) => {
            const btn = e.target.closest('.variant-btn');
            if (!btn) return;
            state.programVariant = btn.dataset.variant;
            renderProgram();
        });
        document.getElementById('program-content').addEventListener('click', (e) => {
            const row = e.target.closest('.program-exercise');
            if (!row) return;
            const variant = getCurrentVariant();
            const item = getProgram(state.currentDay, variant).find(i => i.exerciseId === row.dataset.exerciseId);
            if (!item) return;
            if (addExerciseWithPlan(item.exerciseId, item.sets, item.reps, item.weight)) {
                state.sessionVariant = variant;
                renderAll();
                showToast('Øvelse tilføjet fra programmet', 'success');
            } else {
                showToast('Øvelsen er allerede tilføjet', 'info');
            }
        });
        document.getElementById('program-rules').addEventListener('click', openRules);
        document.getElementById('sample-btn').addEventListener('click', toggleSampleData);
        document.getElementById('rules-close').addEventListener('click', closeRules);
        document.getElementById('rules-overlay').addEventListener('click', closeRules);

        // Event: Add exercise
        document.getElementById('add-exercise-btn').addEventListener('click', () => {
            const select = document.getElementById('exercise-select');
            if (!select.value) {
                showToast('Vælg en øvelse først', 'error');
                return;
            }
            addExercise(select.value);
            select.value = '';
        });

        // Event: Add exercise from progressive suggestion
        document.getElementById('progressive-list').addEventListener('click', (e) => {
            const addBtn = e.target.closest('.add-from-prog-btn');
            if (addBtn) {
                e.stopPropagation();
                addExerciseFromSuggestion(addBtn.dataset.exerciseId);
                return;
            }
            const card = e.target.closest('.progressive-item');
            if (card && !e.target.closest('.add-from-prog-btn')) {
                addExerciseFromSuggestion(card.dataset.exerciseId);
            }
        });

        // Event: Remove exercise (delegated)
        document.getElementById('exercise-list').addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-btn');
            if (removeBtn) {
                removeExercise(parseInt(removeBtn.dataset.index));
            }
            const addSetBtn = e.target.closest('.add-set-btn');
            if (addSetBtn) {
                addSet(parseInt(addSetBtn.dataset.exIndex));
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
                closeShareModal();
                closeRules();
            }
        });

        // Initial render
        renderAll();
    }

    // ─── Del med AI-træner ─────────────────────────────────────────
    // Discords grænse er 2000 tegn pr. besked, og den gamle eksport ramte
    // ~8.000 tegn. Teksten bygges derfor uge for uge og holdes under CHAR_LIMIT,
    // så én uge altid kan deles i én besked. All-time-bedste-sæt følger altid
    // med i kompakt form, så trenden ikke går tabt når man kun deler én uge.
    const CHAR_LIMIT = 2000;

    const WEEKDAYS = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];

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
        return `Uge ${Number(key.split('-W')[1])} (${shortDate(isoDate(mon))}–${shortDate(isoDate(sun))})`;
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
        if (scope === 'all') return 'ALLE UGER';
        if (scope && scope.startsWith('week:')) return weekLabel(scope.slice(5)).toUpperCase();
        // "Kun nyt" kan dække flere uger, så ugerne nævnes i titlen — ellers
        // fremgår det ikke af eksporten hvilket tidsrum den dækker.
        const keys = groupByWeek(selected).map(w => w.key).sort();
        if (keys.length === 0) return `NYT SIDEN SIDST (${selected.length})`;
        const first = Number(keys[0].split('-W')[1]);
        const last = Number(keys[keys.length - 1].split('-W')[1]);
        const span = first === last ? `UGE ${first}` : `UGE ${first}–${last}`;
        return `NYT SIDEN SIDST (${selected.length}) · ${span}`;
    }

    function generateShareText(scope) {
        const workouts = loadWorkouts();
        if (workouts.length === 0) {
            return '📋 Ingen træninger gemt endnu.\n\nKopier denne tekst og send den til mig når du har nogle træninger — så kan jeg hjælpe med feedback!';
        }

        const weeks = groupByWeek(workouts);
        const selected = shareScopeWorkouts(scope, workouts, weeks).sort((a, b) => a.date.localeCompare(b.date));

        if (selected.length === 0) {
            return '📋 Ingen træninger i det valgte tidsrum.\n\nVælg en anden uge i listen ovenfor.';
        }

        const lines = [];
        const upper = selected.filter(w => w.day === 'upper').length;
        const lower = selected.filter(w => w.day === 'lower').length;
        const sets = selected.reduce((n, w) => n + (w.exercises || []).reduce((s, e) => s + e.sets.length, 0), 0);
        const volume = selected.reduce((n, w) => n + (w.exercises || []).reduce((s, e) =>
            s + e.sets.reduce((sv, set) => sv + (set.weight * set.reps), 0), 0), 0);

        lines.push(`🏋️ GYM TRACKER — ${shareScopeTitle(scope, selected)}`);
        lines.push(`${selected.length} træning${selected.length === 1 ? '' : 'er'} · ${upper} Upper · ${lower} Lower · ${sets} sæt · ${volume.toFixed(0)} kg`);
        lines.push('');

        // "per hånd"/"per ben" er afgørende for at læse tallene rigtigt: 20 kg
        // pr. hånd er ikke 20 kg totalt. Noten står kun for de øvelser der er med.
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
            lines.push(`ℹ️ ${note} = kg pr. side: ${[...names].join(', ')}`);
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
            const parts = [`${up} op`];
            if (flat > 0) parts.push(`${flat} uændret`);
            if (down > 0) parts.push(`${down} ned`);
            lines.push('');
            lines.push(`📈 Fremgang: ${parts.join(' · ')} (af ${inScope.size} øvelser)`);
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
            lines.push('🏆 Bedste nogensinde (kg×reps)');
            lines.push(`  ${bests.join(' · ')}`);
        }

        lines.push('');
        lines.push('📤 Send til Binky (AI-træner)');

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
            opts.push({ value: 'new', label: `Kun nyt siden sidst (${unshared.length} træning${unshared.length === 1 ? '' : 'er'})` });
        }
        for (const wk of weeks) {
            const mark = wk.shared ? ' ✓ delt' : '';
            const tag = wk.key === current ? ' ← denne uge' : '';
            opts.push({
                value: `week:${wk.key}`,
                label: `${weekLabel(wk.key)} · ${wk.workouts.length} træning${wk.workouts.length === 1 ? '' : 'er'}${mark}${tag}`,
            });
        }
        if (workouts.length > 0) opts.push({ value: 'all', label: `Alle uger (${workouts.length} træninger)` });

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
            ? `⚠️ ${len} tegn — del i 2 beskeder (Discords grænse er 2.000)`
            : `${len} / 2.000 tegn — passer i én besked ✓`;
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
        const copied = () => showToast('Kopieret til udklipsholderen!', 'success');

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
        if (n > 0) showToast(`${n} træning${n === 1 ? '' : 'er'} markeret som delt`, 'success');
    }

    // ─── Start ────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
    