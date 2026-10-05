# Gym Tracker

**Live: https://lausius.github.io/gym-tracker/** — open it on your phone and add it to the home screen.

Mobile-first training log with no backend and no build step: plain HTML, CSS and JavaScript.
All data is stored locally in the browser's `localStorage`, so the app runs from a phone, a
website, or by opening `index.html` straight from disk.

## Features

- **A/B split (upper/lower):** four programs — `upperA`, `upperB`, `lowerA`, `lowerB`.
  The app suggests the next variant automatically from your most recent saved workout
  (Upper A → Lower A → Upper B → Lower B → repeat). Always overridable with the A/B buttons.
- **Exercises, weight, sets and reps per session:** every exercise has its own sets with kg × reps,
  and volume (kg × reps) is computed per set and per exercise.
- **Equipment variants are kept apart:** e.g. `Bicep Curl (Barbell)`, `(EZ-bar)` and `(Dumbbell)` are
  three entries with their own history and their own progression — 20 kg on an EZ-bar and 20 kg in each
  hand are not the same load, so a shared suggestion would be wrong. Dumbbell and
  single-leg exercises are marked "per hand" / "per leg", and the dropdown is grouped by
  muscle group.
  - **The cable family** (added on request): `Cable Lateral Raise`, `Cable Row (Per hand)`,
    `Dual Bicep Cable Curl`, `Lat Extension` and `Cable Reverse Fly`. They live **only** in the
    exercise database — not in the A/B programs — so you pick them manually with ＋ Add exercise.
    `Cable Row (Per hand)` is the only one of them marked "per hand".
- **Progressive overload:** a suggestion for the next workout per exercise — add weight at 8+ reps,
  more reps when you are below, and a rep focus if the weight has been stuck for 3 sessions.
- **Warm-up sets per exercise:** every card has a collapsible 🔥 Warm-up that computes the ramp
  from the working weight (the heaviest set in the exercise). Compound barbell lifts:
  bar → 50% → 70% → 85%; machine/cable: 50% → 75%; isolation: one light set (~60%).
  The ramp is rounded to 2.5 kg (1 kg for dumbbells) and always stays below the working weight.
  Retype the weight and the ramp follows immediately — without redrawing the card, so an open
  ramp and your cursor stay put. Bodyweight exercises get no ramp (there is no number to ramp).
  The ramp is a suggestion: if you are already warm from an earlier exercise, one light set is enough.
- **Technique cues per exercise:** a short 💡 line under the exercise name with the one thing
  that matters for that lift. Always visible, never behind a fold — the point is to read it while
  standing at the rack. The text lives in the `CUES` dictionary in `app.js`; the longer English
  originals are in `warmup-and-cues.md`.
- **Only exercises you actually do:** "Next week" shows only exercises you have performed at least
  once. An exercise counts as performed when it has at least one set in a saved workout for that day —
  ever, not just recently. That keeps the list short instead of filling it with the whole
  exercise database, where most entries would just say "No history yet".
  - The **Show all (n)** button reveals the hidden ones — e.g. when you want to start a new exercise.
    The "＋ Add exercise" picker always has the full list.
  - With no history for the day nothing is filtered, so a new user is not left with empty lists.
  - Bodyweight exercises (Plank, Pull-up) are **never** filtered out: only sets with weight
    above 0 are stored, so they cannot build weight history. Without that exception they would
    disappear from the list after the first save — permanently.
  - A **brand new** exercise is therefore not in the list until you have performed it once. It can
    always be picked with **＋ Add exercise**, and shows up on its own afterwards.
- **Today's program remembers your last workout:** if you have run e.g. Lower B before, "Today's program"
  shows **that** workout — same exercises in the same order and with the weight from the
  best set last time — so you can repeat it with one tap on **Add all**. The template
  is used only when there is nothing to remember yet (the first time you run the variant).
  - A line under the heading says which workout is remembered, and from which date.
  - Exercises you added yourself (e.g. a cable exercise not in the template) are remembered too.
  - **Show all (n)** reveals the template's remaining exercises if you want to add something new.
  - There is deliberately **no ↻ button** in the program header: A/B is switched with the variant
    buttons below, and ↻ could only do the same thing.
- **Sample data for testing:** on the front page (visible only when the log is empty) you can fill in
  three weeks of A/B history with one tap — handy in a preview on another domain, where no data
  exists. It **never** touches your own workouts: the block is shown only when the log is empty or
  contains sample data only, and it is hidden completely as soon as a real workout is in there.
- **History:** all saved sessions grouped by date with the best set highlighted.
- **Edit a saved workout:** forgot an exercise? Tap ✏️ Edit on the workout in the
  history. The exercises are loaded back in, you can add/fix/remove, and the button then reads
  **Update workout**. The date, the day and the variant are preserved, and no duplicate is created —
  also if you only fix the workout the following day. **Cancel** leaves the edit without
  writing anything.
- **Share with an AI coach:** generates a text report ready to copy. You pick the
  time range in the share window:

  - `Only new since last` — only the workouts you have not sent before (marked automatically
    when you copy, so you do not have to copy everything every time)
  - a specific week, e.g. `Week 40 (28.9–4.10) · 3 workouts ✓ shared`
  - `All weeks`

  Weeks follow the ISO calendar (Monday–Sunday), so `week 40` is the same week as in your
  calendar. The report shows a week heading, the training log, a progress headline and a
  compact list of the best set ever per exercise — the last one is deliberately always included,
  so the trend is not lost when you only share a single week.

  **The character budget drives the design:** Discord allows 2,000 characters per message, and the old
  export hit ~8,000 characters and could not be sent at all. A week is now ~1,000–1,850
  characters and fits in one message. The share window always shows `1,365 / 2,000 characters`, so an
  over-long export is caught before you try to send it.
- **Program rules** live in the README (progressive overload, sets and rest, why
  equipment variants are kept apart). There is deliberately no rules button in the app.

## Sharing: how often and why

**Share once a week, after the last workout of the week.** The share window's `Only new since last`
is built for exactly that rhythm.

Why weekly and not more often:

- **One week = one full A/B cycle.** Then every exercise has been through exactly once. If you share
  mid-week, half the program has no new comparison to measure against.
- **One week is one message.** Worst case — 4 workouts covering both variants — lands at
  ~1,850 characters against Discord's 2,000. See the character counter in the share window.
- **The app's stagnation rule counts unique dates with the same weight and triggers at 3.** In an
  A/B split each exercise comes around once a week, so **3 weeks**. If you share weekly,
  a stagnation can be caught in week 2 — a week before the app flags it itself.
- **Not more often:** each exercise only comes around once a week, so a mid-week share
  contains the same numbers without a new comparison point.

Share right away — do not wait for the week to end — if something hurts, or if a lift
suddenly feels wrong.

If you skip a week, nothing is lost: `Only new since last` picks it up next time.

**What to expect from the feedback:**

- **Weekly:** is the double progression working, do reps drop when the weight goes up, is an
  exercise being skipped, how is the volume moving.
- **Every 4th–6th week:** the bigger picture — whether a lift has genuinely stagnated or just had a
  bad week, and whether the upper/lower balance is off. That cannot be said reliably from
  one week alone.

**One limitation in the app's own rule, worth knowing:** the stagnation rule looks only at
**the weight**, not at reps. Going 80×8 → 80×10 → 80×12 counts as "3 sessions with
80 kg", and the app suggests a rep focus as if you were standing still — while you have in fact added
reps every time. That is why the actual sets in the report matter more than the app's suggestion alone.

The first share is the biggest, because it carries the whole history. After that it is one week at
a time. There is a reminder **Sunday at 21:00** in `#codeslop`.

## Running the app

```bash
# Open directly (works — classic <link>/<script src> are not affected by file:// restrictions)
xdg-open index.html

# …or serve it
python3 -m http.server 8099 --bind 127.0.0.1
# → http://127.0.0.1:8099/
```

All state lives in three `localStorage` keys: `gym_tracker_workouts`,
`gym_tracker_current_day` and `gym_tracker_settings`.

## Structure

```
index.html              markup only — references styles.css and app.js
styles.css              all CSS, including the :root variables
app.js                  all application logic (classic script, no modules)
tests/run-tests.js      logic and structure tests (no browser)
tests/browser-check.js  end-to-end test via Chrome DevTools Protocol
.github/workflows/      CI: syntax check + logic tests on every push
```

There is deliberately no build step: the files are served as they are, and `app.js` is a classic
script (not an ES module), so `file://` still works.

## Previewing a PR (testing from your phone)

The production site comes from `main` via GitHub Pages, so it can only be seen **after** a merge.
To test a PR on your phone **before** it is merged, the repo is connected to **Netlify**,
which gives every pull request its own URL:

```
https://deploy-preview-<PR number>--mellow-conkies-448bd3.netlify.app
```

E.g. `deploy-preview-7--mellow-conkies-448bd3.netlify.app` for PR #7. (Netlify also has a
production URL, `mellow-conkies-448bd3.netlify.app`, which follows `main`. It is not used for
anything — GitHub Pages is the real site.)

### Important: the project must be Public

**A new Netlify team created after 28 July 2026 defaults new projects to "Private".** The page then
answers `401` with an `edge-access` redirect to the Netlify login, and it cannot be opened on your
phone — not even by you, without signing in with your Netlify account.

Turn it off: **Project configuration → General → Visitor access → Project visibility → Edit
visibility → Public → Save.**

**Previews have their own setting and are private by default.** Netlify says so
directly: *"Previews stay private by default, including Deploy Previews, agent-run previews, and
branch deploys."* Setting only the project visibility to Public leaves production open while
`deploy-preview-…` still answers `401`. So preview visibility must also be set to
**Public** in the same area under Visitor access. Worth checking afterwards, because the difference
only shows by fetching the preview URL: production answers `200`, preview `401`.

Those settings have, incidentally, **no API, no CLI and no tooling** — dashboard only. So they
cannot be set from a script or by an agent.

It is not an accident that making them public is fine: the app has no backend, and
all training data lives in **each visitor's own** `localStorage`. There is no data on the
server to expose.

### Deploy Previews are only built for PRs created or updated AFTER the connection

A PR that was open before Netlify was connected does not get a preview on its own — it needs a
new push to the branch. That is also why `deploy-preview-<n>` can answer `404` on a PR
that otherwise looks fine on GitHub.

### Setup (already done — repeated only if the project has to be recreated)

1. Create a free account at [app.netlify.com](https://app.netlify.com/signup).
2. Choose **Add new site → Import an existing project → GitHub** and give Netlify access to
   `Lausius/gym-tracker`.
3. Set **Build command** to **empty**, and **Publish directory** to `/` (the repo root).
   There is no build step — the files are already in the repo.
4. Set **Project visibility** to **Public** (see above).

The URL updates automatically every time new commits are pushed to the branch, and Netlify also
writes a link in the PR's checks.

### Important: the preview does not have your data

The preview lives on a **different domain** from `lausius.github.io`, and `localStorage` is bound
to the domain. The preview therefore starts **without your training data**. That is deliberate: a preview
runs code that has not been approved yet, and on a separate domain it cannot write to your real
training log.

The consequence is that data-dependent things show nothing on an empty preview — e.g. the
filtering shows the whole list, precisely because the rule is "show everything when there is no
history". That is why **Load sample data** exists on the front page (visible only when the log is empty):
it writes three weeks of A/B history with the same shape as real data, so filtering, rotation, suggestions
and week sharing can be tried right away.

### Alternative: Cloudflare Pages

Cloudflare Pages does exactly the same and is just as free. The difference is the URL: Cloudflare
gives a hash URL plus a stable alias per branch, e.g.
`feat-filtrer-oevelser-uden-historik.<project>.pages.dev` (the branch name with `-` instead of
`/`). Netlify was chosen here because `deploy-preview-<n>--…` is easier to read and remember.

## Workflow: changes arrive as PRs

`main` is protected and must not be pushed to directly. All changes — even small ones —
go through a branch and a pull request, so they can be reviewed before merge.

```sh
git switch -c feat/my-change
# ... fix the code, run the tests ...
node tests/run-tests.js && node tests/browser-check.js
git commit -am "feat: ..."
git push -u origin feat/my-change
gh pr create --fill
```

CI (`.github/workflows/tests.yml`) runs automatically on pull requests, and
`logic-tests` is a required check: the PR cannot be merged until the tests are green.

**The branch is deleted automatically on merge.** The repo has `delete_branch_on_merge` enabled, so
you do not have to clean up after every PR:

```sh
gh api repos/Lausius/gym-tracker --jq '.delete_branch_on_merge'
```

After a merge, clean up your local copy like this:

```sh
git switch main && git pull && git fetch --prune && git branch -d feat/my-change
```

### Protection in practice

**On GitHub — the part that actually enforces the rule.** Branch protection on `main` requires
a pull request, `logic-tests` must be green, and force-push/deletion are disabled.
`enforce_admins` is **on**, so the rule applies to the repo owner too: a push to `main`
is rejected by the server regardless of which credentials are used.

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "logic-tests" is expected.
```

There is no requirement for approval from another account (the repo has only one), so you can merge
the PR yourself once the check is green. If you ever need to push directly to `main`,
turn the admin rule off temporarily and back on again:

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

**Locally — convenience only.** `scripts/hooks/pre-push` gives a faster and nicer
error message: it catches the mistake before the network round trip and works offline. The server
above is what guarantees the rule, so the hook is optional. Enable it once per clone:

```sh
git config core.hooksPath scripts/hooks
```

Deliberate override, when you really mean it:

```sh
ALLOW_MAIN_PUSH=1 git push origin main
```

## Tests

Run them like this:

```bash
# 1) Logic without a browser: A/B rotation, program integrity, progressive overload,
#    the warm-up ramp, equipment variants, and that the split across
#    index.html/styles.css/app.js hangs together
node tests/run-tests.js

# 2) Full user journey in headless Chrome (requires a server running on port 8099)
python3 -m http.server 8099 --bind 127.0.0.1 &
node tests/browser-check.js

# ... or against the published site
node tests/browser-check.js https://lausius.github.io/gym-tracker/
```

`tests/browser-check.js` drives Chromium over the DevTools Protocol and covers: loading without
JS errors, loading a program, switching the A/B variant, fixing weight/reps, adding a set, saving,
**reload with persistence and rotation**, history, the share modal, equipment variants in the UI,
**editing a saved workout** (including cancelling and that a new save does not duplicate),
**week-based sharing with a character budget** (pick a week, copy, mark as shared),
**the warm-up ramp** (shown on the card, collapsed by default, follows an edited weight and stays open
while you edit),
**the technique cues** (visible without unfolding, one per card, above the warm-up block),
**filtering of exercises without history in "Next week"** (the Show all button, that a new user is not
left with empty lists, and that bodyweight exercises do not disappear), **"Today's program" that remembers
the last workout** (run a variant, fix it, save, and see the program repeat it — including the
"Remembering" line, that "Add all" loads the remembered workout with the same weight, that the template
can still be brought up with "Show all", and that the ↻ button is gone), **sample data** (fill, clear, and that the button cannot be used when real
workouts are present), **the new cable exercises** (can be picked, are grouped correctly, only the row variant carries
"per hand", and they are not in the programs), and the mobile layout at 320/375/390/430px (including that
the ＋/✕ buttons do not move when the text gets longer, and that nothing spills past the edge).

The tests clear `localStorage` at start, so a run does not inherit state from the previous one — they
can be run any number of times in a row with the same result.

The Chrome path is set to Playwright's cache; override it with the environment variable:

```bash
CHROME_BIN=/path/to/chrome node tests/browser-check.js
```
