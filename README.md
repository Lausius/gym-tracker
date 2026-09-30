# Gym Tracker

**Live: https://lausius.github.io/gym-tracker/** — åbn den på telefonen og læg den på hjemmeskærmen.

Mobil-først træningsdagbog i **én selvstændig HTML-fil** — ingen backend, ingen build-step.
Alle data gemmes lokalt i browserens `localStorage`, så appen kan køre fra en telefon, en
hjemmeside eller bare ved at åbne filen direkte.

## Funktioner

- **A/B split (upper/lower):** fire programmer — `upperA`, `upperB`, `lowerA`, `lowerB`.
  Appen foreslår automatisk næste variant ud fra din seneste gemte træning
  (Upper A → Lower A → Upper B → Lower B → forfra). Kan altid overstyres med A/B-knapperne.
- **Øvelser, vægt, sæt og reps pr. session:** hver øvelse har sine egne sæt med kg × reps,
  og volumen (kg × reps) beregnes pr. sæt og pr. øvelse.
- **Progressiv overload:** forslag til næste træning pr. øvelse — vægt op ved 8+ reps,
  flere reps når du er under, og rep-fokus hvis vægten har stået stille i 3 sessioner.
- **Historik:** alle gemte sessioner grupperet pr. dato med bedste sæt markeret.
- **Del med AI-træner:** genererer en formateret tekst-rapport (overblik, fremgang pr. øvelse,
  seneste træninger) klar til at kopiere.
- **Programregler** i appen under 📖 Regler.

## Kør appen

```bash
# Åbn direkte
xdg-open index.html

# …eller servér den (anbefalet — file:// begrænser localStorage i nogle browsere)
python3 -m http.server 8099 --bind 127.0.0.1
# → http://127.0.0.1:8099/
```

Alt state ligger i tre `localStorage`-nøgler: `gym_tracker_workouts`,
`gym_tracker_current_day` og `gym_tracker_settings`.

## Test

```bash
# 1) Logik uden browser (A/B-rotation, program-integritet, progressiv overload)
node tests/run-tests.js

# 2) Fuld brugerrejse i headless Chrome (kræver en kørende server på port 8099)
python3 -m http.server 8099 --bind 127.0.0.1 &
node tests/browser-check.js
```

`tests/browser-check.js` driver Chromium over DevTools Protocol og dækker: indlæsning uden
JS-fejl, indlæs program, skift A/B-variant, ret vægt/reps, tilføj sæt, gem, **reload med
persistens og rotation**, historik, del-modal, regler-modal, intet vandret overflow ved
mobilbredde.

Chrome-stien er sat til Playwrights cache; override med miljøvariablen:

```bash
CHROME_BIN=/sti/til/chrome node tests/browser-check.js
```

## Struktur

```
index.html              hele appen: HTML + CSS + JS i én fil
tests/run-tests.js      logik-tests (ingen browser)
tests/browser-check.js  end-to-end test via CDP
.github/workflows/      CI: kører logik-testene på hvert push
```