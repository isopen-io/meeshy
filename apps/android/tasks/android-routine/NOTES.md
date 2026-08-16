# Notes — lessons & memory

Append-only log of gotchas and decisions that save time next run.

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`NOTES-archive-2026-08.md`](./NOTES-archive-2026-08.md) (same append/oldest-first order).

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
