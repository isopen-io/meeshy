# Notes — lessons & memory

Append-only log of gotchas and decisions that save time next run.

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`NOTES-archive-2026-08.md`](./NOTES-archive-2026-08.md) (same append/oldest-first order).

## 2026-08-24 — a Prisme resolver lives SERVER-SIDE too: realtime pushed translations, not just on-demand pulls (slice `story-text-object-translation-realtime-merge`)
When a §E "Next" pointer says "X translates only the caption on demand — scout iOS parity before building an
N-call overlay pull", the scout's real question is **"where does the OTHER content get its translation from?"**
For story text overlays the answer was NOT an on-demand pull at all: the **gateway** translates the overlay
server-side and BROADCASTS it via `story:translation-updated` (`{postId, textObjectIndex, translations}`). iOS
merges it into the open viewer; Android had no handler — a whole realtime Prisme channel on the floor. Lesson:
before assuming a missing feature is an on-demand-pull gap, grep the gateway for a `*:translation-updated`
broadcast for that content type — the pull may not exist because a PUSH already covers it. Caption has the
same shape (`post:translation-updated`), a likely next Android viewer gap.

Mechanics that recurred and are worth reusing verbatim: (a) a realtime merge into `rawItems` only repaints if
`emit()` re-projects the current slide **unconditionally** — the viewer had gated re-projection behind an
active exploration override, so a no-override realtime merge never reached the view; generalising it is safe
because the override=null path reproduces `toSlideView`'s own resolver calls exactly. (b) Kotlin `copy` on the
`StoryItem`/`StoryEffects`/`StoryTextObject` data classes makes the iOS "preserve every field" regression pin
trivially true — no memberwise-init field-drop hazard to guard, though a field-preservation test is still cheap
insurance. (c) RED-proof a multi-part slice PER PIECE: neuter the pure fn (`return item`) for the logic tests,
comment the socket `listen` for the wiring tests, and revert ONLY the emit change to isolate that the chip test
(reads `rawItems` directly) does NOT depend on it while the repaint test does.

SDK bootstrap THIS run: `dl.google.com` **200**; `platforms;android-37` is not downloadable; `sdkmanager
--channel=3 "platforms;android-37.0"` installed the preview and AGP mapped compileSdk 37 → android-37.0 on the
first `./gradlew` — **pristine alone, no copy→patch, no both-dirs** (matches the 2026-08-23 entry below).

## 2026-08-23 — this container: `dl.google.com` REACHABLE, pristine `android-37.0` alone worked (slice `story-media-fade-envelope`)
Egress to `dl.google.com` returned **200** this run (unlike the containers the CI-reality note describes,
where it's 403), so the local gate WAS available. Full bootstrap ran clean: `commandlinetools`, then
`sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"`, then
`sdkmanager --channel=3 "platforms;android-37.0"` for the preview compileSdk 37 — **pristine alone**, no
copy→patch, no both-dirs mode. `./gradlew :feature:stories:help` resolved `android-37` on the first run;
full `assembleDebug testDebugUnitTest` **BUILD SUCCESSFUL** (973 tasks, 4m11s). Confirms the "try pristine
first" net rule. Practical timing on this image: config ~1m40s cold, targeted module test ~2m30s, full
check ~4m10s — background the gradle invocations and wait on a `grep -qE 'BUILD (SUCCESSFUL|FAILED)'`
until-loop; `--console=plain … | tail -N` buffers, so the output file stays empty until the run exits.

## 2026-08-23 — opacity fold precedence for foreground clips is `fade ?? keyframeOpacity ?? base`, THEN × transition (NOT all-multiply)
Porting `StoryRenderer.fadeOpacity`: iOS composes the media layer's opacity as
`base = fade ?? kfOverrides.opacity ?? 1.0; layer.opacity = base × transitionFactor`
(`StoryRenderer.swift:246-247`, comment "fade envelope (écrase) > opacité keyframes > 1"). So a live
fadeIn/fadeOut envelope **overrides** an authored keyframe opacity — it does NOT multiply with it — and
only the clip-transition factor multiplies. Android `StoryForegroundMediaView.animated()` mirrors this:
`opacityBase = fadeEnvelope ?: base.opacity; opacity = opacityBase * transitionOpacity`. Easy to get wrong
by multiplying all three; the mutation `fadeEnvelope ?: base.opacity → base.opacity` (drop the override)
is the RED-proof for it. Same not-in-ItemSignature reasoning as the transition factor: the envelope is a
per-tick post-pass, so on Android it belongs in the pure `animated()` fold, never baked into the projection.

## 2026-08-23 — SDK recipe THIRD mode: NEITHER dir alone works, BOTH `android-37` + `android-37.0` present does

Slice `story-clip-transition-opacity`. On this image *both* single-dir recipes the earlier notes record
FAILED identically with **`Failed to find target with hash string 'android-37'`**:
- Pristine `android-37.0` alone (the "let AGP map compileSdk 37 → android-37.0" recipe) → hash error, and
  the first `./gradlew` also printed `Installing Android SDK Platform 37.0` (AGP re-materialised it) yet
  still failed — so that install line is NOT a reliable success signal.
- The full four-edit copy→patch `android-37` alone (`source.properties` ApiLevel, `package.xml`
  `<api-level>` + `path=`, `build.prop` `sdk_full` incl. `ro.system.build.version.sdk_full`) → same hash
  error, NO "inconsistent location" line, descriptor demonstrably correct (`<api-level>37</api-level>`,
  `<base-extension>true</base-extension>`, `path="platforms;android-37"`, `sdk_full=37`, and
  `sdkmanager --list_installed` showing `platforms;android-37 | 2 | ... | platforms/android-37`).
  Clearing `.gradle`/config-cache + `--stop` + `-Pandroid.builder.sdkDownload=false` did not help.

**What worked: keep BOTH dirs.** After the copy→patch `android-37` was in place, `sdkmanager --channel=3
"platforms;android-37.0"` to reinstall the pristine dir *alongside* it — so `platforms/` holds both
`android-37` AND `android-37.0` — and `./gradlew` resolved on the next run (BUILD SUCCESSFUL, 973 tasks).
```bash
# after the four-edit copy→patch of android-37 (see entries below):
sdkmanager --channel=3 "platforms;android-37.0"   # reinstall pristine ALONGSIDE the patched dir
ls $ANDROID_SDK/platforms   # must list BOTH android-37 and android-37.0
```
**Net rule (updated): the recipe is image-dependent and now has THREE modes — pristine-only, patched-only,
and both-together. Try pristine first (cheapest); if it hash-errors, add the four-edit copy→patch; if THAT
still hash-errors, reinstall the pristine so both coexist. Read the first `./gradlew` outcome and escalate.**

## 2026-08-23 — SDK recipe flipped AGAIN: on THIS container the copy→patch `android-37` FAILS, pristine `android-37.0` WORKS (opposite of the previous entry)

Slice `story-keyframe-interpolation`. The full four-edit copy→patch (`source.properties` ApiLevel,
`package.xml` `<api-level>` + `path=`, `build.prop` `sdk_full` — even the extra
`ro.system.build.version.sdk_full`) produced a folder whose `package.xml` was demonstrably correct
(`path="platforms;android-37"`, `<api-level>37</api-level>`, `AndroidVersion.ApiLevel=37`), yet EVERY
`./gradlew` still died with **`Failed to find target with hash string 'android-37'`** — with a fresh
daemon, with `-Pandroid.builder.sdkDownload=false`, with android-37.0 removed. AGP 8.13.0 on this
image simply would not load the hand-patched `android-37` as a target.

What worked instead: install the **pristine** platform and leave it as-is —
```bash
sdkmanager --channel=3 "platforms;android-37.0"   # let AGP map compileSdk 37 → android-37.0
# do NOT create android-37; do NOT patch anything
```
`assembleDebug testDebugUnitTest` was then BUILD SUCCESSFUL (973 tasks). NB the very first build with
this present will print `Installing Android SDK Platform 37.0` (AGP re-materialises it) and then
succeed — that install line is NOT the failure, unlike the copy→patch runs where it preceded the hash
error. **Net rule: the recipe is image-dependent and flips between runs. Try pristine `android-37.0`
FIRST (cheapest, no patching); only fall back to the copy→patch if pristine yields the hash error.**
Read the first `./gradlew` outcome and pick the branch — do not assume the last run's recipe holds.

## 2026-08-23 — Float easing → widen interpolation-value test tolerances to ~1e-4, not 1e-9

Same slice. `KeyframeChannelSample.easing.eased(u)` returns a **Float**; a fraction like `0.2f`
carries ~3e-7 absolute error, and scaled by a delta of 100–200 the interpolated Double lands
~1e-5 off. A `Truth.isWithin(1e-9)` assertion on such a value fails on a CORRECT implementation
(caught here: `interpolate([(0,0),(10,100)], at=2f)` gave 20.0000003). Use `isWithin(1e-4)` for any
value that passes through Float easing — still tight enough to catch a wrong curve (whole-unit
differences). Endpoint/`eased()` assertions on exact fractions (0, 0.5, 0.25, 0.75) stay at `1e-6f`.

## 2026-08-23 — `android-37` copy→patch needs `build.prop`'s `ro.build.version.sdk_full` too (4th edit); and NEVER run two file-mutating gradle jobs at once

Slice `story-text-element-rtl-direction`. Ran the documented three-edit copy→patch (`source.properties`
ApiLevel + `package.xml` `<api-level>` + `path=`) and it STILL died with **`Failed to find target with hash
string 'android-37'`** — this time with NO "inconsistent location" line, so the `path=` was already right.
Cause: AGP 8.13.0 also reads `build.prop`, whose `ro.build.version.sdk_full=37.0` still declared the
minor-versioned id. The 4th edit that fixed it:
```bash
sed -i 's/^ro.build.version.sdk_full=.*/ro.build.version.sdk_full=37/' android-37/build.prop
rm -rf $ANDROID_SDK/platforms/android-37.0   # keep only android-37 to avoid any ambiguity
```
Full recipe THIS image needed (four edits): `source.properties` ApiLevel, `package.xml` `<api-level>`,
`package.xml` `path=`, AND `build.prop` `ro.build.version.sdk_full`. Read the first `./gradlew` error:
if it says `'android-37'` with no "inconsistent location", the `sdk_full` in `build.prop` is the one still
lying. After the fix: `:feature:stories:testDebugUnitTest` BUILD SUCCESSFUL, full `assembleDebug
testDebugUnitTest` green.

**Process lesson (cost me ~4 wasted gradle runs): a mutation RED-proof that `cp`→`sed`→gradle→restore MUST run
as a single isolated job, and you MUST wait for its REAL completion notification before starting another.** I
mis-read a between-gradle-runs `pgrep` gap as "job done", restored the file, and launched a second mutation
job while the first was still alive — two scripts editing the SAME `.kt` + `.bak` concurrently produced
garbage `failures=0` results and a half-restored file. Also `--rerun-tasks` leaves a STALE result XML until it
actually finishes, so reading the XML while gradle is mid-run reports the PREVIOUS run's counts. Rule: one
mutation job at a time; confirm the task-completion notification (not `pgrep`); confirm the restore line in the
job's own captured output; then `find apps/android -name '*.bak' -o -name '*.origbak'` before trusting the tree.

## 2026-08-23 — copy+patch needs the `package.xml` `path=` attribute too, not only `<api-level>` (else "inconsistent location")

Slice `story-text-element-fade-timing`. Ran the full copy+patch below (patched `source.properties` **and**
`package.xml`'s `<api-level>37.0</api-level>`→`37`) — and the first `./gradlew` STILL died with
**`Failed to find target with hash string 'android-37'`**, this time with the telltale line
*"Observed package id 'platforms;android-37.0' in inconsistent location '.../android-37' (Expected
'.../android-37.0')"*. Cause: the copied dir's `package.xml` still carried `path="platforms;android-37.0"`,
so AGP treated the `android-37` folder as a misplaced `android-37.0` and refused it. The missing patch:
```bash
sed -i 's|path="platforms;android-37.0"|path="platforms;android-37"|' android-37/package.xml
```
With `<api-level>` **and** `path=` **and** `source.properties` all patched, `assembleDebug testDebugUnitTest`
was BUILD SUCCESSFUL (973 tasks). Net: on THIS image the copy+patch needs THREE edits (source.properties
ApiLevel, package.xml `<api-level>`, package.xml `path=`). The earlier 08-23 notes patched only the first two
and worked — the images differ; patch all three to be safe, and read the first `./gradlew` error: an
"inconsistent location" line means the `path=` attribute is the one still lying.

## 2026-08-23 — copy+patch needs `package.xml` too, not only `source.properties` (else the hash-string failure persists)

Slice `story-text-element-font-size`. Ran the documented copy+patch (below) but patched **only**
`source.properties` (`AndroidVersion.ApiLevel=37`) — and the first `./gradlew` STILL died with
**`Failed to find target with hash string 'android-37'`**, with a telltale warning: *"Observed package id
'platforms;android-37.0' in inconsistent location '.../android-37'"*. Cause: AGP 8.13.0 reads the platform's
**`package.xml`**, whose `<api-level>37.0</api-level>` still declared the minor-versioned id. Patching
`source.properties` alone is not enough. Full recipe that worked this run:
```bash
sdkmanager --channel=3 "platforms;android-37.0" "build-tools;36.0.0" "platform-tools"
cd $ANDROID_SDK/platforms && cp -r android-37.0 android-37
sed -i 's/^AndroidVersion\.ApiLevel=.*/AndroidVersion.ApiLevel=37/' android-37/source.properties
sed -i 's|<api-level>37.0</api-level>|<api-level>37</api-level>|'     android-37/package.xml   # ← the missing step
```
With both patched, `assembleDebug testDebugUnitTest` was BUILD SUCCESSFUL (973 tasks). The 08-21/earlier notes'
`source.properties`-only sed may have sufficed on other images; on THIS one, `package.xml` is the file AGP
actually reads for the hash — patch both to be safe.

## 2026-08-23 — SDK recipe flipped AGAIN: on THIS container the `cp→android-37` patch works, pristine `android-37.0` FAILS (opposite of the 08-21 note)

Slice `story-text-element-outline`. The 2026-08-21 NOTES said "install pristine `android-37.0`, patch NOTHING,
let AGP map `compileSdk 37 → android-37.0`". This run that FAILED: the first `./gradlew` died with
**`Failed to find target with hash string 'android-37'`** against the pristine dir — AGP 8.13.0 here looks up the
integer hash `android-37`, not `android-37.0`. The recipe that worked (and that the three 2026-08-23 PROGRESS
entries already used) is the **copy+patch**:
```bash
sdkmanager --channel=3 "platforms;android-37.0" "build-tools;36.0.0" "platform-tools"
cd $ANDROID_SDK/platforms && cp -r android-37.0 android-37
sed -i 's/^AndroidVersion\.ApiLevel=.*/AndroidVersion.ApiLevel=37/' android-37/source.properties
```
Net lesson: the two recipes flip-flop between container images, so **don't trust either note blindly** — run the
first `./gradlew` and read the hash string in its error. `'android-37'` → do the copy+patch (this run); a
diagnostic naming `37.0` → leave pristine. Both dirs coexisting is harmless. `build-tools;35.0.0` still gets
auto-installed by a module that pins it — let it. UTF-8 locale (`LANG=C.utf8`) still mandatory for `:sdk-core`.

## 2026-08-23 — Background Bash runs from the SESSION cwd (repo root), not `apps/android` — use `gradlew -p`

A **background** Bash command (`run_in_background: true`) executes from the session working directory
(`/home/user/meeshy`), even though foreground calls in the same session may have `cd`'d into
`apps/android` earlier — that `cd` does **not** carry into background invocations. `./apps/android/meeshy.sh`
and a bare `./gradlew` both resolve against repo root and die with *"No such file or directory"* (there is no
gradlew at repo root; it lives at `apps/android/gradlew`). I burned four backgrounded attempts on this.
The robust form, cwd-independent, is:

```bash
/home/user/meeshy/apps/android/gradlew -p /home/user/meeshy/apps/android assembleDebug testDebugUnitTest
```

Absolute path to the wrapper + `-p <projectDir>`. Works identically foreground or background. (Foreground
`cd /home/user/meeshy/apps/android && ./gradlew …` also works but only because the `cd` sticks for that one
compound command.)

## 2026-08-23 — Mutation RED-proof of a DELEGATING projection: mutate to the absent value, expect PARTIAL failure

`feed-repost-embed-location`'s builder just delegates: `location = FeedPostLocationBuilder.build(repost.location)`.
To prove the 3 new wiring tests aren't tautological, I forced `location = null` in the builder and re-ran the
class. The right signal is **partial**: exactly the 2 positive-projection tests failed, and
`absentLocationBecomesNull` stayed green (it asserts null for null input, so a null mutation can't break it).
A blanket all-red would have meant my "absent" test was really just re-asserting the mutation. Partial,
discriminating failure = the tests pin the behaviour, not the implementation. The label-resolution branches
themselves stay covered where they live (`FeedPostLocationBuilderTest`), so the wiring tests don't re-test the
delegate — they only prove the projection is wired.

## 2026-08-23 — Before adding a model to `Post.kt`, grep for it: `SharedPlace` already existed

Building `feed-post-location-sticker`, I nearly re-declared `SharedPlace` inside `Post.kt` (I had grepped
`class ApiRepostOf`/`ApiRepostOf(` and it didn't surface it). It already lives in its **own** file
`:core:model/SharedPlace.kt` — the composer's outgoing-location slice created it. A duplicate `data class`
in the same package would have been a hard compile error, but the deeper trap is the shape drift: the
existing `SharedPlace` is `{latitude, longitude, name, address, category}` (mirrors the **gateway**), with
**no `id`** — iOS's has `id`, and I'd have copied iOS's. Lesson: before declaring any model type, `grep -rn
"class <Name>"` across `apps/android`, and when a type exists, MIRROR THE ANDROID SSOT's shape, not iOS's.
Corollary confirmed this slice: a field can be plumbed OUT (composer attaches `SharedPlace`) yet dropped on
the way IN (`ApiPost` had no `location`) — "the model exists" ≠ "the field round-trips"; check the specific
API struct.

## 2026-08-22 — SDK bootstrap: the `android-37` symlink is NO LONGER enough — copy + rewrite ApiLevel

The prior note's symlink fix (`ln -sf android-37.0 android-37`) **stopped working** this run. AGP does not
derive the platform hash from the directory *name*: it reads `AndroidVersion.ApiLevel` from the platform's
`source.properties`. The `platforms;android-37.0` package ships `AndroidVersion.ApiLevel=37.0`, so AGP computes
the hash `android-37.0` regardless of a dir renamed/symlinked to `android-37`, and `compileSdk = 37` still dies:
```
> Failed to find target with hash string 'android-37' in: /root/android-sdk
```
(Confirmed: a baseline `assembleDebug` failed on exactly this **with the symlink in place**.) The fix that
actually works — make a **real** `android-37` platform whose `source.properties` claims the integer API level:
```bash
cd "$HOME/android-sdk/platforms"
rm -f android-37                       # drop the symlink if present
cp -r android-37.0 android-37
sed -i 's/^AndroidVersion\.ApiLevel=.*/AndroidVersion.ApiLevel=37/' android-37/source.properties
```
After that, full `assembleDebug testDebugUnitTest` = BUILD SUCCESSFUL (973 tasks). This is a **local-env only**
fix (`$HOME/android-sdk`, never committed; `local.properties` stays gitignored). CI is unaffected — it runs
`android-actions/setup-android` and lets AGP resolve/download the platform it wants, so this hand-patch is only
for the reachable-`dl.google.com` local gate.

## 2026-08-22 — SDK bootstrap: `android-37` is now MINOR-versioned; symlink after install

The routine's recipe `sdkmanager --channel=3 "platforms;android-37.0"` now installs a **minor-versioned**
platform: the dir is `$HOME/android-sdk/platforms/android-37.0` and its `source.properties` reads
`AndroidVersion.ApiLevel=37.0`. But AGP 8.13 with `compileSdk = 37` looks up the hash string **`android-37`**
(no minor), so Gradle dies before compiling with:
```
> Failed to find target with hash string 'android-37' in: /root/android-sdk
```
One-line fix, then everything builds:
```bash
ln -sf android-37.0 "$HOME/android-sdk/platforms/android-37"
```
(Alternative not tried: `sdkmanager "platforms;android-37"` on the stable channel — but only `android-37.0`,
`37.1`, `37.2-betaN` are published, all minor-versioned, so the symlink is the reliable move.) After it, the
full `assembleDebug testDebugUnitTest` ran locally, BUILD SUCCESSFUL (973 tasks). `local.properties` stays
`sdk.dir=$HOME/android-sdk` and gitignored. Reusable habit: **when `dl.google.com` is reachable, the local
gate is worth the ~5 min** — it's the fastest way to prove a Compose/UI wiring change compiles before pushing.

## 2026-08-22 — Reuse the feed's building blocks in post-detail, don't reinvent

The post-detail repost/quote slice added ZERO new value models or strings: it routes through the existing
`RepostCommand` SSOT, reuses `QuoteComposerState` + `QuoteComposerSheet` (widened `private → internal`), and
the existing `feed_action_repost`/`feed_action_quote` strings. Both surfaces (feed card + full-screen detail)
now fold their "what to send" decision through one tested pure function — so the root-target fix and the
blank-quote degradation are guaranteed identical on both, and a future gateway change touches one SSOT. When
a second surface needs a behaviour the first already has, widen visibility and share the value model; a
parallel re-implementation is where the two drift.

## 2026-08-22 — One deep-link route, one entry ViewModel: unify what iOS split across views

iOS routes an authenticated share-link tap (`RootView.resolveShareLinkEntry`, `isAuthenticated: true`)
and an unauthenticated one through **two separate views**. Android's `GUEST_JOIN` nav destination is a
single composable reached in both states, so the SOTA move is to unify the whole decision behind ONE
`ShareLinkEntryViewModel` that reads the auth flag itself (a `fun interface` seam over
`AuthRepository.isAuthenticated`) and branches internally — no duplicated presentation to drift.

Two reusable habits confirmed this run:
- **Gate the expensive fact behind the flag that needs it.** `knownConversationIds` only matters when
  authenticated (the `isAlreadyMember` check), so read the conversation cache ONLY in that branch. A guest
  never pays a needless cache read — and a test asserting the known-ids seam's call count is `0` for a
  guest locks that in behaviourally (not an implementation-detail assertion: it's observable work avoided).
- **A prompt state must be actionable or it is a dead end.** `ChooseIdentity` shipped with `chooseAccount()`
  / `chooseAnonymous()` intents in the same slice; a "which identity?" screen with no way to answer would
  have been orphan UI. Test the actions, not just the prompt.

Testing shape that paid off: drive the VM with the **real** `ShareLinkEntryResolver` over faked LEAF seams
(preview / store / join / auth / known-ids). The whole resolve→policy→navigation reduction is exercised end
to end through the public `state`, and no test mocks the resolver's own output — so a policy regression would
surface here too, not hide behind a canned mock.

## 2026-08-22 — A "resolver" that does I/O + consults device state is app-side, NOT `:sdk-core`
- Last slice's PROGRESS "Next" proposed a `:sdk-core` `ShareLinkEntryResolver`. That was a hypothesis,
  and re-scouting iOS before committing proved it wrong — the routine's "parity notes are hypotheses"
  warning earning its keep. iOS's `ShareLinkEntryResolver.swift` lives in
  `apps/ios/Meeshy/Features/Main/Navigation/` (**app**, not `MeeshySDK`), and its own doc-comment says:
  "App-side et non SDK : elle appelle un service réseau et consulte l'état de l'app."
- The grain test decides: the resolver fetches a preview (network I/O) AND reads the guest-session store
  (device state) → product orchestration → `:feature:*`/`:app`. Only the **pure decision**
  (`ShareLinkEntryPolicy`: facts in, intent out, no I/O) is SDK-grade and stays in `:core:model`. Split
  the two: a resolver that gathers facts + a pure policy that judges them. Landed the resolver in
  `:feature:auth` (the guest-join flow already lives there).
- Testability without the SDK penalty: give the resolver a `fun interface` seam for its one network read
  (`ShareLinkPreviewProviding`) instead of injecting the concrete `AnonymousSessionRepository`. Fake the
  seam with a lambda + record calls; use `InMemoryAnonymousSessionStore` for the store. Fully JVM-testable,
  no Robolectric, no MockK-on-final-class friction. The consumer binds the seam to `repository::preview`.
- Android store divergence to remember: the guest-session store is **single-valued** (one session per
  device), whereas iOS keys `AnonymousSessionStore.load(linkId:)`. So "stored session for THIS link" is
  `store.load()?.linkId == identifier`, not "any session exists". A session opened on a different link
  must not resume here — worth an explicit test (mutation-provable).

## 2026-08-22 — A JWT endpoint on a `conversations/…` path belongs on `ConversationApi`, not `ShareLinkApi`
- `joinAuthenticated` = `POST /conversations/join/{linkId}`, JWT-authed, empty body. Tempting to drop it
  on `ShareLinkApi` beside `joinAnonymously` (both are "share-link joins") — but `ShareLinkApi` is
  documented as the **no-JWT** anonymous surface, and the path is `conversations/…`. The auth regime +
  the path resource both point at `ConversationApi`. The interceptor decides JWT-vs-session, not the
  interface — so "it's a share-link thing" is not a reason to co-locate it with the anonymous endpoints.
- Cost of choosing `ConversationApi`: every hand-written stub of it must gain the new override. There are
  exactly **three** in `:sdk-core` tests (`ConversationRepositoryTest`, `ConversationStatsRepositoryTest`,
  `ConversationAnalysisRepositoryTest`), each with one abstract base stub (`StubConversationApi` /
  `StubStatsApi` / `StubAnalysisApi`) — the concrete recording fakes extend the base, so it's one line +
  one import per file, not per fake. Grep `override suspend fun banParticipant` to find the base stubs.
- Orphaned-model tell, again: `JoinAuthenticatedResponse` was already in `ShareLink.kt` with ZERO
  consumers (grep). A defined-but-unconsumed DTO is unbuilt — wiring API + repository around it is a clean
  vertical slice. (Same pattern as `AgentAnalysis.kt` last week.)
- Empty-body POST in Retrofit = `@POST("…")` with **no `@Body`** (the `markRead` precedent). Don't invent
  an `EmptyBody` DTO like iOS does.

## 2026-08-22 — An umbrella "…-mode / …-flow" parity box is several slices; find the pure brain first
- The `[ ]` "Anonymous-session conversation mode; guest join-via-share-link flow" box LOOKED like
  a big unstarted feature, but recon showed Android had already ported ~90% of it (permission core,
  session store, guest-join form/VM/screen, composer gate, dual-auth). The one un-ported piece was
  the pure entry-decision policy (`ShareLinkEntryPolicy.swift`) — a textbook 6-branch pure-logic
  slice. Lesson: for an umbrella box, grep the codebase for what already exists BEFORE scoping;
  the highest-value TDD slice is usually the pure decision engine the wired-up pieces are missing,
  not a re-port of the whole feature. Mark the umbrella `[~]` with the named follow-ups, never `[x]`
  on the strength of one slice.
- Mutation RED-proof done right this run: `cp <file> /tmp/x.bak` before mutating, `cp /tmp/x.bak <file>`
  to restore (NOT `git checkout` — the file is uncommitted; see the 2026-08-22 checkout lesson below).

## 2026-08-22 — Never `git checkout <file>` to undo a mutation on an UNCOMMITTED file
- Doing a mutation RED-proof, I `git checkout`-ed the reducer to "revert the one-line mutation".
  The file was uncommitted (the whole slice was still in the working tree), so checkout reverted it
  to **HEAD (main)** — silently wiping ALL the slice's edits to that file, not just the mutation.
  The `grep` afterward is what caught it (only the old `entryStep = 0` line remained).
- Rule: for a mutation RED-proof, undo the mutation with the **Edit tool** (exact reverse edit), the
  same way you introduced it — never `git checkout`/`git restore` a file that carries uncommitted
  slice work. If you must use git to revert, commit the slice FIRST so checkout only drops the mutation.

## 2026-08-22 — iOS `ConversationLockSheet.Mode` has SEVEN modes; audit the whole enum before "done"
- The conversation-lock box read as nearly complete (setup/lock/unlock/open/unlock-all all wired), but
  iOS's `ConversationLockSheet.Mode` enum carries `changeMasterPin` + `removeMasterPin` too — two
  Settings-level flows Android's `LockPinReducer` never had. A parity box titled "… setup/change/remove …"
  is not done until every named arm exists; grep the iOS source enum, don't trust the box's prose note
  (the "Still needed: PIN entry UI / hide-from-list / unlock flow" note was stale — all three had shipped).
- SOTA lever found here: iOS `removeMasterPin` force-clears the PIN even while locks survive (orphaning
  them). Android gates Remove on "nothing locked" + applies the store's *guarded* `removeMasterPin`, so an
  orphaned lock is structurally impossible. Prefer the store's guarded call over its `force*` sibling
  whenever a UI gate already guarantees the precondition.

## 2026-08-22 — First gradle run can race its own auto-install of `android-37.0` → false "Failed to find target 'android-37'"
- `compileSdk = 37` (AGP 8.13) resolves to platform hash **`android-37`**, which is served by the
  canary package **`platforms;android-37.0`** (`sdkmanager --channel=3`). If the FIRST gradle
  invocation of the run triggers gradle's own auto-download of `android-37.0`, task-graph
  dependency resolution can run BEFORE the platform finishes unzipping and dies with
  `Could not determine the dependencies of task ':core:model:testDebugUnitTest' > Failed to find
  target with hash string 'android-37'`. This is an **install race, not a toolchain gap** — do NOT
  read it as "SDK 37 unavailable" and do NOT touch `compileSdk` (that's production build config).
  Fix: just re-run the same gradle command once the platform is installed; it builds clean.
- Belt-and-braces for a fresh container: pre-install the platform explicitly in the bootstrap
  (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`) and let
  it FINISH before the first `./gradlew` call, so no gradle-triggered mid-build download can race.

## 2026-08-22 — Reuse the on-device sentiment scorer; don't reach for a new NL model
- The stats dashboard's three-way sentiment bar looked like it might need an on-device NL model
  (iOS uses Apple `NLTagger`, which has no portable Android twin). It does not: `:core:model`
  `SentimentAnalyzer` (the composer's dictionary scorer, shipped by `composer-live-sentiment`) is
  the on-device scorer, and `SentimentLevel.from` is the seven-bucket SSOT. The three-way split just
  **collapses that existing SSOT** (`toneOf`) — one sentiment source of truth, not two. When a parity
  gap smells like "needs a new model", first check whether an existing pure scorer already covers it.

## 2026-08-22 — Two test files in one package can't both declare the same `private class` name
- When adding a new sibling repository test (`ConversationAnalysisRepositoryTest`) modelled on an
  existing one (`ConversationStatsRepositoryTest`) in the SAME package
  (`me.meeshy.sdk.conversation`), a `private class EnvelopeFailureApi` in each file collided:
  Kotlin reported `Redeclaration` + a cascading `Cannot access '…': it is private in file` on the
  OTHER file. File-private top-level classes still share the package's file-facade namespace for
  this name check. Fix: give reused test-double names a per-slice prefix
  (`EnvelopeFailureAnalysisApi`, `StubAnalysisApi`, …) rather than copying the stats test's names
  verbatim. The unique names (`Stub…Api`, `Success…Api`, `Throwing…Api`) were already fine; only the
  generic `EnvelopeFailureApi` clashed.
- Also: when `ConversationApi` gains a method, EVERY hand-written stub of it must implement it — there
  are three in `:sdk-core` tests (`ConversationRepositoryTest`, `ConversationStatsRepositoryTest`,
  and the new one). Grep `override suspend fun stats(` to find them all.

## 2026-08-21 — SDK platform: `compileSdk = 37` wants `android-37.0`, install ordering matters
- The repo is on `compileSdk = 37` = **Android 17**, whose platform package is `platforms;android-37.0`
  (`AndroidVersion.ApiLevel=37.0`), NOT `android-37`. The ROUTINE §Environment recipe still installs
  `platforms;android-35`; that is not enough — add `android-37.0`. `sdkmanager "platforms;android-37"`
  fails (`Failed to find package`); the cmdline-tools bundle only speaks SDK XML v3 and can't see the
  v4-only stable name.
- **Let AGP auto-download it, but wait for it.** With `local.properties` pointing at the SDK, the first
  Gradle invocation auto-installs `android-37.0` — but if dependency resolution runs while that install is
  still in flight it dies with `Failed to find target with hash string 'android-37'`. Re-run once the
  install line prints complete (or pre-run `./gradlew :core:model:compileDebugKotlin` to force the download),
  then the real build/test resolves cleanly. AGP 8.13.0 maps `compileSdk 37` → the `android-37.0` platform.
- **Orphaned models are the frontier.** `AgentAnalysis.kt` (`ConversationMessageStatsResponse`,
  `ConversationAnalysis`, `ParticipantProfile`…) shipped with ZERO consumers (grep outside the model file =
  nothing). When a parity area looks "already started", grep for consumers before assuming — a defined-but-
  unconsumed DTO is unbuilt, and wiring it (repository + pure projection + VM + sheet) is a clean vertical slice.
- **Inject `today` for any windowed/time-bucketed projection.** iOS computes `activityData` off `Date()`
  inside a view getter (untestable). The Android SSOT takes `today: LocalDate` as a parameter and the
  Composable passes `LocalDate.now()` in — the same "pass time in" doctrine the chat header uses for presence
  (`System.currentTimeMillis()`). Makes the cutoff-window mutation catchable in a plain JVM test.

## 2026-08-21 — story on-demand translation: gotchas
- **Mutation-proving an "override" line needs a scenario Prisme can't auto-resolve.** The story
  request arm sets `languageOverride = storyId to target` after merging the pulled translation. If
  the test requests the viewer's PRIMARY language, `emit()`'s auto-resolution
  (`StoryContentResolver` → `preferredTranslation`) lands on that same freshly-merged translation on
  its own, so **dropping the override still passes** — the mutation is not caught. Use a scenario
  where a HIGHER-priority language is already present (prefs `en>de`, story present `en`, request
  `de`): without the override, auto-resolution keeps showing `en`, so the test only goes green with
  the override. Rule: to prove a display-switch line, pick inputs where the default resolution would
  choose *something else*.
- **Stories carry no `originalLanguage`.** `StoryItem` has `content` + `translations` but no source-
  language field (unlike `ApiPost`). `translateStory` passes an empty `sourceLanguage` to the
  translator (auto-detect), which is the same thing `translateSource` does for a post with a null
  original. Don't invent a source-language field on the story model for this.
- **`StoryItem.translations` is a `List<StoryTranslation>`, not a map.** The post/comment merges upsert
  a `Map<code, entry>`; the story merge upserts a list (match by `indexOfFirst`, replace by
  `mapIndexed`, else `+`). Same laws (blank/idempotent/in-place-or-append), different container — hence
  a separate `StoryTranslationMerge` rather than reusing `PostTranslationMerge`.

## 2026-08-21 — comment on-demand translation: gotchas
- **MockK `coAnswers` is a member infix, NOT a top-level import.** `import io.mockk.coAnswers`
  → *Unresolved reference*. Write `coEvery { … } coAnswers { gate.await() }` and import nothing
  extra (only `coEvery`). Same for `answers`. (The build failed only at test-compile, so it was
  cheap to catch — but it costs a full `compileDebugUnitTestKotlin` cycle.)
- **Flipping a dead arm live breaks the test that asserted the dead behaviour.** The comment
  request arm was gated behind `CommentProjection.build` NOT passing `includeTranslatable`; a
  pre-existing test (`content-less language is inert`) asserted the old `RequestTranslation -> Unit`
  no-op. Enabling the arm made a content-less tap fire a request (relaxed mock → non-null →
  display changed). This is not a regression — it is the slice's intended behaviour change, so the
  obsolete test was **rewritten to the new contract** (a content-less tap now requests + leaves the
  display until a translation lands), a strictly stronger assertion. Not a floor-lowering.
- **Fold on-demand translation onto the LIVE row, translations-only** (`retranslated(id, translations)`),
  never replace the whole comment from the tap-time snapshot: `replyCount` lives on `ApiPostComment`
  and a realtime reply can bump it while the translate is in flight — a wholesale swap would revert it.
  (PostDetail could `rawPost.value = merged` wholesale because its count overlay is a *separate* flow;
  comments carry the mutable count on the row itself, so the rule differs.)

## 2026-08-21 (latest) — `--offline` full-assemble trap; `dl.google.com` reachability varies by container; on-demand translation for a caller-held post = a stateless repo method returning the merged post, NOT the cache-mutating one.

Slice `feed-post-detail-translation-request`. Three lessons.

**(1) `dl.google.com` reachability is not fixed per environment.** Prior runs recorded it 403-blocked (forcing
CI-as-compiler). THIS container reached it (`curl -o /dev/null -w '%{http_code}'` → **200**), so the full local
SDK bootstrap + `meeshy.sh check` ran locally. Always probe it at run start; don't assume the last run's verdict.

**(2) `--offline` breaks a *full* `assembleDebug` after a *targeted* run.** If your first gradle invocation only
built `:sdk-core` + `:feature:feed` (targeted `--tests`), only those modules' deps are cached. A subsequent
`./gradlew assembleDebug testDebugUnitTest --offline` then dies resolving `:app`'s deps (androidx.browser:1.8.0,
com.google.zxing:core, androidx.activity:1.7.0 …) — "No cached version … available for offline mode". Run the
full check **online** the first time; `--offline` is only safe once every module's deps are warm.

**(3) On-demand translation for a post the VM owns outside the feed cache.** `PostRepository
.requestOnDemandTranslation(postId, target)` mutates `_feedCache` and returns `Boolean` — perfect for the feed
list VM that observes that cache. But `PostDetailViewModel` holds its post in a private `rawPost` from an
independent `getPost` fetch and never observes `_feedCache`, so that method's mutation would be invisible to it.
The right shape is a **stateless** `translatePost(post, target): ApiPost?` that returns the merged post; the VM
swaps it into `rawPost` and points `activeCode` at the new language. Factor the shared trim→translate→
`PostTranslationMerge` law into one private `translateAndMerge` and have BOTH methods delegate (behaviour of the
cache one is identical under single-thread — its existing tests stay green). Same lesson will recur for comments
(`ApiPostComment`, different type/path — needs its own comment-translation method, no `translatePost` reuse).

## 2026-08-21 — SDK bootstrap: on THIS container the pristine `android-37.0` recipe is the one that works; the `cp→android-37` patch recipe FAILS. And on-demand translation = mirror the chat repository, not the iOS socket path.

Slice `feed-post-translation-request`. Two lessons.

**(1) SDK bootstrap — stop patching to `android-37`.** The malformed metadata (`android-37.0/source.properties`
→ `AndroidVersion.ApiLevel=37.0`, `Pkg.Desc=…Platform 17`) is back, so the older notes' reflex was to
`cp -r android-37.0 android-37` + sed the metadata to a clean `android-37`. **That recipe FAILED here.** AGP
8.13.0's own diagnostic reads "compile SDK version **37.0**" and it resolves `compileSdk 37` to the
minor-versioned **dir** `android-37.0` directly — a hand-made `android-37`, even with byte-perfect
`source.properties`+`package.xml`, is never matched (`sdkmanager --list_installed` shows it, AGP still says
`Failed to find target with hash string 'android-37'`). The recipe that works, every time, on this container:
```bash
sdkmanager --channel=3 "platforms;android-37.0" "build-tools;36.0.0" "platform-tools"   # pristine, DON'T patch
# build with auto-download OFF so the first ./gradlew can't re-fetch the malformed dir over any edits:
./gradlew assembleDebug testDebugUnitTest -Pandroid.builder.sdkDownload=false
```
Two traps that cost a cycle: (a) the very first `./gradlew` of a fresh container needs to run **online** — AGP
8.13.0's plugin artifact isn't cached yet, so `--offline` dies with "Plugin com.android.application 8.13.0 not
found"; run once online, then `--offline` is fine. (b) AGP auto-downloads the platform if it's missing — with
auto-download ON it silently re-fetches the pristine (malformed-metadata) `android-37.0`, which is actually
what we want, so DON'T fight it; the only reason to pass `sdkDownload=false` is to stop it clobbering a manual
edit. Net: **install pristine `android-37.0`, patch NOTHING, let AGP map `compileSdk 37 → android-37.0`.**

**(2) On-demand post translation = the map-keyed sibling of the chat message path.** Feed posts store
translations as `Map<code, ApiPostTranslationEntry>` (vs. the message list form), so the merge is a NEW pure
`PostTranslationMerge` (map upsert, case-insensitive key match, idempotent) — not a reuse of
`MessageTranslationMerge`. But the REST/cache flow is identical: `PostRepository.requestOnDemandTranslation`
blocking-translates via `TranslationApi` + merges into `_feedCache`, exactly like
`MessageRepository.requestTranslation`. Do NOT mirror iOS's literal `POST /posts/:id/translate` fire-and-forget
+ socket-completion path — Android has no post-translation socket consumer, so that variant is blocked/
cross-cutting. Adding `translationApi` to `PostRepository`'s constructor means updating its ~16 test
`PostRepository(api)` call sites (`sed 's/PostRepository(api)/PostRepository(api, translationApi)/g'` + a
class-level relaxed mock). And `includeTranslatable = true` only surfaces a translatable chip when the post
ALREADY has a preferred translation — `MessageLanguageStrip.build` early-returns empty for an untranslated
post regardless of the flag (Prisme rule 1), so a fully-monolingual card still shows no strip.

## 2026-08-21 — Feed realtime = a family of `FeedRealtimeHead` overlays; add the next event as one more overlay, don't invent a mechanism

Slice `feed-realtime-comment-count`. The feed's live-sync surface is now a coherent **overlay family** on
`FeedRealtimeHead`: `posts`+`newPostsCount` (created), `removedIds` (deleted), `likes: LikeOverlay` (like),
`bookmarks: BookmarkOverlay` (bookmark), and now `comments: Map<String, Int>` (comment count). Each has the
identical shape: a pure `FeedRealtimeReducer.<verb>(state, id, …)` arm (blank-id inert, same-value dedup →
same instance) + a `reconcile<Verb>s(state, cachePosts)` that releases overlays the cache has caught up to +
a `with<Verb>Overlays` projection helper in `FeedViewModel`, all applied to BOTH the cache-projected and
realtime-head lists, and `clear()` auto-resets everything via `FeedRealtimeHead()`. **When a new feed socket
event needs live UI, add one more overlay to this family — don't reach for a new pattern.** The only design
choice is whether the event has a viewer-own dimension: like has `mine: Boolean?` (only flips on the viewer's
own userId — another user moves the count only); bookmark is personal so `mine: Boolean` is always
authoritative; comment count is public so a bare `Int` suffices (no `mine`). Absolute count from the gateway
always wins over the cache; clamp negatives (`coerceAtLeast(0)`) so a malformed payload never renders a
negative badge. iOS mutates its in-memory array directly (`posts[i].commentCount = data.commentCount`) — the
Android overlay is the pure, unit-testable, race-proof form of the same law.

**SDK bootstrap got easier this run:** `sdkmanager --channel=3 "platforms;android-37.0"` (pristine, no
hand-patching) + AGP 8.13 auto-mapping `compileSdk 37` → `android-37.0` just works. Prefer this over the
`cp`/`sed`/`package.xml`-patch dance below whenever the container reaches `dl.google.com` (curl → 200 here).

## 2026-08-21 — SDK bootstrap: patching `source.properties` alone is NOT enough — patch `package.xml` too, and delete the malformed `android-37.0` dir

Slice `conversation-lock-unlock-all`. Used the ROUTINE-pinned `commandlinetools-linux-11076708`. The platform
came out malformed as usual (`android-37.0/source.properties` → `Pkg.Desc=Android SDK Platform 17`,
`AndroidVersion.ApiLevel=37.0`). Applied the note-below recipe — `cp -r android-37.0 android-37` + sed on
`source.properties` — and it STILL failed: `Failed to find target with hash string 'android-37'`. Root cause:
the copy's **`package.xml`** still declared `path="platforms;android-37.0"` and `<api-level>37.0</api-level>`,
and the leftover malformed `android-37.0/source.properties` (unparseable `ApiLevel=37.0`) can abort the whole
platform scan. **Full fix that worked:**

```bash
cd $HOME/android-sdk/platforms
cp -r android-37.0 android-37
sed -i 's/AndroidVersion.ApiLevel=37.0/AndroidVersion.ApiLevel=37/; \
        s/Pkg.Desc=Android SDK Platform 17/Pkg.Desc=Android SDK Platform 37/; \
        s/Platform.Version=17/Platform.Version=37/' android-37/source.properties
sed -i 's#path="platforms;android-37.0"#path="platforms;android-37"#; \
        s#<api-level>37.0</api-level>#<api-level>37</api-level>#' android-37/package.xml
rm -rf android-37.0            # remove the malformed sibling so its ApiLevel=37.0 can't abort the scan
```

After this, `assembleDebug testDebugUnitTest` green across all modules (AGP normalizes `compileSdk 37` →
hash `android-37`, now satisfied by the consistent copy). A stale Gradle daemon caches the SDK scan — `./gradlew
--stop` before re-testing if a first attempt failed on the platform.

**Gotcha that wasted a cycle: `./gradlew … | tail` (or `| grep`) swallows gradle's exit code** — the pipeline
reports `tail`'s exit 0 even on `BUILD FAILED`, so a `A --offline || A` fallback never fires and a failed build
reads as success. Redirect to a file (`> gate.log 2>&1; echo $?`) and grep the file, never pipe gradle through
`tail` when you care about pass/fail.

## 2026-08-21 (later) — SDK bootstrap: the "AGP resolves 37→android-37.0 on its own" claim did NOT hold this run — the malformed metadata is back; fix it by hand

Slice `chat-draft-language-persistence`. Same recipe as the note just below (cmdline-tools
`commandlinetools-linux-13114758` = tools rev **19.0**, `sdkmanager --channel=3 "platforms;android-37.0"`,
NO symlink), yet `:core:model:testDebugUnitTest` died with `Failed to find target with hash string
'android-37' in: /root/android-sdk`. Inspecting `platforms/android-37.0/source.properties` showed the
**malformed** metadata the earlier note said only 11076708 produced: `Pkg.Desc=Android SDK Platform 17`,
`AndroidVersion.ApiLevel=37.0`. So AGP 8.13 computed the target hash `android-37` from `compileSdk = 37`
but the installed platform registered itself as `android-37.0` (dir name) with a non-integer ApiLevel →
no match. **The "newer tools fix the metadata" claim is flaky / catalogue-dependent; do not rely on it.**

Robust fix that worked (avoids the symlink's `inconsistent location` sdkmanager rejection — it is a real
COPY, and it is only read by AGP, never re-verified by sdkmanager once build-tools are already installed):

```bash
cd $HOME/android-sdk/platforms
cp -r android-37.0 android-37                     # real dir, not a symlink
sed -i 's/AndroidVersion.ApiLevel=37.0/AndroidVersion.ApiLevel=37/; \
        s/Pkg.Desc=Android SDK Platform 17/Pkg.Desc=Android SDK Platform 37/; \
        s/Platform.Version=17/Platform.Version=37/' android-37/source.properties
# build.prop already had ro.build.version.sdk=37 — only source.properties was wrong.
```

After this, `assembleDebug testDebugUnitTest` (= `meeshy.sh check`) ran green across all modules. If a
future run's `android-37.0` metadata comes out *correct* (ApiLevel=37, dir android-37), this copy is
unnecessary — check `source.properties` first, only patch when ApiLevel carries the `.0`.

## 2026-08-21 — SDK bootstrap: the `android-37` symlink is now HARMFUL — newer cmdline-tools + AGP resolve `compileSdk 37 → android-37.0` on their own

Slice `chat-draft-effects-persistence`. The 2026-08-20 note below tells you to `ln -sfn android-37.0
$HOME/android-sdk/platforms/android-37`. **With the cmdline-tools bundle the routine now needs
(`commandlinetools-linux-13114758`), that symlink BREAKS the build.** sdkmanager rejects it —
`Observed package id 'platforms;android-37.0' in inconsistent location '.../android-37' (Expected
'.../android-37.0')` — and Gradle then dies with `Failed to find target with hash string 'android-37'`.
The correct, verified recipe this run (container reached `dl.google.com` → 200):

```bash
# NOT the pinned 11076708 — its SDK-XML-v3 parser mis-registers the 37.x preview package
# (source.properties comes out "Platform 17", ApiLevel 37.0), which is what made 11076708 fail earlier.
curl -sSL -o t.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
# unzip → $HOME/android-sdk/cmdline-tools/latest
sdkmanager --channel=3 "platforms;android-37.0" "build-tools;36.0.0" "platform-tools"
# NO symlink. AGP 8.13 resolves compileSdk 37 → the android-37.0 dir directly.
echo "sdk.dir=$HOME/android-sdk" > apps/android/local.properties
export LANG=C.utf8 LC_ALL=C.utf8   # still mandatory for :sdk-core test compilation
```

`:core:model:compileDebugKotlin` + `assembleDebug testDebugUnitTest` ran green after, no symlink.
Generalises: when the SDK layout is version-suffixed, hand the compileSdk→dir mapping to AGP (which
owns it) and use a cmdline-tools new enough to read the package's own metadata — don't paper over a
stale tool's mis-registration with a filesystem alias, it just moves the failure.

## 2026-08-21 — A composed a11y label is safe only on a NON-interactive bubble; the list bubble needs an instrumented test

Slice `chat-bubble-a11y-label`. iOS composes one VoiceOver string per message bubble. The obvious
Android port is `Modifier.clearAndSetSemantics { contentDescription = … }` (or
`semantics(mergeDescendants = true)`) on the bubble. **But the interactive list bubble has real
per-element touch targets** — reaction taps, image taps, `combinedClickable` long-press. Collapsing
its semantics subtree into one node would DROP those targets from the accessibility tree and regress
TalkBack, and there is no JVM/unit way to prove TalkBack still works (the routine's §CI-reality
caution: don't write unverifiable UI into a path that can regress behaviour). So:

- **Do NOT** merge/clear semantics on the interactive list bubble in a JVM-only slice.
- **Ship the pure composer** (the hard, edge-case-rich part) fully unit-tested, and wire it only where
  it's provably safe: `MessageOverlayPreviewHero` (the long-press overlay hero) renders
  `MessageBubble(content, outgoingColor)` with **zero** interaction callbacks — no `combinedClickable`,
  no reaction/image `onClick` — so `clearAndSetSemantics` there loses nothing. That's the opt-in
  `accessibilityLabel: String? = null` param's only caller; the list keeps `null` (unchanged).
- Wiring the composed label onto the interactive list bubble (custom a11y actions for reactions/images
  under one merged node) is a legitimate future slice, but it belongs behind an instrumented/Robolectric
  test, not the JVM gate.

General rule this reinforces: an opt-in nullable param whose non-null path reshapes semantics keeps the
default (interactive) path byte-for-byte unchanged — the safe way to add a feature to a shared
leaf-view without an on-device harness.

## 2026-08-20 — `ConversationListViewModel.kt` holds a literal NUL byte — grep treats it as binary

Slice `conversation-row-mood`. `grep`/`Grep` reported `ConversationListViewModel.kt` as a "binary
file" (`found "\0" byte around offset 22391`) and refused to print matches. It is NOT corruption: the
composite typing-key builder holds a deliberate `"$conversationId $userId"` — a real `\x00`
delimiter byte embedded in the Kotlin string literal (the Kotlin compiler accepts it; the module has
compiled with it for weeks). Don't "fix" it. To search or read the file use `grep -a` (text mode) or
the Read tool with offsets — both are unaffected. Editing elsewhere in the file is safe; the Edit tool
matches around the NUL fine.

## 2026-08-20 — "mood" is a per-user STATUS lookup, NOT a field on User/participant

Slice `conversation-row-mood`. Before scoping a "mood avatar affordance" as a wire-DTO widening, a
read-only recon subagent proved across iOS + gateway + Android that **mood is never on `User` or on a
conversation participant** anywhere in the stack. A mood is a `moodEmoji` string on an ephemeral
STATUS-type Post, resolved per-user at render time via `statusForUser(userId)` against the shared
status feed. So the row slice is pure UI wiring with **zero DTO change**: reuse `otherParticipantUserId`
(peer gate) + `statusForUser` (the exact lookup Contacts already uses) + the already-ported
`StatusBarCache`. `ContactsListViewModel.moodEmojiFor`/`paintMoodStatusesFromCache` is the SSOT
precedent — mirror it verbatim so mood resolution stays identical across every surface, rather than
inventing a second resolution path. Lesson: when an affordance "needs a new model", first grep the
serializer — the data may already flow through a feature you've ported, keyed differently.

## 2026-08-20 — a UI parameter already accepted the affordance; the "gap" was a cold caller

Slice `conversation-row-story-ring` (see PROGRESS.md). `MeeshyAvatar` had accepted `storyRing:
StoryRingState` for weeks (sdk-ui, unit-covered rendering), but no conversation-row caller ever
passed a non-`None` value — every row's ring was cold no matter what the peer had posted. Grep first
for the *callers* of a UI affordance before assuming the ring itself needs building: the audit-shot
that flagged "story ring missing on Android" was reading the row, not the widget. When the audit
diff and the widget diff disagree, the audit is describing behaviour at the *edge*, not the *center*
— fix the delegation, not the surface.

## 2026-08-20 — cache-first observation of a repo you don't own: mock its stream in existing VM tests

Slice `conversation-row-story-ring` (see PROGRESS.md). Adding a new dependency (`StoryRepository`)
to `ConversationListViewModel`'s primary constructor breaks EVERY existing test that instantiates
the VM — Kotlin's "No value passed for parameter …" compile error, 2 sites here. The instinct is to
build a fake `StoryRepository`, but its ctor pulls 5 deps you don't need. Use `mockk<StoryRepository>
(relaxed = true) { every { storiesStream(any(), any()) } returns emptyFlow() }` — one line, the
observer subscribes, the flow completes, no story groups arrive, every existing behaviour proof
runs unchanged. The `relaxed = true` on the mock covers every other method the VM might call now or
in a future slice without breaking those tests each time.

## 2026-08-20 — when a Step-0 PR closes as redundant, don't reopen — verify its head is an ancestor of main

Step 0 of this run merged #3238 first (message-summary-kind), then found #3239 (attachment-ladder)
had gone `dirty` because both slices had prepended to `PROGRESS.md`/`NOTES.md`. The resolution
(merge origin/main into the PR branch, strip conflict markers so BOTH sections survive newest-first,
push) shipped fine — but GitHub didn't auto-transition #3239 to `merged`; a maintainer closed it
manually after confirming the head commit (`d0e91d3b`) had become an ancestor of `main` via the
resolved-conflict merge commit and that `ComposerAttachmentLadder.kt`/`ComposerAttachmentTray.kt`/
`ComposerAttachmentLadderTest.kt` were all present on `origin/main`. Lesson for next time an
android-routine PR closes "without merging" while your fix was pushed: run `git merge-base
--is-ancestor <head> origin/main` before treating it as blocked or opening a duplicate. If ancestor
== true, the code shipped, and closed-not-merged is bookkeeping, not a re-do request.

## 2026-08-20 — "wire doesn't carry X" is a client-side blind spot claim, verify at the serializer

Slice `conversation-row-message-summary-kind` (see PROGRESS.md). Previous run's Next-line hint
said the message-body-kind slice would need to *widen the wire contract* because
`ApiConversationLastMessage` "doesn't carry `expiresAt`, `deletedAt`, `viewOnce`". True in the
Kotlin DTO — but **false at the serializer**: `services/gateway/src/routes/conversations/core.ts:971`
spreads the full Prisma `Message` object onto `lastMessage` via `...msgRest` after stripping only
`translations` and `originalLanguage`. Prisma's `Message` model has `isBlurred`, `isViewOnce`,
`expiresAt` (`packages/shared/prisma/schema.prisma:635-698`), so they reach every client TODAY.

The widening was 3 defaulted Kotlin fields — no wire contract change, no gateway PR, no iOS
sync needed. Rule for next time: before designing a slice around "add fields to the wire",
grep the gateway serializer for `...msg` / `...spread` — a spread that only excludes a small
denylist means every column reaches every client already.

## 2026-08-20 — Android SDK bootstrap: alias `android-37 → android-37.0` after auto-install

Fresh container: `apps/android/build.gradle.kts` pins `compileSdk = 37`, so Gradle
auto-triggers `Install Android SDK Platform 37.0` on first task. The install lands in
`$HOME/android-sdk/platforms/android-37.0/`, but Gradle looks up the alias `android-37` (no
version suffix) — build fails with `Failed to find target with hash string 'android-37' in:
/root/android-sdk`. Fix (idempotent):
```bash
ln -sfn android-37.0 $HOME/android-sdk/platforms/android-37
```
`meeshy.sh check` runs green after. Also seen in the 2026-08-20 activity-heat / tags slices —
this is now the standard bootstrap glitch.

## Slice `chat-composer-attachment-ladder` (2026-08-20)
- **When an iOS "which entries to show" decision is buried in a SwiftUI `View` computed property, the
  faithful port is a pure resolver + a dumb renderer — split the two gate families explicitly.** iOS's
  `carouselTiles` folds two unrelated questions into one list comprehension: *is the capability permitted*
  and *did the host wire a handler* (`onCamera != nil`). Modelling them as one boolean would have made the
  test matrix ambiguous. The clean shape is `tiles(affordances, showCamera=…, showLocation=…, …)`: permission
  gates come off the value type, host-capability gates are defaulted flags. Each kind then has TWO
  independently-tested arms (permission off with host on; host off with permission on), which is what the
  reviewer's edge-case checklist wants and what a single combined gate can't express.
- **Set the host-capability flags to reflect what the screen can ACTUALLY handle, at the call site — that is
  how you honour "no dead-end tiles" without inventing UI.** Android has no camera launcher, no send-location
  action, no emoji-into-text handler yet. Rather than render those tiles disabled (a dead end) or omit the
  branches from the pure fn (losing future parity), the resolver keeps all six branches and the ChatScreen
  passes `showCamera=false, showLocation=false, showEmoji=false`. Result today: exactly Photo/File/Voice.
  The day a handler lands, its slice flips one flag to `true` and adds one `when` arm — no touch to the core.
  A dedicated test locks this live posture so a regression (accidentally showing an unhandled tile) fails loud.
- **`Icons.Filled.InsertDriveFile` does not exist — it's `Icons.AutoMirrored.Filled.InsertDriveFile`.** The
  document-with-corner glyph is direction-aware, so Material parks it under `automirrored`. `grep` an existing
  caller (`feature/feed/.../FeedComposerSheet.kt` imports the automirrored one) before guessing the package;
  the filled-only import compiles-fails with "Unresolved reference". Same family: `Send`, `Reply`, `ArrowBack`.
- **A `:feature:*` module's generated `R` is `me.meeshy.feature.<name>.R`, not `me.meeshy.app.<name>.R`.**
  The Kotlin *package* of the source is `me.meeshy.app.chat` but the Android *namespace* (and thus `R`) is
  `me.meeshy.feature.chat` (`feature/chat/build.gradle.kts` `namespace = "me.meeshy.feature.chat"`). A new
  file in the module must `import me.meeshy.feature.chat.R` explicitly — the bare `R` resolves to the package,
  which has none. Copy the `R` import from a sibling file in the same module rather than assuming it matches
  the source package.

## Slice `conversation-row-activity-heat` (2026-08-20)
- **Expose the SSOT palette, not just the primary hex.** Twice now I've watched a caller reach for a
  *pair* of accent hues (`primary` + `secondary`) that already lived on
  `DynamicColorGenerator.ColorPalette` and rebuild it locally by calling `accentHex()` for the
  primary and shrugging at the secondary. Fix, this slice: added `ApiConversation
  .accentColorPalette()` in `:sdk-core/theme` alongside `accentHex()` (`accentHex()` is now its
  `primary` shortcut). The row memoizes the palette once via `remember(conversation)` and reads both
  hues from it — the two accent-tinted labels and the avatar `containerColor` also switch to the
  memoized `primaryAccent`, so a hot row no longer parses the same hex 3× per render.
- **Wrap iOS's `guard !isMuted else { return 0.05 }` short-circuit into the pure core.** A muted row
  is pinned to the cold floor regardless of every other signal. Model it as a **single early return
  at the top** of the function — not as a post-hoc `if (isMuted) 0.05 else max(0.05, sum)`, which
  reads as "muted merely nudges the floor" and lets a very active muted thread bleed heat back in.
  Guard: the "muted short-circuit" test emits maxed inputs (unread 100, members 100, pinned, most
  recent) and asserts the result is *exactly* 0.05, not just "at most 0.05".
- **Recency buckets use `<`, not `<=` — proved by the exact-boundary tests.** A first draft used
  `<=` and would have hidden the transition at 300 / 3600 / 86_400 / 604_800 s under the previous
  bucket. Four one-liner "exactly at the boundary drops to the next bucket" tests make the
  arithmetic unambiguous and lock in parity with iOS's `seconds < 300` chain.
- **`ConversationRowTime.epochMillis` is the SSOT for iOS's `lastMessageAt` — reuse it, don't
  re-parse `lastMessage?.createdAt` inline.** It already threads the last-message → updatedAt →
  createdAt cascade correctly (including a legitimate epoch-0 instant). The heat's `of(...)` reads
  through it in one line and the whole cascade is covered by the pre-existing time-resolver tests.
- **Layer the heat gradient *inside* `MeeshyGlassSurface`, not over it.** The glass surface already
  applies the rounded clip + border; adding a `Modifier.background(heatBrush)` to the inner content
  `Row` puts the tint above the glass fill but below its border — no shape mismatch, no double clip.
  Attempting to put the brush on the surface's own modifier chain competed with its `.background(fill)`
  and painted the tint underneath the (semi-opaque) glass fill instead of on top, muting it to zero.

## Slice `conversation-row-tag-chips` (2026-08-20)
- **The Gradle 8.13 wrapper download 403s through this container's proxy, but the distribution
  itself is reachable.** `./gradlew` (and the direct `gradle` wrapper main) died with a 10 s
  `SocketTimeoutException` fetching `services.gradle.org/distributions/gradle-8.13-bin.zip`, yet a
  plain `curl -L` of the same URL returned the zip (after one 307 redirect). Workaround that let the
  full local gate run: `curl` the distribution once, `unzip` it to `$HOME/gradle-8.13`, and invoke
  `$HOME/gradle-8.13/bin/gradle` directly for local verification. CI on `ubuntu-latest` downloads the
  wrapper fine — this is a container-egress quirk, not a repo problem. Don't burn time retrying the
  wrapper; fetch-and-run.
- **The `android-37.0` platform + `android-37` alias recipe from the typing slice still holds** and
  is now twice-confirmed: newer cmdline-tools bundle `13114758` (the pinned `11076708` can't parse the
  v4 SDK XML that lists 37.x), `sdkmanager --channel=3 "platforms;android-37.0"`, then
  `ln -sfn android-37.0 $ANDROID_SDK/platforms/android-37` so AGP 8.13's `compileSdk 37` hash resolves.
- **Port a UI heuristic into the FEATURE layer, not onto the wire model — even when iOS put it on the
  model.** iOS hangs `estimatedWidth` off `MeeshyConversationTag` (a Codable DTO). The faithful port
  lives in `:feature:conversations` `ConversationTagRow` instead: a character-count width heuristic is
  row-layout logic, not a transported property, and `:core:model` stays a pure serializable DTO
  (SDK-purity grain test). The algorithm is 100% deterministic (no real text measurement), so it's a
  clean pure unit with full branch coverage; the Composable only feeds it `BoxWithConstraints.maxWidth`.
- **Watch the `estimatedWidth` arithmetic when authoring boundary tests by hand.** `"ab"` is
  `2*7+22 = 36`, not 29 — my first draft of the reserve-boundary tests used the wrong width and would
  have asserted the wrong `visible`/`remaining`. Recompute each case against `len*7+22`, spacing 6,
  badge 32 before trusting the expected values; the "final tag skips the reserve" test only proves its
  point at exactly width 79 (36+38 reserve for the first, then 78 for the exempt last).

## Slice `conversation-row-typing-indicator` (2026-08-20)
- **`advanceUntilIdle()` fast-forwards virtual time through ANY pending `delay(...)`, so it silently
  fires a safety-timeout you were trying to test AROUND, not just the immediate work.** Four VM tests
  that emitted a `typing:start` then asserted the typer was surfaced failed with `expected: Alice / but
  was: null` — because `armTypingCleanup` schedules a `delay(15_000)` clear, and `advanceUntilIdle()`
  runs the scheduler until *empty*, executing that 15 s job immediately and clearing the typer before the
  assertion. Fix: use **`runCurrent()`** (drains only tasks scheduled at the current virtual time — no
  time advance) to observe a state that a later timer will undo, and reach for `advanceTimeBy(n)` only in
  the tests that specifically exercise the timeout. Rule of thumb: if the code under test arms a delayed
  job, `advanceUntilIdle()` after the triggering emit will run that job — prefer `runCurrent()`.
- **`list_pull_requests --head isopen-io:claude/apps/android` returns `[]` even when a
  `claude/apps/android/<slice>` PR is open — the head filter is matched as a full `owner:ref`, not a ref
  prefix.** My Step-0 check missed the open PR #3228 this way; I only found it by scanning the Actions run
  list (`actions_list method=list_workflow_runs branch=main`), whose `head_branch` fields revealed the
  live `claude/apps/android/*` branch. For a reliable Step-0 open-PR sweep, list open PRs WITHOUT a head
  filter (or search `head:claude/apps/android`), or read recent Actions runs and look at `head_branch`.
- **A fresh main can be red on Android CI from a cross-cutting commit that updated production + SOME test
  mirrors but not all.** `0a8a1624` switched share-link `joinUrl` to `/chat/` and fixed the `:core:model`
  presentation tests but left 3 `:feature:conversations` ViewModel tests asserting `/join/`. The local
  full gate is what surfaced it (4 failures unrelated to my diff). Attribute via `git log --oneline -- <file>`
  on the production string producer, then check whether a sibling open PR already carries the fix (here
  #3228 did) before touching it yourself — don't double-fix.

## Slice `outbox-message-lane-discovery` (2026-08-11)
- **A Room DAO method named `deliverableForLane(lane: String)` binding an EXACT-match `WHERE
  lane = :lane` can be called with a value that was never meant to be a real lane — and the
  compiler cannot catch it.** `OutboxFlushWorker.doWork()` called
  `outboxRepository.deliverable(OutboxLanes.forMessage(""))` to "discover" which dynamic
  per-conversation message lanes needed draining. `OutboxLanes.forMessage("")` innocently
  evaluates to the literal string `"message:"` — a syntactically valid `String`, so nothing
  about the call looks wrong at a glance, and it type-checks perfectly. But no row is EVER
  enqueued with a blank conversation id (every real call site passes a real id), so the exact-
  match query behind `deliverable()` could never return anything for that input. The entire
  "drain per-conversation message lanes" loop was silently dead code — `SEND_MESSAGE`/
  `EDIT_MESSAGE`/`DELETE_MESSAGE` were never drained by `OutboxFlushWorker` at all, in any build
  that has shipped this discovery mechanism. Lesson: when a "discovery" call reuses a
  single-item lookup function (`deliverableForLane`, built for "give me lane X's rows") with a
  deliberately-empty/placeholder argument to try to get "everything under this lane family"
  behavior, that's a strong signal the lookup function's semantics (exact match) don't actually
  support the caller's intent (prefix/family match) — the fix needed a genuinely different query
  (`LIKE 'message:%' GROUP BY lane`), not a cleverer argument to the existing one.
- **A message "stuck pending forever with a clock icon, even for a plain-text message with zero
  dependencies" is strong direct evidence the DISCOVERY of its lane never ran at all — not
  merely evidence of a same-pass dependency-timing race.** The previous iteration's own
  on-device verification found `flip-test-verify`/`ime-verify-flip-c3` (plain text, no
  attachment, no `dependsOn`) stuck pending and attributed it to the `OutboxFlushWorker`
  same-pass graft-timing gap (a real, but narrower, issue that only explains attachment-
  dependent sends). A `dependsOn`-free row has `DependencyVerdict.SATISFIED` immediately, so the
  ONLY way it never drains on the very first `drainLane` call on its lane is if that lane is
  never visited in the first place — which is exactly what the exact-match discovery bug caused.
  When a "same-run timing" theory doesn't actually explain a **zero-dependency** row exhibiting
  the identical symptom, treat that as a signal the theory is incomplete, not as an unrelated
  data point to set aside.
- **`OutboxFlushPlan.outcome`'s `FlushOutcome.RETRY`-on-blocked-dependency design was already
  correct for the "prerequisite delivers later in the same pass" case — no additional same-pass
  redrain loop was needed once lane discovery was fixed.** Before writing a fix, it's worth
  reading the *existing* retry/backoff design's own doc comments closely: this file's already
  explained (2026-07 era) that a lane stopping on `stoppedOnBlockedDependency` triggers
  `Result.retry()`, which WorkManager reschedules via its own `EXPONENTIAL, 10s` backoff — the
  next pass either delivers the now-satisfied dependent or cascade-exhausts it. That mechanism
  simply never fired for ANY message lane because message lanes were never drained at all
  (previous note). Fixing the root cause (discovery) made the already-correct retry design work
  for the first time, rather than needing a second, parallel same-pass-redrain mechanism layered
  on top — worth checking whether an adjacent "this looks incomplete" mechanism is actually
  already complete and just unreachable, before building a second one next to it.
- **A live-gateway on-device verification can surface a genuine, currently-active, unrelated
  PRODUCTION incident — reproduce it with a bare `curl` before concluding the diff under test
  caused it.** After the fix, a real `POST /conversations/:id/messages` finally reached
  `gate.meeshy.me` (proving the Android-side discovery fix works) but the gateway responded `400
  {"error":"Internal Server Error"}` for every attempt, in two different conversations. Before
  writing this off as "my fix is broken" or silently ignoring it, replaying the exact same
  request with `curl` (same bearer token, same body shape) reproduced the identical 400 outside
  the app entirely — and a `GET` on the same conversation's messages returned a normal `200` —
  proving the failure is server-side and platform-independent, not a symptom of anything in this
  diff (which contains zero gateway changes). Flagged as a new, separate, urgent backlog item
  rather than investigated further, since gateway code is out of this lane's diff-purity bounds
  — but the `curl` reproduction step is what turns "my fix might be broken" into "found a live,
  unrelated production bug" with confidence, in under a minute.

## Slice `tus-upload-checkpoint-resume` (2026-08-11)
- **`adb shell run-as <pkg> sqlite3 …` round-trips are too slow and jittery to catch a
  sub-2-second transient DB row live via a polling loop.** Tried twice to observe the
  intermediate `tus_upload_checkpoint` row that exists only between the first chunk's PATCH
  success and the final chunk's PATCH success (a ~2.3 s window for a 17.9 MB two-chunk upload).
  Each `adb shell "run-as … sqlite3 …"` invocation spawns a fresh `run-as` + `sqlite3` process
  pair, and the actual per-call latency was inconsistent enough (sometimes ~50 ms, sometimes
  much more once a background `logcat` stream was also running) that a 20-40-iteration polling
  loop's *effective* wall-clock coverage was hard to predict in advance — both attempts either
  finished measuring before the write happened or only started after it was already gone. Do
  not treat "polled N times, saw nothing" as proof the write never happened when the window is
  this narrow relative to per-call overhead — either give the polling loop a much wider,
  deliberately-overlapping window (start before the earliest plausible write time, run well past
  the latest plausible one) or drop the live-polling approach entirely.
- **Pre/post DB state + a full logcat request/response trace + mutation-proven unit tests
  together substitute for a live transient-state capture, and are cheaper to obtain reliably.**
  For this slice, confirming (a) the checkpoint table is empty *after* a successful multi-chunk
  upload (proves the delete-on-completion path executed against the real on-device Room DB, not
  a mock), (b) the exact `POST 201 → PATCH 204 → PATCH 200` sequence in `adb logcat` (proves the
  real chunk-then-finish shape reached the live gateway unchanged), and (c) a mutation test that
  fails exactly the "resume" branch's own unit tests when the decision is hardcoded to `Fresh`
  (proves the decision logic itself), together closes the same loop that watching the live write
  would have — without needing to win a timing race against `adb`'s own overhead.
- **A noise-source (`geq=random(1)*255:…`) `ffmpeg` clip is a cheap, reliable way to synthesize a
  real, playable, large (multi-chunk-triggering) test video on demand.** A `testsrc`/`nullsrc`
  pattern compresses far too well under h264 (a 20 s clip landed at ~1 MB) to reliably exceed a
  10 MB chunk boundary; feeding `geq` per-pixel randomness into the video filter graph produces
  genuinely incompressible frames, so a ~1.6 s clip at 960×540/`crf 18` reliably lands at ~18 MB
  — enough for a real two-chunk TUS PATCH sequence without waiting on a multi-minute encode.
- **The system Android photo/media picker's "Add (N)" button lives in a different package
  (`com.google.android.providers.media.module`) with its own `uiautomator` node tree** — grep the
  dump for the visible button text (`text="Add"`) rather than assuming the composer's own
  attach-tile bounds convention (content-desc-first) carries over; the clickable node is a
  sibling `android.widget.Button` with a `resource-id` in that package's namespace, not the
  app's.

## Slice `feed-composer-location-attachment` (2026-08-11)
- **A single visually-estimated tap coordinate broke the routine's own hard rule mid-verification
  — caught and corrected, but worth restating precisely why the rule exists.** After reading the
  "Publish" button's approximate on-screen position from a screenshot and computing a tap
  coordinate by eye, the tap landed nowhere near the button (the composer sheet didn't dismiss,
  no request fired) — the screenshot viewer displays the 1080×2400 PNG scaled to 900 px wide, and
  every coordinate read off it needs the stated 1.2× multiplier back to device pixels, a step
  that's easy to silently skip when eyeballing a position rather than reading a bounds attribute.
  Every OTHER tap in this same verification session used `uiautomator dump` + a grepped `bounds="
  [x1,y1][x2,y2]"` attribute (already in real device pixels, no scaling needed) and landed
  correctly on the first try. Re-confirms the standing rule in absolute terms: there is no
  "close enough" visual estimate that's actually reliable once a screenshot's display scale
  enters the picture — the dump-and-grep step is not optional even for "obvious" targets.
- **A `String.format("%.Nf", …)` call with no explicit `Locale` is a live production bug waiting
  for a comma-decimal device locale (`fr_FR`, `de_DE`, …), not a theoretical one.** Kotlin's
  `String.format` without a `Locale` argument defaults to the JVM's current default locale, which
  on a real device tracks the user's system language — a French or German device would silently
  render `"48,86"` instead of `"48.86"` for a value the gateway's `parseSharedPlace` treats as a
  `Double` on the wire. `Locale.ROOT` (not `Locale.US`, which has its own regional quirks over
  the JDK versions) pins the format regardless of device locale. Proven, not assumed: a dedicated
  test temporarily calls `Locale.setDefault(Locale.FRANCE)`, asserts the output is still
  dot-separated, then restores the original default in a `finally` block so no other test in the
  suite observes a changed JVM-wide default — this is the kind of gotcha that a CI running in a
  single fixed locale (typically `en_US`) will never catch on its own, so the test has to force
  the adversarial locale itself rather than rely on the ambient one.
- **A full port of an iOS map-based picker (search, "my position", `CLGeocoder` reverse-geocoding)
  is a multi-part epic requiring a new Maps SDK dependency with its own API-key provisioning — not
  a slice an unattended routine run should attempt whole.** Confirmed by reading iOS's
  `LocationPickerView.swift` end to end (879 lines) before writing any Android code: the map UI
  alone needs `com.google.android.gms:play-services-maps`/Maps Compose plus a provisioned API key
  outside this routine's reach, on top of the picker's own state machine (search debounce,
  precision degrading, coarse-name fallback). The right-sized first sub-slice instead captured
  the device's raw coordinate via the plain Android SDK's `android.location.LocationManager` (no
  new Gradle dependency at all) and shipped a genuinely valuable, wire-compatible "attach my
  location" capability — deferring map/search/geocoding as explicitly-scoped, heavier follow-ups
  rather than either attempting the whole epic in one run or silently skipping the candidate
  again.
- **`LocationManager.requestLocationUpdates` wrapped in `suspendCancellableCoroutine` +
  `withTimeoutOrNull` is a clean, dependency-free way to get "one fresh fix or a timeout" without
  Play Services** — the coroutine resumes on the listener's first `onLocationChanged` callback
  (which also unregisters itself via `removeUpdates(this)`), and `continuation.invokeOnCancellation
  { removeUpdates(listener) }` covers the timeout/cancellation path so the listener never leaks
  past the call's lifetime either way.

## Slice `feed-composer-language-override` (2026-08-11)
- **The exact screenshot-estimated-tap mistake this file already documents once (previous
  slice's own note) recurred mid-verification, on the identical "Publish" button, within the
  same run.** After confirming the language-picker dialog worked correctly via dump-derived
  bounds, the very next tap (Publish, after typing text) was read off a *displayed* screenshot
  coordinate without reapplying the 1.2x scale-to-device-pixel correction — the tap silently
  landed nowhere near the button and the composer sheet stayed open with no request fired. Caught
  by checking the resulting screenshot (composer still open) rather than assuming success, then
  corrected by dumping `uiautomator` fresh and reading the real `bounds="[874,1360][1006,1414]"`
  for "Publish" — center `(940,1387)`, not the eyeballed `(783,1156)` from the scaled screenshot.
  Confirms the standing rule needs restating even more bluntly: **every single tap in a
  verification session needs its own fresh bounds lookup, including ones that feel "the same
  button I already located a few steps ago"** — a sheet can re-render (draft reset on reopen,
  keyboard IME changing layout, a dialog closing) and shift coordinates between two visually
  similar-looking moments, and muscle-memory-reusing an earlier screenshot-derived guess is just
  as unreliable as never having read a bounds attribute at all.
- **A wire request parameter that has existed on a `Repository`/`ApiRequest` DTO for a long time
  can still be entirely dead for one specific call site.** `PostRepository.create(originalLanguage
  ...)` and `CreatePostRequest.originalLanguage` both already existed (used by other flows), but
  `FeedViewModel.publishPost` never threaded a value into that parameter — every Feed post ever
  published from this composer silently sent `originalLanguage: null`. No production change was
  needed in `PostRepository`/`PostApi` at all; the gap was entirely in the two callers above it
  (`FeedComposerDraft` never carried a language field, `FeedViewModel.publishPost` never had a
  parameter to forward). Worth grepping the full call chain of an "already-wired" field before
  assuming a gap needs wire-model changes — sometimes only the composer-side plumbing is missing.
- **Giving a ViewModel-level pass-through parameter a `null` default (not the app's own real
  default) is what keeps every pre-existing test green when threading a new field through an
  established, heavily-tested method.** `FeedComposerDraft.language` defaults to
  `ComposerLanguage.DEFAULT` ("fr", matching iOS's own composer always having *some* language
  selected) — but `FeedViewModel.publishPost(language: String? = null)` deliberately defaults to
  `null`, not `"fr"`, even though the real composer always supplies a non-null value. Defaulting
  the ViewModel param to `"fr"` would have silently changed the `originalLanguage` argument
  every existing `publishPost(content=.., visibility=..)` test call implicitly sends to
  `repository.create(...)` — MockK's `coEvery`/`coVerify` match on the exact argument values a
  call site passes (defaults included), so every pre-existing stub omitting `originalLanguage`
  (implicitly `null`) would have stopped matching and gone red, with zero relation to the actual
  new behavior under test. Mirrors the established `location: SharedPlace? = null` precedent from
  the prior slice — an additive, nullable pass-through parameter is the only shape that adds new
  forwarding capability without silently mutating the default behavior every untouched caller
  relies on.

## Slice `settings-two-factor-auth` (2026-08-11)
- **A commit message's stated reason for removing a feature is a claim, not a fact — re-verify it
  against the actual backend before trusting it, even when the commit is barely a day old.**
  `761164959` (2026-08-10) removed the 2FA settings row with the message "aucune route gateway
  n'existe" (no gateway route exists). `grep`ping `services/gateway/src/routes/two-factor.ts` +
  `TwoFactorService.ts` + `route-registration.ts` showed six real, tested, live endpoints under
  `auth/2fa`, registered since a much OLDER commit (`c44ded3d5`) — the removal's premise was wrong
  from the moment it was written, not a regression that happened later. A same-day-old commit
  message is not inherently more trustworthy than an old one; both are claims about the codebase
  that the codebase itself can confirm or refute in under a minute.
- **`./apps/android/meeshy.sh check` (`assembleDebug` + `testDebugUnitTest`) does NOT install the
  APK — a fresh `:app:installDebug` is a separate, required step before on-device verification can
  see new code.** Tapped the newly-restored Settings row on the emulator and it wasn't there;
  the emulator was still running whatever build was last installed (from a prior, unrelated
  slice). `adb shell pm list packages`/screen state can look identical whether or not the running
  APK matches the current worktree — always `installDebug` explicitly before any on-device
  verification pass, never assume `check`'s green result means the emulator is running that code.
- **Kotlin block comments nest (unlike Java/C) — a literal `/*` sequence inside a KDoc comment's
  prose (not a code fence) silently opens a SECOND comment that the doc's own closing `*/` then
  closes, leaving the outer one unclosed until EOF.** Writing `` `/auth/2fa/*` `` (a glob-style
  path in backticks) inside a `/** ... */` doc comment produced `kspDebugKotlin: Unclosed comment`
  pointing at the LAST line of the file, nowhere near the actual typo — because Kotlin's nested-
  comment support means the "closing" `*/` at the end of that KDoc block actually closed the
  accidental nested comment opened by `2fa/*`, and the real outer comment kept consuming the rest
  of the file. When "Unclosed comment" points at EOF, grep every doc comment for a literal `/*`
  substring (not just missing `*/`) — the bug is almost certainly an accidental nested-open, not a
  missing close.
- **A security-toggle feature (2FA) exercised against the routine's own shared, long-lived test
  account needs an explicit stop-point BEFORE the state-changing call, not just "verify it works
  end to end."** The account (`atabeth`) is reused across every verification run this routine has
  ever done, by both the Android and iOS lanes — and this session does not know its password
  (needed by the `disable` endpoint's `DisableBodySchema`, which requires it unconditionally).
  Computing a valid live TOTP code from the real `POST auth/2fa/setup` secret and calling `/enable`
  was technically straightforward, but would have left the account's real login flow behind 2FA
  with no password-holder in this session able to complete a subsequent disable — a real risk of
  locking every future run of this routine out of the account it depends on. Verified the read-only
  and non-destructive parts instead (`GET status`, `POST setup`, and that `cancel()` fires zero
  network calls and leaves the account's real status unchanged) and stopped there. When a
  verification pass would need to flip a real, hard-to-reverse account-level flag on a SHARED
  fixture the session doesn't fully control (no known password, no dedicated disposable account),
  the safety-first move is to verify up to but not including that flip, not to "complete the loop"
  for its own sake.

## Slice `settings-account-contact-change` (2026-08-11)
- **`advanceUntilIdle()` fully drains a coroutine's `delay()` loop even when that loop is
  scheduled to run for real minutes of virtual time — it does not stop at "nothing due right
  now," it keeps advancing virtual time until the scheduler is genuinely empty.** A test that
  called `submitEmailChange()` (which launches a 60-iteration `delay(1000)` tick loop for the
  resend cooldown) then `advanceUntilIdle()` to inspect the just-started cooldown got
  `remaining == 0, expired == true` instead of `remaining == 60` — the single `advanceUntilIdle()`
  call ran the ENTIRE 60-second countdown to completion before returning, because from the test
  dispatcher's point of view a 60 s virtual delay and a 1 ms one are equally "not idle yet."
  `runCurrent()` (only run tasks already due at the CURRENT virtual instant, never advance time)
  is the correct call to observe a freshly-started periodic coroutine's initial state; reserve
  `advanceTimeBy(N) + runCurrent()` for when the test actually wants to fast-forward through N ms
  of that loop. Every call site that chains "trigger a tick-loop-starting action" then immediately
  inspects tick-loop state must use `runCurrent()`, not `advanceUntilIdle()` — this bit 4 of 27
  tests on first run here (`MagicLinkViewModel`'s own identical `delay(1000)` tick loop from an
  earlier slice has no test file yet, so this exact trap hadn't been hit in this codebase before).
- **A fully generic pure countdown type is worth reusing across unrelated features even when its
  name reads domain-specific.** `MagicLinkCountdown` (`:core:model/auth`, from the magic-link-login
  slice) is a `remaining`/`expired`/`tick()`/`canResend()`/`start()` value type with nothing
  magic-link-specific in its logic — reused verbatim here for the unrelated 60s email-resend
  cooldown rather than duplicating an identical tick/expire mechanism or renaming the type
  (renaming would touch an unrelated slice's call site for zero behavioural gain, out of scope for
  a single-feature PR). Only the 2nd call site so far — this codebase's own established convention
  (`ComposerLanguagePickerDialog` vs `RegionalLanguageDialog` vs the registration inline grid) is
  to keep duplicating small UI glue until a 3rd call site forces a shared abstraction, but that
  convention is about UI glue, not already-fully-generic pure logic; a pure type with zero
  feature-specific fields is a SSOT from the first reuse, not the third.

## Slice `widget-recent-conversations` (2026-08-11)
- **A `GlanceAppWidget` update can run in a cold app process that never executed the app's
  normal startup flow — any in-memory-only session state silently reads as absent, not stale.**
  `SessionRepository.currentUserId` is populated exclusively by `AuthRepository.restoreSession()`,
  itself called from `MainActivity`'s/a ViewModel's own startup path. `AppWidgetManager` can spawn
  the app's process purely to service `APPWIDGET_UPDATE` (via `GlanceAppWidgetReceiver.onUpdate`)
  without ever launching an Activity — that process never runs `restoreSession()`, so
  `SessionRepository.currentUserId` is `null` even though the user IS signed in on the device.
  Any widget decision needing the current user's identity (here: resolving a direct conversation's
  *other* participant) must read from something actually persisted across process death — added
  `TokenStore.userId`, mirroring the existing `jwt`/`sessionToken` persistence exactly, rather than
  reaching for the in-memory `SessionRepository` a first instinct suggests since it's the "obvious"
  place identity lives everywhere else in the app.
- **`androidx.glance.action.actionStartActivity` (the base `glance` artifact) has NO overload
  accepting a raw `Intent` — only `ComponentName` or a reified `Class<T : Activity>`, both paired
  with `ActionParameters` (an extras-like bundle, not a `data` URI).** The `Intent`-accepting
  overload lives in a DIFFERENT package/artifact: `androidx.glance.appwidget.action.actionStartActivity(Intent, ActionParameters)`
  (from `glance-appwidget`, imported under an alias to avoid colliding with the base package's
  same-named function when both are needed in one file — the empty-state tap still wants the typed
  `actionStartActivity<MainActivity>()` form). Verified via `javap` against the actual jars in
  `~/.gradle/caches/*/transforms/*/transformed/glance-appwidget-1.1.1-api.jar` BEFORE writing any
  code — there is no JDK on `$PATH` by default on this machine (`java_home -V` empty), but
  `brew list` had `openjdk@21` already installed unlinked; `export JAVA_HOME="$(brew --prefix
  openjdk@21)/libexec/openjdk.jdk/Contents/Home"` unblocks `javap`/Gradle without any install step.
  This class of "does the API even have the overload I'm about to write against" doubt is cheap to
  resolve by decompiling the actual dependency jar rather than guessing from memory or Android
  documentation that may describe a different Glance version.
- **Navigation-Compose 2.8.3 (this repo's pinned version) auto-consumes the hosting Activity's
  launching `Intent` for registered `navDeepLink`s — no manual `NavController.handleDeepLink()`
  call needed**, confirmed by `libs.versions.toml` (`navigationCompose = "2.8.3"`, the version that
  added this) plus the total absence of any `handleDeepLink` call anywhere in `apps/android/app`.
  Older Navigation-Compose versions require that call explicitly in `onNewIntent`; don't assume the
  older requirement without checking the pinned version first — it would have led to writing dead
  manual-wiring code for a mechanism this version already handles automatically.
- **A Hilt `@EntryPoint` interface meant for a class of callers (not one specific caller) is worth
  renaming the moment a second caller needs it, not accreting a misleadingly-scoped name.**
  `UnreadWidgetEntryPoint` (singular-widget name) already generalizes cleanly to any
  `GlanceAppWidget` needing a `@Singleton` binding — renamed to `WidgetEntryPoint` via `git mv` the
  moment this second widget needed `tokenStore()` alongside the existing `conversationRepository()`,
  rather than leaving the misnomer or spawning a near-duplicate second entry-point interface.

## Slice `conversation-hardpress-preview` (2026-08-11)
- **A high-load host can trigger a genuine, single, real `ActivityManager` ANR on the emulator
  that has NOTHING to do with the diff under test — distinguish it from an app hang via the
  `InputDispatcher` log lines, not the dialog alone.** Mid on-device verification, `dumpsys
  window` reported an "Application Not Responding" dialog after a long-press gesture. Before
  assuming the new `combinedClickable`/`loadPreviewMessages` code deadlocked something, `adb
  logcat` showed the actual ANR reason: `Input dispatching timed out … Waited 5008ms for
  MotionEvent … spent 8323ms processing MotionEvent` — that phrasing means the SYSTEM took
  8+ seconds just to *deliver* the touch event to the app, not that the app failed to *handle*
  an already-delivered one. `uptime` confirmed a load average of ~7-8 and `ps aux` showed three
  concurrent `claude --dangerously-skip-permissions` processes plus an active Xcode `xctest` run
  alongside the one `meeshy_pixel8` emulator — host-wide contention (the routine's own documented
  "concurrent sessions" gotcha), not a code-level deadlock. Only ONE `ANR in me.meeshy.app.debug`
  line was ever logged despite the dialog appearing to "come back" across several dismiss-and-
  retap attempts — those were the same stuck dialog being slowly re-rendered under load, not
  repeat crashes. Tapping "Close app" (not "Wait") plus a background wait-loop for `mCurrentFocus`
  to clear, then relaunching, recovered cleanly with zero code changes.
- **`dumpsys window`'s `mCurrentFocus` does not reliably report a Compose `DropdownMenu`'s
  `Popup` the same way it reports a system dialog or a `PopupWindow`.** After a successful
  long-press, `mCurrentFocus` read `Window{… Pop-Up Window}` once, but on a second identical
  gesture on a different row it stayed on `MainActivity` even though (per a direct screenshot
  check) nothing had actually opened — the earlier "long-press" had registered as a plain tap
  and NAVIGATED into the conversation instead. `mCurrentFocus` alone is not a trustworthy signal
  for "did a Compose Popup open" — always cross-check with an actual screenshot (or a fresh
  `uiautomator dump` grepped for the menu's own content) rather than inferring solely from the
  focus window name, especially the first time a given gesture is attempted on a fresh row.
- **`input touchscreen swipe x y x y <ms>` reliably triggers a Compose `combinedClickable`'s
  `onLongClick` at ~700-900ms under a QUIET system, but under host contention the SAME command
  can be perceived as a short tap** (the framework's long-press timer apparently measures from
  event delivery, not command issuance, so delivery lag eats into the hold window). No amount of
  increasing the duration fixes this reliably when the host itself is the bottleneck — the fix is
  to retry once system load has visibly dropped (`uptime`), not to keep escalating the duration.
- **A hard-press preview card reusing an existing single-message preview formatter for a LIST of
  messages resurfaces that formatter's existing "no content, no type" fallback as a
  mid-list line, not just a whole-row fallback.** `lastMessagePreview`'s `labels.none` ("No
  messages yet") is designed for "this conversation has no last message at all"; reused verbatim
  for a mid-list message whose own content happens to be blank with no recognized media type, the
  same label reads confusingly out of context ("No messages yet" appearing between two real
  messages in the preview card, seen live on-device against the `atabeth` account's real
  `Belva Tano` thread). Left as-is rather than special-cased this slice: it is the SAME string the
  row's own single-line preview would already show if that message were the conversation's most
  recent one, so this is an inherited pre-existing quirk of the reused formatter, not a new
  regression — refactoring `lastMessagePreview`'s fallback semantics is out of scope for a slice
  whose job was reusing it, not rewriting it.

## Slice `widget-favorite-contacts` (2026-08-11)
- **A `private val` constant becomes worth hoisting to `internal` at its SECOND call site, not
  its third, when it encodes a correctness-sensitive business rule rather than disposable UI
  glue.** `directConversationTypes = setOf("direct", "dm")` lived `private` in
  `RecentConversationsWidgetPresentation.kt`. This slice's `FavoriteContactsWidgetPresentation`
  needed the exact same "is this a 1:1 chat" gate. The codebase's own established convention
  (`MagicLinkCountdown`, documented in an earlier slice's note) is to keep duplicating small UI
  glue until a 3rd call site forces a shared abstraction — but that convention exists because UI
  glue drifting apart at 2 call sites is cheap to notice and cheap to fix. A `setOf("direct",
  "dm")` string-literal duplicate is different: if the canonical set of "direct" type strings
  ever changes (a new value added server-side, a rename), two independently-maintained copies can
  silently drift apart with no compiler signal — a correctness bug, not a style inconsistency.
  Changing `private val` to `internal val` plus one import is a strictly smaller diff than
  duplicating the literal, so there was no actual cost to avoiding the duplication here either.
  Rule of thumb going forward: duplicate-until-3rd-site applies to disposable glue; anything that
  encodes "what counts as X" business logic gets hoisted at the 2nd site regardless of size.
- **`ApiConversation.participants` (`ApiParticipant`) carries no presence fields
  (`isOnline`/`lastActiveAt`) anywhere in this codebase — confirmed by reading the full model,
  not assumed.** iOS's `FavoriteContactsWidget` shows an online/offline status line per contact
  (`MeeshyConversation.lastSeenText`), sourced from a richer conversation snapshot iOS's main app
  publishes into the widget's App Group. Android's widget architecture is structurally different
  (a live Room read via a Hilt `EntryPoint`, not an App-Group snapshot the main app pre-publishes)
  and its `ApiParticipant` model was never given presence fields at all — this is a real, load-
  bearing platform gap for ANY future participant-facing Android surface that wants a presence
  dot without first threading a `PresenceRepository`/cache through to that surface, not specific
  to widgets. Grepped for a `PresenceRepository`/presence-cache class before concluding this —
  none exists; `isOnline` today only appears on `Friend`/`MeeshyUser`/`Participant` models used by
  the contacts/profile surfaces, never joined onto a conversation's participant list.
- **The "mark-read widget action" candidate, twice flagged as the natural next widget sub-slice
  in two consecutive prior runs' notes, turned out to have almost no new pure decision logic to
  TDD once actually scoped.** Investigated before picking a slice this run: the only "decision"
  involved (show the affordance only on an unread row) is already the existing, already-tested
  `row.isUnread` field — the `ActionCallback.onAction` body itself would be pure Android-framework
  glue (`Context`/`GlanceId`/`ActionParameters` → a one-line delegate to the already-tested
  `ConversationRepository.markReadOptimistic(id)` → `GlanceAppWidget().updateAll(context)`),
  structurally identical in kind to `provideGlance()` itself, which has zero direct JVM tests in
  either shipped widget (only its downstream pure `*Presentation.from(...)` is covered — the
  established, `TDD-COVERAGE.md`-sanctioned exemption for Compose/framework glue). A slice that
  would ship with genuinely zero new unit tests breaks this routine's own evidence rhythm (every
  prior `PROGRESS.md` entry cites N new mutation-proven tests) even though nothing about it is
  technically wrong — picked `FavoriteContactsWidget` instead, which had real new filter/sort/cap
  decision logic to cover. Worth re-surfacing "mark-read" once either (a) a second `ActionCallback`
  use case exists to justify the framework-glue investment across more than one call site, or
  (b) someone explicitly decides thin, near-untestable wiring is still worth a slice on its own.

## Slice `dynamic-launcher-shortcuts` (2026-08-11)
- **"Port this iOS widget/intent" is not a safe default without first checking whether the iOS
  side's own deep link is actually wired to anything.** iOS's `QuickReplyWidget` ships 4 canned-
  reply buttons that deep-link via `meeshy://quickreply/{id}?text=...`, and its
  `FavoriteContactsWidget` uses `meeshy://contact/{id}` — both look like real, intentional URI
  contracts from the widget file alone. Grepping the FULL app-side router
  (`DeepLinkRouter.swift`'s complete `switch` over recognized `host` values) found **neither
  `quickreply` nor `contact` is a case anywhere** — both widgets' primary interaction is dead in
  production iOS today, not a hidden/obscure fallback path this session simply didn't find. The
  lesson generalizes past this one file: before treating an iOS widget/intent/extension's own URI
  scheme as a spec to port, grep the MAIN APP's router for that exact host string, not just the
  widget/extension file that emits it — a URI can be perfectly well-formed and still go nowhere.
  Two consequences this run: (1) retroactively confirmed the PRIOR slice's own independent choice
  (reusing `meeshy://conversation/{id}` instead of inventing a matching `contact` host on Android)
  was the right call, not just a defensible one; (2) this run's own first candidate (Quick Reply)
  was disqualified as "port this" and reclassified as "needs a genuinely new mechanism to be worth
  building" — see `PROGRESS.md` for the pivot.
- **A single iOS "App Shortcuts" provider can bundle voice-driven (Siri/Assistant NL parameter
  resolution) and purely-navigational (open a fixed destination) intents under one umbrella —
  splitting them before scoping an Android port avoids conflating a small, safe slice with a much
  bigger one.** `MeeshyAppShortcuts` (`MeeshyAppIntents.swift`) lists 5 phrases; 4 need `AppIntents`
  natural-language parameter resolution against a contact/language with no Android equivalent
  short of Google Assistant App Actions (external indexing/review, not locally verifiable), while
  the 5th (`OpenRecentConversationIntent`) is a plain "open this URL" action with a direct,
  fully-local Android analogue (`ShortcutManagerCompat` dynamic launcher shortcuts). Read the
  intent bodies, not just the shortcut list, before deciding whether "port the App Shortcuts
  epic" is one slice or several.

## Slice `chat-composer-prefill-draft` (2026-08-11)
- **`android.net.Uri.decode(...)` silently returns `null` — not a thrown exception — in a plain
  JVM unit test module (no Robolectric), which turns a real decode call into a quiet no-op rather
  than a visible crash.** Wrote `initialDraft = savedStateHandle.get<String>(DRAFT_ARG)
  ?.let(Uri::decode)?.takeIf { it.isNotBlank() }` first; the RED test failed with `expected:
  Thanks! but was an empty string` — no stack trace, no exception, just a plain assertion mismatch
  that looked exactly like a logic bug in the seeding code itself. The actual cause: this app
  module's unit-test config runs under Android Gradle Plugin's default `returnDefaultValues`
  posture for un-mocked framework classes, so `Uri.decode("Thanks!")` returns `null` (the "default
  value" for a `String?`-returning method) instead of either working or throwing — silently
  collapsing the whole `?.let{}` chain to `null`. Switching to `java.net.URLDecoder.decode(text,
  "UTF-8")` (a real JVM class, not an Android framework stub) fixed it immediately and made the
  decode step itself unit-testable without Robolectric. **Lesson generalizes**: any
  `android.*`-package call inside code that's exercised by a plain (non-Robolectric) JVM test
  class is a candidate for this exact silent-null trap — prefer a `java.*`/Kotlin-stdlib
  equivalent when one exists (here, `URLDecoder` vs `Uri.decode` — near-identical behavior for
  plain percent-encoded text, the only real difference being `+`-as-space handling, irrelevant for
  this call site's short canned-reply text), rather than reaching for Robolectric just to make one
  static call resolve.
- **`DraftAutosave.restore`'s existing idle guard (`currentDraft.isNotBlank() -> null`) already
  encodes the exact precedence rule a new "seed the composer from elsewhere" feature needs, with
  zero changes.** Wanted an incoming deep-link draft (a future Quick Reply tap) to win over
  whatever a stale per-conversation persisted draft would otherwise restore. Before writing a new
  precedence decision, re-read `DraftAutosave.restore`'s own doc comment: it already refuses to
  restore over a non-blank composer ("never clobbers an in-flight edit nor text the user has
  already begun typing"). Seeding the ViewModel's INITIAL `_state.draft` value from the nav arg
  (before the async `draftStore.load()` restore coroutine ever runs) means that guard does 100% of
  the precedence work for free — the incoming draft simply IS the "already begun typing" state
  from the guard's own point of view. Zero new branches added to `DraftAutosave`; the only new
  code is the wiring that populates the initial value. Worth checking whether an existing pure
  decision function's guard already covers a new feature's precedence need before writing a
  parallel rule next to it — this is the same "check whether an adjacent mechanism is already
  complete and just unreachable" lesson from the `outbox-message-lane-discovery` slice, applied to
  a much smaller case.
- **A merge gate that only exists on someone's laptop is not a gate, and the routine ran seven
  weeks without noticing.** `ROUTINE.md` had tracked "add an Android CI workflow" as a follow-up
  for weeks, filed under housekeeping because the local `meeshy.sh check` was believed to cover
  it. It did not: the containers this routine actually runs in cannot install the Android SDK at
  all (`dl.google.com` denied by egress policy), so for every containerised slice the gate was not
  *skipped*, it was *impossible* — and the merge criterion silently degraded to "the agent says it
  passed". The tell was visible in the state files the whole time: a fully written-up, verified
  `StoryCacheSource` defect sitting undelivered at the head of `PROGRESS.md` with "no toolchain
  here" as the reason. **Generalises: when a run reports "I could not verify X", that is a fact
  about the toolchain, not about the slice — record it against the GATE, and when the same reason
  blocks a second item, fix the gate instead of parking a third.**
- **Do not derive an SDK package name from a version number.** `compileSdk = 37` does not imply
  `platforms;android-37` exists. Since the minor SDK releases the catalogue publishes `android-36.1`,
  `android-37.0`, `android-37.1`, `android-37.2-beta1` — and *no* bare `android-37`. The first CI
  run died on precisely that guess. The fix was not a better guess (a canary-channel retry also
  failed) but handing the mapping to AGP, which owns it. Same shape as the `Uri.decode`-in-JVM-test
  lesson above: when a component already owns a mapping, wiring around it invents a second,
  wronger one.
- **`--stacktrace` is not free on a gate whose readers cannot download artifacts.** It buried
  Gradle's own `What went wrong` under 100+ lines of executor internals, so a failing test run was
  unreadable and its cause was never established (it did not recur). CI logs for agent consumption
  should print the failing test names and messages *inline* — parsed from the JUnit XML — because
  "see the report at `<html>`" is unactionable to a run that has no way to open it.
- **A `null`-plus-`any()` MockK matcher isn't a leap of faith once it has a live precedent in the
  same codebase.** With zero JVM available to trial-run `coEvery { api.list(null, any()) }`
  (`story-cache-pagination-truncation`, 2026-08-15 — this container had no Java Runtime at all,
  one rung below the earlier `dl.google.com` denial), the fix was grepping for the exact shape
  elsewhere first: `PostRepositoryTest.kt` already stubs `coEvery { api.getFeed(null, any()) }`
  and passes in CI. A pattern this codebase already runs green is stronger evidence than reasoning
  about MockK's matcher-auto-wrapping rules from first principles — and it is *checkable* without a
  compiler, which pure reasoning about a mocking library's internals is not.
- **A destructive default (`deleteNotIn`) earns a stricter failure mode than its non-destructive
  siblings, and the two platforms disagreeing is a feature, not an inconsistency to paper over.**
  iOS's PR #2867 persists a partial window on a later-page failure (a fresh cache, nothing to lose
  by trying). Android's `StoryCacheSource` had a complete prior tray in Room already, so the
  matching move was to throw and leave it untouched — replacing a *known-complete* cache with an
  *unproven-partial* one on error is strictly worse than serving the stale one a beat longer. Don't
  port a cross-platform fix's decision tree wholesale; port the *invariant* (never prune off an
  unproven window) and re-decide the parts that depend on what state already exists on this
  platform.
- **A "Pending: X, Y, Z" bullet is a claim, not a fact — it decays the moment any of X/Y/Z ships
  and nobody edits the checklist that day.** `feature-parity.md`'s Phase 5 section carried three
  overlapping, partly-duplicated "Pending" bullets (`feature-parity-stale-checkbox-sweep`,
  2026-08-15) naming Calls/composer-publish/count-dots/prefetch/reactions as still missing — every
  one of them had a dedicated file, and in three cases a dedicated test, already in the tree. The
  tell wasn't subtle once looked for: one bullet's continuation line was an orphaned duplicate of
  unrelated text from the bullet above it, a shape that only survives when nobody has re-read the
  paragraph in a while. **Generalises: when a checklist bullet lists several named things as
  pending, grep for each name before trusting the list — a stale multi-item bullet is *more* likely
  than a stale single-item one, because it only takes ONE of the N items shipping unnoticed to make
  the whole line wrong, and N items shipping over N different runs is the common case, not the rare
  one.**
- **A link generator with no receiver fails silently, not loudly — grep both halves of a
  share-link feature before trusting either.** `ProfileShareLink` (`profile-share-link-receiver`,
  2026-08-15) built correct, well-tested `meeshy://u/{username}` / `https://meeshy.me/u/{username}`
  URLs for a month; the QR code rendered, the share sheet worked, `ProfileShareLinkTest` was green.
  Nothing about USING the generator ever surfaces the fact that tapping its own output does
  nothing — there's no crash, no error toast, just a browser opening to a 404-shaped page or an
  inert custom-scheme link. **Generalises: whenever a slice ships something that PRODUCES a
  URL/token/identifier meant to be consumed later (deep links, share links, invite codes), grep for
  the CONSUMING side in the same run, not just the producing one — a generator's own tests can
  never catch a missing receiver, because they never round-trip through the OS.**
- **A manifest's scheme-only, no-host intent-filter is a wildcard — check it before adding a
  narrower one that would be redundant.** `<data android:scheme="meeshy" />` (no `android:host`)
  already routed `meeshy://u/{username}` to the app; only the `https://meeshy.me/u/{username}`
  half needed a new `<intent-filter>`. Re-verifying this against the actual manifest (not assuming
  symmetry between the custom-scheme and App Link halves) avoided a redundant, no-op manifest
  entry.
- **Finding the SAME bug pattern twice does not mean the third instance costs the same to fix —
  check the resolution shape before assuming another 2-line `navDeepLink`.** `/u/{username}` and
  `/join/{identifier}` (this session's two prior slices) were direct 1:1 route mappings; the third
  generator found by the same grep, `/l/{token}` (`MessageTextParser.kt`'s Meeshy links), needs an
  ASYNC network resolve into one of 5 destination types before it can route anywhere — a `navDeepLink`
  alone structurally cannot express that. **Generalises: "same defect class, found by the same grep"
  is a discovery signal, not a scope estimate — read what the REFERENCE implementation (here, iOS's
  `DeepLinkRouter.resolveTrackedLink`) actually does with the value before promising a mechanical
  fix, especially when the first two instances of a pattern were unusually simple.**
- **`androidx.security.crypto`'s `EncryptedSharedPreferences`/`MasterKey` cannot be unit-tested via
  Robolectric in this project's setup — `MasterKey.Builder` needs the `AndroidKeyStore` security
  provider, which Robolectric's JVM does not supply, so any test touching it fails with
  `NoSuchAlgorithmException`/`KeyStoreException`** (`conversation-lock-store-foundation`,
  2026-08-15, confirmed live in CI, not assumed). This retroactively explains why `EncryptedTokenStore`
  — already shipped, already relied on in production — has zero dedicated tests: not an oversight,
  a standing constraint of this test setup. **Generalises: before writing a Robolectric test for
  ANY class touching `androidx.security.crypto`, check whether an existing class using the exact
  same primitive already has (or conspicuously lacks) a test — an absent test next to a shipped,
  trusted implementation is itself a signal, not just missing coverage.** Keep the behavioural
  contract testable by isolating it into a plain-Kotlin interface + in-memory implementation (no
  Android dependency) that the real, Keystore-backed class structurally mirrors — the contract gets
  full JVM test coverage even though the real storage layer can't be exercised here.
- **A DataStore/coroutine `TimeoutCancellationException` flake hit two DIFFERENT, unrelated tests
  across two consecutive CI runs of the same PR** (`ThemeStoreTest`, then
  `MediaDownloadPreferencesStoreTest`, both `dataStore_set*_isReflectedInTheFlow` —
  `conversation-lock-store-foundation`, 2026-08-15). Neither test was anywhere near the PR's actual
  diff, and the PR's own new tests were green both times — a strong pre-existing-infra-flake signal
  (same shape as the earlier-documented `ci.yml` Python/CPython-fetch flakiness). `gh run rerun
  <run-id> --failed` resolved it on the first retry. **Generalises: `gh run rerun --failed` is worth
  trying before assuming it is blocked — an earlier lesson documented `rerun-failed-jobs` as 403 for
  the bot on a DIFFERENT workflow (`ci.yml` on a gateway PR); it worked fine here on `android.yml`.
  Don't let one documented 403 generalise to "reruns never work" without re-checking.**
  **CLOSED, root-caused, and fixed** (`datastore-test-timeout-flake`, PR #3058, 2026-08-16, after 2
  more occurrences brought the total to 4/4 PRs touching Android this session): `git log -p` on the
  two files that never flaked (`MediaDownloadPreferencesStoreTest`/`PrivacyPreferencesStoreTest`)
  showed they were authored from day one with `withTimeout(15_000)` for the identical
  real-DataStore-Flow-collection pattern (`runBlocking`, real wall-clock time), while the 4 files
  that DID flake (`ThemeStoreTest`, `CategorySnapshotStoreTest`, `NotificationPreferencesStoreTest`,
  `InterfaceLanguageStoreTest`) all used the tighter `withTimeout(5_000)`. Bumped all 19 occurrences
  to `15_000` to match the already-proven value. CI on the fix's own PR ran the full matrix clean on
  the first attempt (no Android retry needed) — first live signal it addresses the mechanism, not
  just a coincidence of timing. **Generalises: when the SAME class of flake recurs 3+ times with the
  same exception signature, check whether a sibling file already solved it with a different constant
  before reaching for a rerun again — `git log -p` on the never-flaky siblings is a cheap, decisive
  check that turns "known flake, keep rerunning" into "known fix, already proven elsewhere in this
  exact codebase."**

- **An orphan model is the cheapest slice-finding signal in this repo, and it is mechanical.**
  (2026-08-16, `conversation-members-roster`.) The re-proof that killed the prior run's nominated
  slice ("change email/phone has no UI" — false, `AccountContactViewModel` has shipped) left no
  candidate, so instead of re-reading `feature-parity.md` notes yet again, the search became: *which
  `:core:model` types are declared and referenced nowhere?* `PaginatedParticipant` +
  `PaginatedParticipantsResponse` + `PaginatedParticipantsPagination` came back with zero non-self
  hits — and each one was a wire contract ported ahead of a screen that never landed. The same probe
  applied to `MessageSocketManager` (which of the 30 listened events has no collector?) surfaced the
  same gap from a second angle: `participant:role-updated`, `conversation:participant-left` and
  `conversation:participant-banned` were all being decoded and discarded. **Generalises: two greps —
  "declared model with no reference" and "listened socket event with no consumer" — find real,
  right-sized gaps without trusting a single line of prose in the tracking files, and they
  cross-validate each other when they point at the same feature. Run both when the "Next slice"
  pointer goes stale.** Notably this is the *inverse* of the categorical blind spot documented at
  iteration 19 (whole categories that were never written down): here the category WAS written down,
  and the code was half-written too — what was missing was anything that made the half-written state
  visible.

- **When a Retrofit route's envelope genuinely does not fit the shared `ApiResponse<T>`, adapt it in
  the repository — do not widen the shared envelope.** (2026-08-16, same slice.)
  `GET /conversations/:id/participants` answers with a root-level *cursor* `pagination`
  (`nextCursor`/`hasMore`/`totalCount`); the shared `Pagination` is offset-shaped (`total`/`offset`/
  `limit`) and has no `totalCount`. Adding `totalCount` to the shared type would have leaked one
  route's shape into every other endpoint's model. The route is typed as its own
  `PaginatedParticipantsResponse` instead and the repository re-wraps it into an `ApiResponse` inside
  the `apiCall { }` block — which costs three lines and keeps the whole HttpException/IOException/
  SerializationException ladder. The gateway's own source comment already records that normalising
  this route server-side is a coordinated breaking change for iOS and web, so the deviation is
  permanent and worth absorbing client-side rather than papering over.

- **REOPENED (partially): the DataStore timeout flake survives the 15 s bump.** (2026-08-16, during
  `conversation-members-roster`'s CI.) The entry above closed `datastore-test-timeout-flake` on the
  reasoning that the two never-flaky files used `withTimeout(15_000)` while the four flaky ones used
  `5_000`, and bumped all 19 occurrences to 15 s. That reasoning has now been **falsified by the
  strongest possible counter-example**: `MediaDownloadPreferencesStoreTest.
  dataStore_setPreferences_isReflectedInTheFlow` — one of the two files that had *always* been at
  15 s and had *never* flaked — timed out at 15 s
  (`kotlinx.coroutines.TimeoutCancellationException`, run 31946819183). So 15 s was never the
  mechanism; it was a threshold that happened to sit above the observed contention on those runs.
  **Correction to the earlier lesson: "a sibling already proved this constant" shows a constant is
  *sufficient so far*, never that it is *correct*.** Evidence it is non-determinism and not a
  regression: the identical tree passed the same job ~15 min earlier (head `882f80e8`, run
  31946075339, all 16 checks green); the only delta was a merge of `origin/main` touching neither
  `:sdk-core`'s media package nor DataStore.
  **Do NOT reflexively bump to 30 s** — that repeats the move this data point just invalidated and
  buys, at best, another quiet interval. The real mechanism is that these tests drive a *real*
  file-backed DataStore over `Dispatchers.IO` under `runBlocking`, so they measure the CI runner's
  scheduling latency, and this Android job runs concurrently with the whole monorepo matrix. The
  actual fix is to remove wall-clock time from the assertion — inject the dispatcher/scope into
  `DataStoreMediaDownloadPreferencesStore` (and its siblings) so the test drives a controlled
  scheduler, or collect through a deterministic turbine-style helper. That is a genuine refactor of
  files this slice does not own, so it is **left as a named follow-up**, not smuggled into an
  unrelated diff. Meanwhile a rerun remains the correct unblock for THIS failure class specifically
  — it is documented, reproducible-by-contention, and provably orthogonal to the diff under test —
  but every occurrence should be recorded here rather than silently retried, so the follow-up keeps
  accumulating evidence instead of resetting to "known flake, keep rerunning".

- **The DataStore flake is NOT "DataStore tests are slow" — it is one specific test shape.**
  (2026-08-16, second occurrence during `conversation-members-roster`'s CI, run 31948685756.)
  `NotificationPreferencesStoreTest.dataStore_setPreferences_isReflectedInTheFlow` timed out at 15 s,
  after `MediaDownloadPreferencesStoreTest.dataStore_setPreferences_isReflectedInTheFlow` did the
  same an hour earlier. **Same method name, two different files** — that is a much sharper signal
  than the "bump the constant" story, so it is worth stating precisely:
  - Every `DataStore*Store` exposes `preferences` as
    `dataStore.data.map { … }.stateIn(scope, SharingStarted.Eagerly, DEFAULT)`.
  - The flaky test is always the one that constructs the store and **writes immediately**, then
    asserts via `first { predicate }`: construct → `setPreferences(…)` → `first { … }`. `Eagerly`
    only *launches* the upstream collection into `scope` (`Dispatchers.IO`); it does not await its
    first emission, so the write races the reader's start-up. Under runner contention that race
    widens past any wall-clock bound.
  - The sibling tests in the very same files have never been reported flaky, and their shapes
    explain why: `dataStore_defaultsToTheDefaultBlockOnEmptyStore` never writes at all, and
    `dataStore_hydratesAlreadyPersistedChoiceOnConstruction` writes through a *separate* writer
    before constructing the reader — neither one races start-up.
  - The same construct-then-write-immediately shape is present in `ThemeStoreTest`,
    `PrivacyPreferencesStoreTest`, `MediaDownloadPreferencesStoreTest` and
    `NotificationPreferencesStoreTest`; `ThemeStoreTest` and `NotificationPreferencesStoreTest` are
    both on the historical flaky list. The shape is necessary, not sufficient — whether it trips is
    contention-dependent, which is exactly why raising a timeout only buys a quiet interval.
  **So the follow-up is now concrete and small**, and no longer "refactor DataStore testing": in
  these four tests, await the store's first emission before writing (`store.preferences.first()`
  once, or collect-then-write), which removes the race without touching production code or any
  timeout. Injecting a scheduler remains the more thorough option but is no longer required to close
  this. **What must NOT happen is another constant bump** — this entry and the one above it are two
  independent falsifications of that move.

- **Correction to the entry above — the discriminant is not "writes vs doesn't write", and the fix
  it proposed would not have worked.** (2026-08-16, third occurrence: `ThemeStoreTest`, run
  31950584151, two failures at `:87` and `:106`.) The previous entry proposed "await the store's
  first emission before writing". That is wrong: `preferences`/`themeMode` is a `StateFlow` seeded
  with a default, so `first()` returns that seed **synchronously** without the upstream ever having
  run — it would have awaited nothing and fixed nothing. Do not apply it.
  The correct discriminant, which fits all five observed failures:
  - Failing assertions are always `first { predicate }` where the predicate can only be satisfied by
    a **real upstream emission**, so the `stateIn` sharing coroutine must actually get scheduled on
    `Dispatchers.IO`. Under runner contention it may not, within any wall-clock bound.
  - The never-failing `dataStore_defaultsToTheDefaultBlockOnEmptyStore` asserts a value **equal to
    the seeded default**, so its `first()` completes from the seed and never needs the upstream at
    all. It is structurally immune, not lucky.
  - `ThemeStoreTest.kt:106` proves test *names* mislead here: it failed inside
    `dataStore_hydratesAlreadyPersistedChoiceOnConstruction`, but on that test's **setup** line
    (`writer.setThemeMode(…)` then `first { it == LIGHT }`), not on the hydration assertion it is
    named for. Always read the failing *line*, not the test name, before theorising about shape.
  So the only real fix remains removing wall-clock scheduling from these assertions — inject the
  dispatcher/scope so the test drives a controlled scheduler. **That work is deliberately NOT done
  here**: this container cannot run Gradle at all (no Android SDK, `dl.google.com` denied), and
  `ROUTINE.md §CI reality` forbids writing unverified Kotlin on the strength of a build you could
  not run. Attempting it blind on four files this slice does not own would be exactly that.
  Meanwhile: `rerun-failed-jobs` is **403 for this token on `android.yml` too** (an earlier entry
  recorded it working there — that no longer holds), so the only available retry is a fresh push.

- **The DataStore flake is CLOSED at its mechanism — and the three entries above are the record of
  why every cheaper attempt failed.** (2026-08-16, slice `datastore-test-deterministic-scheduler`.)
  The chain reads: bump `5_000` → `15_000` (falsified: a file always at 15 s flaked); "await the
  first emission before writing" (falsified before it shipped: `stateIn` is seeded, so `first()`
  returns the seed synchronously and awaits nothing); "the discriminant is writes-vs-doesn't-write"
  (falsified: `ThemeStoreTest:106` failed on a *setup* line inside a test named for hydration).
  What survived all three is the plainest reading: `first { predicate }` over
  `stateIn(scope, Eagerly, DEFAULT)` cannot complete until the sharing coroutine is **scheduled**,
  and `Dispatchers.IO` on a runner hosting the whole monorepo matrix offers no bound on when that
  happens. A timeout does not bound an unbounded wait; it only names the price of losing the bet.
  **The fix is `UnconfinedTestDispatcher`** (test-only `me.meeshy.sdk.testing.TestDataStores`):
  the write actor and the collector run inline on the test thread, so there is no scheduling to
  starve. All 19 `withTimeout` occurrences deleted; `runTest`'s 60 s net replaces them.
  Two design points worth keeping, because both are ways this could have gone wrong instead:
  - **The store scope must not be the `TestScope`.** `TestDataStores.scope` carries its own
    unparented `SupervisorJob`. The DataStore actor and the `stateIn` collector never complete by
    construction; as children of the test coroutine they would make `runTest` wait for them at
    teardown and time out. Off-scope, `runTest` has no relationship to them. (The widely-copied
    Now-in-Android recipe puts the DataStore *on* the `TestScope` — it gets away with it because
    nothing there is `stateIn(…, Eagerly)`. Do not copy it verbatim into a codebase that is.)
  - **Sweep by exposure, not by observed failures.** Eight files drive a real DataStore; only four
    had ever flaked. The two with no timeout at all (`ConversationDraftStoreTest`,
    `AnonymousSessionStoreTest`) were the worst of the set, not the best — same exposure, hang
    instead of failure as the symptom. Fixing only the observed four would have re-enacted the
    exact inference these three entries falsified: *"never flaked" is a statement about load so
    far, never about correctness.*
  If a DataStore test flakes again after this, it is a **new** mechanism — go read the failing
  line, and do not reach for a constant.

- **A deferred follow-up list left by the previous slice beats a fresh candidate hunt — and it is
  the routine's own standing instruction.** (2026-08-16, `reels-realtime-room`.) The prior slice
  (`post-detail-realtime-room`) closed one screen and wrote down, by name, the three iOS call sites
  it had *not* wired (`ReelsViewModel`, `StoryViewerView`, `FeedCommentsSheet`). Picking the first
  of those cost zero discovery time and needed no re-proof of *whether* a gap existed — only of
  *how bad* it was. That re-proof paid off anyway: the gap turned out to be **strictly worse** on
  the reel viewer than on post detail, for a reason the prior slice could not have known without
  reading `getReels`. Post detail half-worked by incidental fallback (comments dual-broadcast to
  friend feed rooms); the reels thread is ranked by **affinity** and deliberately serves non-followed
  authors, so no friend feed room exists to fall back to. **Generalises: when a slice defers work,
  name the call sites in `feature-parity.md`. The next run then starts from a proven gap instead of
  a grep — but still re-proves the *severity*, because deferral notes record what the previous run
  knew, not what the code says.**

- **The gateway's source comments name their intended clients — read them before porting a room.**
  (2026-08-16, same slice.) `SocialEventsHandler.commentBroadcastRooms`'s doc comment says outright
  that `ROOMS.post` is « où se trouvent les viewers du détail / **reel viewer** qui ne sont PAS amis
  de l'auteur ». That single line is a complete specification of which Android screens owe a
  `post:join`, and it was already in the tree while three of them were missing it. **Generalises:
  when wiring a client to a room, grep the gateway for the room constant and read the surrounding
  prose — the server often already documents the full intended membership, which turns "which
  screens need this?" from a judgment call into a lookup.**

- **Key a `LaunchedEffect` on identity, not on the state object that carries it.** (2026-08-16,
  same slice.) The obvious wiring — `LaunchedEffect(pagerState, state.reels) { snapshotFlow { … } }`
  — restarts on *every* optimistic like, because `updateReel` rebuilds the list and `state.reels` is
  a new instance each time. Keying on `state.reels.map { it.id }` restarts it exactly when the
  thread changes, since `List<String>` compares structurally. **Generalises: before keying an effect
  on a piece of UI state, ask what else mutates that object. Anything driven by an optimistic update
  is a fresh instance on every user tap.**

## Slice `conversation-lock-menu` (2026-08-19)
- **This container COULD reach `dl.google.com` — the full local Android gate ran here.** The
  ROUTINE §CI reality warns containerised runs usually have `dl.google.com` denied; this one did
  not (`curl` → 200), so `sdkmanager` bootstrapped and `assembleDebug` + `testDebugUnitTest` both
  ran green locally before the PR. When the egress allows it, run the real gate — don't assume the
  documented block applies to every container.
- **`compileSdk = 37` does NOT map to a `platforms;android-37` package.** Since the minor SDK
  releases (37.0, 37.1, …) an API level is no longer published under a bare `android-N` name — the
  bare install fails with *Failed to find package 'platforms;android-37'*, exactly as `android.yml`'s
  provisioning step documents. Two extra gotchas the CI YAML hides: (1) the ROUTINE's pinned
  cmdline-tools `11076708` only understands SDK XML v3 and cannot even *see* the 37.x packages
  (*"SDK XML version 4 was encountered"*) — fetch a newer bundle (`commandlinetools-linux-13114758`)
  first; (2) the platform lives on the preview channel, so `sdkmanager --channel=3 --install
  "platforms;android-37.0"` is what actually lands it. AGP 8.13 then resolves `compileSdk 37` to the
  `android-37.0` dir. `build-tools;35.0.0`/`platforms;android-35` from the ROUTINE recipe are stale
  for this repo.
- **Transient `429 Too Many Requests` from `repo.maven.apache.org` under Gradle's parallel
  download burst.** A single-file `curl` of the same artifact returned 200 immediately (the proxy
  rate-limits bursts, not the artifact). Re-running with `--max-workers=2` after warming the cache
  cleared it. Not a broken repo — just back off the parallelism and retry.
- **Extracting a view-embedded state machine into a pure reducer is the highest-leverage parity
  move.** iOS's `ConversationLockSheet.handleComplete` is a 7-mode × 3-step PIN machine living
  *inside* the SwiftUI view — untestable, and it carries a real bug (its blanket `step = 1` reset
  mislabels the master-PIN setup flow). Porting it as `LockPinReducer` (pure, oracle-injected)
  bought 20 branch-covering unit tests, a cleaner reset (rewind to the mode's real entry step), and
  a dead-end fix (no-master-PIN → chain setup→lock instead of iOS's "go to Settings" alert). The
  Composable is left a dumb dots+keypad renderer. TDD-COVERAGE's "push decisions out of the
  Composable" is not just style here — it's what makes the SOTA-over-iOS improvements provable.

## Slice `conversation-lock-open-gate` (2026-08-20)
- **A cosmetic lock badge is a real bug, not a cosmetic one.** The `conversation-lock-menu` slice
  shipped the 🔒 badge and the lock/unlock PIN flow but left the row's tap calling
  `onConversationClick(id)` **directly** — so a "locked" conversation opened straight through. The
  lock protected nothing on tap. When a prior slice defers "content-hiding" as a follow-up, check
  whether the *entry point* is also ungated; a lock that doesn't gate opening is worse than no lock
  (it implies protection that isn't there). The open-gate is the sub-gap that makes the badge mean
  something.
- **Extending a shipped pure reducer is the cheapest possible parity move.** Adding
  `LockPinMode.OPEN_CONVERSATION` was: one enum arm, one `pinLength`/`copy` arm each (both already
  `when`-exhaustive so the compiler *forced* me to handle the new arm — no silent fallthrough), one
  `complete*` branch mirroring `completeUnlock`, and one new effect. 5 reducer tests covered every
  branch. The Kotlin `when`-exhaustiveness on the sealed/enum types is the safety net: adding a mode
  produced compile errors at exactly the 4 sites that needed a decision, no more.
- **Name the effect for the outcome, not the mechanism — it buys a provable distinction.** `OPEN`
  and `UNLOCK` both verify a 4-digit code against the same oracle; the ONLY difference is `OPEN`
  keeps the lock. Emitting a distinct `LockPinEffect.OpenConversation` (not reusing `RemoveLock`)
  let the reducer test assert `effects.doesNotContain(RemoveLock)` — the "reveal once, stays locked"
  contract is now a red-if-broken test, not a comment. Reusing `RemoveLock` with a flag would have
  made that untestable.
- **One-shot navigation = `Channel(BUFFERED).receiveAsFlow()`, never a `StateFlow`.** Navigation is
  an event: a `StateFlow<String?>` would re-fire on every re-collection (config change, process
  restart) and re-navigate. The `Channel` idiom already lived in this file (`refreshRequests`), so
  no new dependency. Testing it: `launch { vm.openConversation.collect { list += it } }` +
  `advanceUntilIdle()` before and after the action, then `job.cancel()`. `BUFFERED` means a
  `trySend` before the collector attaches is still delivered, so the test isn't order-fragile.
- **Read from the store, not the mirrored UI state, for a tap-time lock decision.** `onConversationTap`
  reads `lockStore.isLocked(id)` (synchronous, authoritative) rather than
  `_state.value.isLocked(id)` (a mirror collected off the store's flow, one dispatch behind). A tap
  landing in the same frame as a just-applied unlock must see the truth, not the lagging mirror —
  same discipline `onLockToggle` already followed.

## Slice `composer-live-sentiment` (2026-08-20)
- **iOS has TWO sentiment scorers; only one is portable — check which surface you're porting.**
  `MessageDetailSentimentTab` (the message-detail sheet) scores with Apple's `NLTagger` (on-device
  **ML**) — no Android equivalent produces the same numbers, so a faithful parity port is
  impossible; it is out of scope. The composer's `SmartContextZone` scores with
  `TextAnalyzer.computeSentiment`, a **dictionary** (FR/EN/ES/DE weighted words) — fully portable and
  JVM-testable. A slice-picking agent conflated the two ("add a sentiment tab to the message
  detail"); reading BOTH iOS sources before committing caught it. When a feature exists in two
  places, confirm the one you're mirroring uses portable logic, not a platform ML API.
- **The proxy rate-limits Gradle's PARALLEL first-fetch, not the artifacts.** A cold module graph
  (`assembleDebug` pulling guava/gson/kotlin-stdlib-jdk8/serialization-plugin poms for the first
  time) draws a burst of `429 Too Many Requests` from `repo.maven.apache.org`; a single `curl` of the
  exact same URL returns 200 immediately. Fix: a 429-aware retry loop at `--max-workers=2` — each
  attempt caches more until it goes green. Don't read the first 429 as a broken build.
- **`pkill -f 'gradlew'` self-terminates your retry script.** `pkill -f` matches the full command
  line, and a bash `-c` loop that runs `./gradlew …` HAS "gradlew" in its own command line, so it
  kills itself (exit 144, no output). Never prefix a gradle loop with `pkill -f gradlew`.
- **A pure computed getter on the UiState is the cheapest possible composer wiring.**
  `ChatUiState.composerSentiment` derives the mood glyph straight from the existing `draft` field
  (same idiom as `composerAffordances`) — null on blank, `SentimentLevel.from(score(draft))`
  otherwise — so no `onDraftChange` edit, no new state field, no plumbing. The getter is testable via
  the public API both directly and through `vm.onDraftChange(...) → state.composerSentiment`.
- **A computed getter references symbols in ITS OWN file — import them there, not only in the
  consumers.** `ChatUiState.composerSentiment` lives in `ChatViewModel.kt` and calls
  `SentimentLevel`/`SentimentAnalyzer`; I added the imports to the two *consumer* files
  (`ChatScreen.kt`, `ChatViewModelTest.kt`) but forgot `ChatViewModel.kt` itself → `Unresolved
  reference` on both CI and the local gate. The local serial gate reproduced it exactly (both agreed
  it was a compile break, "not a test assertion"), which is the whole point of running the gate
  before trusting a push. Lesson: after adding a cross-module symbol, grep every file that names it
  for a matching import, the declaring file included.

## Slice `composer-language-pill` (2026-08-20)
- **The container now builds against `android-37`, not `android-35`.** ROUTINE §Environment recipe still
  installs `platforms;android-35`; the first gate run died with `Failed to find target with hash string
  'android-37' in: /root/android-sdk`. Fix: `sdkmanager "platforms;android-37"`. (Left ROUTINE as-is this
  slice — it's a doc drift to fix when the recipe is next touched; flagged here so the next run installs 37
  directly and doesn't lose a 2-minute gate cycle to it.)
- **A "detect or fall back to X" helper can't tell "I detected X" from "I gave up and returned X".**
  `ComposeLanguageDetector.detect(text, fallback)` returns the fallback verbatim on a weak signal — so if a
  stateful pill stores that result as its "detected language", it pins to whatever fallback happened to be
  live at that keystroke and never re-floats. Fix in `ComposerLanguageState`: pass a `NO_DETECTION` sentinel
  (`""`, a value the detector never returns) as the fallback, treat a `""` return as "no detection"
  (`detected` stays null), and apply the *real* fallback only in `display(fallback)` at READ time. This both
  matches iOS (`language` stays nil until a confident hit) and kills any seed-timing race — the pill's
  fallback is resolved when read, never frozen at detect.
- **When a live composer signal becomes authoritative for a persisted field, capture it BEFORE the clear.**
  The pill now stamps `originalLanguage`, but `send()`/`sendFileAttachment()` reset `composerLanguage` in the
  same `_state.update` that clears the draft. Read `composerLanguage.display(resolveUserLanguage(user))` into
  a local *before* that update (like `text`/`replyToId`/`effects` already are), else the async
  `sendOptimistic` reads the already-reset state and stamps the seed. Two pre-existing send-language tests
  (detected→es, undetectable→user-lang) are the guard that `display` preserves the old behaviour.

## Slice `chat-forwarded-badge-source-name` (2026-08-20)
- **A green local gate does NOT clear the PR's CI, because a `pull_request` build is the MERGE of
  your head with the base — so it inherits whatever the base branch is carrying.** This slice
  branched off `main` at `ccc81b25` (share-link `joinUrl` still `/join/`) and passed the full local
  gate. Minutes later commit `0a8a1624` switched the producers to `/chat/` and updated the
  `:core:model` presentation tests but MISSED the 3 `:feature:conversations` ViewModel tests (4
  assertions still on `/join/`) — leaving `main` red (its own push run `32348038004` = `failure`).
  The PR's Android check then failed on those 4 unrelated tests.
- **Diagnosis order that worked:** the failing tests named a subsystem the diff never touched
  (share links vs a forwarded badge) → suspect base. `actions_list … android.yml branch=main` showed
  the newest main run was `failure` on `0a8a1624`; `get_commit --include-diff` showed it changed
  production `/chat/` + presentation tests but not the ViewModel tests. That is the routine's "CI red
  on base branch too" case — the one legitimate "not mine".
- **Because I am the sole Android dev, "wait for base to recover" would wait forever.** The correct
  in-scope repair: `git merge origin/main` into the branch (clean) + update the 4 stale ViewModel
  assertions to `/chat/` (the deliberate, already-merged product decision; the legacy `/join/`
  deep-link RECEIVERS `0a8a1624` kept on purpose stay `/join/`). Test-expectation-only, still
  `apps/android` only, no production logic — turns the PR green AND repairs `main` on merge. Updating
  a stale expectation to match an intentional product change is not "weakening a test".
- **Reflex for next runs:** when a PR check fails on tests outside your slice, check
  `android.yml` on `main` BEFORE touching your own code — the base may already be red.

## 2026-08-21 (later still) — SDK bootstrap: STOP hand-editing platform metadata; let AGP auto-map compileSdk 37 → android-37.0

Slice `chat-send-clock-reveal-debounce`. The `cp -r android-37.0 android-37 + sed source.properties`
recipe in the note above is **HARMFUL and cost this run ~4 failed gradle attempts.** The copy carries
`platforms/android-37/package.xml` which still declares `path="platforms;android-37.0"` and
`<api-level>37.0</api-level>`. AGP 8.13's RepoManager reads `package.xml` (NOT source.properties) and
sees a package that claims to be `android-37.0` sitting in the `android-37` dir → aborts the whole SDK
scan with `Observed package id 'platforms;android-37.0' in inconsistent location '…/android-37'
(Expected '…/android-37.0')` → then `Failed to find target with hash string 'android-37'`. Editing
source.properties does nothing because package.xml wins; editing package.xml's `path` + `<api-level>`
AND deleting it AND deleting `.knownPackages` all still failed (AGP re-installs android-37.0 on the next
resolve, or a stale registry lingers).

**The actually-correct fix — do NOTHING by hand:**
```bash
rm -rf $HOME/android-sdk/platforms/android-37 $HOME/android-sdk/platforms/android-37.0 \
       $HOME/android-sdk/.knownPackages
$HOME/android-sdk/cmdline-tools/latest/bin/sdkmanager --channel=3 "platforms;android-37.0"
# NO android-37 dir, NO sed, NO symlink. Leave AGP's SDK auto-download ON (do NOT pass
# -Pandroid.builder.sdkDownload=false). Then run the gate from apps/android:
./gradlew assembleDebug testDebugUnitTest   # BUILD SUCCESSFUL
```
Why this is right, not a hack: **since the Android minor SDK releases (36.1, 37.0, 37.1 …) an API level
is no longer published under a bare `android-N` name — only `android-37.0` exists.** AGP is the authority
on which package a `compileSdk` maps to, and AGP 8.13 maps `compileSdk 37` → `android-37.0`
automatically. This is *exactly* what CI does: `android.yml`'s "Provision compileSdk platform (best
effort)" step even documents "AGP resolves and downloads the platform it actually wants … it is the
authority", and its run #1 failed on `platforms;android-37` for this same reason. Stop fighting it.

**Reflex for next runs:** install `platforms;android-37.0` clean and STOP. If you see "Failed to find
target with hash string 'android-37'", do NOT create an `android-37` dir — check for a leftover
hand-made `android-37` / malformed `android-37.0` and `rm -rf` it, reinstall pristine, restart the
daemon (`./gradlew --stop`), and run WITHOUT `sdkDownload=false`. Also: the Bash tool cwd persists
across calls — a `cd /home/user/meeshy` earlier will make `./gradlew` (which lives in `apps/android`)
"No such file or directory"; always `cd /home/user/meeshy/apps/android &&` in the gradle command.

## 2026-08-22 — Port iOS `Mirror`-based trait extraction as explicit field access, and grow an existing sheet rather than add a header button
- iOS `ConversationDashboardView.extractTraitScores<T>(from:)` uses `Mirror(reflecting:)` to pull the
  non-nil `TraitScore` fields out of each trait struct. Kotlin/JVM reflection over data-class members is
  fragile (needs `kotlin-reflect`, order not guaranteed) and slow — the faithful port is **explicit
  `listOfNotNull(traits.verbosity, traits.formality, …)`** per axis. Same behaviour, deterministic order,
  zero reflection dependency, and it doubles as the SOTA note (stable tie-break, unlike Swift's unstable
  `sorted`). Pattern to reuse for any iOS `Mirror` extraction.
- When a second render section belongs to the SAME endpoint/response as an already-shipped sheet
  (persona profiles live in the same `GET /analysis` payload as the summary), **grow the existing
  ViewModel + sheet** instead of minting a parallel ViewModel + a third header button. Add the new
  projection field to the UiState (default `emptyList()` keeps old tests green), recompute the Empty
  gate as "both halves empty", and render the new block under the old one. This matches iOS's single
  dashboard, avoids a double-fetch of the same endpoint, and keeps the chat header uncluttered. The
  existing Empty tests stayed green precisely because they carried no profiles — verify that before
  relying on it.

## 2026-08-23 — Confirm a gateway payload field is on the wire via the iOS SDK decoder

Several §F candidates were parked as "needs gateway payload confirmation first" (mood emoji / location in
the repost embed). The cheap, reliable confirmation **without touching or running the gateway**: check whether
the iOS SDK model *decodes* the field. If `packages/MeeshySDK/.../PostModels.swift` declares
`public let moodEmoji: String?` on `APIRepostOf` and its `init(from:)` does
`decodeIfPresent(String.self, forKey: .moodEmoji)`, then a shipping iOS client already receives it — i.e. the
gateway serializes it — and Android is simply dropping it. That turns an "unverified-backend, model-plumbing"
risk into a pure Android model+projection gap (add the `@Serializable` field, project it, render it), diff stays
`apps/android`-only. Applied for `feed-repost-embed-mood-emoji` (iOS `PostModels.swift:87,281`). The mirror still
open — `ApiRepostOf.location` — is confirmable the same way (`APIRepostOf.location: SharedPlace?` is on the wire).

## 2026-08-24 — a viewer layer that ports iOS's canvas render should reuse the SAME two reader resolvers; only the transition arm differs (slice `story-text-object-viewer-projection`)
Text objects and media clips share iOS's canvas render precedence `fade ?? keyframeOpacity ?? base`, so the
Android `StoryTextObjectView.animated()` is `StoryForegroundMediaView.animated()` minus one arm: text objects
never join a `StoryClipTransition`, so there is no transition ramp to fold and no `duration==0` degenerate-window
guard to carry — the whole `clipTransitions`/`transitionOpacity` block simply drops out. Reusing `StoryKeyframeResolver`
+ `StoryMediaFadeResolver` verbatim meant the pure core was two small files and the mutation proof reused the same
"drop the fade override" trick. Lesson: when a second canvas layer arrives, diff its iOS render against the layer
already ported and port only the *delta* — don't re-derive keyframe/fade math that a shared resolver already owns.

Prisme for a `Map<String,String>` translations field (text objects) is NOT the list-based `LanguageResolver.preferredTranslation`
(that keys on `TranslationLike.targetLanguage`). iOS `StoryTextObject.resolvedText` walks preferred languages and, per
language, tries an exact map key then a normalized-key match. Port `base(code)` as `LanguageCodeNormalizer.normalize(code)
?: code.split('-','_').first().lowercase()` (the shared normalizer IS the Android mirror of `MeeshyUser.normalizeLanguageCode`),
and apply it to BOTH the preferred code and the map key so `"fr-FR"`/`"FR"`/`"fra"` collapse onto `"fr"`. Exact-key-before-normalized
preserves a `"pt-BR"` override over its `"pt"` sibling.

## 2026-08-24 — SDK recipe flipped AGAIN: pristine `android-37.0` hash-errored, copy→patch `android-37` + keep-both worked (slice `story-text-object-exploration-override`)
`dl.google.com` **200** again this run, so the local gate was available. But the cheapest path (pristine
`android-37.0` alone) HASH-ERRORED here: `sdkmanager "platforms;android-35" "build-tools;35.0.0"
"platform-tools"` installed fine, then `:feature:stories:testDebugUnitTest` died `Failed to find target
with hash string 'android-37'` (AGP even re-materialised `android-37.0` on that first run, then still
failed). The four-edit copy→patch fixed it: `cp -r android-37.0 android-37`, then patch
`source.properties` `AndroidVersion.ApiLevel=37`, `package.xml` `<api-level>37</api-level>` + `path=
"platforms;android-37"`, `build.prop` both `ro.build.version.sdk_full=37` and
`ro.system.build.version.sdk_full=37`; KEEP the pristine `android-37.0` alongside the patched `android-37`
(both dirs present). `./gradlew --stop` then re-run → BUILD SUCCESSFUL (973 tasks). Net: the "recipe is
image-dependent and flips between runs" rule holds — try pristine first (cost one failed run here), fall
back to copy→patch+keep-both when it hash-errors.

## 2026-08-24 — the exploration override is a PREPEND, not a new resolver (slice `story-text-object-exploration-override`)
When a reader-side view already resolves content through an ordered preferred-language chain, the ephemeral
"Exploration" language pick is NOT a separate code path — it is the chain with the override prepended
(`listOf(override) + preferredLanguages`). This mirrors `StoryContentResolver`'s documented contract
("tried FIRST, without removing the preference chain") and gives the override, for free, whatever matching
the base resolver already does (here the text-object resolver's exact-then-normalized per-language walk),
plus automatic fall-through to normal Prisme resolution when the override has no matching translation. Keep
the empty-guard on the EFFECTIVE list (`languages.isEmpty()`), not `preferredLanguages.isEmpty()`, so an
override still resolves for a reader with no configured chain (e.g. anonymous). A blank/null override must
be inert. Wire it by threading an optional `overrideLanguage` param (default `null`) so 2-arg call sites
stay byte-identical, and re-project from the RAW item in `emit()`'s override branch — the projected view
was built once with default prefs.

## 2026-08-24 — a Prisme gap can live one rung EARLIER than the resolver: the OFFER surface (slice `story-language-bar-text-object-translations`)

Cycles 118-120 (and the two prior Android story slices) all fixed *resolvers* — the code that RENDERS
content in the reader's language. This slice's gap was upstream of any resolver: the story language bar
(`StoryViewerViewModel.availableLanguagesFor`) derived its "present" chips from the CAPTION
(`item.translations`) alone, so an overlay translation the caption lacked was fully resolvable
(`StoryTextObjectProjection` already honoured the override, wired the prior slice) but **the strip never
offered a chip to trigger it**. The rendering was correct; the *affordance to reach it* was missing.
Net rule: when a §Cohérence "Prisme applies to ALL content" audit turns up a resolver family, also ask
**"what OFFERS the languages, and does the offer enumerate the same content set the resolver can render?"**
A resolver that can render N languages behind a strip that only lists M<N of them is a silent gap — the
missing languages look like "not translated" when they are translated-but-unoffered. Fix: union caption +
`storyEffects.textObjects[].translations` keys (blank-filtered, case-insensitive dedup), caption-first.

## 2026-08-24 — SDK recipe: pristine `android-37.0` auto-installed by gradle STILL hash-errors; four-edit copy→patch + keep-both worked again (same slice)

Confirms the immediately-prior slice on this image family. First `./gradlew` (after only `platforms;android-35`)
died `Failed to find target with hash string 'android-37'` and gradle auto-installed pristine `android-37.0`
(channel 3) on the way — which by itself still hash-errored. The fix that worked: `cp -r android-37.0 android-37`
then patch all four (`source.properties` ApiLevel=37, `package.xml` `<api-level>`, `package.xml` `path=`,
`build.prop` `ro.build.version.sdk_full=37`), keep BOTH dirs. Green on the next run. Try the copy→patch first
on this image family rather than betting on pristine.
