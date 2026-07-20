# Android Routine — the loop

This file is the **operating procedure** for the autonomous Android rebuild of
Meeshy. Read it in full at the start of every run, then read `PROGRESS.md` for
the live state and the next slice.

> **Path note.** The prompt references `tasks/android-routine/`. We keep these
> docs under **`apps/android/tasks/android-routine/`** so that every merged diff
> stays strictly inside `apps/android` (the hard merge gate: *"diff is
> apps/android only"*). All routine/state/notes files live here.

## Sources of truth (read order each run)

1. `ROUTINE.md` (this file) — the loop.
2. `PROGRESS.md` — what is done, what is next, the chosen slice id.
3. `REVIEWER.md` — the mandatory review gate before merge.
4. `TDD-COVERAGE.md` — the coverage rubric (aim: 90% branch + instruction on
   new pure logic; Compose `@Composable` glue is exempt — see that file).
5. `NOTES.md` — lessons, gotchas, environment recipes.
6. `apps/android/tasks/feature-parity.md` — the anti-omission master checklist,
   updated every slice. The integral iOS audit lives in
   `apps/android/tasks/audit/part-01..23.md` (all 673 iOS files read in full).

## Build order (parity sequencing)

`Auth → Conversations → Chat → Feed → Stories → Calls → the rest`

Each area ships in **thin vertical slices**: a pure, fully-tested core plus the
minimum wiring to make it real (no dead ends, no orphan code).

## One run = one phase (slice)

1. **Pick a slice.** From `PROGRESS.md` "Next", or the highest-value unchecked
   box in `feature-parity.md` for the current build-order area. Give it a
   kebab-case `<slice-id>`.
2. **Branch** off the latest `main`: `claude/apps/android/<slice-id>`.
3. **TDD red → green.** Write behavioural tests first (no tautologies, no
   testing of implementation details). Then write the minimum production code.
   Cover the edge-case checklist in `REVIEWER.md`.
4. **Verify locally** (no emulator in CI env):
   - `./apps/android/meeshy.sh build`  — debug APK assembles
   - `./apps/android/meeshy.sh test`   — all JVM unit tests green
   - `./apps/android/meeshy.sh check`  — both at once (use before PR)
5. **Reviewer gate.** Self-run `REVIEWER.md`. Must be PASS.
6. **Update tracking:** `feature-parity.md` (check the boxes that are *verified*
   done), `PROGRESS.md` (state + next), `NOTES.md` (any new lesson), and the
   run log section in `PROGRESS.md`.
7. **PR + CI + merge.** Open a PR, let CI run, then **squash-merge to `main`**
   only when ALL hold:
   - diff is `apps/android` only (no production logic in web/ios/gateway/shared)
   - CI green
   - reviewer PASS
   - clean rebase on `main`
   Otherwise leave the PR open and mark the slice ⚠ blocked in `PROGRESS.md`.
8. **Advance exactly one phase. Leave `main` green.**

## Environment recipe (fresh container)

The repo container has **no Android SDK** by default. Bootstrap once per run:

```bash
# JDK 21 is preinstalled. Install the command-line tools + platform/build-tools:
mkdir -p $HOME/android-sdk/cmdline-tools && cd $HOME/android-sdk/cmdline-tools
curl -sSL -o t.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q t.zip && mv cmdline-tools latest && rm t.zip
yes | $HOME/android-sdk/cmdline-tools/latest/bin/sdkmanager --licenses
$HOME/android-sdk/cmdline-tools/latest/bin/sdkmanager \
  "platforms;android-35" "build-tools;35.0.0" "platform-tools"
echo "sdk.dir=$HOME/android-sdk" > apps/android/local.properties
```

`local.properties` is gitignored — never commit it.

## CI reality

There is **no Android-specific CI workflow** in this repo. The monorepo `ci.yml`
runs on every PR to `main` and tests the JS/TS/Python stack; an `apps/android`-
only diff keeps it green because it touches none of that production code. The
**real Android gate is local**: `./apps/android/meeshy.sh check` must pass before
merge. Adding a dedicated Android CI workflow is a tracked follow-up (it would
touch `.github/`, i.e. outside `apps/android`, so it needs its own explicit run).

## Hard rules (never break)

- Behaviour over implementation; no tautological tests.
- Never lower a coverage floor or weaken a test to make it pass.
- Never merge past red CI or a diff touching production logic.
- Never commit secrets or `local.properties`.
- SDK purity: `:sdk-core` / `:sdk-ui` hold stateless building blocks; product
  orchestration (ViewModels, "when to do X" rules, cache→network cascades) lives
  in `:feature:*` / `:app`. See `packages/MeeshySDK/CLAUDE.md` for the grain test.
- Colour/navigation/UX coherence: conversation-context UI uses the deterministic
  `accentColor`; navigation favours natural gestures and a coherent single view.
