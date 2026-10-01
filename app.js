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

    // ─── Render Functions ─────────────────────────────────────────
    function renderProgram() {
        const variant = getCurrentVariant();
        const list = getProgram(state.currentDay, variant);
        const content = document.getElementById('program-content');
        const hint = document.getElementById('variant-hint');

        document.querySelectorAll('.variant-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.variant === variant);
        });
        if (hint) hint.textContent = state.programVariant ? 'valgt' : 'foreslået';

        if (list.length === 0) {
            content.innerHTML = '<div class="program-ex-meta">Intet program fundet</div>';
            return;
        }

        content.innerHTML = list.map(item => {
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
        const exercises = ALL_EXERCISES[state.currentDay];

        // Always show suggestions for all exercises in this day's category
        list.innerHTML = exercises.map(ex => {
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
        const list = getProgram(state.currentDay, variant);
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
            showToast(`${label} indlæst — ${added} øvelser tilføjet`, 'success');
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
                                        <span class="history-workout-meta">${exCount} øvelse${exCount === 1 ? '' : 'r'} · ${totalVol.toFixed(0)} kg totalt</span>
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
                renderAll();
            });
        });

        // Event: Program (A/B)
        document.getElementById('program-load').addEventListener('click', loadProgramAll);
        document.getElementById('program-refresh').addEventListener('click', toggleProgramVariant);
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

    // ─── Share with trainer ────────────────────────────────────────
    function generateShareText() {
        const workouts = loadWorkouts();
        if (workouts.length === 0) {
            return '📋 Ingen træninger gemt endnu.\n\nKopier denne tekst og send den til mig når du har nogle træninger — så kan jeg hjælpe med feedback!';
        }

        const lines = [];
        lines.push('═══════════════════════════════════════');
        lines.push('🏋️  GYM TRACKER — TRÆNINGSOVERBLIK');
        lines.push('═══════════════════════════════════════');
        lines.push('');

        // Stats
        const totalWorkouts = workouts.length;
        const upperCount = workouts.filter(w => w.day === 'upper').length;
        const lowerCount = workouts.filter(w => w.day === 'lower').length;
        const totalSets = workouts.reduce((sum, w) =>
            sum + (w.exercises?.reduce((s, e) => s + e.sets.length, 0) || 0), 0);
        const totalVolume = workouts.reduce((sum, w) =>
            sum + (w.exercises?.reduce((s, e) => s + e.sets.reduce((sv, set) => sv + (set.weight * set.reps), 0), 0) || 0), 0);

        lines.push(`📊 OVERBLIK`);
        lines.push(`   Totalt: ${totalWorkouts} træninger`);
        lines.push(`   Upper: ${upperCount}  |  Lower: ${lowerCount}`);
        lines.push(`   Sæt: ${totalSets}  |  Volumen: ${totalVolume.toFixed(0)} kg`);
        lines.push('');

        // Per exercise history
        const allExerciseIds = new Set();
        for (const w of workouts) {
            for (const ex of (w.exercises || [])) {
                allExerciseIds.add(ex.exerciseId);
            }
        }

        lines.push(`═══════════════════════════════════════`);
        lines.push(`📈 FREMGANGSHISTORIK PER ØVELSE`);
        lines.push('═══════════════════════════════════════');
        lines.push('');

        for (const exerciseId of allExerciseIds) {
            const exercise = getExerciseById(workouts[0]?.day === 'upper' ? 'upper' : 'lower', exerciseId)
                || getExerciseById('upper', exerciseId)
                || getExerciseById('lower', exerciseId);
            const exName = exercise ? exercise.name : exerciseId;
            const exMuscle = exercise ? exercise.muscle : '?';
            const exEquip = exercise && exercise.equipment ? exercise.equipment : '?';
            const exLoad = exercise && exercise.loadNote ? `, ${exercise.loadNote}` : '';

            // Collect all sets for this exercise
            const sets = [];
            for (const w of workouts) {
                for (const ex of (w.exercises || [])) {
                    if (ex.exerciseId === exerciseId) {
                        for (const set of ex.sets) {
                            sets.push({ weight: set.weight, reps: set.reps, date: w.date, day: w.day });
                        }
                    }
                }
            }

            if (sets.length === 0) continue;

            sets.sort((a, b) => a.date.localeCompare(b.date));

            const bestSet = sets.reduce((b, s) => (!b || s.weight > b.weight) ? s : b, sets[0]);
            const recentSet = sets[sets.length - 1];
            const firstSet = sets[0];

            lines.push(`🔹 ${exName} (${exMuscle}, ${exEquip}${exLoad})`);
            lines.push(`   Første: ${firstSet.weight} kg × ${firstSet.reps} reps (${firstSet.date})`);
            lines.push(`   Sidste: ${recentSet.weight} kg × ${recentSet.reps} reps (${recentSet.date})`);
            if (bestSet && bestSet !== recentSet) {
                lines.push(`   🏆 PR: ${bestSet.weight} kg × ${bestSet.reps} reps (${bestSet.date})`);
            }
            lines.push(`   Sæt i alt: ${sets.length}`);
            lines.push('');
        }

        // Workout log
        lines.push('═══════════════════════════════════════');
        lines.push(`📋 TRÆNINGSLOG (seneste → ældste)`);
        lines.push('═══════════════════════════════════════');

        const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
        const recentWorkouts = sorted.slice(0, 10);

        for (const w of recentWorkouts) {
            const dayLabel = w.day === 'upper' ? 'UPPER' : 'LOWER';
            lines.push(``);
            lines.push(`${w.date} — ${dayLabel}`);
            for (const ex of (w.exercises || [])) {
                const exData = getExerciseById(w.day, ex.exerciseId);
                const name = exData ? exData.name : ex.exerciseId;
                const setsStr = ex.sets.map(s => `${s.weight}×${s.reps}`).join(' | ');
                lines.push(`   ${name}: ${setsStr}`);
            }
        }

        if (sorted.length > 10) {
            lines.push(`   ... og ${sorted.length - 10} flere træninger`);
        }

        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('📤 Sending til Binky (AI-træner)');

        return lines.join('\n');
    }

    function showShareModal() {
        const text = generateShareText();
        document.getElementById('share-text').value = text;
        document.getElementById('share-overlay').classList.remove('hidden');
        document.getElementById('share-modal').classList.remove('hidden');
    }

    function closeShareModal() {
        document.getElementById('share-overlay').classList.add('hidden');
        document.getElementById('share-modal').classList.add('hidden');
    }

    function copyShareText() {
        const textarea = document.getElementById('share-text');
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        try {
            navigator.clipboard.writeText(textarea.value).then(() => {
                showToast('Kopieret til udklipsholderen!', 'success');
            }).catch(() => {
                document.execCommand('copy');
                showToast('Kopieret!', 'success');
            });
        } catch {
            document.execCommand('copy');
            showToast('Kopieret!', 'success');
        }
    }

    // ─── Start ────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
    