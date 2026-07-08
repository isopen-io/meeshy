# Notes — lessons & memory

Append-only log of gotchas and decisions that save time next run.

## Lessons
- **2026-07-08 (`chat-pin-toggle`): a new `OutboxKind` and a new Retrofit method each force one compile-time
  touch-point that a partial diff will otherwise miss.** Adding `PIN_MESSAGE`/`UNPIN_MESSAGE` to the enum makes
  `OutboxLaneMap.assignmentFor`'s exhaustive `when` a compile error until each kind is mapped to a lane — this is
  the intended guard (a registered sender can never be stranded off the drain sweep), so lean on it rather than
  fighting it. Separately, adding `pin`/`unpin` to the `MessageApi` **interface** breaks every hand-written
  `: MessageApi` test fake (`Class 'FakeMessageApi' is not abstract…`) — there is exactly one such fake
  (`MessageRepositoryTest`); MockK-relaxed mocks are unaffected. When a terminal-state toggle (pin/unpin) has the
  same shape as an existing one (block/unblock — opposite terminal states of one target), generalize the coalescer
  helper (`blockToggle` → `terminalToggle`) instead of copy-pasting; the block call sites already passed
  (opposite, same) so the rename was mechanical. The optimistic repo flip touches only `pinnedAt` (what the banner
  SSOT reads); `pinnedBy` is cosmetic and arrives with the `message:pinned` socket refresh, so leaving it null
  optimistically is correct, not a gap.
- **2026-07-07 (`conversations-draft-aware-ordering`): an expression-body `= runBlocking { … }` JVM test must NOT
  end on a Truth assertion that returns a value.** `Truth.assertThat(x).containsExactly(…)` returns an `Ordered`
  (and `.inOrder()`/`.isInstanceOf()` also return non-Unit), so a test written `@Test fun t() = runBlocking { …;
  assertThat(m).containsExactly(k, v) }` makes the method's return type `Ordered`, and JUnit rejects the whole class
  at load time with `InvalidTestClassError: Method t() should be void` — which fails **every** test in that class,
  not just the offender (the report shows one `initializationError`, easy to misread as a single flake). Fixes:
  end the block on a void-returning assertion (`.isEqualTo(...)` returns void in Truth's Java API), split the map
  assertion into `assertThat(m.keys).containsExactly(k)` **then** `assertThat(m.getValue(k)).isEqualTo(v)`, or give
  the function a block body `{ … }` (block bodies are always Unit — this is why the sibling non-`runBlocking` tests
  using `{ assertThat(...).containsExactly(...) }` never tripped it). Note `runBlocking { … isEqualTo }` is fine
  because `isEqualTo` is void; only the collection/ordering matchers bite.
- **2026-07-07 (`conversations-draft-aware-ordering`): a store that a list needs to observe wholesale needs an
  `observeAll()`, and a shared "is this meaningful" predicate belongs in `:core:model`, not duplicated per feature.**
  The conversation list had to know *which* conversations carry a draft — a per-id `load()` can't drive that, so
  `ConversationDraftStore` grew `observeAll(): Flow<Map<..>>` (InMemory backed by a `MutableStateFlow` so it's
  reactive; DataStore maps over `data` filtering the `draft:` key prefix and `value is String`, decoding each,
  corrupt→omitted). The "does a draft count" rule already lived inline in `:feature:chat` `DraftAutosave` twice;
  extracting `val ConversationDraft.isMeaningful` to `:core:model` and having both `DraftAutosave` and the new
  `:feature:conversations` ordering/preview consume it kept one definition. Semantics matched exactly
  (`text.isNotBlank() || !replyToId.isNullOrBlank()` == the old `restore` guard; the `resolve` had-draft check used
  `replyToId != null` but a stored draft is always reply-normalised, so equivalent) — the existing chat suite stayed
  green. The "when to float / how to sort / which preview" product decision is a pure `:feature` atom
  (`DraftAwareOrdering`, `draftPreview`); the row overlap/tint is exempt Compose glue.
- **2026-07-07 (`chat-draft-autosave`): DataStore test files must end `.preferences_pb`, and use the explicit
  serializer for `encodeToString`/`decodeFromString`.** Two traps in one slice: (1) `PreferenceDataStoreFactory
  .create { file }` throws `IllegalStateException` at construction unless the produced file's extension is exactly
  `preferences_pb` — so Robolectric/TemporaryFolder tests must name the file e.g. `tmp.newFile("d1.preferences_pb")`
  (mirror `ThemeStoreTest`), never a bare name. (2) `json.encodeToString(draft)` resolved to the two-arg
  `(SerializationStrategy, value)` overload and failed to compile ("Cannot infer type … Argument type mismatch");
  use the explicit `json.encodeToString(ConversationDraft.serializer(), draft)` /
  `json.decodeFromString(ConversationDraft.serializer(), raw)` to avoid the reified-vs-strategy overload
  ambiguity. Also: DataStore forbids **two live instances over one file** — to test "survives process death",
  reuse the *same* backing `DataStore` for a fresh wrapper (as `ThemeStoreTest.hydrate` does) rather than
  cancelling one scope and opening a second over the same path (flaky active-files race). Pattern reused: durable
  seam = stateless building block in `:sdk-core` (interface + `InMemory…` + `DataStore…`), the "when to
  save/purge/restore" product decision = pure atom in `:feature:chat`, composer render = exempt Compose glue.
- **2026-07-07 (`chat-typing-header-avatars`): resolve socket-payload gaps from the roster the VM already holds,
  and cover the flaky-suite timeout.** The `typing:start` `TypingEvent` carries no avatar, so the header-avatar
  chip's URL has to come from the conversation participants. The `ChatViewModel` conversation collector already
  builds `mentionRoster`/`recipientCount` from `conversation.participants`; add one more derived field
  (`avatarByUserId = participants.associate { (it.userId ?: it.id) to it.avatar }`) and read it in the typing
  collector — no new stream, no new repo. Keep the "how many chips + overflow" decision a pure `:core`-style
  atom (`TypingAvatarStack.of`, in `:feature:chat`), test every cap branch incl. zero/negative → all-overflow,
  and leave the overlap/ring render as exempt Compose glue. **Flaky-suite gotcha:** a *full*
  `gradle assembleDebug testDebugUnitTest` occasionally fails `:sdk-core`
  `NotificationPreferencesStoreTest.dataStore_setPreferences_isReflectedInTheFlow` with a 5000 ms
  `TimeoutCancellationException` — it's a real DataStore-backed test whose 5 s `first()` wait starves under the
  parallel-module test load, **not** a regression. Re-run that single test/module in isolation to confirm green
  (it passes in ~4 s), then re-run the full suite; don't chase it as a slice failure.
- **2026-07-07 (`chat-edit-time-window`): a time source is already in the Hilt graph — inject it, don't
  `System.currentTimeMillis()` inside a ViewModel.** `SdkModule.providesCacheClock()` binds `CacheClock`
  (`@Singleton`), so a VM that needs "now" can add `private val clock: CacheClock` to its `@Inject constructor`
  with **zero DI changes** and tests pass a fixed clock (deterministic window/expiry assertions). Gotcha:
  `CacheClock` is a **plain `interface`, not a `fun interface`** — the SAM lambda `CacheClock { fixedNow }` fails
  to compile ("interface does not have constructors"); use an anonymous object `object : CacheClock { override
  fun nowMillis() = fixedNow }`. When you gate a VM action on a window, put the predicate in a pure `:core:model`
  object (here `MessageEditability.canEdit`, beside `DeliveryStatusResolver`) taking `nowMillis: Long` + a
  nullable `createdAtMillis` — parse the wire's ISO string with the `isoToEpochMillisOrNull` SSOT, and decide the
  null case deliberately (here: null → editable, since a message factory / optimistic row often has no
  `createdAt` and the existing green edit tests rely on it; blocking on a missing timestamp would both break
  them and be worse UX than a stale edit).
- **2026-07-07 (`chat-typing-in-control`): render-priority rules belong in a pure content SSOT, not `if`s in the
  Composable.** iOS `ConversationScrollControlsView` documents "typing indicator takes priority over count"; on
  Android that lived nowhere until `ScrollControlContent.of(affordance, typing)` made the four states
  (Hidden/Typing/Unread/Plain) an explicit, branch-swept decision. The Composable then just maps a variant to a
  pill and reads the badge count from the `Unread` variant only — so "typing hides the badge" is enforced by the
  type, not by remembering to guard it. When two feature slices need the same `TypingLabel`→string mapping,
  extract one `@Composable typingLabelText(label): String?` and reuse it (killed the duplicated `when` in
  `TypingIndicator`).
- **2026-07-07 (`chat-typing-participants-core`): two `runTest` gotchas that silently emptied a just-populated
  ViewModel roster.** (1) **mockk stub name-shadowing:** a socket flow field on the *test class* that shares a
  name with the mocked property (`private val typingStarted = MutableSharedFlow<TypingEvent>()`) makes a bare
  `every { typingStarted } returns …` resolve to the **outer test field**, not the mock's property — the mock
  property stays unstubbed. Qualify it: `every { this@mockk.typingStarted } returns this@ChatViewModelTest.
  typingStarted` (the existing `messageReceived`/`reactionAdded` stubs already do this — follow the pattern for any
  new same-named flow). (2) **`advanceUntilIdle()` fires pending `delay()`s:** the typing collector schedules a 5 s
  `delay(TYPING_TIMEOUT_MS)` cleanup that removes the participant, so `emit(start)` **then** `advanceUntilIdle()`
  runs the clock past 5 s and the roster is empty again by the assertion. Use `runCurrent()` (process the emission
  at the current virtual time, no clock advance) to assert the *pre-timeout* roster; reserve `advanceTimeBy(6_000)`
  for the expiry test. Symptom for both: `expected [X] but was []` with no exception.
- **2026-07-07 (`chat-typing-participants-core`): dedup incoming presence rosters by a stable id, never by the
  display name.** The old inline typing roster keyed on displayName (`(list - name) + name`) collapsed two distinct
  users named "Alex" into one and let a `typing:stop` from one remove the other. Keying `TypingParticipant` by
  `userId` fixes both; the same rule applies to any future presence/reaction/read roster.
- **2026-07-06 (`chat-mention-autocomplete`): the monorepo CI's `services/translator` Python jobs can fail on a
  PyTorch-CDN TLS outage that has nothing to do with an `apps/android` diff — recognise it and do NOT merge past
  it, but also do NOT churn re-triggers.** Symptom: `Test Python (translator)` + `Voice API Tests` +
  `TTS/STT Integration` + `Audio Pipeline Tests` all red at the **same** step "Install Python dependencies (CPU
  backend for CI)" with `Failed to fetch torch-…whl.metadata → received fatal alert: HandshakeFailure`
  (`download-r2.pytorch.org`). Every JS/TS job stays green. It is a global infra flake, not our code. Gotchas:
  (1) the GitHub integration **cannot** `rerun-failed-jobs` (403 "Resource not accessible by integration") — an
  empty-commit push re-triggers the *whole* suite instead, but if the CDN is still down it just fails again
  (verified: two runs, same 4 reds). (2) The PR shows `mergeable_state: "unstable"` = mergeable, **no required
  check blocks it** — so the platform *would* let you merge, but the routine hard rule "never merge past red CI"
  says don't. Correct move: mark the slice **⚠ blocked-on-infra** in PROGRESS (impl done + reviewer PASS), leave
  the PR open, record the one-line unblock path (re-run the 4 translator jobs once the CDN recovers → merge), and
  report to the user. Don't loop re-triggers on a persistent outage.
- **2026-07-06 (`chat-mention-autocomplete`): mentions are one pure `:feature:chat` core, and the roster→display-
  name wiring is free value alongside autocomplete.** Ported iOS `MentionComposerController`'s pure logic to
  `ChatMention` (`extractQuery`/`filterCandidates`/`insertMention` + a `MentionAutocompleteState` reducer) and
  `MentionRoster` (participants→candidates, self-excluded). Threading `mentionDisplayNames` (from the same roster)
  into `MessageBubble` makes received `@username` resolve in-bubble — so the autocomplete slice also lands the
  previously-pending display-name resolution. Keep the suggestion strip **neutral** (input chrome), not accent-
  tinted, matching the iOS decision (accent stays for message-content surfaces).
- **2026-07-06 (`chat-rich-text-segments`): the Gradle *wrapper* download 403s through the proxy — use the
  preinstalled system Gradle 8.14.3 (`/opt/gradle/bin/gradle`) instead of `./gradlew`.** `./gradlew` tries to
  fetch `gradle-8.11.1-bin.zip` from `services.gradle.org` → `github.com/gradle/gradle-distributions`, which
  returns HTTP 403 via the agent proxy. `gradle` is on PATH at 8.14.3 and builds every module fine (`gradle
  :app:assembleDebug testDebugUnitTest`). ROUTINE's `meeshy.sh` wrappers assume `./gradlew`; when the wrapper is
  unavailable just call `gradle` directly with the same tasks. (Recorded so future runs skip the wrapper dead end.)
- **2026-07-06 (`chat-rich-text-segments`): rich-text is one pure segmenter, not a view concern — and Compose 1.7
  gives real link taps for free.** Ported iOS `MessageTextRenderer` to a pure `:core:model` `MessageTextParser`
  (`parse`/`highlightRanges`/`extractUrls`/`resolvedLinkUrl`) so every treatment decision is JVM-testable
  (earliest-match-wins over a priority rule list, recursive markdown nesting, lookbehind-guarded mention/`m+`/URL,
  display-name mentions winning ties by registering first). Kotlin `Regex.find(text, startIndex)` keeps full-input
  lookbehind visibility (unlike a bounded `Matcher.region`), so `(?<![a-zA-Z0-9])` still sees the char before the
  cursor — the direct analogue of `NSRegularExpression.firstMatch(in:range:)`. The `:sdk-ui` render glue uses
  `LinkAnnotation.Url` + `withLink` (Compose 1.7+, BOM 2024.10.01) so taps open via `LocalUriHandler` with **zero
  callback plumbing**. Apply highlight over the **rendered** plain text (markers stripped), never the raw source
  offsets — iOS's raw-offset highlight drifts once markdown is present; ours can't.
- **2026-07-06 (`delivery-status-resolver`): `main` was force-reset and lost merged Android work — and the
  monorepo CI does NOT build Android, so a broken `main` compiles "green".** On this run `origin/main` had been
  force-updated (`6cd1a3c4…→5ee31e52`, a forced push) to a state whose `apps/android/tasks/*` docs had regressed
  ~21 slices AND whose `:core:model` `IsoTime.kt` was missing `isoToEpochMillisOrNull` — yet the just-merged
  message-effects `ChatScreen.kt` references it, so `main` was **uncompilable for Android**. `ci.yml` only tests
  JS/TS/Python, so it never caught it. **Takeaways:** (1) after a step-0 rebase onto `main`, run `meeshy.sh check`
  locally before trusting — CI green ≠ Android compiles; (2) when resolving doc conflicts from a force-reset, the
  feature-branch side is the superset (verified: 0 `main`-unique slices) so keep it; (3) restoring a
  force-dropped helper that a merged file needs is legitimate in-scope work (`apps/android` only) and required to
  leave `main` green; (4) a dedicated Android CI job (`.github/`, its own run) would have flagged this — still a
  tracked follow-up.
- **2026-07-06 (`delivery-status-resolver`): the delivery indicator must be honest — resolve at the display point
  with an all-or-nothing rule, never a `> 0` count threshold.** iOS centralises this in a pure
  `DeliveryStatusResolver`; Android now mirrors it: `resolve(base, deliveredCount, readCount, recipientCount,
  deliveredToAllAt?, readByAllAt?)` returns Delivered/Read only when the count `>= recipientCount` (recipients =
  `memberCount - 1`), trusts `> 0` when `recipientCount <= 1` (1:1 / unknown denominator), and lets unambiguous
  "all" markers win denominator-independent. **Under-report, never over-report** — an upstream Read downgrades
  honestly when group counts are partial. Thread `recipientCount` as a reactive `MutableStateFlow` in the
  ViewModel (from the conversation stream) into the bubble `combine`, so the check refreshes when *either* the
  counts or the member list arrives — not a one-shot read.
- **2026-07-06 (`message-effects-lifecycle`): a new nullable field on `ApiMessage` needs NO DB migration.**
  `MessageEntity.payload` stores the serialized `ApiMessage` JSON (not columns), so `val effects: MessageEffects?
  = null` decodes from the wire, persists in the payload, and reloads for free — kotlinx lenient decode tolerates
  the older payloads that lack it. Adding message-shaped optional fields is a pure `:core:model` change; reserve
  DB-version bumps for genuinely new tables/columns (stats cache, friends cache).
- **2026-07-06 (`message-effects-lifecycle`): centralise per-message "lifecycle state" as a pure `:core:model`
  SSOT, not scattered in Compose.** iOS recomputes ephemeral-expiry / view-once-consumed / blur-revealed ad hoc
  inside its message views. On Android, `MessageLifecyclePresentation.of(effects, createdAtMillis, nowMillis,
  revealed, viewCount)` is one total, side-effect-free decision the bubble just draws — trivially 90%+ covered
  (25 cases) and reusable by any surface (story reply). Runtime inputs (`now`/`revealed`/`viewCount`) are pushed
  in by the UI each frame; the core owns no state. Gate the 1 Hz countdown clock on `messages.any { it.effects
  ?.isEphemeral == true }` so there are no idle wake-ups when no ephemeral message is on screen.
- **2026-07-06 (`settings-regional-content-language`): `:sdk-core` `ThemeStoreTest` (and other DataStore
  tests) flake under the FULL parallel run, not in isolation.** They use a real `Dispatchers.IO` DataStore
  with `withTimeout(5_000)`; when `gradle :app:assembleDebug testDebugUnitTest` compiles+tests every module
  at once, IO contention can push a single `store.themeMode.first { … }` past 5s → a *different* test fails
  each run (`dataStore_setThemeMode_…` one run, `dataStore_hydrates…` the next). It is environmental, not a
  regression: run the same test 3× in isolation (`--tests "*ThemeStoreTest*" --rerun-tasks`) — green every
  time — then re-run the full check on the warm cache (compilation already done → no IO storm) and it passes.
  Don't "fix" it by touching sdk-core; a warm-cache re-run is the gate evidence. (Candidate future hardening:
  bump the timeout or pin these to a test dispatcher — a separate sdk-core slice, out of scope here.)
- **2026-07-06 (`settings-regional-content-language`): reuse the `edit-profile-optimistic` outbox path for
  any single-field backend content preference — no new store.** The regional (content) language is just a
  `regionalLanguage` profile field, so the whole slice was a pure picker SSOT (`RegionalLanguageSelection`)
  + a 3-line VM intent delegating to `UserRepository.enqueueProfileEdit(UpdateProfileRequest(regionalLanguage=…))`
  (optimistic session repaint + durable `UPDATE_PROFILE` + wake-worker-on-`cmid`). Contrast the *interface*
  language, which is device-local UI chrome → its own `InterfaceLanguageStore`. The test for "does it hit the
  right seam" asserts on the captured `UpdateProfileRequest`: `regionalLanguage == picked` AND every other
  field (`systemLanguage`/`customDestinationLanguage`/`displayName`) stays `null` (edits exactly one field).
- **2026-07-06 (`settings-regional-content-language`): `LanguageData.info(code)` is case-SENSITIVE (codes are
  lowercase).** If you clean a stored code to upper/mixed case (`" ES "` → `"ES"`) and feed it to `info()`,
  you get `null` and lose the label — even though your `equals(ignoreCase=true)` selection-marking still
  works. Resolve the display label with `allLanguages.firstOrNull { it.code.equals(code, ignoreCase=true) }`,
  not `info()`, whenever the code may not be canonically lowercase. Caught by a `" ES "` test that asserted
  the `selectedLabel` equals the native name.
- **2026-07-06 (`settings-notification-prefs-sync`): a literal `/*` inside a KDoc `/** */` is an "Unclosed comment".**
  Writing `` `/api/v1/me/preferences/*` `` in a KDoc line makes the Kotlin lexer open a *nested* block comment at
  the `/*` that never closes → `error: Unclosed comment`, and the whole file fails to compile (which cascaded into
  a misleading Hilt/KSP `error.NonExistentClass` on the class the KDoc documented). Never put a bare `/*` (glob,
  path wildcard, C-comment) in a doc comment — reword to `{category}`/`…`. Same trap applies to `*/` inside a KDoc.
- **2026-07-06 (`settings-notification-prefs-sync`): wiring a *dead declaration* is a clean, high-value slice.**
  `OutboxKind.UPDATE_SETTINGS` + `OutboxLanes.SETTINGS` existed with no coalescer rule and no worker sender (an
  `else -> Enqueue` fall-through). The whole slice was: pure wire-body SSOT in `:core:model` (mirrors the gateway
  Zod schema field-for-field, drops the local-only `extras`), a session-gated `enqueueSync` repo (mirrors
  `enqueueProfileEdit` but with **no optimistic session flip** — the device DataStore store already holds the
  value, and the PATCH is idempotent so no exhaust-rollback is needed), the explicit `UPDATE_SETTINGS` coalescer
  arm, and the sender. Grep for enum values that have a lane mapping but no sender/coalescer arm — they are
  latent "declared but never delivered" features. The `updateNotifications` single-funnel in the VM meant *one*
  edit (persist-then-`enqueueSync`-then-wake-worker-on-`cmid`) covered **every** notification toggle at once.
- **2026-07-06 (`settings-notification-type-toggles`): keep locale-aware search pure by injecting the label fn.**
  A "searchable" list needs to match localized labels, but string resources must not leak into `:core:model`
  (that would break SDK purity and force a Robolectric/Context dependency into a pure test). Solution:
  `sections(prefs, query, label: (T)->String)` takes the label lookup as a parameter — the pure builder owns
  grouping/ordering/`contains` matching and is tested with a fake label map; the Composable builds the real
  `Map<T,String>` via `stringResource` (once, `NotificationType.entries.associateWith { stringResource(res(it)) }`)
  and passes `label = { map.getValue(it) }`. Also: model per-event toggles as a **catalog of descriptors**
  (`type → category + get/set lens`) rather than a giant `when` per field — one `associateBy`-backed map gives
  total `toggle`/`isEnabled` and the `.copy` lens keeps every edit non-clobbering, and adding a type is one
  list entry. `byType.getValue` is total because every enum value has a descriptor (guarded by the
  round-trip-over-`entries` test).
- **2026-07-06 (housekeeping): main CI red ≠ block for an apps/android-only PR.** `main`'s push CI is currently
  failing only on the `Test Python (translator)` job (unrelated flake/pre-existing); an `apps/android`-only diff
  touches none of the JS/TS/Python stack, so its PR CI can only ever inherit that same unrelated red as
  `mergeable_state: unstable`. The real Android gate is the local `gradle :app:assembleDebug testDebugUnitTest`.
  Confirm the *only* failing check is that pre-existing non-android job before merging; never merge if the
  android diff itself introduced a failing check.
- **2026-07-05 (`settings-interface-language`): re-localise a pure-Compose app app-wide with no AppCompat.**
  minSdk 26 and the app is a `ComponentActivity` (not `AppCompatActivity`), so `AppCompatDelegate.setApplicationLocales`
  isn't the free path (needs appcompat + the metadata service, and would become a *second* persistence SSOT next to
  our DataStore). Instead: keep DataStore as the single persisted SSOT, and *apply* the locale by wrapping the whole
  Compose tree — `CompositionLocalProvider(LocalContext provides base.createConfigurationContext(cfg.apply{setLocale}), LocalConfiguration provides cfg)` — so every `stringResource` re-resolves. Works on every API ≥17, no new
  dependency, and the *decision* (`resolveInterfaceLocaleTag` → tag or null) stays a pure tested function; the
  wrapper is the only (coverage-exempt) glue. Also: `null` = "follow the device locale" (System) is a cleaner model
  than a magic sentinel — the pure codec maps corrupt/unsupported/`"system"`/blank all to `null`, and the applier
  no-ops on `null` so an untranslated device locale still falls through Android's own resource resolution.
  Distinguish **interface** language (app UI chrome → app locale, this slice) from **regional/content** language
  (Prisme `ContentLanguagePreferences` → `LanguageResolver`, backend profile) — they are different stores; don't
  wire the content row to the interface store.
- **2026-07-05 (`settings-theme-mode`): DataStore allows only one active instance per file per process.**
  A test that writes through one `DataStore`, cancels its scope, then opens a *second* `DataStore` over the
  same file to prove persistence will hang/`TimeoutCancellationException` — cancelling the scope doesn't
  reliably release the file from DataStore's internal `activeFiles` registry within the same JVM. To test
  cold-start hydration, share ONE `DataStore` instance across two store wrappers and assert the freshly
  constructed wrapper's `stateIn` reads the already-persisted value. That's the real unit under test
  (the wrapper's hydration), not androidx's file persistence. Also: back a DataStore-backed `StateFlow`
  with `stateIn(scope, SharingStarted.Eagerly, default)` so cold start has no flash of the default before
  the persisted value loads; decode the stored token through a pure codec that maps garbage → the safe
  default so a corrupt/legacy value can never brick the surface.
- **2026-07-05 (`edit-profile-optimistic`): outbox kinds can be pre-declared but wired only partway.**
  `OutboxKind.UPDATE_PROFILE` already existed with a lane (`OutboxLanes.PROFILE`, in `sharedDrainLanes`)
  but no `OutboxFlushWorker` sender and no `OutboxCoalescer` rule — an enqueued row would drain, find no
  sender, and `markExhausted("No sender registered…")`. When a slice "just needs an outbox mutation," grep
  `buildSenders()` + `OutboxCoalescer.decide` for the kind first; a lane assignment alone is not a live path.
- **2026-07-05: PATCH omit-null is the optimistic-merge contract.** kotlinx serialization omits null fields
  (`encodeDefaults=false`), so the gateway `PATCH /users/me` never receives a null field → it's "leave
  unchanged," not "clear." The optimistic local merge (`ProfileEditApply`) must use the exact same rule
  (null → keep existing, non-null → overwrite) or the optimistic paint and the server result diverge. This
  also means a blank editor field must degrade to `null` in the request builder (a blank edit = no-op),
  never an empty string (which would clear the field server-side).
- **2026-07-05: guard editor buffers against background state emissions.** The own-profile VM collects
  `SessionRepository.currentUser`; naively re-seeding the editable buffers on every emission clobbers a
  user's in-flight typing when a background `refresh()` fires. Fix: only re-seed the buffers when
  `!isEditing`; while editing, advance only the read-only `user` reference.

## Environment
- **The Gradle wrapper's 8.11.1 distribution zip is blocked in the web container (403 from
  github.com/gradle releases via the agent proxy).** `./gradlew` / `./apps/android/meeshy.sh check`
  therefore fail to *bootstrap*. A system Gradle **8.14.3** is preinstalled at `/opt/gradle/bin/gradle`
  and drives the same build fine — run the gate as `cd apps/android && /opt/gradle/bin/gradle
  assembleDebug testDebugUnitTest` (online; Google/Maven artifacts *do* resolve through the proxy, only
  the wrapper's github-hosted distribution zip is blocked). Do **not** edit `gradle-wrapper.properties`
  to work around this — CI/other envs rely on 8.11.1; keep the wrapper untouched and just use the
  system binary for local verification. `--offline` fails on a cold cache (AGP 8.7.3 not pre-seeded);
  run online the first time so Gradle can fetch AGP + deps. (2026-07-05, slice `profile-header-presentation`.)

## CI / merge
- **The monorepo `CI` workflow can run 40+ min (or sit queued behind the runner pool) on an
  `apps/android`-only PR — `updated_at` on the run object freezes while it waits.** (2026-07-05, slice
  `profile-details-rows`.) Only the `CI` workflow triggers for an android-only diff (iOS Tests / SDK
  Tests are path-filtered out — good). Do **not** busy-poll `actions_list`/`actions_get`: each response
  embeds the full ~5-6k-token repository object even with `minimal_output`/`perPage=1`, and
  `get_status` returns `total_count:0` (CI is a check-run, not a legacy commit status). When CI is slow,
  hand off to a recurring `CronCreate` (`*/8 * * * *`) that re-checks the run and squash-merges the
  moment `status==completed && conclusion==success`, then `CronDelete`s itself — instead of blocking the
  turn on `sleep`. A CI *failure* also arrives via the PR-activity webhook subscription.

## Design lessons
- **Reuse the existing pure SSOTs when building a projection — don't re-derive.** (2026-07-05, slice
  `profile-header-presentation`.) `ProfileHeaderBuilder` composes three already-tested SSOTs rather than
  re-implementing them: the display-name ladder is `MeeshyUser.effectiveDisplayName`, presence is
  `UserPresence(isOnline, lastActiveAt).state(now)`, and member-since is `isoToEpochMillisOrNull`. The
  builder's own new logic (blank→null degradation, `coerceIn(0,100)` on the completion %, `@handle`
  formatting, E2EE = key-present) is what the 22 tests target — no test re-asserts a borrowed SSOT's
  behaviour. Keeps the builder thin and the branch-coverage honest.
- **"Absent" ≠ "epoch 0" — a 0L-defaulting parse silently poisons time-delta logic.**
  (2026-07-04, slice `presence-away-indicator`.) `isoToEpochMillis` returns `0L` for both an absent/
  unparseable string **and** the legitimate `1970-01-01T00:00:00Z`. Reusing it for presence
  (`now - last > 5min → away`) would classify a friend with **no** `lastActiveAt` as "last active in
  1970" → always away — the opposite of the iOS `UserPresence.state` rule (no timestamp ⇒ *online*).
  Fix: a nullable `isoToEpochMillisOrNull` (null = no reliable time, `0L` = the real epoch instant),
  with `isoToEpochMillis` delegating (`?: 0L`) so the single parse path stays the SSOT. Lesson: when a
  helper collapses "missing" and "zero" into one sentinel, add a nullable sibling before building
  time-arithmetic on top of it — and unit-test the epoch-0 case explicitly.
- **A functional seam pays off when the real collaborator lands — zero churn to bind it.**
  (2026-07-04, slice `contacts-blocked-list`.) `UserRelationshipResolver` shipped taking a
  `BlockStatusProvider` `fun interface` seam (`{ false }` default). Binding the real block data was a
  one-liner: `BlockStatusProvider { blockCache.isBlocked(it) }` in `DiscoverViewModel` — the resolver
  class never changed. Confirms the earlier lesson: prefer a functional seam over a throwaway stub, and
  the payoff is a trivial bind later. Prove the bind is *consumed* with a test (a blocked user →
  `ConnectAction.Blocked`) so the seam-wiring isn't silent/orphan.
- **`BlockCache` mirrors `FriendshipCache` deliberately** — same `@Singleton` + `synchronized` +
  `version: StateFlow<Int>` shape. When adding a second in-memory SSOT store, copy the proven store's
  structure (defensive-copy snapshot, blank-id inert, full-replace hydrate, version-bump-per-mutation)
  rather than inventing a new one; the tests port 1:1 too.
- **Test a ViewModel's transient in-flight state with a gated `CompletableDeferred`, not sleeps.**
  Under `UnconfinedTestDispatcher` a `viewModelScope.launch` runs to completion synchronously, so a
  `pendingIds`/`showSkeleton` flag is set-and-cleared before you can observe it. Stub the suspend repo
  call with `coAnswers { gate.await() }`: assert the mid-flight state, then `gate.complete(...)` and
  assert the settled state. Also the way to prove an in-flight guard (call the action twice while the
  gate is open, `coVerify(exactly = 1)`).
- **Mock an `ApiResponse<Unit>` DELETE as `ApiResponse(success = true, data = Unit)`** — `apiCall`
  treats `data == null` as failure, and `Unit` is non-null, so a success needs `data = Unit` explicitly
  (mirrors the existing `FriendRepository.deleteRequest` `ApiResponse<Unit>` pattern).

- **`FriendRequest` carries BOTH id-strings and nested user objects — keep test fixtures consistent.**
  (2026-07-04, slice `contacts-list-friends`.) `FriendshipCache.hydrate` keys the friend graph off the
  `senderId`/`receiverId` **strings**, but `ContactList.fromAcceptedRequests` reads the `sender`/`receiver`
  **user objects** (it needs name/avatar/presence). Production gateway payloads always populate both
  consistently (`sender.id == senderId`). Two `ContactsListViewModel` tests were RED because the fixture
  set only the object, leaving `senderId=""` → the cache hydrated empty while the list populated. Fix was
  in the **test fixture** (derive `senderId`/`receiverId` from the objects), not the production code — a
  faithful red→green. Lesson: when a model has redundant id+object fields consumed by different collaborators,
  make fixtures set both, and prefer a helper that derives one from the other so they can't drift.
- **Loop-guard a StateFlow-version reconcile with a `lastReconciled` snapshot.** The cache-observation
  reconcile refetches on an unknown friend addition; that refetch re-hydrates the cache → bumps `version`
  → re-enters the collector. Without a guard (`if (cacheIds == lastReconciledFriendIds) return`, port of
  iOS's `guard cacheIds != lastObservedFriendIds`) an id the fetch can't resolve (in cache but no user
  record) loops forever. Under `UnconfinedTestDispatcher` the re-entrancy is synchronous, so the guard is
  load-bearing even in tests — assert "exactly N fetches" to pin it.
- **Pivot areas when the current one runs out of pure cores, don't force glue.** (2026-07-04, slice
  `friendship-relationship-resolver`.) The Calls area's remaining parity items are all WebRTC/Telecom/
  FCM platform glue — untestable in JVM, high-risk to merge blind. Rather than stall, the routine
  advanced to the next-richest in-progress area (Contacts §J) where a genuine pure vertical existed.
  Build-order is a *default* sequencing, not a hard gate: when an area's testable surface is exhausted,
  move to the highest-value pure slice available and note the pivot in PROGRESS "Next".
- **Missing-dependency seam pattern: `fun interface` provider, not a stub service.** The iOS
  `UserRelationshipResolver` folds in block state via `BlockServiceProviding.isBlocked`, but Android
  has no BlockService yet. Instead of inventing a throwaway stub, the resolver takes a
  `BlockStatusProvider` `fun interface { isBlocked(id): Boolean }` seam — fully testable now, and a
  future `BlockRepository` binds to it with zero resolver churn. The `Blocked` state is honestly
  tracked as `[~]`/seam-pending in feature-parity until that binding lands. Prefer a functional seam
  over a fake when the real collaborator doesn't exist yet.
- **Default constructor param keeps prior direct-construction tests green when injecting a new
  `@Singleton`.** `ContactsViewModel` gained a `FriendshipCache` param; giving it a
  `= FriendshipCache()` default meant the existing `ContactsViewModel(repository)` test calls compiled
  unchanged (Hilt still injects the real singleton in prod — it ignores the default). Minimal test
  churn, no weakened tests.
- **Identity-less fan-out streams must not drive per-entity teardown.** The gateway fans `call:ended`
  out to *every* member USER room, so a busy user (active call + a waiting-call banner) receives the
  *waiting* call's teardown on the same socket. Folding an identity-less `CallEvent.RemoteHangUp` from
  `CallSignalManager.events` blindly into the active FSM tore down the wrong call. Fix pattern (slice
  `call-ended-identity-teardown`): teardown frames go **only** through the identity-carrying stream
  (`endedCalls: SharedFlow<CallEndedSignal>` = id + the FSM event), and the consumer gates on the active
  id. `CallSignalMapper.map` returns `null` for `call:ended`/`call:missed` — they are deliberately not
  FSM-facing. Rule of thumb: if a socket frame's effect depends on *which* entity it names, decode the
  identity at the boundary and gate on it; never let the identity-less convenience event drive a mutation.
- When two decode helpers on the same object overlap (`endedCallId` returned just the id; the VM later
  also needed the event), collapse them into one identity-carrying value type rather than calling both —
  one SSOT decode, no chance of the id and the event disagreeing.

## PR / CI
- ⚠ **The monorepo CI (`ci.yml`) is the only gate on an `apps/android` PR, and it stays green
  by construction** — the diff touches none of the JS/TS/Python stack it exercises. `mergeable_state:
  unstable` right after opening just means checks are still running; poll the CI run to completion
  before squash-merging. Webhooks deliver CI *failures* but NOT success, and `send_later` is not
  available in this env — poll `pull_request_read get_status` (or `actions_list list_workflow_runs
  ci.yml`) yourself; a short background timer to re-check is fine.

## Environment
- ⚠ **Always rebase the slice onto `origin/main`, never local `main`.** Fresh containers ship a
  stale local `main`, and `git pull origin main` can hard-fail with `Need to specify how to
  reconcile divergent branches` (no merge/rebase strategy configured) — which silently leaves you on
  the stale tree. A branch cut from it **loses the previous merged slice** (e.g. `story-canvas-snap-guides`
  was first cut without PR #1045's `scale`/`rotation` fields). Recipe: `git fetch origin main && git
  checkout -B claude/apps/android/<slice> origin/main`. Verify a known recent symbol is present before coding.
- ⚠ **Gradle wrapper distribution 403s through the egress proxy.** `./gradlew` downloads the pinned
  `gradle-8.11.1-bin.zip` from `services.gradle.org`, which **302-redirects to a `github.com` release
  asset** the org egress policy blocks (`403`). The wrapper then dies with
  `Server returned HTTP response code: 403`. Fix: a full Gradle is preinstalled at **`/opt/gradle`**
  (8.14.3) — run the build with `/opt/gradle/bin/gradle <tasks> --no-daemon` (the daemon had a startup
  hiccup once; `--no-daemon` is reliable). 8.14.3 builds this AGP project fine. **Do NOT edit the
  committed `gradle-wrapper.properties`** to work around this — that's a repo change unrelated to the
  slice; keep the wrapper pinned and use the system gradle locally.
  - **Run ONLINE, not `--offline`** (2026-07-03): AGP 8.7.3 + its transitive deps are **not** in the
    local Gradle cache on a fresh container, so `gradle … --offline` fails with `Plugin [id:
    'com.android.application'] … was not found`. Let it fetch through the agent proxy (Google Maven +
    Maven Central are allowed). The partially-downloaded wrapper leaves a **0-byte
    `~/.gradle/wrapper/dists/gradle-8.11.1-bin/*/*.part`** — harmless, ignore it. The daemon worked fine
    this run (plain `gradle <tasks>`); `--no-daemon` remains the fallback if it hiccups.
- Fresh container has **no Android SDK**. Install per `ROUTINE.md` recipe (~2 min).
- JDK 21 preinstalled; modules target JVM 17 — fine.
- First Gradle run downloads the whole toolchain (slow); run it in the
  background and poll the output file.
- `./apps/android/meeshy.sh check` = `assembleDebug` + `testDebugUnitTest`.
  Full clean check ≈ 2.5 min once dependencies are cached.
- ⚠ **Robolectric artifact-fetch SSL flake.** The first Robolectric run in a fresh container downloads
  the `android-all-instrumented` jar from Maven through the agent proxy; that download can fail with
  `SSLHandshakeException` inside `MavenArtifactFetcher` (surfaces as ONE test in a class "failing" with an
  `AssertionError`/`EOFException` cause — not a real assertion failure). It is a network flake: simply
  **re-run the same test task** and it passes once the jar is cached. Don't chase it as a code bug.
  Seen in `call-history-repository` on `:core:database`'s first run.
- The `:app` module now has a **JVM test source set** (`app/src/test/kotlin`, first added in
  `call-nav-conversation-thread`). Test deps (junit/robolectric/truth/turbine/mockk) were already declared
  in `app/build.gradle.kts`. Navigation-decision logic belongs in a pure helper under
  `me.meeshy.app.navigation` (e.g. `CallRoute`) so it is unit-testable while the `NavHost` glue stays
  exempt. `android.net.Uri` needs `@RunWith(RobolectricTestRunner::class)`.
- **Pattern for platform-glue slices (FCM/Service/BroadcastReceiver): a pure router + a synchronized
  live-state holder.** `fcm-call-push-route` kept `MeeshyFcmService` (untestable `FirebaseMessagingService`)
  a 3-line delegation: (1) a pure `IncomingCallPushRouter.route(data, ctx) → sealed Route` in `:core:model`
  folds all the decisions and *returns* the advanced state (never mutates), (2) a plain `@Singleton`
  holder (`IncomingCallRingStore`, `@Inject constructor()`, no Android deps → JVM-testable without Hilt)
  owns the live state and persists it only on the outcome that should advance it, (3) the Service just
  pattern-matches the Route. 19 tests hit the real behaviour; zero test touches the Service. A store test
  needs **no** `Dispatchers.setMain` — it's synchronous, so instantiate it real (`IncomingCallRingStore()`).
- **`| tee file | tail -N` hides progress from a backgrounded Bash task.** `tail -N` only emits at pipe
  close, so the task's own output file stays empty until the build ends — poll the **`tee` target**
  (`appcheck.log`) for live `> Task :…` lines, or grep it for `BUILD SUCCESSFUL|BUILD FAILED` in a
  `run_in_background` `until` loop to get one clean completion ping. First full `:app` `check` in a fresh
  container ≈ 5 min (assembleDebug compiles the whole feature graph); `:core:model` alone ≈ 3.5 min cold.

## CI / GitHub gotchas
- ⚠ **Never poll GitHub via raw `curl` to `api.github.com`.** Even with `$GITHUB_TOKEN` set, the direct
  API returns `{"message":"GitHub access is not enabled for this session..."}` — the token is not scoped
  for it. All GitHub reads/writes must go through the **`mcp__github__*` tools** (they use the proxied auth
  path). A `curl` poll loop will spin forever on a `None` status. Use `mcp__github__actions_list`
  (`method:list_workflow_jobs`, `resource_id:<run_id>`, `filter:latest`) for a compact per-job
  status/conclusion view — much smaller than `list_workflow_runs`, which overflows the token limit.
- ⚠ **`pull_request_read get_status` shows `total_count:0` for an `apps/android`-only PR** — that's the
  *legacy commit-status* API, which GitHub **Actions** check-runs do not populate. It does NOT mean CI
  didn't run or failed. Confirm the real state via the workflow **jobs** endpoint above.
- The monorepo `ci.yml` runs on **every** PR to `main` (no path filter), so an `apps/android`-only PR does
  trigger the full JS/TS/Python suite (~10 min) — but it stays green because it touches none of that code.
  Merge only once every job's `conclusion` is `success` (a `skipped` benchmark job is fine).

## Serialization gotchas
- ⚠ **Never put a `private companion object` on a `@Serializable` class.** The plugin generates the
  public `serializer()` *onto the class's companion*; if you declare your own `private companion object`
  (e.g. to hold `const`/helper functions), the generated `serializer()` inherits that `private`
  visibility and `MyType.serializer()` becomes inaccessible from other files (compile error:
  "Cannot access 'companion object Companion': it is private"). Fix: keep helpers/constants as
  **file-private top-level** declarations (no companion), or make the companion non-private. Hit on
  `call-history-model` (`CallRecord`).

## Socket-emit patterns (established in repo)
- **Keep the conditional payload shape as a pure `Map<String, Any>` in `:core:model`, not inline in the
  emit.** `call-webrtc-plumbing-emits` put the `call:quality-report` `stats` decision (which optional
  fields are present) in `CallQualityReport.statsFields()` — a pure map, JVM-tested for every branch with
  no `org.json` dependency — and the `:sdk-core` emit just does `JSONObject(report.statsFields())`.
  `org.json.JSONObject(Map)` works under Robolectric, so the manager test asserts the nested `stats` keys
  directly. This mirrors the `CallInitiateAckParser` grain: transport in the manager, decision in the model.
- **Prefer `Long` over `Int` for cumulative WebRTC byte counters.** iOS uses a 64-bit Swift `Int`; Kotlin
  `Int` is 32-bit and a long video call's totals exceed ~2.1 GB → silent overflow. Modelling them as `Long`
  is a correctness win over a literal iOS port (assert with a `> Int.MAX_VALUE` test case).

## Test patterns (established in repo)
- ViewModel tests: `UnconfinedTestDispatcher` + `Dispatchers.setMain/resetMain`
  in `@Before/@After`; Truth `assertThat`; MockK (`relaxed = true`); Turbine
  `state.test {}` for flow assertions.
- **Observe an intermediate cache-first state before the network resolves** (e.g.
  "cached roster painted while the fetch is in flight"): under `UnconfinedTestDispatcher`
  the whole `init` runs to completion synchronously, so hold the network stub open with a
  `CompletableDeferred` and `coEvery { api.call(...) } coAnswers { gate.await() }`. Assert the
  cached state, then `gate.complete(result)` and assert the network overwrite. NB: `coAnswers`
  is an **infix member of `MockKStubScope`** (the receiver `coEvery {…}` returns) — do **not**
  `import io.mockk.coAnswers` (there is no such top-level symbol; it fails to resolve). Used in
  `contacts-friends-room-cache`.
- **A `relaxed = true` MockK returns a NON-null fabricated instance even for a `T?` return type**
  (e.g. `suspend fun cachedStats(id): UserStats?` → a mock `UserStats`, not `null`). (2026-07-05, slice
  `profile-stats-room-cache`.) This silently defeats a "cache is cold → paints nothing" assumption: the
  relaxed cache mock hands back data, so a network-failure test that expected an empty state suddenly sees
  a painted one and fails. When a test needs a **cold** collaborator, stub it explicitly —
  `coEvery { cache.cachedStats(any()) } returns null` (a small `coldStatsCache()` factory) — rather than
  trusting `relaxed` to yield null. Only trust `relaxed` for values you don't assert on.
- **Dagger `@Inject constructor` ignores Kotlin default args:** a param like
  `clock: CacheClock = SystemCacheClock` still demands a binding and there is none for
  `CacheClock`. For `@Singleton` repos that need `now`, call `SystemCacheClock.nowMillis()`
  inline rather than injecting it (test time isn't asserted). Cf. `FriendListRepository`,
  `CallHistoryRepository`, `SuggestionsRepository`.
- **Cache-first cold-paint slice recipe** (`FriendListRepository`, the template to copy for the
  suggestions cache): a `*Entity` with a serialized-payload column + a `sortIndex` so the DAO
  (`ORDER BY sortIndex`) replays the pure builder's order verbatim (ordering SSOT stays in the
  `:core:model` builder, never re-derived in SQL); a focused `@Singleton` repo with
  `cachedSnapshot()` (null = cold, distinguished from a synced-but-empty roster via `sync_meta`)
  + `persist()` (write-through; guard the empty case with `dao.clear()`, since Room `deleteNotIn`
  on an empty list generates invalid `NOT IN ()` SQL); the ViewModel paints from the snapshot
  first, then revalidates and writes the fresh roster back through.
- `MeeshyConfig` is a plain `data class` with defaults — instantiate it real,
  do not mock.
- `SessionRepository` is a concrete class — mock with `mockk(relaxed=true)` and
  stub `currentUser` (a `MutableStateFlow`) and `currentUserId` explicitly.
- `NetworkResult.Failure` wraps **`ApiError(message, code?, httpStatus?)`** — not
  a `NetworkError` type. Use `NetworkResult.Success(Unit)` for unit endpoints.
- For distinct sequential stub returns, MockK `coEvery { … } returnsMany listOf("a","b")`;
  for "succeed once then fail", `… returns "a" andThenThrows Exception(…)`. Used to test
  multi-pending staging (each `enqueue` returns a distinct cmid) and mid-batch failures.
- **Non-deterministic id minting in a VM, tested without injection:** when a VM mints ids
  inline (`UUID.randomUUID()` like `StoryCommentsViewModel`), don't fight Hilt to inject a
  `() -> String` (a function type has no Hilt binding). Instead assert **structure** and read
  ids back off the state (`vm.state.value.deck.slides[i].id`) to drive the next op — fully
  behavioural, no exact-id tautology. Used for `story-composer-slide-deck` slide intents.
- **Editor-buffer ↔ selected-item mirror:** the composer keeps `draft.text == deck.selectedSlide.text`
  as a one-writer invariant (a single private `applyDeck{}` re-syncs the buffer on every structural
  op). This is an accepted "active editor buffer" pattern, not a SoT violation — the deck is the SoT,
  the draft is the live editing view of its selected slide.
- **MockK capture-all into a `mutableListOf`:** `coEvery { repo.enqueuePublish(capture(reqs), capture(deps)) }`
  collects **every** call's arg in order — perfect for asserting a publish loop (one row per slide).
- **Flipping a behavioural test is not weakening it** when the slice *intentionally* changes
  the behaviour: `story-composer-multi-pending` flipped "second offline pick is rejected" →
  "second offline pick is appended". Keep the assertion strong (assert the new outcome
  precisely), record the flip + rationale in the run log, and the reviewer gate passes.
- **A "duplicate-free across categories" invariant pays for itself as a RED test.** `story-sticker-picker-search`'s
  `all is … duplicate-free` test caught `⭐` accidentally placed in both OBJECTS and SYMBOLS on the first run
  — exactly the kind of hand-curated-data slip that silently breaks `distinct`/counts. Assert structural
  invariants (`containsNoDuplicates`, `hasSize(sum of parts)`, `isInOrder`) over curated catalogues, not just
  spot-checks of individual entries.
- **Encode "search ignores the active tab" as a pure reducer, not Compose state.** The product rule (a
  non-blank query searches across all categories) lives in `StickerPickerState.visibleEmojis`, so it is
  unit-tested with a one-liner (`state.withQuery("heart").visibleEmojis contains ❤️` while the tab is ANIMALS)
  and the dialog never has to branch. Same grain as `ComposerBandState` — push the decision out of the Composable.
- **One text field, two roles (caption vs on-canvas element):** rather than add a second editor,
  `story-text-elements` routes the existing field by a derived `editorText`/`isEditingTextElement`
  (selected element's text or the slide caption). `onTextChange` branches on
  `_state.value.selectedTextElement?.id`. Keeps the canvas a single coherent surface and the SoT in
  the deck. A dangling element selection (after a slide switch/remove) is dropped centrally in
  `mirrorDraftToSelection` — an element id only lives on one slide, so "not on the selected slide ⇒
  not editing". Don't clear in `applyDeck` per-op (it also runs on every pan gesture).
- **Editor models can land before/after-but-separate from wire serialization** — but prefer wiring
  it when the model already exists: `story-canvas-transform` shipped the per-slide transform without
  publishing it; `story-text-elements` *did* serialize into the existing `StoryEffects.textObjects`,
  so the slice is a complete vertical (no dead-end). Check `core/model` for an existing wire type
  before deciding the publish path is out of scope.
- **Private VM companion constants aren't visible to tests** — assert `errorMessage != null` (the
  existing pattern for `MEDIA_LIMIT` etc.), don't reference `StoryComposerViewModel.X` from a test.
- **Pure gesture resolvers (drag/swipe) — keep thresholds/slot widths as params** so the
  decision is fully unit-tested off the Composable (`StorySwipeResolver`, `SlideReorderResolver`).
  The Composable measures (`onSizeChanged`, `LocalDensity`), accumulates (`detectHorizontalDragGestures`
  with a local `totalDrag`), and on drag end calls the pure resolver → an existing tested intent.
- **Float interpolation drifts at the endpoints — short-circuit them.** `a + (b - a) * 1f` is
  **not** bit-equal to `b` for many floats (1-ULP error), so a lerp tested with `isEqualTo(b)` at
  `t = 1` (and `isEqualTo(a)` at `t = 0`) fails. Don't switch the test to a tolerance and lose
  exactness — make `blend` return `this`/`other` directly when `k ≤ 0` / `k ≥ 1`. It's also the
  correct design: "full-strength filter == base matrix" should be exact. Hit on `story-photo-filters`
  (3 reds: `blend at one`, `non-finite → full`, VM `selecting a filter`).
- **Model a small fixed-size numeric vector as `List<Float>`, not `FloatArray`, when you want value
  equality in tests.** `FloatArray` uses reference equality (a `data class` over it won't compare by
  content), breaking `assertThat(matrix).isEqualTo(other)`. `StoryColorMatrix` wraps a 20-element
  `List<Float>` (value equality, JVM-testable) and the Composable only does `values.toFloatArray()`
  at the glue boundary to feed Compose `ColorMatrix`.
- **`Float.roundToInt()` rounds half **up** toward +∞** (`2.5 → 3`, but `-0.5 → 0`). When a
  reorder/threshold test sits exactly on `.5` the expectation is ambiguous — pick a value clearly
  above/below half (e.g. `2.3` not `2.5`) so the assertion is unambiguous, not flaky. Hit while
  writing `SlideReorderResolverTest`.
- **Moving a field "up" a level cheaply: keep a *mirror*, not a second source of truth.** Moving story
  media from whole-draft to per-slide (`story-slide-media`) looked like it would flip ~20 mature media
  tests. Instead the deck became the single owner and `draft` was made a *mirror of the selected slide*
  for media — exactly as it already was for text (`mirrorDraftToSelection`). On the single-slide path
  `draft.mediaIds == selectedSlide.mediaIds`, so nearly every existing test passed unchanged and only
  the genuinely new per-slide behaviour needed new tests. The reviewer "single source of truth" box
  still holds because the mirror has **one writer** and the deck is authoritative; `draft.*` media
  helpers (`remainingMediaSlots`/`isMediaFull`/`hasMedia`) then automatically read per-*selected*-slide
  for free. Prefer this over a wholesale rename when the existing facade is already a projection.

## Outbox / durable chain
- The durable upload→publish chain is two halves: (1) **gating** the dependent on
  its prerequisite (`outbox-dependency-gating` — drainer holds/cascade-exhausts via
  `OutboxDependencies.verdict`); (2) **produced-id write-back**
  (`outbox-produced-id-writeback` — a prerequisite's `SendResult.SuccessWithId(realId)`
  grafts the id into dependents' payloads via `OutboxRepository.rewriteDependents` +
  the pure `PublishMediaWriteBack.graft`). The **placeholder convention** is: a publish
  queued before its upload carries the **upload row's own `cmid`** as the placeholder
  media id; the drainer passes `placeholder = row.cmid` to the graft. Self-documenting,
  needs no extra column.
- Keep the outbox package **payload-agnostic**: `rewriteDependents` takes a generic
  `(payload) -> payload?` and the drainer takes an injected `graftProducedId` (no-op
  default). The story-specific `CreateStoryRequest` decode lives only in
  `PublishMediaWriteBack` (sdk-core `story` package); the worker injects it. Don't let
  `OutboxRepository`/`OutboxDrainer` import story types.
- `MeeshyApi.json` has `explicitNulls = false` + default `encodeDefaults = false`, so
  re-encoding a `CreateStoryRequest.copy(...)` round-trips cleanly (default/null fields
  are simply omitted). Safe to decode→edit→re-encode a queued payload.
- `rewriteDependents` only touches **PENDING** dependents — never rewrite a row that is
  INFLIGHT (mid-send) or EXHAUSTED. The gate keeps a dependent PENDING until its
  prerequisite succeeds, so the graft always lands before the dependent's gate opens.
- Producer gap (still open after `outbox-produced-id-writeback`): nothing emits
  `SuccessWithId` yet and the worker's lane list omits `MEDIA`. The write-back is a
  tested primitive awaiting its `UPLOAD_MEDIA` sender — same "ship the primitive before
  its producer" pattern as the gating slice. Drain `MEDIA` **before** `STORY` when it
  lands. Also: a `BLOCKED` dependency doesn't set `anyTransient`, so a held lane isn't
  auto-retried by WorkManager — fix with the producer.

## Domain gotchas
- `List<ApiPost>.toStoryGroups()` orders each group's stories **oldest-first**
  (ascending `createdAt`); groups order = current-user → unviewed → latest desc.
  When building viewer fixtures, the *first* slide is the *oldest* story.
- Prisme rule 1: when no translation matches a preferred language, show the
  ORIGINAL (`isTranslated = false`) — never an arbitrary translation. Honoured by
  `StoryContentResolver` / `LanguageResolver.preferredTranslation`.

## Decisions
- **Routine docs live in `apps/android/tasks/android-routine/`** (not repo-root
  `tasks/`) so merged diffs stay inside `apps/android` per the hard merge gate.
- Cross-group story navigation is modelled as a **pure `StoryPlayback`** reducer
  in `:feature:stories`; the ViewModel holds an instance and re-derives
  `UiState` from it, the Composable only wires gestures + the auto-advance timer
  and observes `isDismissed` to pop. Keeps all branch logic JVM-testable.

## Decisions (cont.)
- **Optimistic story reactions > iOS fire-and-forget.** iOS `sendReaction` does
  not bump locally and waits for the socket echo (`applyStoryReactionDelta`) for
  its own +1. Android `StoryReactionState.reactedLocally` bumps instantly; to keep
  the eventual socket echo from double-counting, `applyDelta(emoji, delta, isOwn)`
  treats an own ADD of an emoji already in `mine` as a no-op. The VM rolls back to
  a snapshot on `NetworkResult.Failure`/exception. Reducer lives in
  `:feature:stories` (the "when to count" rule is product UX, not an SDK atom).
- Quick-strip source of truth = `EmojiCatalog.defaultQuickReactions` (sdk model),
  NOT a screen-local literal — keeps the strip consistent with the picker.

## Decisions (cont.)
- **Story viewer swipes = pure resolver + pure engine transition.** A drag is
  mapped to intent by `StorySwipeResolver.resolve(dragX, dragY, hThreshold,
  vThreshold)` on the **dominant axis** (`|x|>|y|`); only a *downward* drag
  dismisses; sub-threshold travel is `None` so finger drift during a tap can't
  hijack navigation. Thresholds are parameters (Composable feeds them from
  density) → the decision stays 100% JVM-testable. `StoryViewerViewModel.onSwipe`
  dispatches into `jumpToNext/PreviousGroup` + the new pure `StoryPlayback
  .dismissed()`. Composable only runs `detectDragGestures` (exempt glue).
- Compose gesture coexistence: keep `detectTapGestures` and `detectDragGestures`
  in **separate `pointerInput`** blocks on the same Box — Compose routes taps vs
  drags to the right detector; do not try to merge them.

## Decisions (cont.)
- **Realtime story-reaction deltas = SocialSocketManager flow → VM `applyDelta`.**
  `SocialSocketManager` only decodes `story:reacted`/`story:unreacted` (payload
  `{storyId,userId,emoji}`, identical across shared TS, iOS, Android) into
  `SharedFlow`s — pure transport. The product rule ("which slide, fold +1/-1,
  is-own, ignore unknown ids, don't double-count my optimistic bump") lives in
  `StoryViewerViewModel.onReactionDelta`, which seeds a non-current slide's base
  count from `playback.groups`, calls the pure `StoryReactionState.applyDelta`,
  and re-emits **only on an actual change** (`next == current` → skip). Own echo
  of an already-counted emoji is inert because `applyDelta` returns `this`.
- **Testing socket managers on the JVM needs Robolectric** — `org.json.JSONObject`
  is an android.jar stub that throws "not mocked" under plain unit tests. Mock
  `SocketManager`, capture the `on(event, cb)` handlers into a map, `attach()`,
  then invoke the captured handler with a real `JSONObject`; assert via Turbine
  `flow.test {}`. `@RunWith(RobolectricTestRunner::class)`.
- VM SharedFlow collectors started in `init` are live under
  `UnconfinedTestDispatcher`; emit on the test-owned `MutableSharedFlow`
  (extraBufferCapacity) and read `vm.state.value` synchronously — same pattern as
  the existing intent-driven tests.

## Decisions (cont.)
- **MockK `coAnswers` is a member infix, NOT a top-level import.** `import
  io.mockk.coAnswers` is unresolved in this mockk version — use `coEvery { … }
  coAnswers { … }` directly (it resolves as a member of `MockKStubScope`). To test
  a "cold skeleton then content" transition, gate the suspending stub on a
  `CompletableDeferred` and assert via Turbine `state.test {}` (initial idle →
  isLoading=true → completed).
- **Viewers sheet ≫ load-once.** iOS `StoryViewersSheet` loads once in raw gateway
  order. Android: pure `StoryViewersPresentation.order()` sorts most-recent-first
  (ISO `viewedAt` desc, nulls last via `compareByDescending { it.viewedAt != null }
  .thenByDescending { it.viewedAt.orEmpty() }`, stable → ties keep input order) +
  dedups by id; the VM applies Instant-App SWR (cold-only skeleton, refresh keeps
  the stale list and swallows refresh failures, error only on cold). The "order /
  when-skeleton / author-only affordance" rules are product UX → `:feature:stories`,
  while the wire model + `toStoryViewer()` mapper + `StoryRepository.viewers()` are
  building blocks → `core/model`/`sdk-core`.
- **`story:viewed` realtime can't append a viewer row yet.** Socket payload is
  `{storyId, viewerId, viewedAt}` — no display name/avatar, so a live append would
  render an empty row. Left as a one-shot load (iOS parity); realtime append needs
  a richer gateway event or a user lookup. Tracked follow-up.

## Decisions (cont.)
- **Tray cache-first = Room-backed SWR, not in-memory.** The Feed still uses an
  in-memory L1 cache (`PostRepository`, Room deferred to "Phase 3"); the stories
  tray instead got a real `StoryCacheSource` (port of `ConversationCacheSource`)
  so it survives process death and paints instantly on a cold launch — the
  Instant-App "no spinner when cache has data" rule. Reuse the existing
  `cacheFirstFlow`/`SwrCacheSource`/`CachePolicy`/`sync_meta` primitives; do NOT
  re-implement the SWR state machine (Feed did, inline — don't copy that).
- **Adding a Room entity bumps `MeeshyDatabase.version`.** `StoryEntity` took it
  4 → 5. `fallbackToDestructiveMigration()` is already set, so no migration test
  is needed yet (tracked: `exportSchema`/migration tests follow-up).
- **Story tray fixtures must be LIVE.** `StoryTrayBuilder.build` drops
  fully-expired groups against `System.currentTimeMillis()` (21h fallback TTL),
  and the VM calls it with the default wall-clock `nowMillis`. A fixed past
  `createdAt` makes the tray empty → VM tests fail. Use `Instant.now().toString()`
  for VM-level fixtures; pass an explicit `nowMillis` only to the pure builder/
  grouping tests.

## Decisions (cont.)
- **Adjacent-slide prefetch = pure planner + shared Coil loader.** The "which
  images to warm / how far ahead / skip text-only / stop at the end" decision is
  a pure `StoryPrefetchPlanner.plan(playback, lookahead)` in `:feature:stories`
  (product UX rule, not an SDK atom) returning distinct URLs in forward viewing
  order across group boundaries. The VM derives `prefetchUrls` in `emit()`; the
  Composable enqueues them through `context.imageLoader` — the SAME Coil
  singleton `AsyncImage` resolves against, so the warmed disk/memory entry is
  reused (do NOT build a second `ImageLoader`, that would defeat the cache).
  Coil 2.x prefetch = `loader.enqueue(ImageRequest.Builder(ctx).data(url).build())`
  with no target. Surpasses iOS (single-next) with a windowed cross-group warm.

## 2026-06-27 — optimistic tray derived from the durable outbox
- **Optimism = a projection of the durable queue, not a separate in-memory list.**
  The tray's optimistic self-ring is `StoryRepository.pendingPublishes()` — a `map`
  over `OutboxRepository.observeAll()` keeping `PUBLISH_STORY` rows in a **live**
  state (`PENDING`/`INFLIGHT`). This gives reconcile + rollback for free: a
  *delivered* publish deletes its row (vanishes), an *exhausted* one flips to
  `EXHAUSTED` (filtered out) — no bespoke state machine, and the optimism survives
  process death because the row does. Surpasses iOS's in-memory optimistic story.
- **Decode lives in `:sdk-core`, "render it" lives in `:feature`.** Decoding the
  outbox payload (`CreateStoryRequest`) into a `PendingStoryPublish` is queue
  semantics → a building block in `:sdk-core` (also keeps `:feature` off
  `:core:database`, which `:sdk-core` only exposes as `implementation`, NOT `api` —
  so `OutboxEntity` is invisible downstream). The "synthesize a self-authored
  `STORY` `ApiPost` and merge it into the tray" rule is product UX → pure
  `StoryOptimisticTray` in `:feature:stories`. Reuse the existing `toStoryGroups` →
  `StoryTrayBuilder` pipeline (one code path) instead of a second tray builder.
- **Delivery hand-off without an `outcomes` subscription:** diff consecutive
  `pendingPublishes` emissions in the VM — a tempId present last tick but gone now
  was delivered (success deletes the row; exhausted rows linger), so `refresh()`
  pulls the real story in. Avoids plumbing `OutboxOutcome` + cmid→kind tracking.
  Guard the first emission (empty→empty ⇒ no spurious refresh) and rely on the
  pending set staying stable afterwards so the refresh doesn't loop.
- **`combine` needs every source to emit once.** A `relaxed` mockk of a
  `Flow`-returning fun yields a flow that emits **nothing**, so `combine` stalls and
  the VM never updates state. Always stub `pendingPublishes()`/`storiesStream()`
  explicitly with `flowOf(...)` in `StoriesViewModel` tests, even the unrelated ones.

## 2026-06-27 — media upload foundation (`media-upload-api`)
- **`:core:network` exposes okhttp only as `implementation`, not `api`.** So a
  downstream module that builds `MultipartBody.Part` (here `:sdk-core`'s
  `MediaUpload`) does NOT see okhttp transitively — add an explicit
  `implementation(libs.okhttp)` to that module's `build.gradle.kts`. Symptom
  otherwise: `MultipartBody`/`RequestBody.toRequestBody` unresolved at compile.
- **okhttp multipart parts are JVM-testable without a server or Robolectric.**
  `MultipartBody.Part.createFormData(name, filename, body)` is pure JVM okhttp:
  assert the field name + filename via `part.headers?.get("Content-Disposition")`
  and the content type + length via `part.body.contentType()` / `contentLength()`.
  Keeps the "which field name / filename / mime" decision behavioural, not mocked.
- **Stories reference media by id, not URL.** iOS `AttachmentUploader` returns the
  uploaded URL and throws the attachment **id** away (messages embed by URL). But
  `CreateStoryRequest.mediaIds` is a list of **ids**, so the Android `UploadedMedia`
  carries `id` (= the gateway attachment id from `messageAttachmentSchema.id`) as the
  primary key, with `url` alongside for previews. Don't port iOS's URL-only response.
- **Repository drops unusable rows instead of failing the batch.** `MediaRepository
  .upload` maps the wire list through `toUploadedMedia()` with `mapNotNull` — a blank
  id or url removes that one attachment but keeps the good ones (one degenerate row
  never discards a multi-file upload). Empty input short-circuits to `Success(empty)`
  with **no** network call (assert with `coVerify(exactly = 0)`).
- **A `data class` holding a `ByteArray` is a footgun** (value equality over arrays).
  `MediaUploadItem` is a plain `class` — it's only ever constructed + read, never
  compared by value, so no `equals`/`hashCode` is needed.

## Open follow-ups (cross-slice)
- Wire **Kover** with a 90% per-module verification rule.
- Add a dedicated **Android CI workflow** (touches `.github/` → separate run).
- **`SocialSocketManager.attach()` has no caller yet** — none of its social flows
  (storyCreated/Viewed/Reacted/Unreacted, post*, comment*) actually receive events
  in-app until attach is wired to the socket lifecycle. Affects ALL social events,
  touches `:app` → its own slice.
- Story viewer richness: **swipe gestures done**, **reactions strip done**,
  **realtime reaction socket-delta done**, **viewers sheet done**, **tray SWR/Room
  backing done**, **comments overlay done** (optimistic post + `comment:added`
  delta — but realtime echo only flows once `SocialSocketManager.attach()` is
  wired, see above); remaining: media prefetch, cross-dissolve transitions,
  realtime `story:viewed` append (needs richer event payload).
- **Cross-module smart-cast.** A nullable `public` property declared in another
  Gradle module (e.g. `StoryComment.clientId` from `:core:model`) cannot be
  smart-cast after a `!= null` check inside `:feature:*` — Kotlin can't prove it
  is stable across the module boundary. Bind it to a local `val` first, then
  null-check the local. Bit us in `StoryCommentsSheet` (compile error).
- Reaction `mine` still seeded empty on load — needs server `currentUserReactions`
  exposed by the stories API to pre-fill the user's own emojis.
- **Optimistic publish has no failed-state UI.** An `EXHAUSTED` publish silently
  drops from the optimistic tray (rollback). A "failed to post — tap to retry"
  affordance (read `EXHAUSTED` rows via `observeAll`/`outcomes`, call
  `outboxRepository.retry(cmid)`) would close the loop. Needs `:app`/`:feature`
  wiring → its own slice.
- **`data class` with a non-public primary constructor** triggers a Kotlin 2.1
  copy-visibility warning (the generated `copy()` will change visibility). When a
  value object is only meant to be built through a factory (e.g. `StoryCountDots`),
  prefer a plain `class` (no `copy()` needed) over `data class internal constructor`.
  `@Immutable` already gives Compose stability without value equality here.

## 2026-06-23 — step-0 open PR may be SUPERSEDED, not just mergeable
- An open Android PR (#877, conversation swipe pin/mute/archive) from a *parallel*
  session was far behind `main` (ancient merge-base → a raw merge conflicted in
  hundreds of unrelated translator/gateway/tasks files). Before forcing a merge,
  **check whether `main` already implements the feature** — `git grep` for the
  PR's key symbols on `origin/main`. Here `main` already had a *more complete*
  version (togglePin/Mute/Archive + outbox `UPDATE_CONVERSATION_PREFS` + swipe UI
  + mark-read + row badges), so the right move was to **close the PR as
  superseded**, not merge it. Cherry-picking the PR's single commit onto fresh
  `main` was the right probe — the `strings.xml` conflict (`conversations_action_*`
  already present on HEAD vs the PR's `swipe_*`) was the tell.
- Lesson: "merge the open iteration PR first" assumes the PR's work isn't already
  on `main`. Verify with a symbol grep on `origin/main` before resolving conflicts.

## 2026-06-23 — auto-advance media gate
- The story viewer's auto-advance is gated on media readiness via a pure
  `StoryAutoAdvanceGate`. Readiness is fed from `AsyncImage` `onSuccess`/`onError`
  (BOTH — a failed load must resolve too, else the viewer hangs forever on a dead
  URL). The VM's `onImageResolved` re-emits only when the resolved URL is the
  *current* slide's image, so off-screen prefetch resolutions don't churn state.
  `resolvedImageUrls` persists across slides so back-navigation never re-waits.

## 2026-06-26 — story composer / publish via outbox
- **Publish reuses the shared outbox, not a bespoke queue.** iOS has a dedicated
  `StoryPublishQueue` (its own retry schedule + media-ref persistence). Android's
  generic `outbox` already gives durable FIFO lanes, ×5 retry/exhaust, boot
  recovery and the WorkManager drain — so a story publish is just a new
  `OutboxKind.PUBLISH_STORY` on its own `OutboxLanes.STORY` lane. The sender lives
  inline in `OutboxFlushWorker.buildSenders()` (mirror the existing senders:
  `json.decodeFromString<CreateStoryRequest>` → `postApi.createStory`, map
  Success/Failure → SendResult). Add the lane to the drained-lanes list too, or it
  never flushes.
- **Don't coalesce publishes.** `OutboxCoalescer.decide` only special-cases the
  message/reaction/prefs kinds; everything else (incl. PUBLISH_STORY) falls to
  `Enqueue`. Give each publish a fresh `pending_<uuid>` targetId so two stories
  stay independent rows.
- **R import is the module Gradle namespace, NOT the package.** `feature:stories`
  Kotlin lives in `me.meeshy.app.stories` but the generated `R` is
  `me.meeshy.feature.stories.R` (the module `namespace`). Always
  `import me.meeshy.feature.stories.R` — copy it from a sibling screen.
- **`Modifier.weight` is a scope member, never import it.** Importing
  `androidx.compose.foundation.layout.weight` pulls the *internal* RowColumn
  extension and fails with "it is internal in file". Inside a `Column { }` /
  `Row { }` content lambda, `Modifier.weight(1f)` resolves on the scope receiver
  with no import.
- **Nav route collisions are silent.** `story_composer` (literal) must not be
  `story/compose` — that pattern-matches `story/{userId}` with userId="compose".
  Use a slash-free literal for a sibling of a parameterised route.
- **`WorkManager` is a per-feature dependency.** `feature:stories` needed
  `implementation(libs.work.runtime)` added before the VM could `workManager
  .enqueue(OutboxFlushWorker.buildRequest())` (chat already had it). `buildRequest()`
  builds a `OneTimeWorkRequest` fine in a plain JVM unit test (no Robolectric).

## Lessons — slice `story-publish-retry` (2026-06-27)
- **`combine` only emits once ALL source flows have emitted.** When the VM's
  combined repository flows changed, every test (and every hand-rolled mock) had to
  stub the new flow (here `publishQueue()`) — a relaxed mockk returns a Flow that
  never emits, so `combine` silently never collected and the VM state stayed at its
  default. Symptom: a previously-green assertion fails for no obvious reason. Always
  stub *every* combined flow (default `flowOf(...)`).
- **A "row vanished from the pending queue" is ambiguous.** Both a *delivered*
  publish (row deleted) and a *failed* one (row → `EXHAUSTED`, dropped from
  `pendingPublishes`) disappear from the live queue. The optimistic-tray
  reconciler originally treated any disappearance as delivery and fired a spurious
  `refresh()`. Disambiguate by also tracking the failed set: a temp id now failed
  exhausted (surface it), only a temp id in neither set delivered.
- **Don't disambiguate across two separately-subscribed flows — they race.**
  First cut combined `pendingPublishes()` + `failedPublishes()` as two `combine`
  args, but each independently re-subscribes `observeAll()`, so a `PENDING →
  EXHAUSTED` change fires both and `combine` emits an intermediate frame where the
  row is in *neither* set → the exact spurious `refresh()` we were fixing,
  reintroduced by timing. Fix: a **single** `publishQueue(): Flow<{pending, failed}>`
  mapping one `observeAll()` emission into both lists, so the transition is atomic
  to the consumer; `pendingPublishes`/`failedPublishes` became thin `.map`
  projections. Rule: when two derived views must stay mutually consistent, derive
  them from **one** source emission, never two subscriptions.
- **`OutboxRepository.retry(cmid)` already existed** (revive EXHAUSTED → PENDING,
  fresh budget) but had no caller — wiring it through `StoryRepository.retryPublish`
  + a VM intent that kicks `OutboxFlushWorker` is all the recovery loop needed.
  Added a sibling `discard(cmid)` (plain `deleteAll`, emits no outcome — a user
  removal is not a delivery outcome) so a permanently-failing publish isn't a dead end.
- **A public `UiState` can't hold an `internal` nested type.** `StoriesUiState`
  (public, read by the screen + exposed via the public VM `StateFlow`) carries
  `List<StoryPublishFailures.Item>`, so `StoryPublishFailures` had to be public
  (matches `StoryCountDots`). "Function 'public' exposes its 'internal' parameter
  type" is the compiler telling you a public surface leaks an internal type.

## Decisions (cont.)
- **A module pins `build-tools;34.0.0`.** The env recipe installs `35.0.0` only;
  the first `:feature:stories:testDebugUnitTest` failed with "Failed to install
  build-tools;34.0.0" (Gradle's auto-install can't reach the SDK repo through the
  proxy). Fix once per fresh container: `sdkmanager "build-tools;34.0.0"`. Tracked:
  align the pinned build-tools across modules (or add 34.0.0 to the ROUTINE recipe).
- **Photo/video picker = `ActivityResultContracts.PickVisualMedia`, not legacy
  `GET_CONTENT`.** Needs `implementation(libs.androidx.activity.compose)` on the
  feature module for `rememberLauncherForActivityResult`. Keep the VM testable by
  passing it a clean `MediaUploadItem` (bytes already read) — the `ContentResolver`
  read (bytes/MIME/`OpenableColumns.DISPLAY_NAME`) stays in the Composable on
  `Dispatchers.IO`; filename/MIME defaulting lives downstream in `MediaUpload`, so
  the reader is a thin, exempt glue function with no branch logic worth a JVM test.
- **Story media product rule lives in the VM, not the SDK.** `onMediaPicked`
  encodes "when to upload / append vs replace / gate publish while uploading / how
  to surface each failure" → `:feature:stories`. `MediaRepository.upload` +
  `MediaUpload` part-builder + wire→domain mapper stay opaque building blocks in
  `:sdk-core`/`:core:*`. Draft `canPublish` admits **text OR media** so a caption-
  less image story is valid (iOS-surpassing — iOS has no story media composer).
- **Media cap belongs in the pure draft, enforced at the VM upload-gate.** `MAX_MEDIA`
  + `remainingMediaSlots` (clamped ≥0) live on `StoryComposerDraft`; the cap also
  gates `canPublish` so an over-cap draft can never publish. `onMediaPicked` reads the
  free slots and `items.take(remaining)` BEFORE the upload — truncating the pick, not
  the result, so we never spend an upload on media that won't fit, and the cap holds
  even if a future multi-pick hands in more than `remaining`. Surface a warning + skip
  the network entirely when already full (`remaining <= 0`).
- **#979 was held on a pre-existing `main` red, not its own.** When the ONLY red CI job
  is failing on `origin/main` itself (verify: `git show origin/main:<test-file>` shows
  the same breakage) AND the PR diff touches zero files in that job's scope, merging an
  `apps/android`-only PR cannot regress `main`. The "never merge past red CI" rule
  guards against *introducing* a regression; a pre-existing, out-of-scope red that the
  run directive tells you to merge through is the documented exception. Always re-confirm
  the red is pre-existing + out-of-diff before merging, and record the proof in the log.

- **`dependsOn` was persisted but never honoured (fixed in `outbox-dependency-gating`).**
  `OutboxEntity.dependsOn` + `OutboxMutation.dependsOn` shipped with the outbox runtime
  but `OutboxDrainer.drainLane` ignored it — a chain was a no-op. The gate is now a pure
  `OutboxDependencies.verdict(prerequisiteState)`: **gone (null) = SATISFIED** (a chain is
  enqueued prerequisite-first, so an absent row has already succeeded), `PENDING`/`INFLIGHT`
  = BLOCKED (hold the lane, dependent stays PENDING for the next pass), `EXHAUSTED` = FAILED
  (cascade-exhaust the dependent — it can never run). The prerequisite can live on **another
  lane** (`OutboxRepository.stateOf(cmid)` looks it up by cmid, lane-agnostic), which is the
  point: an upload on the `MEDIA` lane, a publish on `STORY` that `dependsOn` it. BLOCKED
  *stops the lane* (like a transient failure) rather than skipping — preserves the strict
  FIFO-per-lane invariant uniformly; message rows never carry `dependsOn` so this branch
  only ever affects the upload/publish lanes. Remaining gap for the real chain: the upload's
  returned real `mediaId` must be written into the dependent publish's payload before the
  gate opens (next slice) — gating alone holds the order but doesn't yet rewrite the id.

- **Durable bytes need their own table — the outbox payload is a `String`
  (`media-blob-store`).** An `UPLOAD_MEDIA` row can't carry raw file bytes in the
  outbox; persist them in a dedicated `MediaBlobEntity`/`MediaBlobDao` keyed by the
  upload row's `cmid` and read them back in the `MEDIA`-lane sender. The
  `MediaBlobStore` wrapper deliberately reuses `MediaUploadItem` (single bytes shape —
  the store persists exactly what `MediaRepository.upload` consumes, no second type).
  Two Room footguns confirmed: (1) a `ByteArray` field makes a `data class` equals/
  hashCode reference-compare the array — use a **plain `class`** (same call already
  made on `MediaUploadItem`); (2) adding an entity bumps `@Database(version=…)` (5→6
  here) — safe with the existing `fallbackToDestructiveMigration()` since an in-flight
  blob is transient (it re-queues), no bespoke migration needed. Assert bytes with
  `assertThat(actual.bytes).isEqualTo(expected)` (Truth does an array content compare),
  not entity equality.

- **Worker senders stay thin; the *decision* moves to a pure object
  (`media-upload-sender`).** `OutboxFlushWorker`'s sender lambdas aren't unit-tested
  (they're WorkManager glue). For a sender with real branching (blob gone / offline /
  empty result / real id), extract a pure `MediaUploadSender.send(item, upload)` that
  returns a `SendResult` and unit-test all four arms with a fake `upload` lambda; the
  worker lambda is then just "look the blob up → `send` → `remove` on any non-transient
  outcome". The producer-half enqueue (`MediaUploadQueue.enqueue`) writes the blob
  **before** the outbox row so a queued upload never lacks its bytes, and shares **one
  `cmid`** across blob + row + (future) dependent publish placeholder. Blob cleanup is
  symmetric: drop it on `SuccessWithId`/`PermanentFailure` in the sender glue **and** in
  `onExhausted` (repeated transient → exhausted keeps the bytes until the give-up), or it
  leaks. Gotchas: `UploadedMedia` lives in `me.meeshy.sdk.model` (not `.media`); and
  `:sdk-core`'s `media` package does **not** use `explicitApi`-style `public` modifiers
  (bare `class`/`object`) while the `outbox` package does — match the *package-local*
  convention, don't blindly add `public`.

- **Offline-media composer fallback (`story-composer-offline-media`).** The "when to
  fall back to the durable chain" decision is a **product policy → app-side**: a pure
  `MediaUploadRetryPolicy.isQueueable(ApiError)` in `:feature:stories` (null status /
  429 / 5xx → queueable; other 4xx → dead end), NOT in the SDK. Adding an optional param
  to an SDK function consumed via mockk (`enqueuePublish(req, dependsOn = null)`) **breaks
  existing mockk stubs** silently: `coEvery { f(capture(s)) }` no longer matches the now
  2-arg call, the relaxed mock returns the default, and the slot never captures →
  "slot not captured". Fix = extend every stub/verify to the new arity
  (`f(capture(s), any())`), which is *adapting* not weakening. **`io.mockk.captureNullable`
  is not in this mockk version** — to capture a nullable param whose actual value is
  non-null, use a plain `slot<String>()` + `capture(slot)` (non-null actual ⇒ matches).
  Keep the offline path **single-pending**: the outbox `dependsOn` is one cmid, so one
  pending upload per publish stays provably correct; reject a 2nd pick + multi-item batches
  rather than ship a broken multi-`dependsOn` chain. Centralise the combined wire ids in
  **one** derivation (`UiState.draftMediaIds = attachments.ids + pending?.cmid`) and feed
  `withMediaIds(next.draftMediaIds)` from every mutator (applyUploaded/queueDurably/remove)
  — else a later success silently drops the pending placeholder. The pending preview tile
  renders the held `ByteArray` straight through Coil (`AsyncImage(model = bytes)`); make it
  removable so it's never a dead end.

- **Multi-dependency outbox gate (`outbox-multi-dependency`).** The single-pending constraint
  above was a deliberate *temporary* guard until the gate could express **several** prerequisites.
  It now can: `OutboxMutation.dependsOn` is a `Set<String>` encoded into the **one** `dependsOn`
  TEXT column by `OutboxDependencyKey` — wrapped-delimited (`{a,b}`→`"|a|b|"`, `'|'` reserved/absent
  from a `cmid`), so a *membership* test is a substring `LIKE`. Two gotchas that shaped the design:
  (1) a `cmid` is `cmid_<uuid>` and contains `_`, a `LIKE` wildcard — `likePattern` **escapes** it
  and the DAO query must use `ESCAPE '\'` (Kotlin string: `"… ESCAPE '\\'"`), else `cmid_a` spuriously
  matches `cmidXa`; a regression test (`up` must NOT match member `upload`) guards it. (2) `decode`
  must tolerate a **bare** value with no delimiter → singleton, so existing single-dep rows/tests keep
  resolving — that let every prior drainer test keep its behaviour while only the *storage format*
  changed (no schema/migration: same column). Gate priority: in `verdictAll`, **`FAILED` dominates
  `BLOCKED`** — one exhausted prerequisite means the dependent can never run, so cascade-exhaust now
  rather than wait on the others. Keep the key/gate **pure in `:sdk-core`** (no product policy); the
  composer's "when to queue / how many pending" rule stays app-side. Changing `enqueuePublish`'s param
  `String? → List<String>` again rippled into mockk stubs — `slot<String>()` → `slot<List<String>>()`
  and `isEqualTo("x")` → `containsExactly("x")` (same adapting-not-weakening pattern as the offline
  slice). The composer **UX** relaxation (`pendingUploads: List`, drop the single-pending guard) is a
  separate slice — splitting the SDK primitive from the UI kept this diff thin and every prior test green.

## 2026-06-28 — multi-slide composer foundation (`story-slide-deck`)
- **Open a big feature with its pure structural model, not its UI.** The multi-slide composer
  (feature-parity §E line 433) is large; the first slice is `StorySlideDeck` — an immutable
  reducer owning the slide CRUD rules — with **no wiring yet** (same "primitive first, UX next
  slice" pattern as `outbox-multi-dependency` / `media-blob-store`). Keeps the diff tiny and the
  rules 100% JVM-tested before any Compose canvas glue exists to obscure a bug.
- **Two invariants, enforced in `init`:** a deck always holds **≥1 slide** and **≤`MAX_SLIDES`=10**
  (iOS `maxSlides`). `init { require(slides.isNotEmpty()); require(slides.any{it.id==selectedId}) }`
  — construction-time guards mean every op can assume a valid deck (no defensive nulls downstream).
  `selectedIndex`/`selectedSlide` are total because the selected id is invariant-present.
- **Total functions over throwing.** Every op returns `this` (same instance) when inapplicable —
  cap reached (`addSlide`/`duplicate`), last slide or unknown id (`removeSlide`), unknown id / no-op
  (`move`/`select`). Tests assert `isSameInstanceAs(deck)` for the inert arms — a strong, cheap
  behavioural check that the reducer didn't allocate a spurious new state. Mirrors the iOS
  composer's silent-guard CRUD without porting its mutable `@MainActor` state (the deprecated
  `StorySlideManager` was an explicit SSoT violation — Android uses one pure model from the start).
- **Caller-supplied ids keep the reducer pure.** `addSlide(newId)`/`duplicate(sourceId, newId)`
  take the new id as a param rather than minting a UUID inside — no `Math.random`/clock, so the
  reducer is deterministic and the ViewModel (next slice) owns id minting. `removeSlide` reselects
  the slide that **takes the removed one's place** (`next[index.coerceAtMost(lastIndex)]`), i.e. the
  former neighbour, and the new-last when the selected last is removed — the natural carousel UX.
- **Placement = `:feature:stories` (product), not `:sdk-core`.** The deck encodes composer UX rules
  ("when can I add", "always keep one", "what gets selected after a remove") → product orchestration,
  same module as `StoryComposerDraft`. An SDK atom would be agnostic to those policies. Grain test
  from `packages/MeeshySDK/CLAUDE.md` applied.

## `story-canvas-transform` — pure 2D pan/zoom that *persists* per slide (2026-06-29)
- **Persisted, not ephemeral.** The fullscreen image viewer's `ImageViewerTransform` (in `:sdk-ui`)
  is throwaway per-session viewer state. The story canvas transform is **part of the slide's
  identity** — it survives slide switches, is carried by `duplicate`, and rides into publish. So it
  lives on `StorySlide.transform` in `:feature:stories` (product state), NOT as an SDK atom and NOT
  in transient Compose `remember`. Same shape of clamp math, opposite lifecycle — don't conflate them.
- **Clamp the offset to the *new* scale inside `apply`.** Order matters: compute `nextScale` first,
  then clamp the translated offset to `maxOffset(size, nextScale)`. This makes a pinch-out tighten the
  pan range *and* snap a now-out-of-range offset back toward centre in the same gesture. Clamping to
  the old scale would let the content drift off-edge for one frame.
- **`maxOffset = (size·scale − size)/2`** — the symmetric half-overflow of the scaled content. No
  division anywhere, so a not-yet-measured 0px canvas just yields `0` (no div-by-zero guard needed);
  a unit test pins this (`apply(.., canvasWidth=0f, canvasHeight=0f)` → offset 0).
- **Composable stays glue.** All math is in the pure object; `StoryCanvasSurface` only measures the
  canvas (`onSizeChanged`), forwards each `detectTransformGestures` callback verbatim to
  `onCanvasTransform`, and applies the result via `graphicsLayer`. Zero testable decisions in Compose
  → nothing lost to the JVM coverage gate. `isIdentity` lets it skip the layer at rest.
- **Default field keeps existing tests byte-identical.** Adding `transform = IDENTITY` to `StorySlide`
  with a default means every prior `StorySlide(id=..)` / deck test still constructs the same value —
  only genuinely new per-slide-transform behaviour needed new tests.

## `story-text-element-transform` — per-element pinch/rotate (2026-06-29)
- **Extend `normalised()`, don't bolt clamps onto every mutator.** Adding `scale`/`rotationDeg` to
  `StoryTextElement`, I made `normalised()` re-pull *all* continuous fields (x/y/scale/rotation) into
  range. Because the deck's `updateTextElement` already calls `.normalised()` after every transform,
  every reducer (move/style/transform) re-clamps for free — one place, no per-mutator clamp drift.
  `transformed()` still clamps directly too (mirrors `nudged`), so the value is sane even if called
  raw; `normalised()` is then idempotent.
- **Non-finite is a real gesture input.** A `detectTransformGestures` zoom can be `0`/`NaN` on a
  degenerate pinch. `clampScale` guards `isFinite()` → `DEFAULT_SCALE` (coerceIn would pass `NaN`
  straight through — `NaN.coerceIn` returns `NaN` because every comparison is false). `normaliseRotation`
  guards the same. Both have a unit test pinning the non-finite arm.
- **Rotation wrap = `(-180, 180]`.** `% 360` then `+360` if `<= -180`, `-360` if `> 180`. `-180` maps
  to `180` so `±180` are one canonical value; `360`→`0`, `540`→`180`, `270`→`-90`. Tested each arm.
- **One gesture, three effects.** Switching the per-element `detectDragGestures` → `detectTransformGestures`
  lets a single two-finger gesture pan (→ `onTextElementMoved`) *and* pinch-scale + rotate (→
  `onTextElementTransform`). Single-finger drag still pans. More natural than separate handle chips
  (CLAUDE.md UX rule). The Composable forwards `zoom`/`rotation` verbatim — zero testable decision lost
  to the JVM gate; `graphicsLayer { scaleX/scaleY/rotationZ }` renders around the layer centre while the
  `offset` keeps using the *unscaled* measured size, so centring stays correct under scale.
- **Wire fields already existed.** `StoryTextObject.scale`/`rotation` were on the `:core:model` port
  from day one but always left at defaults; this slice is purely `:feature:stories` consuming them — no
  SDK/model change, keeps the diff `apps/android`-only.

## `story-canvas-snap-guides` — magnetic snap + safe-zone on drag (2026-06-30)
- **Snap the delta, reuse the reducer.** Rather than add an absolute `placeTextElement` reducer (which
  would orphan `moveTextElement`/`nudged`), the snap-aware `onTextElementMoved` computes the resolver's
  snapped centre, then moves by `snap.x - element.x` / `snap.y - element.y` through the **existing**
  `StorySlideDeck.moveTextElement` delta path. One reducer, no orphan, the canvas clamp still lives in
  `nudged`. The existing corner-clamp test (`drag 0.9,-0.9 → (1,0)`) stays green untouched because the
  far corner is beyond every guide's threshold (snapping is a no-op there) — proof a magnetic enhancement
  need not break the raw-move contract.
- **Per-axis independent snap.** `resolve` snaps x against vertical guides and y against horizontal guides
  separately, so an element can lock to the centre column while its row slides free — matches iOS. Guides
  are `[1/3, 0.5, 2/3]` on each axis (rule-of-thirds + centre). Min guide gap (0.167) ≫ threshold (0.025),
  so a centre is ever within threshold of at most one guide — `minByOrNull` then a single threshold check
  is enough; no tie-breaking needed.
- **`coerceIn` doesn't guard `NaN` (again).** Snap's `clampCoord` does `if (value.isFinite()) coerceIn(0,1)
  else CENTER`. A `NaN`/∞ drag candidate (degenerate gesture) collapses to the canvas centre instead of
  poisoning the position. Same lesson as `clampScale` — pin the non-finite arm with a test.
- **Transient feedback, cleared on lift.** Guide lines + the out-of-bounds verdict live in
  `StoryComposerUiState.snapFeedback: SnapFeedback?` — set during drag, cleared by `onTextElementDragEnd()`.
  It's *transient UI feedback*, never persisted on the element; the element only carries its snapped x/y.
- **Compose drag-end without reimplementing `detectTransformGestures`.** That detector never returns (its
  internal `awaitEachGesture` loops forever), so you can't append an `onEnd` after it, and a parallel
  detector on the **Main** pass would see consumed events and cancel early. Pattern that works: a second
  `pointerInput` running `awaitEachGesture { awaitFirstDown(false); do { awaitPointerEvent(Final) } while
  (changes.any { pressed }) ; onDragEnd() }`. The **`Final`** pass observes events *after* the transform
  detector consumed them and only watches `pressed`, so it fires exactly on lift without stealing the
  gesture. Pure glue (JVM-exempt); the testable decision (clear vs keep) is the VM's `onTextElementDragEnd`.

## `story-text-element-zorder` — z-order restack (2026-06-30)
- **The list order IS the z-order.** The canvas renders `slide.elements.forEach { TextElementLayer(...) }`,
  so later items paint on top → index 0 = back, `lastIndex` = front. Z-order needs **no new field on the
  element** — restacking is a pure list move within the holding slide. `TO_BACK`→0, `TO_FRONT`→lastIndex,
  `BACKWARD`→from-1, `FORWARD`→from+1, all `coerceIn(0, lastIndex)`; `target == from` ⇒ inert (same
  instance). This keeps the model minimal and the publish serialisation unchanged (order already rides).
- **Same-`when`, four arms, one `coerceIn` covers all boundaries.** Mapping each `StoryZOrder` to a target
  index then a single clamp + `target == from` guard collapses "already at front/back" and "single
  element" into one inert path — no per-op boundary branches to miss. Test sweep: 4 op-arms × (move +
  inert-at-extreme) + unknown-id + single-element + cross-slide isolation = full branch coverage in 13
  reducer tests.
- **VM must guard `copy` to keep the same-instance contract.** `_state.update { it.copy(deck = reducer(...)) }`
  always mints a NEW `UiState` even when the reducer returned the same deck — so `isSameInstanceAs(before)`
  would fail and an inert tap churns recomposition. Pattern: `val deck = state.deck.reorder(...); if (deck
  === state.deck) state else state.copy(deck = deck)`. Same shape as `onTextElementDragEnd`'s null-guard.
  Always pair a "returns same instance when inert" reducer with this guard at the VM edge.
- **Step-0 conflict recovery (PR #1048).** A prior slice's PR can still be **open with conflicts** when
  main advanced past its base. Recipe: `git fetch origin main <pr-branch>`; `git checkout -B <pr-branch>
  origin/<pr-branch>`; `git rebase origin/main`; resolve keeping **both** sides (additive state fields /
  imports / doc entries); `meeshy.sh check`; `git push --force-with-lease` (fall back to a plain `push -u`
  if the remote ref was deleted out from under you → "couldn't find remote ref"). Verify with the merge
  tool; the maintainer may merge it concurrently — re-`get` the PR to confirm `merged:true` before moving on.
- **Reuse canvas geometry across element types (`story-sticker-elements`).** A new on-canvas object
  (sticker) shares the *exact* clamp/wrap rules of `StoryTextElement` (coord `0..1`, scale `0.3..4`,
  rotation `(-180,180]`). Don't re-derive them — call `StoryTextElement.clampCoord`/`clampScale`/
  `normaliseRotation` from the new model so the geometry lives in **one** unit-tested place. Reads slightly
  oddly ("a sticker using a text-element companion") but it's pure canvas math and keeps single-source-of-
  truth. Mirror the deck reducer family verbatim (`add*ToSelected`/`remove*`/`update*`/`move*`/`transform*`)
  so most behaviour falls out of the established, tested pattern.
- **`when(tile)` exhaustiveness is your friend.** Adding `ComposerContentTile.STICKER` made the screen's
  `when (tile)` non-exhaustive → compiler error until the new branch was wired. Free guarantee that a new
  enum content-tile can't be silently unrendered (a dead-end tile). Same for any `when` over a sealed/enum.
- **Grid `items` vs list `items` import clash.** `StoryComposerScreen` already imports
  `androidx.compose.foundation.lazy.items` (LazyRow). For a `LazyVerticalGrid` use
  `import androidx.compose.foundation.lazy.grid.items as gridItems` to disambiguate — importing both
  un-aliased compiles but is fragile; the alias is explicit.
- **Mutually-exclusive canvas selection.** When two selectable object kinds share a canvas (text element vs
  sticker), each select/add intent must clear the *other*'s selection (`selectedTextElementId = null` when
  selecting a sticker and vice-versa), and `mirrorDraftToSelection` must drop *both* stale ids on a slide
  switch — otherwise a slide change can leave a phantom remove-handle on an object not on the visible slide.

## Decisions (cont.) — Calls area kickoff (2026-06-30)
- **Calls started with the pure FSM, not the WebRTC plumbing.** First Calls brick = a pure
  call-lifecycle reducer (`core:model` `me.meeshy.sdk.model.call`: `CallState`/`CallEndReason`/
  `CallEvent`/`CallStateMachine.reduce`). Faithful port of iOS `CallManager.CallState` +
  `WebRTCTypes.CallEndReason`. The transition table is THE thing to get right (iOS only validates it
  informally — a real FSM validator is a P1 todo in `tasks/calls-sota-plan-2026-06-05.md`), so it's the
  highest-leverage, most-testable first slice. WebRTC/Telecom/FCM plumbing is glue-heavy → comes after.
- **Why `core:model` and not a new `:feature:calls` module yet.** SDK-purity grain test: the FSM is a
  stateless, parameter-driven building block agnostic to product orchestration → it belongs with the
  codebase's other pure domain logic (`EmojiUsageRanker`, `ConversationFilter`, `LanguageResolver`),
  not behind new-module wiring. The `:feature:calls` VM + screen that *consume* it (giving it a real,
  non-orphan consumer) are the very next slice. A pure FSM in `core:model` is NOT a dead-end screen —
  the reviewer's "no dead-end screens" is about navigation/UX, and SDK-purity explicitly endorses
  stateless building blocks.
- **FSM shape that keeps branch coverage honest + safe:** model phase only (media-type/mute live
  alongside, never inside the state — matches iOS); make every inapplicable (state, event) pair
  **inert** (return the same state) so the machine is total and idempotent; let terminal `Ended` leave
  only via `Settle`→`Idle` so it always settles and never loops. A shared `terminal(event)` helper maps
  the from-any-active-phase enders (LocalHangUp/RemoteHangUp/ConnectionFailed) so each per-state `when`
  stays short. Reconnect budget (`attempt >= maxReconnectAttempts`, default 3 per iOS) → boundary tests
  at both default max=3 and max=1.
- **Merge-gate: unblock-then-merge a stale ⚠-blocked PR before the new slice.** PR #1135 had been
  blocked on a pre-existing red `main` (web a11y test). Step 0 each run: if the prior PR is blocked on
  `main`, re-check `main`'s latest CI — once green, rebase the blocked branch onto it
  (`git rebase origin/main`, force-with-lease push), re-run CI, and squash-merge once green. Never merge
  past red CI; the red must be gone (fixed on `main`), not bypassed.

## Realtime socket lifecycle (slice `realtime-session-coordinator`, 2026-07-02)
- ⚠ **The realtime layer was entirely dead until this slice.** `SocketManager.connect()` had **zero
  callers in production** and no socket manager's `attach()` (message/social/call) ran anywhere. Only
  `SocketManager.connectionState` was ever observed (for the connection banner). So no `call:*`,
  `message:*` or social frame could reach any ViewModel — the whole `attach()`/`events` machinery built
  over prior loops was orphaned. If you wire a new socket manager, remember it also needs its `attach()`
  called from `RealtimeSessionCoordinator.attachAll()`, or it stays dead.
- **Attach must follow every connect, and exactly once per socket.** `SocketManager.on(event, cb)`
  registers on the current `_socket` and **no-ops when `_socket` is null** — so `attach()` before
  `connect()` silently loses every listener. And `disconnect()` nulls `_socket`; a later `connect()`
  mints a **new** `Socket` (socket.io's internal auto-reconnect reuses the *same* instance and keeps its
  listeners, but a full disconnect→connect does not). Therefore the rule encoded in the pure
  `RealtimeLifecyclePlan`: sign-in emits `[Connect, Attach]` **in that order**, and `Attach` is paired
  with **every** `Connect` (a logout→login re-attaches on the new socket) — NOT an "attach once ever"
  flag, which would leave the second session's socket listener-less.
- **`SocketManager.reconnectWithToken()` (disconnect+connect on token refresh) still has no caller.**
  When a token-refresh path is wired, it must also re-attach (it mints a new socket) — either route it
  through the coordinator or call `attachAll()` after it. Tracked follow-up.
- **Driver placement.** The "when to connect" edge is product orchestration → driven from `AuthViewModel`
  (`:feature:auth`, the app-level auth holder created above the NavHost in `MeeshyApp`, so effectively
  process-lifetime for the session). The coordinator + pure plan are stateless-ish SDK building blocks in
  `:sdk-core`. The `@Singleton` coordinator dedups on the edge, so a VM recreation can't double-connect.

## Compose Navigation route shape for nullable values (slice `incoming-call-deeplink`, 2026-07-02)
- **A required path arg must be non-empty, or `navigate()` throws.** Compose Navigation compiles a path
  placeholder `{arg}` to the regex `[^/]+` (one-or-more non-slash). A route built with a blank value —
  e.g. `call/${Uri.encode("")}/…` → `call//…` — has an empty segment that the regex won't match, so
  `navController.navigate(route)` throws `IllegalArgumentException: destination … cannot be found`. And
  `Uri.getPathSegments()` **silently drops** empty segments, so a test parsing `path.split("/")`/
  `pathSegments` won't even see the collapse — it just shifts indices and passes for the wrong reason.
- **Fix: for any route field that can be blank/nullable, use an OPTIONAL QUERY ARG, not a path arg.** A
  static path + `?a={a}&b={b}…` with `navArgument { … ; defaultValue = … }` (and `nullable = true` for
  strings) matches with the arg present-blank OR absent, binding the default — never a crash. We migrated
  `CallRoute` from `call/{conversationId}/{peerName}/{video}` to a static `call?…` query route so an
  incoming call with no room (gateway may omit `conversationId`) still deep-links safely. Prefer this shape
  from the start for routes carrying free-text names or optional ids.
- **Test the route by decoding it back through the SSOT, not by string-splitting.** `Uri.parse(route)
  .getQueryParameter(ARG)` (auto-decoded) → `CallRoute.config(...)` → assert on the real `CallConfig`. That
  survives an encoding change (path→query) without rewriting the behavioural intent, and it asserts the
  actual value the screen drives rather than a positional segment literal.
- **`MainActivity` intent → NavHost deep-link.** Keep the decision pure: `MainActivity` reads the intent
  extras into a plain `LaunchExtras` (thin, untestable glue) and calls `LaunchRouter.route(...)`; hold the
  result in `mutableStateOf`, recompute in both `onCreate` and `onNewIntent` (a running Activity gets
  `onNewIntent`, not a fresh `onCreate`). `MeeshyApp` navigates from a `LaunchedEffect(route, isAuth)` — gate
  on `isAuthenticated` so a not-yet-logged-in cold launch defers the route across the login gate — then a
  `onLaunchRouteConsumed` callback nulls the state so a recomposition never re-navigates.
- **⚠ A self-rescheduling `while(true){ delay }` loop in `viewModelScope` HANGS `runTest`.**
  `call-duration-timer` first shipped the 1-Hz timer as `viewModelScope.launch { while (isActive) {
  delay(1000); elapsed++ } }`. Any existing test that merely *reached* the connected phase then spun a
  gradle worker at 100% CPU forever: `runTest`'s end-of-test `advanceUntilIdle()` chases the infinite
  chain of virtual-time-scheduled `delay` continuations and never idles (the ticker always has one more
  task queued). A `SharedFlow.collect` that just *suspends* (like `signalManager.events`) is fine — it
  schedules no timed task — which is why only the `delay`-loop version hung. **Fix / pattern:** inject the
  tick source as a `Flow<Unit>` seam (`CallSecondsTicker` interface + `@Binds RealCallSecondsTicker`, whose
  prod impl is the `flow { while(true){ delay(1000); emit(Unit) } }`), and collect it in the VM. Tests pass
  a fake backed by a `MutableSharedFlow<Unit>` and drive the clock with plain `emit(Unit)` calls — fully
  deterministic, no `advanceTimeBy`, no wall-clock, and impossible to hang because the fake schedules no
  timed work. Same grain as every other "push the decision out of the untestable primitive" lesson: the
  ticker is the primitive, the elapsed-count logic is what we test.

## 2026-07-03 — env: gradle wrapper dist download is 403-blocked; use `/opt/gradle`
- In a fresh web container the wrapper's `distributionUrl` (services.gradle.org →
  github releases) returns **403 through the agent proxy**, and the cached
  `~/.gradle/wrapper/dists/gradle-8.11.1-bin/` holds only a `.lck`/`.part` (incomplete).
  `./gradlew` / `meeshy.sh` therefore can't bootstrap.
- **Recipe:** a matching system gradle is preinstalled at `/opt/gradle/bin/gradle`
  (8.11.1 — same version the wrapper pins). Run tasks with it directly, e.g.
  `export ANDROID_HOME=$HOME/android-sdk ANDROID_SDK_ROOT=$HOME/android-sdk &&
  /opt/gradle/bin/gradle assembleDebug testDebugUnitTest --console=plain`. Maven
  dependency resolution goes through the proxy fine; only the wrapper's own dist zip is
  blocked. (Follow-up if it recurs: pre-seed the dist, or point `distributionUrl` at a
  reachable mirror — but that touches `apps/android/gradle/…`, a legit apps/android edit.)

## 2026-07-03 — pattern: parallel *identity* stream beside the identity-less FSM `events`
- The call socket layer republishes a decoded FSM `CallEvent` on `CallSignalManager.events`
  — deliberately **identity-less** (`ReceiveIncoming`/`RemoteHangUp`/`RingTimeout` carry no
  `callId`). When a feature needs the *identity* of a frame (which call?), do **not** widen
  `events` or the `map` contract (that breaks every existing mapper/manager test). Instead add
  a **parallel `SharedFlow`** fed by a separate pure decode: `incomingOffers` (call-waiting
  raise, from `call:initiated`) and now `endedCalls` (banner dismiss, from `call:ended`/
  `call:missed`) both follow this shape — pure `CallSignalMapper.{incomingOffer,endedCallId}`
  decode + `_flow.tryEmit` in `listen`, collected in the VM. Keeps `map`/`events` frozen, adds
  zero risk to the FSM path, and each stream is independently unit-testable.
- **Known limitation this exposes (next Calls slice):** because `events` is identity-less, a
  teardown for a *different* call (e.g. the waiting call's `call:ended`, which the gateway fans
  out to member USER rooms) is folded into the *active* call's FSM as `RemoteHangUp` and wrongly
  ends it. The `endedCalls` banner-dismiss is correct and self-contained, but the full fix is an
  **identity-aware active-call teardown**: gate the FSM teardown so only a teardown whose `callId`
  matches the active call reduces it. Deferred to keep this slice thin and non-test-breaking.

## 2026-07-04 — pattern: durable absolute-state mutations (block/unblock) via the outbox
- Block/unblock are **opposite terminal states**, not deltas — but they coalesce **exactly**
  like the reaction add/remove toggle: a queued opposite for the same target **annihilates**
  (the pair returns the user to the last-synced server state; the optimistic `BlockCache` flip
  the second call made is the correct net state), and a repeated same-kind row is **superseded**
  (idempotent). So reuse the reaction-toggle shape in `OutboxCoalescer`, don't invent a new one.
- **No payload needed**: like `DELETE_MESSAGE`, the kind (`BLOCK_USER`/`UNBLOCK_USER`) + `targetId`
  carry everything; `payload = ""`. That means **no DB migration** — a cheap durable slice.
- **Delivery-exhaust rollback is the worker's job, not the VM's** (precedent: `markReadOptimistic`).
  The VM writes optimistically + enqueues + wakes `OutboxFlushWorker`; it only rolls back on a
  **local enqueue failure**. A *delivery* hard-exhaust rolls the **SSOT** (`BlockCache`) back in the
  worker's `onExhausted`, and the list re-hydrates truthfully on next `load()`. Do **not** wire the
  VM to `OutboxRepository.outcomes` for per-cmid list restoration — no existing durable mutation does,
  and it adds a stateful cmid→row map for a rare tail case the SSOT already corrects.
- **Wake the worker only on a real cmid**: `OutboxRepository.enqueue` returns `null` when the incoming
  mutation annihilated a pending opposite — nothing to deliver, so schedule no `WorkManager` request
  (mirrors `ConversationListViewModel.runPrefMutation` gating on the "something was queued" boolean).
- **Enqueue-repo tests go Robolectric**: a repository that calls `OutboxRepository.enqueue` needs a
  real in-memory `MeeshyDatabase` (`Room.inMemoryDatabaseBuilder` + `RobolectricTestRunner`) — the
  established `StoryRepositoryTest`/`MediaUploadQueueTest` pattern. Assert the queued row via
  `outbox.deliverable(lane)`; don't mock the final `OutboxRepository`.

## 2026-07-05 — resolved: the lane-in-drain-list gotcha, structurally (outbox-lane-map-ssot)
- The 2026-07-04 follow-up ("a worker drain-list test that asserts every lane with a registered
  sender is drained") is **closed — one better than a test**. Instead of a Robolectric worker test
  guarding the hand-maintained `lanes` list, the list is **gone**: a new pure `OutboxLaneMap`
  (`sdk-core/.../outbox/OutboxModel.kt`) is the SSOT `OutboxKind → OutboxLaneAssignment`
  (`PerConversation` | `Shared(lane)`, exhaustive `when` → every kind must have an assignment or it
  won't compile), and `OutboxFlushWorker` now drains `OutboxLaneMap.sharedDrainLanes` (derived,
  deduped, stable enum order) instead of a literal `listOf(...)`. A kind with a registered sender can
  no longer be stranded on an undrained lane — the BLOCK/FRIEND omission class is now impossible, not
  merely tested for. Bonus: the derivation drops the always-empty `PRESENCE`/`SOCIAL` lanes (no kind
  maps there, no enqueue site) from the sweep — a behaviour-preserving no-op (draining an empty lane
  did nothing). +9 pure tests over `assignmentFor`/`sharedDrainLanes` (per-arm mapping, dedup,
  per-conversation exclusion, non-blank invariant, BLOCK/FRIEND regression). **Lesson generalised:**
  when two lists must stay in lockstep (senders keyed by kind ↔ lanes drained), don't guard the drift
  with a test — **derive one from the other** so the drift can't exist.

## 2026-07-04 — pattern: durable friend-request send + the lane-in-drain-list gotcha
- **Adding an `OutboxKind` + `OutboxLanes.X` is NOT enough — you MUST also add lane `X` to the
  `OutboxFlushWorker` shared-lane drain list.** The prior `block-outbox-durable` slice added
  `OutboxLanes.BLOCK` + senders but forgot the drain list, so block/unblock rows never delivered (a
  silent no-op, invisible to the JVM tests because there is no worker integration test). This slice
  added both `BLOCK` and `FRIEND` to the list. **Follow-up: a worker drain-list test** (Robolectric)
  that asserts every lane with a registered sender is drained would have caught it — worth wiring.
  ✅ **RESOLVED 2026-07-05 (`outbox-lane-map-ssot`)** — went one better: derived the drain list from a
  kind→lane SSOT (`OutboxLaneMap`) so the drift is structurally impossible. See the 2026-07-05 entry above.
- **Optimistic flip of a shared singleton cache must come AFTER the durable enqueue commits, not
  before.** `DiscoverViewModel.connect` first flipped `FriendshipCache` (an app-wide `@Singleton`)
  then enqueued in a `viewModelScope` coroutine — a cancellation between the two (VM cleared on
  nav-away) left a **phantom `PendingSent`** in the cache with no queued row and no rollback, wrong on
  every screen until a hydrate. Fix: enqueue first, flip only on a non-`null` cmid (the local Room
  write is sub-ms, so it is still effectively instant). This differs from `BlockedListViewModel`,
  which flips its **own** `_state` list (dies with the VM) — a cache-derived VM has no such safety, so
  order matters. Deleted the local-enqueue-failure rollback path entirely (nothing to undo).
- **A `SEND` overrides the drainer's "404-as-success" default** (ARCHITECTURE.md §5). That rule is for
  idempotent deletes (404 = already gone). `FriendRequestSend.classify` maps 404 → permanent reject +
  rollback (404 = receiver not found), never success — else a pending would strand toward a
  non-existent user. Documented inline so the divergence reads as intentional.
- **Known optimistic-drift edges (reconciled by a later hydrate, deferred):**
  1. The gateway returns **409 for a friendRequest in EITHER direction and any status** (already
     friends / inbound-pending / previously-rejected), so `409 → AlreadyExists` can leave the button
     showing "Pending sent" when the truth is "Friends"/"Accept". A proper fix triggers a
     friendship re-hydrate on 409 rather than trusting the optimistic placeholder.
  2. **Cancel-while-queued**: cancelling a still-queued (placeholder) send does not annihilate the
     outbox row (no cancel-via-outbox path yet), so on delivery `Delivered → didSendRequest` can
     resurrect it. When the "cancel a pending sent request" flow lands, route it through a
     `CANCEL_FRIEND_REQUEST` coalescer rule that **annihilates** a pending `SEND_FRIEND_REQUEST` to
     the same receiver (mirror the send+delete message annihilation).

## 2026-07-04 — env gotcha: the Gradle wrapper distribution is 403-blocked; use system gradle
- **`./gradlew` cannot bootstrap in this container.** The wrapper downloads
  `services.gradle.org/distributions/gradle-8.11.1-bin.zip`, which 302-redirects to
  `github.com/gradle/gradle-distributions/releases/...` — a host the egress policy **blocks (403)**.
  The cached dist under `~/.gradle/wrapper/dists/gradle-8.11.1-bin/` is a **partial** (`.part`+`.lck`
  only), so the wrapper never completes.
- **Fix:** a system Gradle is preinstalled at `/opt/gradle/bin/gradle` (8.14.3). Run the build with
  `gradle <tasks>` instead of `./gradlew`. AGP 8.7.3 runs fine under it. Maven Central + Google Maven
  are allowed, so **do NOT pass `--offline`** (the AGP plugin marker isn't pre-cached → resolution
  fails). `meeshy.sh` calls `./gradlew`, so invoke `gradle` directly for `assembleDebug`/
  `testDebugUnitTest` until a full wrapper dist can be primed.

## 2026-07-05 — durable-preference codec: record-token (JSON) vs enum-token variant
- The theme/language stores persist a **single enum token** with a pure `when`-based codec. The
  notification block (`settings-notification-prefs`) persists a **whole record**
  (`UserNotificationPreferences`, 30+ fields), so the codec round-trips as **JSON**, not an enum
  string. Kept the same corruption-proof contract: `notificationPreferencesFromStorage(raw)` wraps
  `decodeFromString` in `runCatching` → blank/absent/malformed/wrong-shape all degrade to
  `UserNotificationPreferences()` defaults; `ignoreUnknownKeys` drops legacy fields; `encodeDefaults`
  makes every field survive the round-trip. Same `:core:model` purity (private `Json` instance,
  precedent `CallSignalMapper`) + `:sdk-core` DataStore store + `stateIn(Eagerly)` hydration pattern.
- **ViewModel intent shape for a multi-field record:** don't add 30 setters. One private
  `updateNotifications { copy(field = value) }` read-modify-writes the whole block from
  `store.preferences.value`, so a single toggle never clobbers the others (tested by the
  successive-toggles-compose case). Screen: push is the **master** — sub-toggles `enabled = pushEnabled`
  so a coherent parent/child relationship, no dead ends.

## 2026-07-07 — Kotlin `combine` arity cap (5 typed flows) — chain, don't widen
- `ChatViewModel`'s message-stream already `combine`d **5** flows (the typed-overload ceiling:
  messagesStream, currentUser, ownReactions, showingOriginal, recipientCount). Adding a 6th (the
  locally-hidden set for `chat-delete-for-me-vs-everyone`) can't extend the same call — the 6-arg
  `combine` is the untyped `vararg`/`Array<*>` form and would lose all the types.
- **Fix:** keep the typed 5-combine producing `BubbleInputs`, then `.combine(store.hidden) { inputs,
  hidden -> inputs to hidden }` and destructure in `collect`. Preserves full typing, no `Array` casts.
  Prefer this two-stage chain over promoting to the vararg overload whenever you cross 5 sources.
- **Local-only "delete for me" pattern:** a durable `SharedPrefs…StringSet` store exposed as
  `StateFlow<LocallyHiddenMessages>`, `.combine`d into the stream, and applied as a pure
  `filterNot { hidden.isHidden(id) }` before building bubbles — no repo/outbox/network touched. The
  pure set value returns `this` on a no-op `hide` so the SharedPrefs layer skips redundant writes.

## Lesson (2026-07-08, `chat-pinned-banner`)
- **Adding a `MessageSocketManager` stream ⇒ update the `ChatViewModelTest` mock.** The test builds the
  socket with a **non-relaxed** `mockk<MessageSocketManager> { … }`, so every collected flow must be
  stubbed with `every { flowName } returns …`. A new stream the ViewModel collects (e.g.
  `messagePinned`/`messageUnpinned`) throws `MockKException` at construction until you add the stub — add a
  `MutableSharedFlow` field + `every { this@mockk.messagePinned } returns …` alongside the existing ones.
- **Deriving read-side state from the existing bubble stream avoids new plumbing.** The pinned banner is a
  pure computed `ChatUiState.pinnedBanner = PinnedMessages.of(messages.map { it.toPinnable() })` over the
  already-combined `messages` — no extra combine source, no repo change. Cross-client live updates come for
  free by having the socket pinned/unpinned collectors call `messageRepository.refresh(conversationId)`
  (same pattern as `messageDeleted`/`messageUpdated`).
- **Stable newest-pick on ties:** `maxByOrNull` keeps the *last* max; for "newest pin, ties→earliest in
  list order" write a small `maxByStable` that only replaces on a strict `>` — keeps the first max.
