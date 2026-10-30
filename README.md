# Gym Tracker

**Live: https://lausius.github.io/gym-tracker/** — open it on your phone and add it to the home screen.

Mobile-first training log with no backend and no build step: plain HTML, CSS and JavaScript, all data in
`localStorage`, so it runs from a phone, a website, or by opening `index.html` straight from disk.

## Features

- **A/B split:** four programs — `upperA`, `upperB`, `lowerA`, `lowerB`. The next pass is suggested
  (Upper A → Lower A → Upper B → Lower B, alternating upper and lower) and marked `next` in the week
  bar, where `✓` shows what is already logged this week and a tap switches pass. Saving moves you on to
  the pass the bar calls next, so the pass you stand on and the pass the app suggests cannot disagree.
- **Exercises, sets, reps, volume:** every exercise has its own sets (kg × reps); volume is computed per
  set and per exercise.
- **Equipment variants are kept apart:** `Bicep Curl (EZ-bar)` and `Bicep Curl (Dumbbell)` are separate
  entries with their own history — 20 kg on an EZ-bar and 20 kg per hand are not the same load. Dumbbell
  and single-leg exercises carry a **per hand** / **per leg** tag. Cable Lateral Raise and Dual Bicep
  Cable Curl sit in Upper B and Cable Pull-Through in Lower A; Cable Row, Lat Extension and Cable
  Reverse Fly are reachable by swapping them into a row.
- **The pass is the program:** the program rows are always the cards, in program order. Nothing is
  filtered and there is no "add exercise" — a different exercise is picked by **swapping** it into a row:
  tap the name (▾) and choose among exercises sharing a muscle group (full match first, never one already
  in today's workout, never Romanian Deadlift). The new exercise brings **its own** numbers, and the swap
  is remembered for that pass. A pass with fewer rows than the program offers
  **↩︎ 1 exercise missing — restore**.
- **Remembers your last workout:** the cards are filled in from your last saved run of that variant — same
  exercises in the same order, the best set's weight and the number of sets you did — with the program's
  own recommendation next to it. A line says what it remembers
  (`↩︎ Same exercises and weights as your Upper A on 26 October.`, or `Your Upper A program — ready to
  go.`). **Already logged this week?** The pass opens but cannot be saved twice: **Go to Lower A** /
  **Log anyway**.
- **Progressive overload:** a suggestion per exercise — add weight at 8+ reps, more reps below, a rep
  focus once the weight has been stuck for 3 sessions.
- **Warm-up ramp:** every card has a collapsible 🔥 Warm-up computed from the working weight — barbell
  bar → 50% → 70% → 85%, machine/cable 50% → 75%, isolation one light set — rounded to 2.5 kg (1 kg for
  dumbbells) and always below the working weight. It follows a retyped weight without redrawing the card.
  Bodyweight exercises get none.
- **Technique cue:** a short 💡 line under each exercise name, always visible (the `CUES` dictionary in
  `app.js`).
- **Nothing you type is lost:** a session in progress is written to `localStorage` while you type and
  again when the page leaves (**🔒 Kept if the page reloads**), and comes back after a reload with
  "Restored what you had typed". A draft belongs to one pass and one ISO week and is dropped on save.
- **Collapse a finished exercise:** the caret in the card's top right folds it down to the name plus
  `3/3 sets · 1640 kg`, so the exercises left are easy to find. Folded cards are remembered per pass and
  per ISO week; saving clears them.
- **Skipping an exercise:** there is deliberately no ✕ button — write **0 reps** instead. A set only
  counts when both weight and reps are filled in, so zeroing every set drops that exercise from the log.
- **Edit a saved workout:** ✏️ Edit loads it back in — fix the numbers or swap which exercise occupies a
  row (to drop one, write 0 reps) — and **Update workout** overwrites it, keeping date, day and variant.
  **Cancel** writes nothing.
- **Share with an AI coach:** a text report to copy — `Only new since last`, a single week, or all weeks —
  tracking what you have already sent. Weeks are ISO (Mon–Sun). The window shows the character count:
  Discord allows 2,000 per message and a week is ~1,000–1,850.
- **Sample data:** when the log is empty the front page offers three weeks of A/B history in one tap, for
  trying the app on a domain that has none of your data. It never touches real workouts.
- **History:** all saved sessions grouped by date with the best set highlighted.

## Sharing: how often and why

**Once a week, after the last workout of the week** — that is what `Only new since last` is built for, and
one week is one full A/B cycle (every exercise once) and one message (~1,850 characters worst case).
Share right away if something hurts; skipping a week loses nothing, the next share picks it up. Weekly
feedback shows whether the double progression is working, every 4th–6th week whether a lift has genuinely
stagnated. A reminder goes out Sunday at 21:00 in `#codeslop`.

One limitation worth knowing: the app's stagnation rule looks only at **weight**, not reps, so
80×8 → 80×10 → 80×12 counts as "3 sessions at 80 kg" and gets a rep-focus suggestion even though you added
reps every time. The sets in the report matter more than the suggestion.

## Running the app

```bash
xdg-open index.html                             # works straight from disk
python3 -m http.server 8099 --bind 127.0.0.1    # …or serve it → http://127.0.0.1:8099/
```

State lives in `localStorage`: `gym_tracker_workouts` (saved sessions), `gym_tracker_current_day`,
`gym_tracker_settings`, `gym_tracker_program_swaps` (remembered swaps), `gym_tracker_draft` (the session
in progress), `gym_tracker_collapsed` (folded cards).

## Structure

```
index.html              markup only — references styles.css and app.js
styles.css              all CSS, including the :root variables
app.js                  all logic (classic script, no modules — so file:// works)
tests/run-tests.js      logic and structure tests (no browser)
tests/browser-check.js  end-to-end test via Chrome DevTools Protocol
.github/workflows/      CI: syntax check + logic tests on every push
```

No build step: the files are served as they are.

## Tests

```bash
node tests/run-tests.js                                             # logic, no browser
python3 -m http.server 8099 --bind 127.0.0.1 &                      # the browser suite needs a server
node tests/browser-check.js
node tests/browser-check.js https://lausius.github.io/gym-tracker/  # …or the live site
CHROME_BIN=/path/to/chrome node tests/browser-check.js              # override Playwright's Chrome
```

The browser suite drives Chromium over the DevTools Protocol through the whole journey — load, switch
pass, type, save, reload, history, share, edit, swap, week lock, sample data, collapse — plus the mobile
layout at 320 and 390px. Both suites clear `localStorage` at start, so they can be run repeatedly.

## Workflow: changes arrive as PRs

`main` is protected: a pull request is required, `logic-tests` must be green, force-push and deletion are
off, and `enforce_admins` is on — a direct push is rejected even for the owner:

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
```

```sh
git switch -c feat/my-change
node tests/run-tests.js && node tests/browser-check.js
git commit -am "feat: ..." && git push -u origin feat/my-change && gh pr create --fill
```

Merging deletes the branch (`delete_branch_on_merge`); clean up locally with
`git switch main && git pull && git fetch --prune && git branch -d feat/my-change`. The optional
`scripts/hooks/pre-push` catches an accidental push to `main` before the network round trip — enable it
once per clone with `git config core.hooksPath scripts/hooks`, override a deliberate push with
`ALLOW_MAIN_PUSH=1 git push origin main`.

If you ever need to push to `main` directly, turn the admin rule off and back on:

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

## Previewing a PR on your phone

The live site follows `main`, so a PR can only be seen after it is merged. Netlify gives every pull
request its own URL:

```
https://deploy-preview-<PR number>--mellow-conkies-448bd3.netlify.app
```

Two gotchas, both dashboard-only (**Project configuration → General → Visitor access** — no API or CLI):

- **Project visibility must be Public.** New projects after 28 July 2026 default to private and answer
  `401` behind the Netlify login.
- **Previews have their own setting and are private by default**, so setting only the project leaves
  `deploy-preview-…` on `401` while production answers `200`.

A PR that was open before Netlify was connected gets no preview until something is pushed to its branch.
The preview is a different domain and therefore starts **without your training data** — that is the point
(unapproved code cannot touch the real log), and it is why **Load sample data** exists. Recreating the
project: build command empty, publish directory `/`.
