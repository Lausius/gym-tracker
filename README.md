# Gym Tracker

**Live: https://lausius.github.io/gym-tracker/** — åbn den på telefonen og læg den på hjemmeskærmen.

Mobil-først træningsdagbog uden backend og uden build-step: ren HTML, CSS og JavaScript.
Alle data gemmes lokalt i browserens `localStorage`, så appen kan køre fra en telefon, en
hjemmeside eller ved at åbne `index.html` direkte fra disken.

## Funktioner

- **A/B split (upper/lower):** fire programmer — `upperA`, `upperB`, `lowerA`, `lowerB`.
  Appen foreslår automatisk næste variant ud fra din seneste gemte træning
  (Upper A → Lower A → Upper B → Lower B → forfra). Kan altid overstyres med A/B-knapperne.
- **Øvelser, vægt, sæt og reps pr. session:** hver øvelse har sine egne sæt med kg × reps,
  og volumen (kg × reps) beregnes pr. sæt og pr. øvelse.
- **Redskabsvarianter holdes adskilt:** fx `Bicep Curl (Barbell)`, `(EZ-bar)` og `(Dumbbell)` er
  tre poster med hver sin historik og hver sin progression — 20 kg på en EZ-bar og 20 kg i hver
  hånd er ikke samme belastning, så et fælles forslag ville være forkert. Håndvægt- og
  enkeltbensøvelser er markeret "per hånd" / "per ben", og dropdown'en er grupperet pr.
  muskelgruppe.
- **Progressiv overload:** forslag til næste træning pr. øvelse — vægt op ved 8+ reps,
  flere reps når du er under, og rep-fokus hvis vægten har stået stille i 3 sessioner.
- **Historik:** alle gemte sessioner grupperet pr. dato med bedste sæt markeret.
- **Del med AI-træner:** genererer en formateret tekst-rapport (overblik, fremgang pr. øvelse,
  seneste træninger) klar til at kopiere.
- **Programregler** i appen under 📖 Regler.

## Kør appen

```bash
# Åbn direkte (virker — klassiske <link>/<script src> er ikke ramt af file://-begrænsninger)
xdg-open index.html

# …eller servér den
python3 -m http.server 8099 --bind 127.0.0.1
# → http://127.0.0.1:8099/
```

Alt state ligger i tre `localStorage`-nøgler: `gym_tracker_workouts`,
`gym_tracker_current_day` og `gym_tracker_settings`.

## Struktur

```
index.html              markup alene — refererer styles.css og app.js
styles.css              alt CSS, inkl. :root-variablerne
app.js                  al applikationslogik (klassisk script, ingen moduler)
tests/run-tests.js      logik- og struktur-tests (ingen browser)
tests/browser-check.js  end-to-end test via Chrome DevTools Protocol
.github/workflows/      CI: syntax-tjek + logik-tests på hvert push
```

Der er bevidst ingen build-step: filerne serveres som de er, og `app.js` er et klassisk
script (ikke et ES-modul), så `file://` stadig virker.

## Arbejdsgang: ændringer kommer som PR

`main` er beskyttet og må ikke pushes direkte til. Alle ændringer — også små —
går igennem en branch og en pull request, så de kan reviewes før merge.

```sh
git switch -c feat/min-aendring
# ... ret koden, kør tests ...
node tests/run-tests.js && node tests/browser-check.js
git commit -am "feat: ..."
git push -u origin feat/min-aendring
gh pr create --fill
```

CI (`.github/workflows/tests.yml`) kører automatisk på pull requests, og
`logic-tests` er et påkrævet check: PR'en kan ikke merges før testene er grønne.

### Beskyttelse i praksis

**På GitHub — den del der reelt håndhæver reglen.** Branch protection på `main` kræver
en pull request, `logic-tests` skal være grønt, og force-push/sletning er slået fra.
`enforce_admins` er slået **til**, så reglen også gælder repo-ejeren: et push til `main`
afvises af serveren uanset hvilke credentials der bruges.

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "logic-tests" is expected.
```

Der er ikke krav om godkendelse fra en anden konto (repoet har kun én), så du kan selv
mergie PR'en, når checket er grønt. Skal du en sjælden gang pushe direkte til `main`,
slås admin-reglen midlertidigt fra og til igen:

```sh
gh api -X DELETE repos/Lausius/gym-tracker/branches/main/protection/enforce_admins
# ... push ...
gh api -X PUT repos/Lausius/gym-tracker/branches/main/protection --input - <<'JSON'
{ "required_status_checks": { "strict": false, "contexts": ["logic-tests"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null, "allow_force_pushes": false, "allow_deletions": false }
JSON
```

**Lokalt — kun bekvemmelighed.** `scripts/hooks/pre-push` giver en hurtigere og pænere
fejlbesked: den fanger fejlen før netværksrunden og virker offline. Serveren ovenfor er
den, der garanterer reglen, så hooket er valgfrit. Aktiveres én gang pr. klon:

```sh
git config core.hooksPath scripts/hooks
```

Bevidst override, når man virkelig mener det:

```sh
ALLOW_MAIN_PUSH=1 git push origin main
```

## Tests

Køres sådan:

```bash
# 1) Logik uden browser: A/B-rotation, program-integritet, progressiv overload,
#    redskabsvarianter, samt at opdelingen i index.html/styles.css/app.js hænger sammen
node tests/run-tests.js

# 2) Fuld brugerrejse i headless Chrome (kræver en kørende server på port 8099)
python3 -m http.server 8099 --bind 127.0.0.1 &
node tests/browser-check.js

# ... eller mod den udgivne side
node tests/browser-check.js https://lausius.github.io/gym-tracker/
```

`tests/browser-check.js` driver Chromium over DevTools Protocol og dækker: indlæsning uden
JS-fejl, indlæs program, skift A/B-variant, ret vægt/reps, tilføj sæt, gem, **reload med
persistens og rotation**, historik, del-modal, regler-modal, redskabsvarianter i UI'et,
og mobillayout ved 320/375/390/430px (bl.a. at ＋/✕-knapper ikke flytter sig når teksten
bliver længere, og at intet flyder ud over kanten).

Chrome-stien er sat til Playwrights cache; override med miljøvariablen:

```bash
CHROME_BIN=/sti/til/chrome node tests/browser-check.js
```