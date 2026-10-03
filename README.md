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
  - **Cable-familien** (tilføjet efter ønske): `Cable Lateral Raise`, `Cable Row (Per hånd)`,
    `Dual Bicep Cable Curl`, `Lat Extension` og `Cable Reverse Fly`. De ligger **kun** i
    øvelsesdatabasen — ikke i A/B-programmerne — så de vælges manuelt med ＋ Tilføj øvelse.
    `Cable Row (Per hånd)` er den eneste af dem der er markeret "per hånd".
- **Progressiv overload:** forslag til næste træning pr. øvelse — vægt op ved 8+ reps,
  flere reps når du er under, og rep-fokus hvis vægten har stået stille i 3 sessioner.
- **Kun øvelser du faktisk laver:** "Næste uge" og "Dagens program" viser kun øvelser du har
  udført mindst én gang. En øvelse tæller som udført, når den står med mindst ét sæt i en
  gemt træning for den dag — nogensinde, ikke kun for nylig. Det holder listerne korte i
  stedet for at fylde dem med hele øvelsesdatabasen, hvor det meste bare ville sige "Ingen
  historik endnu".
  - Knappen **Vis alle (n)** henter de skjulte frem — fx når du vil begynde på en ny øvelse.
    Vælgeren "＋ Tilføj øvelse" har altid hele listen.
  - **Tilføj alle til dagens træning** lægger kun de synlige øvelser ind, så de skjulte ikke
    kommer med bagvejen.
  - Uden historik for dagen filtreres der ikke, og en variant du aldrig har kørt vises i fuld
    længde — ellers ville Lower B stå tom, bare fordi du hidtil kun har kørt Lower A.
  - Kropsvægtøvelser (Plank, Pull-up) filtreres **aldrig** væk: der gemmes kun sæt med vægt
    over 0, så de kan ikke føre vægthistorik. Uden den undtagelse ville de forsvinde fra
    programmet efter det første gem — for bestandigt.
  - En **helt ny** øvelse er derfor ikke i listerne, før du har udført den én gang. Den kan
    altid vælges med **＋ Tilføj øvelse**, og dukker op af sig selv bagefter.
- **Eksempeldata til test:** nederst i reglerne (📖 Regler) kan du fylde tre ugers A/B-historik
  ind med ét tryk — praktisk i en preview på et andet domæne, hvor der ikke ligger data. Den
  rører **aldrig** dine egne træninger: knappen tilbydes kun når loggen er tom eller kun
  indeholder eksempeldata, og den skjules helt så snart der ligger en rigtig træning.
- **Historik:** alle gemte sessioner grupperet pr. dato med bedste sæt markeret.
- **Rediger en gemt træning:** glemte du en øvelse, trykker du ✏️ Rediger på træningen i
  historikken. Øvelserne indlæses igen, du kan tilføje/rette/fjerne, og knappen hedder så
  **Opdater træning**. Datoen, dagen og varianten bevares, og der laves ikke en dublet —
  også hvis du først retter træningen dagen efter. **Annuller** forlader redigeringen uden
  at skrive noget.
- **Del med AI-træner:** genererer en tekst-rapport klar til at kopiere. Du vælger selv
  tidsrummet i delingsvinduet:

  - `Kun nyt siden sidst` — kun de træninger du ikke har sendt før (markeres automatisk
    når du kopierer, så du slipper for at kopiere det hele hver gang)
  - en bestemt uge, fx `Uge 40 (28.9–4.10) · 3 træninger ✓ delt`
  - `Alle uger`

  Uger følger ISO-kalenderen (mandag–søndag), så `uge 40` er den samme uge som i din
  kalender. Rapporten viser uge-overskrift, træningslog, en fremgangs-headline og en
  kompakt liste med bedste sæt nogensinde pr. øvelse — den sidste er med vilje altid med,
  så trenden ikke går tabt når man kun deler én uge.

  **Tegnbudgettet er styrende:** Discord tillader 2.000 tegn pr. besked, og den gamle
  eksport ramte ~8.000 tegn og kunne slet ikke sendes. En uge ligger nu på ~1.000–1.850
  tegn og passer i én besked. Delingsvinduet viser hele tiden `1.365 / 2.000 tegn`, så en
  for lang eksport opdages før man prøver at sende den.
- **Programregler** i appen under 📖 Regler.

## Deling: hvor ofte og hvorfor

**Del én gang om ugen, efter ugens sidste træning.** Delingsvinduets `Kun nyt siden sidst`
er bygget til netop den rytme.

Hvorfor ugentligt og ikke oftere:

- **En uge = én fuld A/B-cyklus.** Så har hver øvelse været forbi præcis én gang. Deler du
  midt i ugen, har halvdelen af programmet ingen ny sammenligning at holde op mod.
- **En uge er én besked.** Worst case — 4 træninger dækkende begge varianter — ligger på
  ~1.850 tegn mod Discords 2.000. Se tegntælleren i delingsvinduet.
- **Appens stagnation-regel tæller unikke datoer med samme vægt og slår til ved 3.** I et
  A/B-split kommer hver øvelse forbi én gang om ugen, altså **3 uger**. Deler du ugentligt,
  kan en stagnation fanges i uge 2 — en uge før appen selv flagger den.
- **Ikke oftere:** hver øvelse kommer kun forbi én gang om ugen, så en midt-uge-deling
  indeholder de samme tal uden et nyt sammenligningspunkt.

Del med det samme — vent ikke til ugen er slut — hvis noget gør ondt, eller hvis en løft
pludselig føles forkert.

Springer du en uge over, er intet tabt: `Kun nyt siden sidst` samler det op næste gang.

**Hvad du kan forvente af feedbacken:**

- **Ugentligt:** virker dobbelt-progressionen, falder reps når vægten stiger, bliver en
  øvelse sprunget over, hvordan bevæger volumen sig.
- **Hver 4.–6. uge:** det større blik — om en løft reelt er stagneret eller bare havde en
  dårlig uge, og om upper/lower-balancen er skæv. Det kan man ikke sige noget rigtigt om ud
  fra én uge alene.

**Én begrænsning i appens egen regel, værd at kende:** stagnation-reglen kigger kun på
**vægten**, ikke på reps. Går du 80×8 → 80×10 → 80×12, tæller det som "3 sammenhænge med
80 kg", og appen foreslår rep-fokus som om du stod stille — mens du i virkeligheden har øget
reps hver gang. Derfor er de faktiske sæt i rapporten vigtigere end appens forslag alene.

Den første deling er den største, fordi den tager hele historikken. Derefter er det én uge ad
gangen. Der ligger en påmindelse **søndag kl. 21** i `#codeslop`.

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

## Preview af en PR (test fra telefonen)

Produktionssiden kommer fra `main` via GitHub Pages, så den kan man først se **efter** merge.
For at kunne teste en PR på telefonen **inden** den merges, kobles repoet til **Netlify**, som
giver hver pull request sin egen URL af formen
`https://deploy-preview-<PR-nummer>--<site>.netlify.app` — fx `deploy-preview-6--...` for PR #6.
URL'en opdateres automatisk hver gang der pushes nye commits til branchen, og Netlify skriver
også et link i PR'ens checks.

### Opsætning (gøres én gang)

1. Opret en gratis konto på [app.netlify.com](https://app.netlify.com/signup).
2. Vælg **Add new site → Import an existing project → GitHub** og giv Netlify adgang til
   `Lausius/gym-tracker`.
3. Sæt **Build command** til at være **tom**, og **Publish directory** til `/` (repoets rod).
   Der er ingen build-step — filerne ligger klar i repoet.
4. Deploy. Netlify opretter også en produktions-URL (`<site>.netlify.app`); den bruges ikke til
   noget. GitHub Pages er fortsat den rigtige side — det er kun `deploy-preview-…`-URL'erne der
   er interessante.

### Vigtigt: preview'en har ikke dine data

Preview'en ligger på et **andet domæne** end `lausius.github.io`, og `localStorage` er bundet
til domænet. Preview'en starter derfor **uden dine træningsdata**. Det er med vilje: en preview
kører kode der ikke er godkendt endnu, og på et separat domæne kan den ikke skrive i din rigtige
træningslog.

Konsekvensen er at data-afhængige ting ikke viser noget på en tom preview — fx viser
filtreringen hele listen, netop fordi reglen er "vis alt når der ingen historik er". Derfor
findes **🧪 Fyld med eksempeldata** i reglerne (📖 Regler → nederst): den skriver tre ugers
A/B-historik med samme form som rigtige data, så filtrering, rotation, forslag og uge-deling
kan prøves med det samme.

### Alternativ: Cloudflare Pages

Cloudflare Pages gør præcis det samme og er lige så gratis. Forskellen er URL'en: Cloudflare
giver en hash-URL plus et stabilt alias pr. branch, fx
`feat-filtrer-oevelser-uden-historik.<projekt>.pages.dev` (branch-navnet med `-` i stedet for
`/`). Netlify er valgt her fordi `deploy-preview-6--…` er nemmere at læse og huske.

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

**Branchen slettes automatisk ved merge.** Repoet har `delete_branch_on_merge` slået til, så
du ikke skal rydde op efter hver PR:

```sh
gh api repos/Lausius/gym-tracker --jq '.delete_branch_on_merge'
```

Efter et merge rydder du den lokale kopi sådan:

```sh
git switch main && git pull && git fetch --prune && git branch -d feat/min-aendring
```

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
**redigering af en gemt træning** (inkl. annullering og at et nyt gem ikke dublerer),
**uge-opdelt deling med tegnbudget** (vælg uge, kopiér, markering som delt),
**filtrering af øvelser uden historik** (Vis alle-knappen, "Tilføj alle" der kun tager de
synlige, at en variant man aldrig har kørt ikke bliver tømt, og at kropsvægtøvelser overlever
et gem), **eksempeldata** (fyld, ryd, og at knappen ikke kan bruges når der ligger rigtige
træninger), **de nye cable-øvelser** (kan vælges, er grupperet rigtigt, kun row-varianten bærer
"per hånd", og de ligger ikke i programmerne), og mobillayout ved 320/375/390/430px (bl.a. at
＋/✕-knapper ikke flytter sig når teksten bliver længere, og at intet flyder ud over kanten).

Testene rydder `localStorage` ved start, så en kørsel ikke arver state fra den forrige — de
kan køres vilkårligt mange gange i træk med samme resultat.

Chrome-stien er sat til Playwrights cache; override med miljøvariablen:

```bash
CHROME_BIN=/sti/til/chrome node tests/browser-check.js
```