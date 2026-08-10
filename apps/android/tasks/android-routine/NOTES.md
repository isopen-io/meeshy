# Notes — lessons & memory

Append-only log of gotchas and decisions that save time next run.

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`NOTES-archive-2026-08.md`](./NOTES-archive-2026-08.md) (same append/oldest-first order).

## Slice `chat-slow-mode-cooldown` (2026-07-25)
- **No new VM constructor param needed for slow mode.** The interval + viewer exemption ride in on the
  existing `conversationRepository.conversationStream` fold, and the clock was already an injected
  `CacheClock`. So the slice touched `ChatViewModel`/`ChatUiState`/`ChatScreen` in place — no `harness()`
  signature change, existing tests untouched. Prefer folding new derived state onto an existing stream
  over widening the constructor when the inputs are already flowing in.
- **Edits must bypass a send-rate gate.** `ChatViewModel.send()` handles both new sends *and* edits
  (`editingMessageId != null → applyEdit; return`). Place any slow-mode/rate guard **after** the edit
  early-return so an edit is never throttled — mirror the composer (`enabled = canSend && (isEditing ||
  slowMode.canSend)`).
- **Ceil the remaining-seconds countdown**, never floor: a floor lets the UI read "0s" while the send is
  still blocked. `((remainingMillis + 999) / 1000)`.
- **Android string format specifiers vs perl/sed.** Adding `<string>…%1$ds</string>` via `perl -0pi -e`
  silently ate `$ds` ($d = perl var). Use a literal-safe editor (Edit tool or a `sed` with the exact
  literal) for resource strings containing `$`.

## Slice `composer-send-gate` (2026-07-25)
- **Consolidate scattered client-side gates into one pure verdict.** `send()` checked slow-mode only;
  `sendFileAttachment()` checked neither slow-mode nor permissions and never recorded the cooldown stamp.
  A single `ComposerSendGate.evaluate(kind, affordances, slowMode)` folding both `ComposerAffordances`
  and `SlowModeState` lets every send path enforce identical rules — cheaper to reason about than N
  ad-hoc `if` checks that drift. When two paths "should behave the same", make the sameness a value.
- **Precedence matters and must be a test.** A hard capability denial outranks the cooldown; the reverse
  order would let a denied guest's block surface a misleading countdown. Assert the winner *and* that no
  residual timer leaks (`cooldownSeconds == 0` on a capability block).
- **Record the send stamp on EVERY new-message path, not just text.** Moving `lastSelfSentAtMillis` into
  `sendFileAttachment` is what makes file↔text share one cooldown. A gate that reads a stamp is only as
  correct as the paths that write it — audit all writers when you add a reader.
- **Compute the classifier inputs before the coroutine.** `sendFileAttachment` resolved mime inside
  `viewModelScope.launch`; the gate needs the kind *synchronously* to decide before any state mutation.
  Hoist mime/messageType above the gate and reuse them inside the coroutine (no double resolution).
- **`ComposerSendKind.entries`** (Kotlin 1.9 enum entries) works here — used it to assert the gate permits
  every kind under a full posture without hand-listing them.

## Slice `chat-encryption-disclaimer` (2026-07-27)
- **The conversation carries `encryptionMode` on the wire, not the message.** The first
  `encryptionMode` grep hit was on `MessageAttachment` (`Core.kt`), a red herring — the field the
  E2EE notice needs lives on `ApiConversation` (mirrors iOS SDK `CoreModels.swift` Conversation,
  shared `message-types.ts` `'e2ee' | 'server' | 'hybrid'`). `ApiConversation` did NOT have it; added
  it. Lesson: when porting a View-level flag, trace it to the exact model the ViewModel reads
  (`conversationStream` emits `ApiConversation`), don't trust a same-named field on a sibling type.
- **JSON-blob cache = free field round-trip.** `conversationStream` decodes an `ApiConversation` from a
  Room `payload` string blob, so a new `@Serializable` field persists and rehydrates with zero Room
  schema/DAO change. Contrast with field-mapped entities where a new field silently drops through cache.
- **Map iOS gate names to the real Android state fields, and test the mapping.** iOS
  `!hasOlderMessages && !isLoadingInitial` → Android `!hasMoreOlder && !showSkeleton`. `hasMoreOlder`
  defaults `true` (so the notice stays hidden until pagination reaches the top — correct). Two
  ui-state derivation tests guard against inverting either field; the mutation proof showed they fail
  exactly when the guards are dropped.
- **Inject top-of-list chrome as a `ChatListItem` row, never a separate LazyColumn `item {}`.** All
  scroll math (`InitialScrollTarget.of`, reply-jump `indexOfFirst`, `isNearBottom(lastIndex)`) reads
  `listItems` indices; a `ChatListItem.EncryptionNotice` prepended inside `buildChatListItems` keeps
  every index consistent, whereas an out-of-band header item would shift them by one and desync the
  open-scroll target.
- **`MediaDownloadPreferencesStoreTest` is load-flaky.** Under a full parallel `check`, its
  `dataStore_hydratesAlreadyPersistedChoiceOnConstruction` timed out at 15s (real DataStore on a temp
  file, `StateFlow.first()`); it passes in ~6s in isolation. Not caused by an `apps/android` diff — if
  a full `check` reddens only on this test, re-run it isolated before treating the gate as failed.

## Slice `category-picker-create` (2026-08-08)
- **A pure decision core sitting unused for weeks is a strong "next slice" signal — verify what's
  actually still missing before assuming the whole follow-up is one slice.** `ConversationCategoryPicker`
  (resolve/canCreate/submit) shipped 2026-07-26 with a "TagInputField + CategoryPickerField composables"
  follow-up that got recommended in every subsequent run's "Next slice" note without being picked, likely
  because it reads as one large "build a whole preferences screen" slice. Re-scoping to just the
  **category** half (tags need a net-new wire field, `ApiConversation` has none — out of scope) and
  wiring it into the **already-shipped** long-press "move to category" dropdown (instead of a new screen)
  turned it into a normal-sized slice: one new Retrofit method, one repository method, one ViewModel
  method, and a Composable rework of an existing menu section.
- **A cache-first repository's "create" write should self-serve the snapshot, not just trigger a
  revalidate.** `CategoryRepository.create` appends the POST response straight into
  `CategorySnapshotStore` (`store.save(current + created, now)`) rather than calling `refresh()`
  afterward — the new category is selectable in the *same* frame the create call resolves, no extra
  network round-trip. The later `category:created` socket echo the gateway broadcasts to the creating
  device is a harmless idempotent re-upsert (`UserCategoryCatalog.upsert` keys by id), confirmed by
  reading `CategoryEvent`/`UserCategoryCatalog.upsert` before relying on it — don't assume idempotency,
  trace the fold.
- **Reuse the existing reassignment guard instead of re-deriving "is this a no-op".** A freshly created
  category can never equal the conversation's current category id, so
  `createCategoryAndAssign` calls straight into `reassignCategory(id, newId)` rather than
  `repository.setCategoryOptimistic` directly — one idempotency rule, one place, and the outbox-flush
  scheduling that `runPrefMutation` already wires stays correct for free.
- **`remember(expanded) { mutableStateOf("") }` resets ephemeral menu-local state on every reopen.**
  Keying the search-query `remember` on the `DropdownMenu`'s own `expanded` boolean gives a fresh state
  instance each time the menu transitions to visible, without needing an explicit `LaunchedEffect` reset —
  cheaper than threading a reset callback through `onDismiss`.

## Slice `session-logout-teardown` (2026-08-09)
- **A "Next slice" note is a hypothesis, not a fact — re-prove it against the actual code before
  spending a run on it or before choosing something else because of it.** The routine's own
  "category expand/collapse toggle still unbuilt" recommendation (recorded in `feature-parity.md` §B
  after `category-picker-create`) was flat-out wrong: `CollapsibleSection` has had a working
  `clickable { expanded = !expanded }` header since its very first commit (`560dce4e9`, phase-4 design
  system), months before that note was written, and `ConversationListScreen` already wraps every
  section in one. Nobody had actually opened the component before writing the note. Cost ~10 minutes
  to catch by reading the file instead of trusting the claim — cheap insurance against burning a whole
  run on already-done work. Same discipline the iOS-dette lane already mandates ("RE-PROUVER avant de
  corriger") applies equally to the Android lane's "Next slice" pointer, even though `ROUTINE.md`
  doesn't say so explicitly today.
- **"Recommended in every run's Next-slice note but never picked for 15+ runs" is a real signal — but
  it can mean two different things, and they need different responses.** For `category-picker-create`
  it meant "reads as one big slice, actually isn't" (fix: re-scope it down, do it). For the paged
  `OnboardingFlowView` Compose scaffold it means the opposite: it genuinely IS oversized for one
  slice — 8 step screens, zero registration-wizard UI existing yet beyond `LoginScreen`/
  `GuestJoinScreen`, and the PROFILE step alone needs a photo-picker + compression pipeline. Don't
  pattern-match "recurring but unpicked" straight to "just re-scope and ship it" — check the actual
  remaining surface area first. Left a concrete decomposition (named sub-slices, starting with a
  `auth-onboarding-shell` pager+PSEUDO-step slice) in `feature-parity.md` §A instead of either
  attempting the whole thing or re-listing it as one vague bullet for run #16.
- **Room's `RoomDatabase.clearAllTables()` is a real, first-class "wipe everything" primitive — reach
  for it before hand-rolling per-DAO `clear()` calls.** One call replaces N `dao.clear()` calls across
  every entity and stays correct automatically as new entities/tables are added (iOS's `CacheCoordinator
  .reset()` — the parity target — is the same "wipe every store" shape). It's a **blocking** call
  though (not `suspend`), so it must be dispatched (`withContext(Dispatchers.IO)`) — calling it
  straight from a `viewModelScope.launch` body (Main dispatcher) would violate `StrictMode`/hang the UI
  thread on a real device even though Robolectric's JVM test won't catch that.
- **`Room.inMemoryDatabaseBuilder(...).allowMainThreadQueries().build()` (Robolectric) is the existing,
  proven pattern for testing real Room behaviour in this repo** (see `OutboxRepositoryTest`) — reuse it
  for anything that needs to prove a *real* Room effect (like `clearAllTables()`) rather than mocking
  `MeeshyDatabase` and only checking the mock recorded a call. A seeded-then-wiped-then-reread
  assertion is strictly stronger evidence than `verify { database.clearAllTables() }`.
- **A store's `clearAll()` sibling to its existing `clear(id)`/`save()` is cheap to add and worth
  adding proactively when a teardown seam needs it**, rather than reaching into the DataStore
  `Preferences` object from outside the store's own file. `DataStoreCategorySnapshotStore.clearAll()`
  and `DataStoreConversationDraftStore.clearAll()` are both one-liners (`dataStore.edit { it.clear() }`)
  because each backing file is dedicated to exactly one store — safe to nuke the whole file. Would need
  a narrower `prefs.asMap().keys.filter { ... }.forEach(prefs::remove)` if a DataStore file were ever
  shared between two stores; it currently isn't for either of these two.
- **Changing a repository method from sync to `suspend` ripples to every constructor call site in
  tests, not just the direct caller.** `AuthRepository.logout()` becoming `suspend` broke compilation
  in three test files (`AuthRepositoryTest`, `AuthViewModelTest`, `RegistrationViewModelTest`) purely
  because their `AuthRepository(...)` constructor calls needed the new `SessionTeardown` parameter —
  `grep -rn "AuthRepository("` across the whole tree before declaring the change done is cheaper than
  discovering the second and third call sites one gate-failure at a time.
- **`PROGRESS.md` is now 14k+ lines, ~10x the ~1500-line hygiene threshold in `ROUTINE.md`, and has
  been over that threshold for a while (it was already 14283 lines at the start of this run) —**
  archiving it is a real, standalone follow-up (move everything but the ~300 most recent lines to
  `PROGRESS-archive-<YYYY-MM>.md`, dedicated commit per the hygiene section) that no run has actually
  done yet. Flagging rather than attempting it inside this slice's run — it's a big enough diff to
  deserve its own dedicated pass, not a rider on a security-fix slice.

## Slice `auth-onboarding-shell` (2026-08-09)
- **A "genuinely too large for one slice" verdict from a prior run is itself a hypothesis to re-check,
  not just its "next slice" pointer.** The previous run concluded the paged `OnboardingFlowView`
  Compose scaffold was oversized and left a concrete decomposition (`auth-onboarding-shell` as slice 1)
  instead of re-listing the whole thing. Re-proving that decomposition (not just trusting it) meant
  actually reading `RegistrationViewModel.kt`'s full public surface (`nav`, `fill`, `canProceed`,
  `next`/`previous`/`skip`/`jumpTo`) before writing a line of UI — every decision the shell needed was
  already there and already tested, which is what made "PSEUDO step only" a real, mergeable slice
  instead of another unpickable bundle.
- **A step with no field UI yet is a safe no-op, not a trap, if the proceed gate is already strict.**
  `RegistrationStepGate.canProceed` for PHONE/EMAIL/IDENTITY/PASSWORD/LANGUAGE all require non-empty
  field state (`phoneStepCanProceed("", null, false)` = false, same shape for the others) — so a
  placeholder step reached via a lucky `next()` just sits with a permanently-disabled primary button.
  No skip affordance is needed there either (`RegistrationNavModel.showSkip` is PROFILE-only). The one
  and only escape a placeholder step needs is Back, which the chrome already provides unconditionally
  off the first step — traced through the actual gate functions before relying on this, not assumed
  from the enum shape.
- **When a Compose container's body will grow one `when` arm per future slice, extract the "is this
  arm live yet" boolean into `:core:model` even though the dispatch itself stays exempt UI glue.**
  `RegistrationStepContent.isImplemented(step)` is one line of real logic (today: `step == PSEUDO`) but
  it's the single place next slice's author edits, and unlike an inline `when` fallback it comes with a
  test that will start failing the moment someone adds a step to the Composable's `when` without adding
  it here (or vice versa) — cheap insurance against future-slice drift, and it kept this slice honestly
  TDD-compliant (RED→GREEN→mutation-proof) instead of leaning entirely on the `TDD-COVERAGE.md` Compose
  exemption for zero new tests.
- **A new `LoginScreen` parameter with a default (`onSignUp: () -> Unit = {}`) is source-compatible
  with every existing call site** — `MeeshyApp.kt` was the only production caller and still needed
  updating (to actually wire the navigation), but nothing else (tests, previews) broke from the
  signature change. Cheaper than threading a nullable/optional through a wrapper.
- **`RegistrationViewModelTest` staying green and untouched (45/45) is itself the regression proof for
  a Compose-wiring-only slice** — the routine's `TDD-COVERAGE.md` exempts `@Composable` glue from new
  tests, but that's not licence to skip verification: re-running the existing VM suite after wiring the
  screen on top of it is what confirms the new UI didn't have to (and didn't) change any tested
  decision behaviour underneath.

## Slice `auth-phone-step-fields` (2026-08-09)
- **Branch from `origin/main`, never local `main`, in a shared multi-worktree checkout.** This session's
  `Étape 0` ran `git fetch origin main && git merge --ff-only origin/main` on the *routine* branch
  (`ops/android-ios-parity-routine`), which fast-forwards that branch's view of `origin/main` but does
  **not** touch the local `main` ref itself. `git checkout -b claude/apps/android/<slice-id> main` then
  silently branched off a local `main` that was ~150 commits stale (missing the previous run's merged
  PR #2684) — caught only because the freshly-created `RegistrationStepContent.kt` file didn't exist on
  the new branch. Fix: `git checkout -b <branch> origin/main` explicitly, every time, in this worktree
  setup — never bare `main`. Cheap to verify: after creating the branch, spot-check one file/symbol you
  know landed in the immediately-prior merged PR before writing any code.
- **A pure core field with a default nobody reads yet is a real signal the SSOT was built ahead of its
  consumer, not dead code.** `RegistrationSummaryInput.phoneDialCode` had existed since
  `auth-onboarding-shell` with a `""` default and zero callers passing it — exactly the same
  "already-shipped, unconsumed" shape as `ConversationCategoryPicker` before `category-picker-create`.
  Grepping for a pure core's fields that are always defaulted at every call site is a fast way to find
  a slice's real remaining surface before assuming a decision needs building from scratch.
- **Adding a real country picker to a field that previously accepted "type anything, including the dial
  code" is a genuine, minor breaking change to the field's contract — proving it via the debounced-probe
  test's expected value is what caught the arithmetic, not review.** The old test typed
  `"+33 6 12 34 56 78"` as a single blob (there was no separate country control) and asserted a
  digits-only probe. Once the dial code moves to its own picker, the phone `OutlinedTextField` can only
  ever hold national digits — re-typing the OLD test's input into the new field's semantics would silently
  probe a garbled number. Rewriting the test to the new, realistic input (national digits only) and
  asserting the E.164 `+`-prefixed combination is what the gateway's `/auth/check-availability` comment
  documents ("E.164 format") — catching along the way that concatenating a French trunk-prefix `"0"` into
  `dialCode + digits` (`"+330123456789"`, not `"+33123456789"`) is iOS's existing behaviour too (verified
  by reading `RegistrationViewModel.swift`'s `checkPhoneAvailability` before "fixing" it) — a faithful
  port preserves iOS's real behaviour, quirks included, rather than silently correcting them as an
  uncredited scope-creep fix.
- **A field the pure core already supports but no production caller populates is invisible to
  `./meeshy.sh check`** — `RegistrationSummaryInput.phoneDialCode` compiled and passed every existing
  test for weeks while permanently `""` in production, because `RegistrationUiState.summary`'s
  `RegistrationSummaryInput(...)` call site simply never named it. A green gate proves the *tested*
  behaviour, not that every accepted parameter is actually wired — re-reading a core's full input struct
  against its real call site (not just its test file) is the only way to catch this class of gap.

## Slice `auth-email-step-fields` (2026-08-09)
- **When a step's decision layer was fully built two slices ago "ahead of its UI", the wiring slice
  can legitimately need zero new ViewModel/core tests — verify that's true by re-running the existing
  suite, don't treat "no new VM tests" as a red flag on its own.** `signup-availability-probe`
  (2026-07-25) already shipped `onEmailChange`/`onEmailAvailability` and the debounced probe pipeline
  with full behavioural coverage; this slice only had to teach `RegistrationScreen` to render a field
  bound to state that was already correct. The regression proof is re-running
  `RegistrationViewModelTest` unmodified and confirming it's still 52/52 — a Compose-only slice with a
  passing *existing* suite is stronger evidence of "nothing broke" than a slice that had to touch the
  ViewModel at all.
  - **A missing capability (no skip button) is itself a decision worth verifying against both iOS and
  the local gate, not just omitting by default.** PHONE has `skipPhone` + an in-content skip button;
  EMAIL's gate (`SignupAvailabilityPolicy.emailStepCanProceed`) has no skip arm whatsoever. Before
  concluding "EMAIL doesn't need a skip button", both `RegistrationStepGate`'s EMAIL arm (no
  `skipEmail` state, no `||` short-circuit) and iOS `StepEmailView` (no skip control) were checked —
  matching absences on both sides is what makes "no skip" a faithful port rather than an
  accidentally-dropped affordance. Wiring a skip button that calls into a gate with no skip escape
  would have been worse than not wiring one at all (a dead button whose tap silently does nothing).
- **The RED-test-against-the-old-set trick doubles as its own mutation proof when a core is a single
  `Set` literal.** Writing `isImplemented_email_isTrue` before touching
  `RegistrationStepContent.implemented` and running it against the *unmodified* production code is
  simultaneously "prove RED" and "prove the mutation (reverting the one-line change) fails exactly this
  test" — no separate revert-then-rerun step needed when the production change is a single-line set
  literal with no other logic to accidentally break.

## Slice `auth-password-step-fields` (2026-08-09)
- **A same-named type on each platform is not proof of a faithful port — read both definitions before
  reusing or porting.** iOS declares TWO distinct `PasswordStrength` enums: a file-local one inside
  `OnboardingStepViews.swift` (4 bands: weak/fair/good/strong) used only by the onboarding
  `StepPasswordView`, and a separate one in `MeeshyUI/Auth/Components/PasswordStrengthIndicator.swift`
  (6 bands) used by `ChangePasswordView`/`ForgotPasswordView` — Android's `PasswordStrength` core
  already ports the *second* one. Diffing their scoring formulas (both sum the identical six booleans:
  length≥8, length≥12, uppercase, lowercase, digit, special-char) before assuming they're the same type
  is what made "reuse the already-shipped 6-band core for onboarding too" a defensible SSOT call
  instead of an accidental parity miss — same signal, more granular presentation, not different math
  silently substituted for the real one. The prior `auth-password-requirements` slice's note ("The
  strength *meter* score already existed") had already made this call; this slice just had to verify
  it before trusting it, per the routine's own "re-prove before picking" discipline.
- **A registration-branch's working tree is not automatically a `claude/apps/android/<slice-id>`
  branch — create the branch BEFORE editing files, not after.** This run wrote the RED test, the GREEN
  core change, the Compose body and all four locale files directly on the routine's own driver branch
  (`ops/android-ios-parity-routine`) before realising no slice branch had been created. Recovered
  cleanly with `git stash push -- <files>` (scoped to just the touched paths, not `-A`, to avoid
  sweeping up anything else live in the shared worktree), `git fetch origin main && git checkout -b
  claude/apps/android/<slice-id> origin/main`, then `git stash pop` — but the cheaper fix is sequencing
  right the first time: branch off `origin/main` as literally the first action of §Lane ANDROID step 2,
  before opening any editor on a single file, never after drafting the change.
- **Reusing an existing private Composable pattern across feature modules means duplicating it, not
  importing it, when the modules don't already share a UI dependency.** `ChangePasswordScreen`
  (`:feature:settings`) already has a private `PasswordField` (visibility-toggle `OutlinedTextField`)
  and `StrengthMeter`. `RegistrationScreen` (`:feature:auth`) needed the identical shape but the two
  feature modules don't depend on each other and Compose glue is exempt from the JVM coverage gate —
  extracting a shared component would be a legitimate but separate refactor (new `:sdk-ui` component +
  two call-site migrations), out of scope for a single field-UI slice. Duplicating ~15 lines of
  UI-only Composable code here is the minimal-impact call; flagged in `feature-parity.md` as a
  deliberate, not accidental, scope boundary.

## Slice `auth-language-step-fields` (2026-08-09)
- **A lazy list nested inside an already-scrollable `Column` crashes Compose — know this before
  reaching for `LazyColumn`/`LazyVerticalGrid` inside a step body.** `RegistrationScreen`'s step
  content sits inside the wizard's own `Modifier.verticalScroll(rememberScrollState())` `Column`.
  A `LazyVerticalGrid` (or `LazyColumn`) composed directly in there — unlike `CountryPickerSheet`,
  which lives inside its own `ModalBottomSheet` with a `heightIn(max = …)` bound — gets measured
  with an unbounded height and crashes at runtime ("Vertically scrollable component was measured
  with an infinity maximum height constraints, which is disallowed"). For a bounded, modest-size
  list (79 languages) the simplest correct fix is a **non-lazy** grid: `languages.chunked(2)`
  composed straight into the parent `Column`, no new import family, no height-bounding needed. Lazy
  layouts are only safe here when they own their own scroll container (a sheet, a fixed-height
  `Box`) — never bare inside a step body that's already inside the wizard's outer scroll.
- **When a core function's two returned fields play different "which one is active" roles, a
  Compose step body only needs local `remember` state for the role, not a mirrored copy of the
  core's data.** `LanguageStepSelection` operates on a slot (`LanguageSlot.SYSTEM`/`REGIONAL`) plus
  the read-only `LanguageSelectionState` snapshot already exposed via
  `RegistrationUiState.languageSelection`; the step body only needed one new piece of local UI
  state — which slot is *currently being edited* (`var activeSlot by remember { mutableStateOf(...) }`)
  — everything else (the two slots' current values, the filtered list, the preview) is a pure
  function of `state` + `activeSlot` + the search query, recomputed each recomposition via
  `remember(query)`. No new ViewModel state, no new core needed — the wiring is provably complete
  once every core function the step needs already exists (verified against `feature-parity.md`'s
  own follow-up note before starting).
- **A step's "Deliberately out of scope" note is only trustworthy if it's re-derived from the
  actual follow-up text, not assumed.** `feature-parity.md`'s own §A bullet for this step already
  separated "wire the picker UI" from "wire `SignupRegionInference` for a device-locale default"
  into two distinct follow-up sentences written back on 2026-07-21/07-22 — re-reading both before
  scoping this slice (rather than assuming the whole language step was one unit) is what kept the
  slice PHONE-sized instead of accidentally growing into a device-locale-detection slice too. Same
  discipline as `auth-phone-step-fields`'s "the phone-ownership recovery hint is a distinct,
  larger capability" call — a shipped-but-unwired core two slices away doesn't have to land in the
  same run as the field UI it eventually feeds.
- **Merging two iOS UI elements that convey the same information into one control is a legitimate,
  minor simplification worth calling out explicitly rather than doing silently.** iOS
  `StepLanguageView` renders the system/regional summary as an always-visible card pair *and* a
  separate pair of tab buttons that switch which slot the grid edits — four controls carrying
  three facts (system value, regional value, which slot is active). Merging summary-card and
  tab-button into one tappable card per slot (label + current value, tap = both "shows the value"
  and "activates editing") drops one redundant control row without losing any information the user
  could see or do on iOS. Flagged as a deliberate simplification in `feature-parity.md`, not an
  accidental parity miss — the same "SOTA note" discipline the `auth-language-step-selection-core`
  slice already established for this exact core.

## Slice `auth-recap-step-fields` (2026-08-09)
- **A pure core's enum missing a case iOS has is a decision to re-verify, not a gap to silently
  patch.** iOS `StepRecapView` appends a masked-password row (`••••••••`) outside its
  `summaryItems` array; Android's `SummaryField`/`RegistrationSummaryRow` (shipped
  `registration-recap-summary`, two slices before this one) simply has no `PASSWORD` case. The
  cheap, wrong move would have been to add one "for parity" without checking whether the omission
  was deliberate. Reading that slice's own `feature-parity.md` writeup first (its SOTA note lists
  three hardening edges over iOS but says nothing about password — meaning its exclusion, not its
  inclusion, was the actual design) turned "add a PASSWORD case to the core" into "leave the
  shipped, tested core alone and don't re-surface the password at all" — the more defensible
  security posture, not a missed port.
- **`Modifier.toggleable(role = Role.Checkbox)` is the idiomatic Compose equivalent of iOS's
  `.accessibilityAddTraits(.isSelected)` on a custom checkbox button** — it gives VoiceOver-
  equivalent TalkBack semantics (announces "checkbox, checked/unchecked") for free, without a
  manual `contentDescription` state string that would need to be kept in sync with `accepted` by
  hand. Reached for it instead of a bare `Modifier.clickable` + `semantics { contentDescription =
  ... }` block (the pattern every other custom tappable row in this file — `LanguageSlotCard`,
  `CountryPickerSheet`'s rows — uses, because none of them are actually a binary accept/reject
  toggle; RECAP's terms checkbox is the first row in the wizard that genuinely is one).
- **A step whose primary-button wiring was already fully correct before this slice is a real,
  cheap signal the remaining work is presentation-only.** `RegistrationNavModel.primaryAction ==
  REGISTER` on RECAP dispatching to `viewModel.register()` was already wired in
  `RegistrationScreen`'s `onPrimaryClick` since `auth-onboarding-shell` (RECAP being the wizard's
  last step, its primary action was always going to be `REGISTER`, decided the moment the nav
  chrome shipped) — this slice never had to touch `RegistrationBottomBar` or the click dispatch at
  all, only add the step body content above it. Confirmed by grepping the dispatch switch before
  writing anything, not assumed from the step's position in the wizard.
- **The shared `state.errorMessage` banner + bottom-bar `loading` param already cover what iOS's
  `StepRecapView` re-implements per-step (`isLoading`/`errorMessage` branches inside its own
  `body`).** Porting those internal branches into `RecapStepBody` would have duplicated state the
  wizard's outer `Column` already renders once, above every step, since `auth-onboarding-shell` —
  worth calling out explicitly in the tracking docs as a deliberate non-port rather than an
  oversight, the same discipline as the "no skip button" checks on EMAIL/IDENTITY/PASSWORD/
  LANGUAGE.
- **Reusing an existing string across two visually different controls (an icon-only top-bar Close
  button vs. a text `TextButton` dismissing a bottom sheet) is still the same semantic action** —
  `registration_close` (already used by `RegistrationTopBar`'s leading `IconButton`) was reused
  verbatim for `RecapTermsSheet`'s dismiss button instead of adding a near-duplicate
  `registration_recap_terms_close` string in ×4 locales. Different visual chrome, same meaning,
  one string — SSOT wins over "give every composable its own string for symmetry."

## Slice `auth-profile-step-fields` (2026-08-09)
- **A "too large for one slice" verdict repeated across four prior runs was never re-checked
  against the actual remaining surface — it was re-typed from the previous run's note each time.**
  Every "Next slice" pointer since `auth-password-step-fields` called PROFILE out as needing "its
  own photo/banner picker + compression pipeline" without anyone grepping whether Android already
  had one. It did: `feature/profile/AvatarBannerUploadViewModel` (picker → `ImageUploadValidator`
  → `MediaRepository.upload` → `UserRepository.updateAvatar`/`updateBanner`) has shipped and been
  fully tested since long before this routine started tracking PROFILE as a blocker. The actual
  gap was wiring, not a subsystem. Re-reading the note is not re-proving the note — the routine's
  own "RE-PROUVER" rule exists precisely because a stale note repeated verbatim by successive runs
  accumulates false authority the longer it goes unchallenged.
- **"No compression pipeline exists" turned out to be true, and that was fine.** iOS compresses
  avatar/banner JPEGs (`jpegData(compressionQuality:)`, `AttachmentUploader.compress`) before
  upload; Android's existing, already-shipped, already-tested avatar/banner flow uploads raw
  picked bytes gated only by a per-target byte ceiling (`ImageUploadTarget.maxBytes`, 8 MB avatar
  / 12 MB banner) and has done so in production for weeks without anyone building a compressor.
  The lesson isn't "Android needs to catch up to iOS's compression" — it's that a feature-parity
  note inferred from reading iOS's implementation can smuggle in an iOS-specific *technique*
  (compress-then-upload) as if it were a required *capability* (upload-a-reasonably-sized-image).
  Android already has the capability via a different, already-proven technique (size-cap instead
  of compress). Re-verify against what the OTHER platform's code actually requires functionally,
  not what its specific implementation happens to do.
- **A step's captured-but-not-yet-sent local state is a real data-loss trap if the "send it later"
  half is deferred without checking whether deferring is safe.** Early in this run's design the
  plan was to ship PROFILE's field-capture UI first and defer the post-registration upload wiring
  to a follow-up slice — mirroring how `auth-phone-step-fields`/`auth-language-step-fields`
  legitimately deferred `SignupRegionInference` wiring. The difference: deferring a nice-to-have
  auto-fill loses nothing a user typed; deferring PROFILE's upload would have silently discarded
  a picked photo the user believed they'd set, the moment they tapped "Create account." Not every
  "ship the field UI, defer the rest" precedent generalises — check whether what's deferred is an
  enhancement or user data before reusing the shape.
- **Reading iOS's `register()` line-by-line (not just its `@Published` properties) found that
  `profileImage`/`bannerImage`/`bio` never travel through `POST /auth/register` at all** — a fact
  invisible from the ViewModel's property list alone. iOS uploads them in a *separate* call chain
  (`OnboardingFlowView.uploadProfileCompletionAssets` → `ProfileCompletionUploader`) fired only
  after authentication succeeds, because the upload endpoints require a session that doesn't exist
  yet during the wizard. This shaped the entire Android port: bio/images could NOT be bundled into
  `RegistrationFields.toRegisterRequest()` (the pattern every prior field used), and instead needed
  their own post-success hook in `register()`. Skimming a ViewModel's stored properties to infer
  its wire contract misses this class of split; read the actual network call.
- **Compose disposes step-local state on navigating away from a `when`-dispatched step body — a
  picked `Uri` alone is not a safe place to hold data that must survive the user browsing back to
  RECAP and returning to PROFILE.** `RegistrationScreen`'s step container is a plain
  `when (state.currentStep)`, not a `Pager` keeping siblings alive off-screen; leaving PROFILE for
  RECAP fully disposes `ProfileStepBody`'s composition, and any `remember { mutableStateOf(...) }`
  in it resets on return. The fix was reading the picked file's bytes into a `MediaUploadItem`
  eagerly at pick time (mirroring the existing `ProfileScreen.kt` picker-callback pattern) and
  storing that in `RegistrationUiState` (ViewModel-owned, survives step navigation) rather than a
  bare `Uri` plus composable-local preview state.
- **Coil 2.7.0 ships a built-in `ByteArrayMapper`** (`coil.map.ByteArrayMapper`, confirmed by
  unzipping the cached `coil-base-2.7.0-runtime.jar` rather than assuming) — `AsyncImage(model =
  byteArray)` works with no custom `Fetcher`/`ComponentRegistry` needed. This sidestepped an
  entire Context-injection-into-the-ViewModel design (to re-read a `Uri` at upload time) that would
  otherwise have been needed purely to make local-picked-image preview work across step
  navigation, and kept `RegistrationViewModel` fully testable with plain `MediaUploadItem` values
  instead of a mocked `Context`/`ContentResolver`.
- **Awaiting a fire-and-forget upload inline (instead of a detached coroutine) is sometimes the
  correct Android port of an iOS `Task.detached`, not a corner cut.** iOS's `OnboardingFlowView`
  fires the post-registration asset upload as a genuinely detached task because the view dismisses
  itself ~1s later regardless. Android's `RegistrationScreen` has no such grace window —
  `LaunchedEffect(state.isRegistered)` navigates away the instant `isRegistered` flips, and
  `viewModelScope` is cancelled with it. A same-shaped detached-looking `launch` here would race
  that teardown non-deterministically. Awaiting the upload inside the same `launch` that already
  owns `register()`'s network call, before the final `_state.update`, trades a few hundred ms of
  extra spinner time for a guarantee the picked photo is never dropped — verified by a dedicated
  test that makes the upload throw and asserts `isRegistered` still ends up `true`.
- **`git diff origin/main...HEAD --stat` returning empty while `git status --short` lists many
  modified files is not a bug — it means nothing is committed yet.** Three-dot diff only compares
  committed trees; uncommitted working-tree edits never appear in it regardless of how large the
  diff will be once committed. Confirmed this by checking `git log -1` on local `main` vs.
  `origin/main` first (they'd diverged — local `main` had picked up an unrelated, unpushed commit
  from another concurrent worktree session, the exact shared-ref hazard `CLAUDE.md` already warns
  about) before concluding the empty diff meant something was wrong; it didn't — it meant "not
  committed yet," the expected state at that point in the run.

## Slice `auth-username-suggestion-strip` (2026-08-10)
- **When a headline item ("the OnboardingFlowView Compose scaffold is 8/8") makes the obvious
  thread disappear, re-read the CLOSED item's own follow-up text before falling back to the
  generic "Next slice" candidate list.** With the registration wizard fully wired, the prior run's
  "Next slice" note offered four options, none obviously best (device-locale inference, a
  large-and-recurring §C rewrite, a backend-blocked TagInputField, coverage-gate infra). A cheap
  first move that isn't in that checklist: grep the follow-up sentences hanging off *already-`[x]`*
  or `[~]` bullets in the same area — `signup-availability-probe`'s own entry had said "Follow-up:
  the username-suggestion strip … and the Compose onboarding screen" back on 2026-07-25; the
  Compose screen half got done across eight later slices but the suggestion-strip half never got
  its own line item in any "Next slice" list, so it silently accumulated seven weeks of not being
  picked without ever being flagged as blocked or hard. Confirmed real (not stale) with one grep
  for the symbols it would need (`usernameSuggestions`, `selectUsernameSuggestion`) before
  committing to it.
- **A shared generic helper's signature is not sacred — but changing it for one caller out of
  three isn't always the cheapest fix either.** `RegistrationViewModel.launchProbe`'s `probe`
  parameter is `suspend (String) -> Boolean?`, shared by the username/email/phone debounce
  pipelines. Only username's probe needed to report a second piece of data
  (`AvailabilityResult.suggestions`). Generalising `launchProbe` to `<T>` would have touched all
  three call sites for one caller's need; instead the username probe closure calls
  `onUsernameSuggestions(...)` as a side effect before returning the `Boolean?` `apply` still
  expects — exactly what iOS's own `checkUsernameAvailability` does (sets two `@Published`
  properties from one response inside one `do` block), so the "two things from one round-trip"
  shape isn't a workaround, it's the faithful port of how the source already models this.
- **`FlowRow` needs `@OptIn(ExperimentalLayoutApi::class)` on THIS `composeBom` (`2024.10.01`)
  even though it's used unguarded-looking elsewhere in the codebase** — `ChatScreen.kt` and
  `PostDetailScreen.kt` both opt in per-function (`@OptIn(ExperimentalLayoutApi::class)` right
  above the composable), it's just easy to miss scrolling past 2800+ lines of an unrelated file.
  Compiler error is a same-line, precise `The API of this layout is experimental` — cheap to find,
  but grep the existing `@OptIn(ExperimentalLayoutApi::class)` sites first rather than assuming
  `FlowRow` is unconditionally stable because it appears unadorned nearby in the same file (it's
  adorned two screens up, just off-screen).

## Slice `auth-signup-region-inference-wiring` (2026-08-10)
- **A `@HiltViewModel @Inject constructor` parameter with a Kotlin default value is NOT a usable
  test seam under Hilt** — Hilt still tries to satisfy every constructor parameter from the DI
  graph regardless of a default value, so `Locale.getDefault()` can't just be read inline inside
  `init` if the ViewModel needs to stay constructible with a controllable value in JVM tests (the
  host JVM's default locale is unpredictable across machines/CI, and even if it weren't, a bare
  `Locale.getDefault()` call has no seam for a test to override). The already-shipped
  `CacheClock`/`SystemCacheClock` pair (`sdk-core/cache/CacheClock.kt`, Hilt-bound in
  `SdkModule.providesCacheClock()`) is the established, working pattern for exactly this shape —
  a trivial `interface` + a `System*`-prefixed object default implementation, Hilt-bound, faked in
  tests — and it generalises cleanly to any other system/platform read a ViewModel needs
  (`DeviceLocaleProvider`/`SystemDeviceLocaleProvider` this run). No dedicated unit test was written
  for the `System*` implementation itself, matching the `SystemCacheClock` precedent (nothing to
  assert beyond "it calls the system API" — that would be tautological); the real behaviour lives
  in whatever consumes the interface, tested there via a fake.
- **Wiring a device-locale default into a step's proceed gate can silently flip a "user must act"
  step into "already pre-satisfied," and any test that relied on the old always-blank fresh-state
  default breaks as a legitimate consequence, not a regression to work around.** Android's LANGUAGE
  step gate is `fields.systemLanguage.isNotEmpty()`; before this slice `RegistrationFields()`
  defaulted `systemLanguage`/`regionalLanguage` to `""`, so the step always started blocked. Once
  `RegistrationViewModel.init` pre-fills both from the device locale (mirroring iOS, whose own
  `systemLanguage`/`regionalLanguage` are never blank either — they default to `"fr"`/`"fr"` even
  before `detectLanguages()` overwrites them), the step starts pre-satisfied — correct, matches iOS,
  and exactly the point of the slice. One pre-existing test
  (`register_blankRegionalLanguage_sendsNullNotBlank`) had implicitly relied on fresh state being
  blank to reach the "blank → sends null" wire-mapping branch; the fix is an explicit
  `vm.onRegionalLanguageChange("")` to reach that branch on purpose, not loosening the assertion —
  the pure `toRegisterRequest()` trim-to-null behaviour it protects is unchanged and still holds.
  Grep every test that asserts on a field's fresh-state value before wiring a new init-time default
  into it; only one such assertion existed here, but a wider field would need the same sweep.
- **A field fed by two independent optional inputs from the same source needs a wiring test that
  proves BOTH downstream consumers read the SAME source read, not two separately-injected values
  that happen to agree in every other test.** `applyDeviceLocaleDefaults()` calls
  `deviceLocaleProvider.regionTag()` twice — once inside the `inferLanguages` argument list, once
  inside `inferCountryIso`'s — both from the same provider call chain, not two independently mocked
  inputs. The
  `initialState_deviceRegionMapsToARegionalLanguageDistinctFromSystem_setsBoth` test picks a region
  (`"CM"`) that simultaneously resolves a regional-language map hit AND a known country, asserting
  all three fields in one scenario — this is what would catch a future refactor that accidentally
  wired `inferCountryIso` to a stale or hardcoded region instead of the same live read
  `inferLanguages` uses, which a test only ever setting one of the two inputs at a time could miss.
