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
4. **Verify** (no emulator in CI env):
   - `./apps/android/meeshy.sh build`  — debug APK assembles
   - `./apps/android/meeshy.sh test`   — all JVM unit tests green
   - `./apps/android/meeshy.sh check`  — both at once (use before PR)

   If the SDK cannot be installed in your environment (see §CI reality), say so
   explicitly in the run log and let the **Android** CI check carry the same two
   commands. Verified there counts; verified nowhere never does.
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

**UTF-8 locale is mandatory for Gradle** (else `:sdk-core` test compilation dies with an *Internal
compiler error* — `InvalidPathException` while writing a `.class` whose backtick test-method name holds a
non-ASCII em-dash). The fresh container boots with `LANG`/`LC_ALL` unset (`sun.jnu.encoding=ASCII`):

```bash
export LANG=C.utf8 LC_ALL=C.utf8   # prefix every ./gradlew invocation with this
./gradlew --stop                    # restart the daemon under the new locale if it was already up
```

## CI reality

`.github/workflows/android.yml` (**Android**) is the merge gate. It runs on every
PR touching `apps/android/**`, on `ubuntu-latest`, and mirrors
`./apps/android/meeshy.sh check` exactly — `assembleDebug` then
`testDebugUnitTest`, nothing stricter (no lint, no instrumented tests: a CI gate
harder than the documented local gate would block slices on debt this routine
never agreed to take on). It was added on 2026-08-12 by the run
`android-ci-workflow`; before that the only gate was local, and the paragraph
here said so.

The monorepo `ci.yml` also runs on every PR regardless of diff (it has no path
filter) and stays green on an `apps/android`-only diff because it compiles no
Kotlin — it is not an Android gate and never was.

**This matters most for containerised runs.** The routine's own agents usually
execute in containers whose egress policy denies `dl.google.com`, so
`sdkmanager` cannot bootstrap and *no* Gradle task can run locally there
(confirmed 2026-08-12: `CONNECT tunnel failed, response 403`; `maven.google.com`
and Maven Central are reachable, but the platform packages are not on them). In
such a run the local gate is not "skipped" — it is unavailable, and CI is the
only Android toolchain you have. Push the branch, open the PR, and treat the
**Android** check as the compiler: read its logs, fix, push again. Never merge
on a red or a skipped Android check, and never write unverified Kotlin into a
destructive path on the strength of a local build you could not run.

`meeshy.sh check` remains the fast local gate wherever the SDK *is* installed;
CI does not replace it, it makes it non-optional.

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
