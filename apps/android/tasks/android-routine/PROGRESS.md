# Progress — state & what to do next

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`PROGRESS-archive-2026-08.md`](./PROGRESS-archive-2026-08.md) (same prepend/newest-first order).
> On 2026-08-10 **mark-unread landed in the conversation context menu** (slice
> `conversation-mark-unread`, feature-parity §B, PR #2715). **RE-PROVEN before picking:** with Auth
> §A's fully-local items exhausted (per the previous run's note), the four standing candidates
> re-listed across the last several runs were the §C inverted-list rewrite (re-confirmed genuinely
> large, still deferred — see below for why this run did NOT attempt the promised decomposition),
> `TagInputField` (re-grepped `ApiConversation` for `tags`, still absent, still blocked), the Kover
> coverage-gate infra (lowest priority — infra, not a parity gap), and moving to
> Conversations/Chat per the `Auth → Conversations → Chat → …` build order. Rather than force the
> §C decomposition on faith, this run first swept §B's own "Reste" follow-up notes for a smaller,
> concretely-scoped, already-understood gap — found one at the swipe-actions bullet's "mute/lock/
> **mark-unread**/block/hide pending" list: a real half of the read/unread toggle Android was
> missing entirely (grepped `markUnread`/`mark-unread`/`MarkUnread` across all of `apps/android`,
> zero hits in any casing, before starting — this was not stale). Confirmed via iOS
> `ConversationContextMenuView.swift` (single `onMarkReadToggle` action, branching on
> `unreadCount > 0`) + `ConversationListViewModel.markAsUnread`/`ConversationStore`'s
> `.markAsUnread` case + the gateway's `POST /conversations/:id/mark-unread` route
> (`conversations/messages.ts`, distinct from the `mark-as-read`/`message-read-status.ts` route
> `markRead` already targets — no `mark-as-unread` alias exists) that this is a real, already-live
> server capability iOS already exposes and Android simply never wired. **Added (production, all
> `apps/android`):** `core:network` `ConversationApi.markUnread` (`POST
> conversations/{id}/mark-unread`); `sdk-core` `ConversationRepository.markUnreadOptimistic` (hints
> `unreadCount = 1` locally — the server stays authoritative on the exact count, matching iOS's own
> "hint ≥ 1, let the server correct it" comment; no-op, returns `false`, when the conversation is
> unknown or already unread, mirroring `markReadOptimistic`'s shape exactly); a new
> `OutboxKind.MARK_UNREAD` sharing the `READ_RECEIPT` lane (`OutboxLaneMap`); and
> `ConversationListViewModel.markUnread`, wired as a second `DropdownMenuItem` in
> `ConversationContextMenu` shown only when `!hasUnread` (an `if`/`else` against the existing
> `hasUnread`-gated "Mark as read" item, not two independent `if`s — exactly one of the pair is
> always offered, matching iOS's single toggle action). **Deliberate deviation from iOS, called out
> not silent:** iOS's `UserStateMutation.markAsRead`/`.markAsUnread` share one coalescing key
> ("readState") with always-replace (last-write-wins) semantics; Android's `OutboxCoalescer`
> instead routes `READ_RECEIPT`/`MARK_UNREAD` through the existing `terminalToggle` helper (the same
> opposite-terminal-state shape already used for block/unblock and pin/unpin) — a queued
> mark-unread followed by mark-read (or vice versa) **annihilates both** rather than replacing with
> the latest. Traced through both approaches by hand: on a true two-state toggle they always
> converge to the same final synced state, but `terminalToggle` additionally skips a redundant
> network round-trip when a fast undo returns to the pre-mutation server state (iOS's replace-only
> approach would still fire one no-op API call in that case) — **SOTA over iOS**, and reuses an
> existing SSOT helper rather than introducing an iOS-style shared-coalescing-key mechanism Android
> didn't have. **+3 `ConversationRepositoryTest`** (hints unreadCount=1 + queues MARK_UNREAD; no-op
> when already unread; no-op for an unknown conversation id), **+2 `ConversationListViewModelTest`**
> (calls the repository + schedules a flush; a no-op mutation schedules nothing), **+5
> `OutboxCoalescerTest`** (mark-unread-then-mark-read annihilates the mark-unread; mark-read-then-
> mark-unread annihilates the mark-read; a repeated mark-unread keeps the latest; a first
> mark-unread enqueues; a different conversation is not coalesced), **+1 `OutboxLaneMapTest`**
> (mark-unread shares the read-receipt lane). **Mutation (RED proof):** dropping the
> already-unread no-op guard in `markUnreadOptimistic` fails **exactly**
> `markUnreadOptimistic is a no-op when the conversation is already unread` (18 run, 1 failed, no
> collateral) — verified by hand (guard removed, ran the suite, restored, re-ran clean) rather than
> asserted from memory. **Gate:** `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL in 2m 4s`**
> (full `assembleDebug` + all-module `testDebugUnitTest`, 970 tasks), re-run clean after the
> mutation-proof restore. Reviewer **PASS** (diff `apps/android` only — `core/network`
> [`ConversationApi.kt` +1 endpoint], `sdk-core` [`OutboxModel.kt`/`OutboxCoalescer.kt`/
> `OutboxFlushWorker.kt` +1 kind +1 lane share +1 sender (unregistered-sender risk noted below, not
> introduced by this slice — see "Also flagged" at the end), `ConversationRepository.kt` +1 method],
> `feature/conversations` [`ConversationListViewModel.kt` +1 transition, `ConversationListScreen.kt`
> +1 menu item threaded through 3 composables, ×1 string ×4 locales]; SDK purity — the store/API/
> outbox additions are stateless building blocks at `markReadOptimistic`'s exact grain, the product
> decision (which action the menu offers) stays in `:feature:conversations`; SSOT — reused
> `OutboxCoalescer.terminalToggle` and `runPrefMutation` untouched, no re-implementation;
> instant-app — synchronous local write, no spinner; UDF — unchanged `ConversationListViewModel`
> shape, immutable `StateFlow<ConversationListUiState>`; no dead end; no tautological tests; no
> coverage floor lowered). **feature-parity.md's "Context menu" bullet gains the mark-read/
> mark-unread toggle note** (swipe-actions' own "mark-unread pending" note left as-is but annotated:
> it means swipe-gesture-specifically, not the whole feature — see feature-parity.md itself).
> **Also flagged, not fixed this run (scope discipline):** `OutboxFlushWorker.buildSenders()` is a
> plain non-exhaustive `mapOf`, not a compiler-enforced-complete `when` like `OutboxLaneMap` — the
> exact shape of bug class NOTES.md documents being fixed for `OutboxLaneMap` (BLOCK/FRIEND
> silently stranded off the drain list) could still recur here for a *sender* specifically (a kind
> with a lane assignment but no registered sender). This run's own `MARK_UNREAD` sender was added
> correctly and verified via the full local gate, but the structural gap in the map itself is a
> candidate follow-up for a future iOS-dette-style hygiene pass, not addressed here to stay within
> one slice's scope. **Next slice (no single obvious pick — re-verify each before committing a
> run):** the §C inverted-list rewrite's promised decomposition attempt is still outstanding (two
> runs in a row have deferred it after re-confirming it's large; a third re-confirmation without an
> attempt would be worth flagging explicitly rather than silently re-deferring again).
> `TagInputField` remains blocked on the same absent `ApiConversation.tags` field. The Kover
> coverage-gate infra remains the lowest-priority standing candidate. Also worth sweeping: other §B
> "Reste" follow-up notes (context menu's `details/invite/favorite/move/lock/block/delete`,
> pinned/muted/archived's `locked/favorited (emoji) pending`) may hide similarly small,
> concretely-scoped gaps the same way mark-unread did — worth checking before defaulting to a
> brand-new Conversations/Chat area slice.
>
> On 2026-08-10 the **server environment selector's app-side wiring landed** (slice
> `auth-server-environment-wiring`, feature-parity §A, the pure core's own follow-up, tracked since
> `auth-server-environment-selector` on 2026-07-21 and re-surfaced as "the next best candidate" by the
> previous run's note). **RE-PROVEN before picking:** re-read the bullet's own follow-up text (not just
> the "Next slice" pointer) and grepped `ServerEnvironment`/`ServerEnvironmentStore`/`apiBaseUrl` across
> `apps/android` outside `core/model` first — zero app-side hits, confirming the app-side wiring gap was
> real, not stale. Picked over the other three standing candidates (§C inverted-list, still flagged
> genuinely large; `TagInputField`, still blocked on an absent `ApiConversation.tags` field — re-grepped,
> still absent; the Kover coverage-gate infra) because it was the only one of the four that was fully
> local (no backend dependency) AND already scoped down to a concrete follow-up sentence in
> `feature-parity.md` itself. Re-read iOS `MeeshyConfig.swift` and `LoginView.swift`'s `environmentSelector`
> line-by-line (not just the pure core's own doc comment) to confirm the exact wiring shape: `applyEnvironment`
> persists `selectedEnvironment` unconditionally but only touches `customHost` on the `.custom` branch, the
> non-custom pill tap calls `applyEnvironment(env)` immediately while the `.custom` pill tap only flips
> local `@State` (no persistence) until the checkmark button's `applyCustomHost()` — a two-step
> select-vs-apply distinction easy to collapse into one if only skimming the follow-up sentence. **Added
> (production, all `apps/android`):** `:core:network` `ServerEnvironmentStore.kt` — interface +
> `InMemoryServerEnvironmentStore` + `SharedPrefsServerEnvironmentStore` (plain SharedPreferences, not
> encrypted — non-sensitive dev/QA config, unlike `TokenStore`), living in `core:network` next to
> `MeeshyConfig`/`NetworkModule` rather than `sdk-core` (deviates from the `SavedAccountsStore`/
> `SdkModule` precedent used by every other store so far — deliberate: `NetworkModule.providesMeeshyConfig()`
> is the one caller that needs the store at Hilt-graph-construction time, and `sdk-core` cannot be a
> dependency of `core:network` without inverting the existing module graph). `NetworkModule.providesMeeshyConfig(store)`
> now derives `apiBaseUrl`/`socketUrl` from `ServerEnvironmentResolver.apiBaseUrl`/`.serverOrigin` fed by
> the store — the Android equivalent of iOS `restoreEnvironment()` "at app launch" (both re-derive from a
> persisted selection once, before the first network call). `AuthViewModel` gains a 5th/6th constructor
> dep (`MeeshyConfig` — reused, not new; `ServerEnvironmentStore`), seeds `AuthUiState.selectedEnvironment`/
> `customHostInput` synchronously from the store at construction, and 3 new transitions:
> `selectEnvironment`/`onCustomHostChange`/`applyCustomHost` (see `feature-parity.md` §A for the full
> select-vs-apply behavioural spec). `logout()` now explicitly re-seeds the environment fields from the
> store — the same cross-account-survives-logout treatment as `savedAccounts`, caught by re-applying the
> `auth-saved-account-picker-ui` lesson ("a bare `AuthUiState()` reset silently wipes any field that must
> survive logout") proactively this time rather than after a failing test. `LoginScreen.kt` gains an
> `EnvironmentSelector` composable (Material3 `FilterChip` row + conditional custom-host field + "Connected
> to: %@" label) gated on `state.showEnvironmentSelector`, itself sourced from `config.enableLogging`
> (`BuildConfig.DEBUG`, reused not duplicated) as the Android-idiomatic equivalent of iOS's
> `Self.isSimulator` gate — called out as a deliberate simplification, not silent, since Android has no
> reliable simulator-vs-device signal. **Also called out:** a selection persists immediately but only takes
> effect on the next app launch, not mid-session — iOS's `APIClient` re-reads `MeeshyConfig.shared.apiBaseURL`
> per request from a mutable singleton, while Android's `MeeshyApi` bakes `apiBaseUrl` into a
> `Retrofit.Builder` at Hilt-graph construction; hot-swapping that live would be new architecture, out of
> this slice's scope. **+3 new `NetworkModuleTest`, +9 new `ServerEnvironmentStoreTest`, +10 new
> `AuthViewModelTest`.** **Mutation (RED proof):** making `select()` also overwrite `customHost` fails
> **exactly** `inMemory_select_neverTouchesTheCustomHost` (9 run, 1 failed, no collateral); dropping the
> environment-preserving fields from `logout()`'s reset fails **exactly**
> `logout_preservesTheServerEnvironmentSelection` (29 run, 1 failed, no collateral). **Gate:**
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL in 21s`** (full `assembleDebug` + all-module
> `testDebugUnitTest`, 970 tasks). Reviewer **PASS** (diff `apps/android` only — `core/network`
> [new `ServerEnvironmentStore.kt`, `NetworkModule.kt` rewired, +1 test dep], `feature/auth`
> [`AuthViewModel` +2 constructor deps +3 transitions, `LoginScreen.kt` +`EnvironmentSelector`, ×3 strings
> ×4 locales]; SDK purity — the store is a stateless persistence seam at `TokenStore`'s grain, no product
> rule; the product decisions (when to persist, selector visibility, "connected to" label) stay in
> `:feature:auth`; SSOT — reuses `ServerEnvironment`/`ServerEnvironmentResolver`/`config.enableLogging`
> untouched, no re-implementation; instant-app — N/A, synchronous SharedPrefs read, no network/spinner;
> UDF — unchanged `AuthViewModel` shape, immutable `StateFlow<AuthUiState>`; no dead end; no tautological
> tests; no coverage floor lowered). **feature-parity.md's "Server environment selector" bullet flips
> `[~]` → `[x]`.** **Next slice (no single obvious pick — re-verify each before committing a run):** with
> both fully-local Auth §A follow-ups now closed (saved-account picker, server environment selector), the
> three standing candidates are the §C inverted-list rewrite (still genuinely large — attempt a concrete
> sub-slice decomposition next time rather than deferring again), `TagInputField` (still blocked on the
> absent `ApiConversation.tags` field), and the Kover coverage-gate infra. The remaining non-wizard Auth
> §A items (magic-link, OTP verification, email/phone recovery) all confirmed still blocked on missing
> `AuthApi` endpoints as of the previous run. Next run should also weigh moving on to Conversations/Chat
> per the `Auth → Conversations → Chat → Feed → Stories → Calls → the rest` build order, now that Auth's
> cheaply-shippable, fully-local items are exhausted.
>
> On 2026-08-10 the **saved-account picker's app-side UI landed** (slice
> `auth-saved-account-picker-ui`, feature-parity §A, the pure core's own follow-up, tracked since
> `auth-saved-account-picker-core` on 2026-07-21). **RE-PROVEN before picking, not the §C rewrite
> re-typed from prior "Next slice" notes:** with the registration wizard, username suggestions, and
> device-locale wiring all closed, this run first re-verified the §C inverted-list message layout
> candidate against the real `ChatScreen.kt` (3050 lines) rather than accepting its "genuinely large"
> verdict on faith — confirmed genuinely large this time: the list has no `reverseLayout`, and
> bottom-anchoring is instead simulated via 7+ interacting `LaunchedEffect`s (auto-scroll-on-new,
> load-older-on-top-threshold, unread-boundary one-shot scroll, search-jump, quoted-reply-jump,
> pinned-day-header derivation) that all assume today's oldest-first top-down order — porting to a
> true inverted list (iOS's own `MessageListViewController` uses a genuinely flipped
> `CGAffineTransform(scaleX: 1, y: -1)` UICollectionView) would touch every one of them plus
> `buildChatListItems`' day-grouping, not a one-slice change. Left un-re-scoped rather than force a
> premature decomposition — no fresh sub-slice boundary was obvious from this read alone, next run
> should attempt one before deferring again. `TagInputField` re-confirmed still blocked (grepped
> `ApiConversation` for `tags`, still absent). Chose the saved-account picker instead: its own
> "Follow-up" text was fully self-contained (composable + a store + 4 wiring points), needed **no**
> new backend endpoint (unlike OTP/magic-link/email-recovery/phone-recovery, whose follow-ups all
> require net-new `AuthApi` methods this run confirmed don't exist yet — grepped `verifyEmailWithCode`
> /`resendVerificationEmail`/`requestMagicLink`/`requestPasswordReset`/`forgotPasswordPhone*` across
> `apps/android`, zero production hits outside docs), and re-reading iOS `LoginView.swift` line-by-line
> (not just `AuthManager`) confirmed the exact UI shape to port: `showPicker` gates a list/selected-
> account sub-state from the plain form, `.contextMenu` removes a row, tapping a row prefills
> `username` and jumps focus to a **second**, distinct `accountPassword` field. **Added (production,
> all `apps/android`):** `sdk-core/auth/SavedAccountsStore.kt` — `SavedAccountsStore` interface +
> `InMemorySavedAccountsStore` + `SharedPrefsSavedAccountsStore`, byte-for-byte the same shape as the
> already-shipped `StarredMessagesStore`/`SharedPrefsStarredMessagesStore` (JSON list under one
> SharedPreferences key, corrupt blob → empty, idempotent mutation skips the write via a referential
> check) — always exposes an already-`SavedAccounts.sorted` list so no caller re-sorts. `SavedAccount`
> (`:core:model`) gained `@Serializable` (no shape change) to round-trip through the store.
> `SdkModule.providesSavedAccountsStore()` mirrors the Starred binding. `AuthViewModel` gains a 3rd/4th
> constructor dep (`SavedAccountsStore`, `CacheClock` — reused, not new), seeds `AuthUiState.
> savedAccounts` **synchronously** from `store.accounts.value` at construction (cache-first, matches
> the SharedPrefs read being synchronous — no spinner needed) then collects the store's flow for live
> updates; `AuthUiState.showPicker` is a pure derivation over `SavedAccounts.showPicker`. Five new
> transitions: `selectAccount`/`deselectAccount`/`useAnotherAccount`/`backToSavedAccounts`/
> `removeAccount`. `login()`'s success branch now also `store.upsert`s the freshly-authenticated user
> (id/username/displayName/avatar + `cacheClock.nowMillis()` — **not** the server's `lastActiveAt`;
> re-reading iOS `upsertSavedAccount` confirmed it stamps `Date()` at upsert time, not an echoed
> server field); a failed login upserts nothing. `logout()` re-seeds `savedAccounts` from the store
> after resetting the rest of `AuthUiState` — the list is cross-account, so it must **not** reset to
> the type's `emptyList()` default the way every other field does, and `SessionTeardown.wipe()`
> (re-read to confirm) never touches it either, matching iOS's `AuthManager.logout()` never touching
> `savedAccounts`. **Deliberate simplifications over iOS, called out, not silent:** (1) reused
> Android's single existing `password` field for the selected-account flow instead of porting iOS's
> second `accountPassword` `@State` — Android's login submission was already keyed off one field, so
> duplicating it would have been a workaround, not a port; (2) `.contextMenu` (long-press) → a visible
> trailing close-icon button on `SavedAccountRow` — Compose has no first-class context-menu primitive,
> and a visible affordance is equally discoverable; (3) avatar renders initials-only via the existing
> `MeeshyAvatar` (no `avatarUrl` image loading) — consistent with every other Android surface
> (contacts, chat, calls all use initials-only `MeeshyAvatar` today; grepped, zero `AsyncImage`-backed
> avatars anywhere in `apps/android`), so adding image loading for just this screen would have been
> new scope, not parity. `LoginScreen.kt` decomposed into `SavedAccountsPicker`/`SavedAccountRow`/
> `SelectedAccountForm`/`NormalLoginForm` (was a single 128-line composable). **+10 new
> `AuthViewModelTest`, +7 new `SharedPrefsSavedAccountsStoreTest`.** **Mutation (RED proof):**
> commenting out the `store.upsert(...)` call inside `login()`'s success branch fails **exactly**
> `login_success_upsertsTheAccountIntoTheSavedAccountsStore` (19 run, 1 failed, no collateral); the
> store's own suite was RED-proven by the whole file failing to compile against the absent
> `SharedPrefsSavedAccountsStore` first. **Gate:** `./apps/android/meeshy.sh check` →
> **`BUILD SUCCESSFUL in 5s`** (full `assembleDebug` + all-module `testDebugUnitTest`, 970 tasks).
> Reviewer **PASS** (diff `apps/android` only — `core/model` [`SavedAccount` +`@Serializable`],
> `sdk-core` [new `auth/SavedAccountsStore.kt` + 1 `SdkModule` binding], `feature/auth`
> [`AuthViewModel` +5 transitions +2 constructor deps, `LoginScreen.kt` decomposed, ×3 strings ×4
> locales]; SDK purity — the store is a stateless durability seam at `StarredMessagesStore`'s exact
> grain, no product rule; the product decisions stay in `AuthViewModel`; SSOT — reuses `SavedAccounts`'
> pure transforms/`MeeshyAvatar`/`CacheClock`/`login_password_label` untouched; instant-app —
> cache-first synchronous seed, no spinner; UDF — unchanged `AuthViewModel` shape, immutable
> `StateFlow<AuthUiState>`; no dead end; no tautological tests; no coverage floor lowered).
> **feature-parity.md's "Username/password login with saved-account picker" bullet flips `[~]` →
> `[x]`.** **Next slice (no single obvious pick — re-verify each before committing a run):** with the
> saved-account picker now closed, Auth §A's remaining non-wizard items are all blocked on a missing
> `AuthApi` endpoint this run confirmed absent (server environment selector is the one exception —
> fully local, no backend call, follow-up is a `LoginScreen` composable + a DataStore config store
> driving `apiBaseUrl` at app launch — the next best candidate) — OTP verification, magic-link,
> email/phone recovery all need new `POST /auth/...` wiring before their Compose UI can land. The §C
> inverted-list (re-verified genuinely large this run, see above — attempt a concrete sub-slice
> decomposition next time rather than deferring again), `TagInputField` (still blocked), and the Kover
> coverage-gate infra remain the other three standing candidates. Also weigh moving on to
> Conversations/Chat per the `Auth → Conversations → Chat → Feed → Stories → Calls → the rest` build
> order, now that Auth's cheaply-shippable items are thinning out.
>
> On 2026-08-10 **device-locale inference was wired into the registration wizard's init** (slice
> `auth-signup-region-inference-wiring`, feature-parity §A, the "Country auto-detection +
> region→language inference at signup" bullet's own follow-up, tracked since
> `auth-region-language-inference` on 2026-07-21 and re-surfaced as a candidate by the previous
> two runs' "Next slice" notes). **RE-PROVEN before picking:** with the wizard's Compose
> decomposition and the username-suggestion strip both closed, this run's candidate list was the
> same four re-listed since `auth-username-suggestion-strip`: this device-locale wiring, the §C
> inverted-list rewrite (still flagged "genuinely large" — deferred again, re-verification below),
> `TagInputField` (still blocked on a backend `tags` wire field — grepped `ApiConversation` for a
> `tags` field, still absent, gap confirmed real and still blocked), and the Kover coverage-gate
> infra (deferred — infra work, not a parity gap, lowest priority of the four per the routine's own
> ordering precedent). Picked the locale wiring: smallest, best-scoped, a real user-visible parity
> gap (a French-locale device currently always starts the wizard on `"FR"`/blank language
> regardless of device locale) rather than infra, and — per the routine's "RE-PROUVER" discipline —
> re-read the bullet's own follow-up text (not just the "Next slice" pointer) and grepped
> `SignupRegionInference`/`inferLanguages`/`inferCountryIso` across `apps/android` production code
> first: all three hits were inside the pure core itself and one doc comment in
> `RegistrationScreen.kt` explicitly flagging the wiring as "a distinct, not-yet-wired follow-up —
> out of scope for this field-UI slice" (written by `auth-language-step-fields`) — confirming the
> gap was real, not stale, and exactly where the prior slice had deliberately deferred it. Re-read
> iOS's own `RegistrationViewModel.init()` line-by-line too: `detectCountry()` +
> `detectLanguages()` fire unconditionally at construction, before any Combine debounce setup —
> the wizard's LANGUAGE step and PHONE-step country picker are pre-selected from
> `Locale.current` the instant the screen appears, not lazily on first render. **Added (production,
> all `apps/android`):** `sdk-core/.../locale/DeviceLocaleProvider.kt` — a new `:sdk-core` seam
> (`interface DeviceLocaleProvider { languageTag(); regionTag() }` +
> `object SystemDeviceLocaleProvider : DeviceLocaleProvider` wrapping `Locale.getDefault()`),
> deliberately the same shape as the already-shipped `CacheClock`/`SystemCacheClock` pair
> (`sdk-core/cache/CacheClock.kt`) — a trivial JDK pass-through behind a fake-able interface, Hilt-
> bound in `SdkModule.providesDeviceLocaleProvider()`, no dedicated unit test of its own (matches
> the `SystemCacheClock` precedent: nothing to assert beyond "it calls the system API", the real
> behaviour under test lives in what consumes it). `RegistrationViewModel` gains the new
> constructor dep + `applyDeviceLocaleDefaults()`, called first in `init` (before the three
> `launchProbe` debounce pipelines): reads `deviceLocaleProvider.languageTag()`/`.regionTag()`,
> feeds them straight into the unmodified `SignupRegionInference.inferLanguages`/
> `.inferCountryIso` (SSOT — the core's own 22 tests already cover every inference branch, this
> slice only proves the wiring calls it correctly), and applies the result via the existing
> `updateFields` helper — `systemLanguage`/`regionalLanguage` always overwrite (the core
> guarantees a non-blank pair), `countryIso` only overwrites `RegistrationFields`'s static
> `CountryCatalog.priority.first()` default when `inferCountryIso` resolves a known region
> (mirrors iOS `detectCountry()`'s `guard let regionCode = … else { return }`, which leaves
> `selectedCountry` at its `countries[0]` default on a `nil`/unmatched region rather than clearing
> it — ported as `countryIso ?: it.countryIso`, an Elvis fallback to the current value, not a
> hardcoded literal). Supported-language set reused verbatim from
> `LanguageStepSelection.pickerLanguages` (the exact list the LANGUAGE step's own picker already
> renders) rather than reaching into `LanguageData` a second, independent way — SSOT: "is this code
> offered in the picker" is the exact question `inferLanguages` needs answered. **+6 new
> ViewModel tests** (`RegistrationViewModelTest`, new `FakeDeviceLocaleProvider`, opt-in — its
> default `null`/`null` keeps every pre-existing scenario byte-for-byte deterministic):
> unresolvable device locale falls back to `fr`/`en`/priority-country; a supported device language
> becomes `systemLanguage`; an uppercase device language code still matches case-insensitively; a
> known device region becomes `countryIso`; an unknown device region leaves `countryIso` at the
> static default (the Elvis fallback's other arm); a device region that maps to a regional language
> distinct from the system language sets both fields from the same round-trip (proves `regionTag()`
> feeds both `inferLanguages` and `inferCountryIso` from one shared source, not two independently
> wired reads). **One pre-existing test's premise changed and was fixed, not weakened:**
> `register_blankRegionalLanguage_sendsNullNotBlank` relied on `fields.regionalLanguage` being
> blank on fresh state — no longer true now that `applyDeviceLocaleDefaults()` always pre-fills it
> — so the test now calls `vm.onRegionalLanguageChange("")` to explicitly reach the blank case it
> actually exercises (the pure `toRegisterRequest()` trim-to-null behaviour, unchanged and still
> asserted identically); the other two regional-language edge tests
> (`register_whitespaceRegionalLanguage_isTrimmedToNull`, `register_trimsRegionalLanguageValue`)
> already called `onRegionalLanguageChange` explicitly and needed no change. **Mutation (RED
> proof):** commenting out the `applyDeviceLocaleDefaults()` call in `init` fails **exactly** the
> 5 of 6 new tests that depend on the call actually running (77 run, 5 failed, no collateral on any
> pre-existing test) — the 6th (`initialState_unknownDeviceRegion_keepsThePriorityCountryDefault`)
> legitimately still passes under the mutation, since disabling the call and never calling it both
> leave `countryIso` at its unchanged static default; that test's value is corroborating the
> "unknown region" branch alongside the known-region test that does catch the mutation, not
> standing alone as its own RED proof. **Gate:** `./apps/android/meeshy.sh check` →
> **`BUILD SUCCESSFUL in 20s`** (full `assembleDebug` + all-module `testDebugUnitTest`, 970 tasks).
> Reviewer **PASS** (diff `apps/android` only — new `sdk-core/locale/DeviceLocaleProvider.kt`,
> `sdk-core/di/SdkModule.kt` [+1 `@Provides`], `feature/auth` [`RegistrationViewModel` +1
> constructor dep + `applyDeviceLocaleDefaults()`, its test file]; SDK purity — the new seam is a
> stateless system-API pass-through with no product rule, same grain as `CacheClock`, correctly
> `:sdk-core`; the product decision ("pre-select the wizard's language/country from the device
> locale at init") stays in the `:feature:auth` ViewModel; SSOT — reuses `SignupRegionInference`/
> `LanguageStepSelection.pickerLanguages`/`CountryCatalog.dialCodes` untouched, no re-implementation;
> instant-app — N/A, no network/spinner involved; UDF — unchanged `RegistrationViewModel` +
> immutable `StateFlow`, applied via the existing `updateFields` helper; no dead end; no
> tautological tests; no coverage floor lowered, one existing test's fixture adjusted to its new
> real premise rather than weakened). **feature-parity.md's "Country auto-detection +
> region→language inference at signup" bullet flips `[~]` → `[x]`** — its only follow-up is now
> shipped. **Next slice (no single obvious pick — re-verify each before committing a run):** the §C
> **inverted-list** message layout (bottom-anchored `reverseLayout`, recurring since
> `chat-pinned-day-header`, flagged "genuinely large" over several runs without a fresh
> re-decomposition — re-verify `ChatScreen.kt` before committing a run to it, per the routine's own
> "a repeated verdict is a hypothesis, not a fact" discipline), OR the `TagInputField` composable +
> `allTags` corpus hydration (still blocked on a new `tags` wire field on `ApiConversation` —
> re-confirmed still absent this run), OR the tracked **Kover 90% coverage-gate infra**. With the
> registration wizard now fully closed (8/8 Compose steps + username-suggestion strip + device-
> locale inference), the next run should also weigh Auth §A's remaining non-wizard items (saved-
> account picker, server environment selector, magic-link, OTP, phone recovery, onboarding
> carousel, splash screen — several still `[~]`/`[ ]`, listed at feature-parity.md lines ~278-1285)
> against moving on to Conversations/Chat per the `Auth → Conversations → Chat → Feed → Stories →
> Calls → the rest` build order.
>
> On 2026-08-10 the **registration wizard's username-suggestion strip** landed (slice
> `auth-username-suggestion-strip`, feature-parity §A). **RE-PROVEN before picking, not a rerun of a
> stale note:** with the `OnboardingFlowView` Compose decomposition now 8/8 (all 8 steps shipped
> `auth-profile-step-fields`, previous run), there was no single obvious "next slice" — the prior run's
> candidate list was SignupRegionInference device-locale wiring, the §C inverted-list message layout
> (flagged "genuinely large" over several runs), `TagInputField` (blocked on a backend `tags` wire
> field), and the Kover coverage-gate infra. Re-reading `feature-parity.md`'s own follow-up text for
> the registration-wizard bullet (not just the "Next slice" pointer) surfaced a concrete, already-scoped,
> not-yet-picked item hiding in plain sight: "the username-suggestion strip (surface
> `AvailabilityResult.suggestions`)" — flagged as a follow-up since `signup-availability-probe`
> (2026-07-25) and never picked up. Grepped `usernameSuggestions`/`selectUsernameSuggestion` across
> `apps/android` first — zero production hits, confirming the gap was real, not stale. Chose it over the
> other candidates: smaller and better-scoped than the §C inverted-list rewrite, not blocked on a
> gateway wire field like `TagInputField`, and closes a real, small, well-understood parity gap rather
> than infra work. **Re-verified iOS itself too**, not just the Android note:
> `RegistrationViewModel.usernameSuggestions`/`selectSuggestion`
> (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`) — populated from
> `AvailabilityResult.suggestions` inside `checkUsernameAvailability`, rendered by `StepPseudoView.
> suggestionsCard` (a warning-tinted card, lightbulb icon, `FlowLayout` of tappable `@handle` capsules),
> tapping one sets `username`, optimistically marks `usernameAvailable = true` (the server already
> confirmed it when it offered the handle), and clears the list. **Added (production, all
> `apps/android`):** `RegistrationFields.usernameSuggestions: List<String>` (`:core:model`, sibling to
> `usernameAvailable`); `RegistrationViewModel.onUsernameSuggestions` (background-verdict setter, same
> `updateFields`/errorMessage-preserving rationale as `onUsernameAvailability`) + `selectUsernameSuggestion`
> (the tap handler, faithful port of iOS `selectSuggestion`); the username probe's `init{}` pipeline now
> applies both the verdict and its suggestions from one `checkAvailability` round-trip — a side effect
> inside the `launchProbe` closure, since the shared generic plumbing only carries one value back to
> `apply` and changing its signature for one of three callers wasn't worth the diff (mirrors iOS
> `checkUsernameAvailability` setting both `@Published` properties from the same response, not a new
> pattern); `onUsernameChange` now also clears `usernameSuggestions` on every edit — extends the
> existing "invalidate stale verdict on edit" SOTA convention (Android already diverges from iOS here by
> clearing `usernameAvailable` immediately rather than waiting for the debounced sink) to suggestions
> too, consistently. `RegistrationScreen.kt`'s new `UsernameSuggestionStrip` — `FlowRow` (stable since
> Compose Foundation 1.7, already used elsewhere in this codebase, e.g. the chat effects picker) of
> Material3 `SuggestionChip`s in a `MeeshyTheme.tokens.warning`-tinted card with a lightbulb icon —
> renders under `PseudoStepBody`'s availability indicator whenever the list is non-empty. **+7
> behavioural tests** (`RegistrationViewModelTest`: direct setter; edit invalidates stale suggestions;
> selecting a suggestion sets username + marks available + clears the list + unlocks `canProceed`;
> editing again after a select re-invalidates the optimistic verdict; a taken-username probe applies
> suggestions; an available-username probe leaves them empty; a failed probe leaves them empty).
> **Mutation (RED proof):** reverting `selectUsernameSuggestion`'s optimistic `usernameAvailable = true`
> to `null` fails **exactly** `selectUsernameSuggestion_setsUsernameAndMarksAvailable` (71 run, 1 failed,
> no collateral); RED was also proven first by the suite failing to **compile** against the absent
> production members (`onUsernameSuggestions`/`selectUsernameSuggestion`/`usernameSuggestions` all
> unresolved). **Gate:** `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (full `assembleDebug` +
> all-module `testDebugUnitTest`, 970 tasks). Reviewer **PASS** (diff `apps/android` only — `core/model`
> [`RegistrationFields` +1 field, no new files], `feature/auth` [`RegistrationViewModel` +2 setters +
> probe-closure wiring, `RegistrationScreen.kt` +1 composable, ×4 locale strings ×4 locales]; SDK purity
> — `usernameSuggestions` is inert data on an existing `:core:model` type, `selectUsernameSuggestion` is
> ordinary ViewModel plumbing at the same grain as the sibling `on…Change` setters, the Compose strip is
> UI glue over ViewModel state — no shared-singleton-plus-product-rule combo; SSOT — reuses
> `AvailabilityResult.suggestions` untouched, no re-implementation; instant-app — no spinner introduced;
> UDF — unchanged `RegistrationViewModel` + immutable `StateFlow`; no dead end — the strip is purely
> additive under the existing field, doesn't gate anything; no tautological tests; no coverage floor
> lowered, no existing test weakened). **Registration-wizard top-level bullet now `[x]`** — both of its
> tracked follow-ups (the 8 step composables, and the suggestion strip) are done. **Bookkeeping
> correction alongside this slice (not new production work):** re-verifying this area of
> `feature-parity.md` found three sibling bullets (progress bar, bottom-bar nav, ViewModel wiring) still
> marked `[~]` despite their own text already documenting `auth-onboarding-shell` (2026-08-09) shipping
> the composables/wiring they describe — corrected to `[x]` since directly re-verified in this run's
> research, rather than left for a future run to re-discover the same staleness. **Next slice (no single
> obvious pick — re-verify each before committing a run):** wiring `SignupRegionInference` into the
> wizard's init for a device-locale default (deliberately deferred since `auth-language-step-fields`), OR
> the §C **inverted-list** message layout (bottom-anchored `reverseLayout`, recurring since
> `chat-pinned-day-header` — re-verify `ChatScreen.kt` before committing a run to it, the "genuinely
> large" verdict is itself a hypothesis several runs have repeated without re-decomposing it), OR the
> `TagInputField` composable + `allTags` corpus hydration (still blocked on a new `tags` wire field on
> `ApiConversation`), OR the tracked **Kover 90% coverage-gate infra**. With Auth's registration wizard
> now fully closed end-to-end, the next run should also weigh whether Auth §A has any remaining
> non-wizard gaps (saved-account picker, server environment selector, magic-link, OTP, phone recovery,
> onboarding carousel, splash screen — several still `[~]`/`[ ]`) against moving on to Conversations/Chat
> per the `Auth → Conversations → Chat → Feed → Stories → Calls → the rest` build order.
>
> On 2026-08-09 the **registration wizard's PROFILE step field UI + post-registration asset upload**
> landed (slice `auth-profile-step-fields`, feature-parity §A — slice **8/8, the last one** of the
> `OnboardingFlowView` Compose decomposition, flipping the combined "Profile photo / banner / bio
> optional step; registration recap + terms acceptance" item from `[~]` to `[x]`). **RE-PROVEN, not
> re-scoped:** every run since `auth-password-step-fields` flagged PROFILE as "the one step genuinely
> too large — needs its own photo/banner picker + compression pipeline" without anyone re-reading the
> actual remaining surface. Doing that this run found the opposite: `feature/profile/
> AvatarBannerUploadViewModel` already ships a fully tested pick → validate (`ImageUploadValidator`) →
> upload (`MediaRepository`) → confirm (`UserRepository.updateAvatar`/`updateBanner`) pipeline for the
> Settings/Profile editor, and `RegistrationSummaryInput.bio` had existed unused since
> `registration-recap-summary`. No compression pipeline exists anywhere in `apps/android` — grepped
> `Bitmap.CompressFormat`/`BitmapFactory`, zero production hits — the existing avatar/banner flow
> uploads raw picked bytes capped by `ImageUploadTarget.{AVATAR,BANNER}.maxBytes` (8 MB / 12 MB)
> instead, reused as-is. Re-verified iOS itself too: `StepProfileView`'s `profileImage`/`bannerImage`/
> `bio` never travel through `POST /auth/register` (`RegisterRequest` has no such fields) — iOS uploads
> them **after** authentication via a separate `OnboardingFlowView.uploadProfileCompletionAssets()` →
> `ProfileCompletionUploader`, best-effort per asset. Android mirrors this shape exactly. **Added
> (production, all `apps/android`):** `RegistrationFields.bio` (wires the already-shipped but
> previously-unused `SummaryField.BIO` row into `RegistrationUiState.summary` for the first time);
> `RegistrationUiState.profileImage`/`bannerImage: MediaUploadItem?` (kept outside `fields` — nothing
> in the proceed gate or summary reads them); `onBioChange`/`onProfileImagePicked`/
> `onBannerImagePicked`; `RegistrationScreen.kt`'s `ProfileStepBody` (optional-note banner,
> `ProfilePreviewCard` with two `PickVisualMedia` pickers + `AsyncImage` previews reading the picked
> bytes directly via Coil 2.7's built-in `ByteArrayMapper` — no `Uri` persistence needed across step
> navigation since Compose disposes step-local `remember` state on navigating away, confirmed by
> reading `RegistrationScreen`'s `when` dispatcher, not a Pager — a bio field with a 150-char soft
> counter matching iOS's display-only ceiling) reusing `RecapSummaryCard` **verbatim** (iOS reuses the
> same `summaryItems` for both `StepProfileView` and `StepRecapView` — one card, no near-duplicate
> string). **Deliberate simplification over iOS:** no banner-avatar overlap (iOS offsets -30pt) — a
> plain stacked layout sidesteps Compose's offset/clip interaction inside a rounded clipped container
> for a purely cosmetic flourish. **Post-registration upload** (`RegistrationViewModel.register()` →
> new `uploadProfileCompletionAssets`, +3 constructor deps `MediaRepository`/`UserRepository`/
> `WorkManager`): fires only after `authRepository.register()` succeeds (session already adopted by
> then) and before `isRegistered = true`. Avatar/banner reuse the exact validate→upload→confirm
> sequence `AvatarBannerUploadViewModel` already ships (not called directly — that ViewModel owns
> profile-screen-only UI state this fire-and-forget call has no use for). Bio goes through
> `UserRepository.enqueueProfileEdit` + waking `OutboxFlushWorker` on a non-null `cmid` — the
> established optimistic + offline-durable path `SettingsViewModel`/`ProfileViewModel` already use
> (SOTA over iOS's online-only bio save). Wrapped in `try/catch` (rethrowing `CancellationException`)
> so a failed upload never blocks `isRegistered` — proven by a test that throws inside
> `mediaRepository.upload` and asserts registration still completes. **Deliberate divergence from
> iOS's shape:** iOS fires this via a detached `Task` (survives view dismissal); Android awaits it
> inline in the same `viewModelScope.launch` before flipping `isRegistered`, because
> `RegistrationScreen`'s `LaunchedEffect(state.isRegistered)` navigates away immediately on that flip,
> which would race-cancel a sibling `launch` — awaiting first trades iOS's marginally earlier handoff
> for never silently dropping a picked photo. **+15 new/changed tests**
> (`RegistrationStepContentTest.isImplemented_profile_isTrue` + the now-permanently-vacuous "every
> other step" sweep — all 8 steps are implemented; `RegistrationViewModelTest`: bio/image setters, bio
> summary include/omit, avatar upload+confirm, banner upload+confirm, bio enqueue+wake-worker,
> no-assets skips every call, an `ImageUploadValidator`-rejected empty pick skips upload, an explicit
> `NetworkResult.Failure` skips the confirm PATCH, the exception-safety-net test). **Mutation (RED
> proof):** the PROFILE-implemented test against the pre-slice set failed **exactly**
> `isImplemented_profile_isTrue` (10 run, 1 failed, no collateral); the ViewModel test file failed to
> *compile* against the pre-slice 2-arg constructor before the 3 new deps landed — a stronger RED than
> a runtime failure. **Gate:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 36s** (full
> `assembleDebug` + all-module `testDebugUnitTest`, 970 tasks). Reviewer **PASS** (diff `apps/android`
> only — `core/model` [`RegistrationFields.bio`, `RegistrationStepContent.implemented`], `feature/auth`
> [`RegistrationViewModel` +3 deps + upload orchestration, `RegistrationScreen.kt` +3 composables + 2
> private extensions, +8 locale strings ×4 locales, `build.gradle.kts` +2 deps: `work-runtime`,
> `coil-compose`], `tasks/feature-parity.md`; SDK purity — orchestrates existing `:sdk-core`
> repositories, no product rule added to `:sdk-core`/`:sdk-ui`; SSOT — reuses `ImageUploadValidator`/
> `AvatarBannerUpload`/`MediaRepository`/`UserRepository.enqueueProfileEdit`/`RecapSummaryCard`
> untouched; instant-app — no new blocking spinner; UDF — unchanged `RegistrationViewModel` +
> immutable `StateFlow`; no dead end; no tautological tests; no coverage floor lowered, no existing
> test weakened). **The `OnboardingFlowView` Compose decomposition is now complete (8/8 steps)** —
> every `RegistrationStep` has real field UI. **Next slice (no single obvious pick — re-verify each
> before committing a run):** wiring `SignupRegionInference` into the wizard's init for a device-locale
> default (deliberately deferred since `auth-language-step-fields`), OR the §C **inverted-list**
> message layout (bottom-anchored `reverseLayout`, recurring since `chat-pinned-day-header`), OR the
> `TagInputField` composable + `allTags` corpus hydration (still blocked on a new `tags` wire field on
> `ApiConversation`), OR the tracked **Kover 90% coverage-gate infra**.
>
> On 2026-08-09 the **registration wizard's RECAP step field UI** landed (slice
> `auth-recap-step-fields`, feature-parity §A — slice 7 of the `OnboardingFlowView` Compose
> decomposition, closing the "registration recap + terms acceptance" half of the combined
> "Profile photo / banner / bio optional step; registration recap + terms acceptance" `[~]` item
> — the PROFILE half stays `[ ]`). Re-proven before picking: `RegistrationStepContent.implemented`
> held only `PSEUDO`/`PHONE`/`EMAIL`/`IDENTITY`/`PASSWORD`/`LANGUAGE` — `RECAP` still rendered the
> inert placeholder, confirming the prior run's "Next slice" note. Every decision the step needed
> was already shipped and tested: `RegistrationSummary.rows` (slice `registration-recap-summary`,
> 2026-07-26 — the recap card's rows), `RegistrationStepGate`'s RECAP arm (`fields.acceptTerms`,
> since `registration-step-gate-core`, 2026-07-22), and `RegistrationViewModel.onAcceptTermsChange`
> / `state.summary` — this slice is the first real UI consumer of all three, same "wiring-only"
> shape as every step since IDENTITY. The primary button was ALREADY correctly wired to
> `register()` on RECAP (`RegistrationNavModel.primaryAction == REGISTER`, shipped
> `registration-nav-chrome`) — nothing to change there either. **Added (production, all
> `apps/android`):** `feature/auth/RegistrationScreen.kt` gains `RecapStepBody` — header/subtitle
> copy, a `RecapSummaryCard` (icon + localized label + value per `state.summary` row, icons a
> faithful port of iOS `summaryItems`'s SF Symbols: `at`→`AlternateEmail`, `envelope.fill`→`Email`,
> `person.fill`→`Person`, `phone.fill`→`Phone`, `globe`→`Language`, `text.quote`→`Description`), and
> a `RecapTermsCheckbox` (`Modifier.toggleable(role = Role.Checkbox)` — correct a11y semantics,
> mirrors iOS's `.accessibilityAddTraits(.isSelected)` intent) bound to
> `onAcceptTermsChange`, plus a "Read the terms" link opening a `RecapTermsSheet`
> (`ModalBottomSheet`, same established pattern as `CountryPickerSheet`) with the terms body text
> ported from iOS `StepRecapView.termsSheet` — `RegistrationScreen`'s `when` arm now also
> dispatches `RegistrationStep.RECAP`, and `RegistrationStepContent.implemented` gains `RECAP`
> alongside the six prior steps. **Deliberately no password row:** iOS's recap appends a
> `••••••••` row (`String(repeating: "•", count: min(password.count, 10))`) outside
> `summaryItems`; Android's `RegistrationSummaryRow`/`SummaryField` (shipped
> `registration-recap-summary`, 2026-07-26) has no `PASSWORD` case at all — a decision made and
> tested two slices before this one, re-verified here rather than silently overridden or re-opening
> the shipped core to add a field only this one step would ever read. Never re-surfacing the
> password, even as masked dots whose *length* leaks a weak signal, is a legitimate simplification
> over iOS, not an accidental parity miss. **SSOT reuse:** the terms sheet's close button reuses
> the existing `registration_close` string (already used by the top bar's leading-Close icon)
> rather than adding a near-duplicate string. **No skip affordance** — iOS `StepRecapView` has none
> either, and `RegistrationNavModel.showSkip` is PROFILE-only. **No duplicated loading/error
> handling** — unlike iOS, which branches `isLoading`/`errorMessage` internally inside
> `StepRecapView.body`, Android's shared `state.errorMessage` banner (rendered once, above every
> step body since `auth-onboarding-shell`) and the bottom bar's existing `loading` param already
> cover both, so RECAP stays exactly as thin as every other field-UI step — no step-local
> reimplementation of state the chrome already owns. **+13 new locale strings ×4 locales**
> (`registration_recap_*`: header/subtitle/summary_title/field_username/field_email/field_name/
> field_phone/field_languages/field_bio/terms_accept/terms_read/terms_title/terms_body — the last
> one a multi-paragraph terms text faithfully translated from iOS's French source into en/fr/es/pt).
> **+2 core tests** (`RegistrationStepContentTest.isImplemented_recap_isTrue`; the "every other
> step" sweep renamed to exclude PSEUDO+PHONE+EMAIL+IDENTITY+PASSWORD+LANGUAGE+RECAP). **Mutation
> (RED proof):** the new test against the pre-slice `implemented` set (still only `{PSEUDO, PHONE,
> EMAIL, IDENTITY, PASSWORD, LANGUAGE}`) failed **exactly** `isImplemented_recap_isTrue` (8 run, 1
> failed, no collateral) before the one-line core change landed. **Zero new ViewModel tests
> needed** — `RegistrationViewModelTest` already exercises `onAcceptTermsChange`/`register()`/
> `summary` end-to-end; re-ran unmodified and stayed green (52/52) — the regression proof for this
> Compose-wiring-only slice, per `TDD-COVERAGE.md`'s exemption for `@Composable` glue. **Gate:**
> `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL in 23s` (full `assembleDebug` +
> all-module `testDebugUnitTest`, 970 tasks). Reviewer **PASS** (diff `apps/android` only —
> `core/model` [1-line `implemented` set change, no new files], `feature/auth` [+9
> composables/helpers in `RegistrationScreen.kt`, the `when` arm, ×13 locale strings ×4 locales],
> `tasks/feature-parity.md`; SDK purity — `RegistrationStepContent` stays a stateless `:core:model`
> lookup, every new Composable is ordinary UI glue over the already-shipped
> `RegistrationSummary`/`RegistrationStepGate`/`RegistrationViewModel` cores, no
> shared-singleton-plus-product-rule combo; SSOT — reuses every existing recap/terms/register
> wiring untouched, re-implements no rule, reuses `registration_close` instead of duplicating it;
> instant-app — no spinner introduced; UDF — unchanged `RegistrationViewModel` + immutable
> `StateFlow`; no dead end — Back stays reachable, the terms sheet dismisses via its close
> button/scrim/swipe; no tautological tests; no coverage floor lowered, no existing test
> weakened). **Next slice:** PROFILE (needs a photo/banner picker + compression pipeline — the
> ONE remaining step of the `OnboardingFlowView` Compose decomposition, now 7/8 done; every prior
> "next slice" note has flagged this as the one genuinely large step, re-verify that verdict rather
> than assuming it before committing a run to it), OR wiring `SignupRegionInference` into the
> wizard's init for a device-locale default (deliberately deferred since `auth-language-step-fields`),
> OR the §C **inverted-list** message layout (bottom-anchored `reverseLayout`, recurring since
> `chat-pinned-day-header` — re-verify `ChatScreen.kt` before committing a run to it), OR the
> `TagInputField` composable + `allTags` corpus hydration (still blocked on a new `tags` wire field
> on `ApiConversation`), OR the tracked **Kover 90% coverage-gate infra**.
>
> On 2026-08-09 the **registration wizard's LANGUAGE step field UI** landed (slice
> `auth-language-step-fields`, feature-parity §A — slice 6 of the `OnboardingFlowView` Compose
> decomposition, "System + regional language selection with live translation preview" `[~]`
> flipped `[x]`). Re-proven before picking: `RegistrationStepContent.implemented` held only
> `PSEUDO`/`PHONE`/`EMAIL`/`IDENTITY`/`PASSWORD` — `LANGUAGE` still rendered the inert placeholder,
> confirming the prior run's "Next slice" note. Every decision the step needed was already shipped
> and tested: `LanguageStepSelection` (picker list, search filter, summary/preview labels,
> slot-aware highlight + write — since `auth-language-step-selection-core`, 2026-07-22) and
> `RegistrationViewModel.onSystemLanguageChange`/`onRegionalLanguageChange`/`languageSelection`
> (since `registration-regional-language`, 2026-07-26) — this slice is the first real UI consumer
> of both, same "wiring-only" shape as PASSWORD one level up. **Added (production, all
> `apps/android`):** `feature/auth/RegistrationScreen.kt` gains `LanguageStepBody` — two tappable
> slot cards (label + current `LanguageStepSelection.summaryLabel`, tap both shows the slot's value
> and activates it for editing — a deliberate merge of iOS `StepLanguageView`'s separate
> always-visible summary cards + tab-button row into one control, same information with one fewer
> redundant control row), a search field driving `LanguageStepSelection.filter`, a non-lazy
> 2-column picker grid (`chunked(2)`) over the filtered `LanguageData` catalogue (79 entries)
> highlighting the active slot's current choice (`LanguageStepSelection.isSelected`) and
> dispatching taps to `onSystemLanguageChange`/`onRegionalLanguageChange` depending on which slot
> is active, and a translation-preview card (`LanguageStepSelection.translationPreview`) —
> `RegistrationScreen`'s `when` arm now also dispatches `RegistrationStep.LANGUAGE`, and
> `RegistrationStepContent.implemented` gains `LANGUAGE` alongside
> `PSEUDO`/`PHONE`/`EMAIL`/`IDENTITY`/`PASSWORD`. **Deliberately non-lazy grid:** the step body
> sits inside the wizard's outer `verticalScroll` `Column`; a `LazyVerticalGrid`/`LazyColumn`
> nested there without a bounded height would crash Compose ("infinity maximum height
> constraints") — the same pitfall `CountryPickerSheet` (from `auth-phone-step-fields`) sidesteps
> with a `heightIn(max = …)` inside its own `ModalBottomSheet`. A plain `chunked(2)` grid composed
> directly into the parent scroll avoids the nesting hazard entirely, simple enough for 79 rows in
> an onboarding step used once. **Deliberately out of scope:** wiring
> `SignupRegionInference`/`SignupLanguages` (shipped `auth-region-language-inference`, 2026-07-21)
> to pre-select from the device locale — verified by reading its own `feature-parity.md` follow-up
> note, which already calls this out as a distinct, separate task from the field-UI wiring; the
> same "wiring-only" shape as PHONE shipping with a static default country (`CountryCatalog.
> priority.first()`) rather than device-locale inference. **No skip affordance** — iOS
> `StepLanguageView` has none either, and `RegistrationNavModel.showSkip` is PROFILE-only. **+6
> new locale strings ×4 locales** (`registration_language_*`:
> header/subtitle/system_tab/regional_tab/search_hint/example_title). **+1 core test**
> (`RegistrationStepContentTest.isImplemented_language_isTrue`; the "every other step" sweep
> updated to exclude PSEUDO+PHONE+EMAIL+IDENTITY+PASSWORD+LANGUAGE). **Mutation (RED proof):** the
> new test against the pre-slice `implemented` set (still only `{PSEUDO, PHONE, EMAIL, IDENTITY,
> PASSWORD}`) failed **exactly** `isImplemented_language_isTrue` (7 run, 1 failed, no collateral)
> before the one-line core change landed. **Zero new ViewModel tests needed** —
> `RegistrationViewModelTest` already exercises `onSystemLanguageChange`/`onRegionalLanguageChange`/
> `languageSelection` end-to-end (since `registration-regional-language`); re-ran unmodified and
> stayed green (52/52) — the regression proof for this Compose-wiring-only slice, per
> `TDD-COVERAGE.md`'s exemption for `@Composable` glue. **Gate:** `./apps/android/meeshy.sh check`
> → `BUILD SUCCESSFUL in 39s` (full `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks).
> Reviewer **PASS** (diff `apps/android` only — `core/model` [1-line `implemented` set change, no
> new files], `feature/auth` [+9 composables in `RegistrationScreen.kt`, the `when` arm, ×6 locale
> strings ×4 locales], `tasks/feature-parity.md`; SDK purity — `RegistrationStepContent` stays a
> stateless `:core:model` lookup, every new Composable is ordinary UI glue over the stateless
> `LanguageStepSelection` core + ViewModel state, no shared-singleton-plus-product-rule combo; SSOT
> — reuses `LanguageStepSelection`/`LanguageData`/`RegistrationViewModel`'s existing language wiring
> untouched, re-implements none; instant-app — no spinner introduced; UDF — unchanged
> `RegistrationViewModel` + immutable `StateFlow`; no dead end — Back stays reachable, Next stays
> correctly disabled until a system language is chosen; no tautological tests; no coverage floor
> lowered, no existing test weakened). **Next slice:** PROFILE (needs a photo/banner picker +
> compression pipeline — the one step genuinely larger than the rest, per prior runs' notes), OR
> RECAP (terms checkbox + summary rows, core shipped per `registration-step-gate-core`/
> `RegistrationSummary`), OR wiring `SignupRegionInference` into the wizard's init for a
> device-locale default (deliberately deferred by this slice, see above), OR the §C
> **inverted-list** message layout (bottom-anchored `reverseLayout`, recurring since
> `chat-pinned-day-header` — re-verify `ChatScreen.kt` before committing a run to it), OR the
> `TagInputField` composable + `allTags` corpus hydration (still blocked on a new `tags` wire field
> on `ApiConversation`), OR the tracked **Kover 90% coverage-gate infra**. **Hygiene note
> (recurring, still unaddressed):** `PROGRESS.md`/`NOTES.md` remain well past the ~1500-line
> archival threshold in `ROUTINE.md` §Hygiène (unaddressed since at least the
> `session-logout-teardown` run) — flagging again rather than bundling an archive pass into this
> slice's commit, per the hygiene section's "separate, dedicated commit" rule; both files have
> grown further since the last flag. A dedicated archival increment is now a strong candidate for
> the next run that doesn't pick a content slice.

> On 2026-08-09 the **registration wizard's PASSWORD step field UI** landed (slice
> `auth-password-step-fields`, feature-parity §A — slice 5 of the `OnboardingFlowView` Compose
> decomposition, "First/last name capture; password strength meter + requirements checklist" `[~]`
> flipped `[x]`). Re-proven before picking: `RegistrationStepContent.implemented` held only
> `PSEUDO`/`PHONE`/`EMAIL`/`IDENTITY` — `PASSWORD` still rendered the inert placeholder, confirming the
> prior run's "Next slice" note. Every decision the step needed was already shipped and tested:
> `RegistrationFields.password`/`confirmPassword` (since `registration-wizard-viewmodel`),
> `RegistrationStepGate`'s PASSWORD arm (`PasswordEntry.evaluate(...).canProceed`, since
> `registration-step-gate-core`), `RegistrationViewModel.onPasswordChange`/`onConfirmPasswordChange`,
> and — the three pure Step-5 decision cores from iOS `StepPasswordView` —
> `PasswordEntry.evaluate` (confirm-field reveal at `password.length >= 8` + match verdict),
> `PasswordRequirements.evaluate` (the four-row checklist), and `PasswordStrength.evaluate` (the 6-band
> meter, since `auth-password-requirements`/the change-password slice) — this slice is the first real
> UI consumer of all three, same "wiring-only" shape as EMAIL/IDENTITY one level up. **Added
> (production, all `apps/android`):** `feature/auth/RegistrationScreen.kt` gains `PasswordStepBody` —
> header/subtitle copy, a local `PasswordField` (show/hide toggle via `PasswordVisualTransformation`,
> reused twice for the password + confirm fields), a `PasswordStrengthMeter` (5-segment bar + label,
> reuses `PasswordStrength`/`PasswordStrengthLevel` verbatim — the exact core already shipped and
> tested for `ChangePasswordScreen`, `:feature:settings`) shown once the password is non-empty, the
> confirm field shown once `PasswordEntry.evaluate(...).showConfirmField`, a `PasswordMatchRow`
> (check/cancel icon + match/mismatch text) shown once the confirm field is non-empty, and a
> `PasswordRequirementsCard` (four `PasswordRequirementRow`s off `PasswordRequirements.evaluate`) —
> `RegistrationScreen`'s `when` arm now also dispatches `RegistrationStep.PASSWORD`, and
> `RegistrationStepContent.implemented` gains `PASSWORD` alongside `PSEUDO`/`PHONE`/`EMAIL`/`IDENTITY`.
> **Deliberate choice, read both iOS types before deciding:** iOS onboarding's `StepPasswordView` file
> declares its own file-local `PasswordStrength` enum (4 bands: weak/fair/good/strong) — a *different*
> Swift type from `MeeshyUI.PasswordStrengthIndicator`'s strength type that Android's `PasswordStrength`
> core already ports (6 bands, TOO_WEAK..EXCELLENT). Both compute the identical 6-boolean-factor raw
> score (length≥8, length≥12, uppercase, lowercase, digit, special char) — only the band-to-label
> mapping differs (4 labels vs. 6). Reusing the already-shipped 6-band core (as the prior
> `auth-password-requirements` slice's note already flagged: "The strength *meter* score
> (`PasswordStrength`, 0..5 bands) already existed") is SSOT-correct — same signal, richer bands — over
> porting a second, near-duplicate scoring type just to match iOS's file-local label count. **No skip
> affordance** — iOS `StepPasswordView` has none either, and `RegistrationNavModel.showSkip` is
> PROFILE-only. **+19 new locale strings ×4 locales** (`registration_password_*`: header/subtitle/
> label/confirm_label/show/hide/match/mismatch/requirements_title/req_length/req_uppercase/
> req_lowercase/req_digit/strength_0..5). **+1 core test**
> (`RegistrationStepContentTest.isImplemented_password_isTrue`; the "every other step" sweep updated to
> exclude PSEUDO+PHONE+EMAIL+IDENTITY+PASSWORD). **Mutation (RED proof):** the new test against the
> pre-slice `implemented` set (still only `{PSEUDO, PHONE, EMAIL, IDENTITY}`) failed **exactly**
> `isImplemented_password_isTrue` (6 run, 1 failed, no collateral) before the one-line core change
> landed. **Zero new ViewModel tests needed** — `RegistrationViewModelTest` already exercises
> `onPasswordChange`/`onConfirmPasswordChange` end-to-end via `fillAllValid()`; re-ran unmodified and
> stayed green (52/52) — the regression proof for this Compose-wiring-only slice, per
> `TDD-COVERAGE.md`'s exemption for `@Composable` glue. **Gate:** `./apps/android/meeshy.sh check` →
> `BUILD SUCCESSFUL` (full `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks). Reviewer
> **PASS** (diff `apps/android` only — `core/model` [1-line `implemented` set change, no new files],
> `feature/auth` [+7 composables in `RegistrationScreen.kt`, the `when` arm, ×19 locale strings ×4
> locales], `tasks/feature-parity.md`; SDK purity — `RegistrationStepContent` stays a stateless
> `:core:model` lookup, every new Composable is ordinary UI glue reading ViewModel state and the three
> pure cores, no shared-singleton-plus-product-rule combo; SSOT — reuses
> `PasswordEntry`/`PasswordRequirements`/`PasswordStrength`/`RegistrationStepGate`/
> `RegistrationViewModel`'s existing password wiring untouched, re-implements none — the `PasswordField`
> show/hide composable is duplicated from `ChangePasswordScreen`'s private equivalent rather than
> extracted to a shared module, a deliberate scope call since `:feature:auth` and `:feature:settings`
> share no UI component today and Compose glue is coverage-exempt; instant-app — no spinner
> introduced; UDF — unchanged `RegistrationViewModel` + immutable `StateFlow`; no dead end — Back stays
> reachable, Next stays correctly disabled until the password meets both length and match; no
> tautological tests; no coverage floor lowered, no existing test weakened). **Next slice:** LANGUAGE
> (system/regional picker + live-translation preview, core shipped per
> `auth-language-step-selection-core`), OR PROFILE (needs a photo/banner picker + compression
> pipeline — the one step genuinely larger than the rest, per the prior run's note), OR RECAP (terms
> checkbox + summary rows, core shipped per `registration-step-gate-core`/`RegistrationSummary`), OR
> the §C **inverted-list** message layout (bottom-anchored `reverseLayout`, recurring since
> `chat-pinned-day-header` — re-verify `ChatScreen.kt` before committing a run to it, the "genuinely
> large" verdict from prior runs is itself a hypothesis to re-check), OR the `TagInputField` composable
> + `allTags` corpus hydration (still blocked on a new `tags` wire field on `ApiConversation`), OR the
> tracked **Kover 90% coverage-gate infra**. **Hygiene note (recurring, still unaddressed):**
> `PROGRESS.md`/`NOTES.md` remain well past the ~1500-line archival threshold in `ROUTINE.md` §Hygiène
> (unaddressed since at least the `session-logout-teardown` run) — flagging again rather than bundling
> an archive pass into this slice's commit, per the hygiene section's "separate, dedicated commit"
> rule; both files have grown further since the last flag (`PROGRESS.md` now 14563+ lines pre-this-entry).

> On 2026-08-09 the **registration wizard's IDENTITY step field UI** landed (slice
> `auth-identity-step-fields`, feature-parity §A — slice 4 of the `OnboardingFlowView` Compose
> decomposition, "First/last name capture" `[~]` gains its field UI half). Re-proven before picking:
> `RegistrationStepContent.implemented` held only `PSEUDO`/`PHONE`/`EMAIL` — `IDENTITY` still rendered
> the inert placeholder, confirming both the prior run's "Next slice" note and the `feature-parity.md`
> §A follow-up ("IDENTITY next (first/last name, no new core needed, same wiring-only shape")). Every
> decision the step needed was already shipped and tested: `RegistrationFields.firstName`/`lastName`
> (since `registration-wizard-viewmodel`), `RegistrationStepGate`'s IDENTITY arm (`firstName.isNotBlank()
> && lastName.isNotBlank()`, since `registration-step-gate-core`, 2026-07-22), and
> `RegistrationViewModel.onFirstNameChange`/`onLastNameChange` — this slice is the first real UI
> consumer, one notch simpler than EMAIL (two fields, no availability probe at all — the gate is purely
> local — and no skip, `RegistrationNavModel.showSkip` stays PROFILE-only). **Added (production, all
> `apps/android`):** `feature/auth/RegistrationScreen.kt` gains `IdentityStepBody` — header/subtitle
> copy, two `OutlinedTextField`s (first name, last name) bound to `state.fields.firstName`/`lastName`
> and `viewModel::onFirstNameChange`/`onLastNameChange`, no available/taken indicator (iOS
> `StepIdentityView` has no server check either — verified by reading it before assuming one belonged
> here, unlike PSEUDO/PHONE/EMAIL's tri-state availability) — `RegistrationScreen`'s `when` arm now also
> dispatches `RegistrationStep.IDENTITY`, and `RegistrationStepContent.implemented` gains `IDENTITY`
> alongside `PSEUDO`/`PHONE`/`EMAIL`. **+1 core test**
> (`RegistrationStepContentTest.isImplemented_identity_isTrue`; the "every other step" sweep updated to
> exclude PSEUDO+PHONE+EMAIL+IDENTITY). **Mutation (RED proof):** the new test against the pre-slice
> `implemented` set (still only `{PSEUDO, PHONE, EMAIL}`) failed **exactly** `isImplemented_identity_isTrue`
> (5 run, 1 failed, no collateral) before the one-line core change landed. **Zero new ViewModel tests
> needed** — `RegistrationStepGateTest` already covers every IDENTITY gate branch
> (both/first-blank/last-blank/both-blank/whitespace-only, since `registration-step-gate-core`) and
> `RegistrationViewModelTest` already exercises `onFirstNameChange`/`onLastNameChange` end-to-end via
> `fillAllValid()` plus the blank-names→null register-mapping assertion
> (`register_blankOptionalNames_sendsNullNotBlank`); re-ran unmodified and stayed green (52/52) — the
> regression proof for this Compose-wiring-only slice, per `TDD-COVERAGE.md`'s exemption for
> `@Composable` glue. **Gate:** `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (full
> `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks). Reviewer **PASS** (diff `apps/android`
> only — `core/model` [1-line `implemented` set change, no new files], `feature/auth` [+1 composable in
> `RegistrationScreen.kt`, the `when` arm, ×4 locale strings], `tasks/feature-parity.md`; SDK purity —
> `RegistrationStepContent` stays a stateless `:core:model` lookup, `IdentityStepBody` is ordinary UI
> glue reading ViewModel state, no shared-singleton-plus-product-rule combo; SSOT — reuses
> `RegistrationStepGate`/`RegistrationViewModel`'s existing firstName/lastName wiring untouched,
> re-implements none; instant-app — no spinner introduced; UDF — unchanged `RegistrationViewModel` +
> immutable `StateFlow`; no dead end — Back stays reachable, Next stays correctly disabled until both
> names are non-blank; no tautological tests; no coverage floor lowered, no existing test weakened).
> **Next slice:** PASSWORD (needs `PasswordEntry`'s strength/match UI + `PasswordRequirements`'s
> checklist card, both cores already shipped per `feature-parity.md`), OR LANGUAGE (system/regional
> picker + live-translation preview, core shipped per `auth-language-step-selection-core`), OR the §C
> **inverted-list** message layout (bottom-anchored `reverseLayout`, recurring since
> `chat-pinned-day-header` — re-verify `ChatScreen.kt` before committing a run to it, the "genuinely
> large" verdict from prior runs is itself a hypothesis to re-check), OR the `TagInputField` composable +
> `allTags` corpus hydration (still blocked on a new `tags` wire field on `ApiConversation`), OR the
> tracked **Kover 90% coverage-gate infra**. **Hygiene note (recurring, still unaddressed):**
> `PROGRESS.md`/`NOTES.md` remain well past the ~1500-line archival threshold in `ROUTINE.md` §Hygiène
> (unaddressed since at least the `session-logout-teardown` run) — flagging again rather than bundling an
> archive pass into this slice's commit, per the hygiene section's "separate, dedicated commit" rule.

> On 2026-08-09 the **registration wizard's EMAIL step field UI** landed (slice
> `auth-email-step-fields`, feature-parity §A — slice 3 of the `OnboardingFlowView` Compose
> decomposition). Re-proven before picking: `RegistrationStepContent.implemented` held only
> `PSEUDO`/`PHONE` — `EMAIL` still rendered the inert placeholder, confirming the prior run's "Next
> slice" note. Every decision the step needed was already shipped and tested since the
> `signup-availability-probe` slice (2026-07-25): `RegistrationFields.email`/`emailAvailable`,
> `SignupAvailabilityPolicy.emailStepCanProceed`/`emailIntent`, `RegistrationStepGate`'s EMAIL arm,
> `RegistrationViewModel.onEmailChange`/`onEmailAvailability`, and the debounced `emailInput` probe
> pipeline — this slice is the first real UI consumer, one notch simpler than the PHONE slice (single
> field, no country picker, no skip). **Added (production, all `apps/android`):** `feature/auth/
> RegistrationScreen.kt` gains `EmailStepBody` — header/subtitle copy, an `OutlinedTextField`
> (`KeyboardType.Email`) bound to `state.fields.email`/`viewModel::onEmailChange`, and the
> available/taken indicator mirroring `PseudoStepBody`'s pattern verbatim — `RegistrationScreen`'s
> `when` arm now also dispatches `RegistrationStep.EMAIL`, and `RegistrationStepContent.implemented`
> gains `EMAIL` alongside `PSEUDO`/`PHONE`. **Deliberately no skip button**: iOS `StepEmailView` has
> none either — verified by reading both the iOS view and `SignupAvailabilityPolicy.emailStepCanProceed`
> before assuming one belonged here; unlike PHONE's `skipPhone` escape hatch, the EMAIL gate has no
> skip arm at all, so a skip control would be a dead affordance whose tap does nothing. **+1 core test**
> (`RegistrationStepContentTest.isImplemented_email_isTrue`; the "every other step" sweep renamed to
> exclude PSEUDO+PHONE+EMAIL). **Mutation (RED proof):** the new test against the pre-slice
> `implemented` set (still only `{PSEUDO, PHONE}`) failed **exactly** `isImplemented_email_isTrue` (4
> run, 1 failed, no collateral) before the one-line core change landed. **Zero new ViewModel tests
> needed** — `RegistrationViewModelTest` already covered every EMAIL branch
> (`editingEmail_invalidatesStaleAvailability`, `validEmail_afterDebounce_probesAndAppliesVerdict`, the
> recap/register field assertions) since the availability-probe slice; re-ran unmodified and stayed
> green (52/52) — the regression proof for this Compose-wiring-only slice, per `TDD-COVERAGE.md`'s
> exemption for `@Composable` glue. **Gate:** `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL`
> (full `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks). Reviewer **PASS** (diff
> `apps/android` only — `core/model` [1-line `implemented` set change, no new files], `feature/auth`
> [+1 composable in `RegistrationScreen.kt`, the `when` arm, ×4 locale strings], `tasks/
> feature-parity.md`; SDK purity — `RegistrationStepContent` stays a stateless `:core:model` lookup,
> `EmailStepBody` is ordinary UI glue reading ViewModel state, no shared-singleton-plus-product-rule
> combo; SSOT — reuses `SignupAvailabilityPolicy`/`RegistrationStepGate`/`RegistrationViewModel`
> untouched, re-implements none; instant-app — no spinner introduced; UDF — unchanged
> `RegistrationViewModel` + immutable `StateFlow`; no dead end — Back stays reachable, Next stays
> correctly disabled until the server confirms availability; no tautological tests; no coverage floor
> lowered, no existing test weakened). **Next slice:** IDENTITY (first/last name fields, no new core
> needed — same "wiring-only" shape as this slice, `RegistrationStepGate.canProceed`'s IDENTITY arm
> already requires both non-blank), OR PASSWORD (needs `PasswordEntry`'s strength/match UI, core
> already shipped per `feature-parity.md`), OR the §C **inverted-list** message layout (bottom-anchored
> `reverseLayout`, recurring since `chat-pinned-day-header` — re-verify `ChatScreen.kt` before
> committing a run to it, the "genuinely large" verdict from prior runs is itself a hypothesis to
> re-check), OR the `TagInputField` composable + `allTags` corpus hydration (still blocked on a new
> `tags` wire field on `ApiConversation`), OR the tracked **Kover 90% coverage-gate infra**. **Hygiene
> note (recurring, still unaddressed):** `PROGRESS.md`/`NOTES.md` remain well past the ~1500-line
> archival threshold in `ROUTINE.md` §Hygiène (unaddressed since at least the `session-logout-teardown`
> run) — flagging again rather than bundling an archive pass into this slice's commit, per the hygiene
> section's "separate, dedicated commit" rule.

> On 2026-08-09 the **registration wizard's PHONE step field UI** landed (slice
> `auth-phone-step-fields`, feature-parity §A — slice 2 of the `OnboardingFlowView` Compose
> decomposition, "Phone entry with searchable country-code picker (skippable)" flipped `[x]`).
> Re-proven before picking: read `RegistrationScreen.kt` — only `PSEUDO` was in
> `RegistrationStepContent.implemented`, `PHONE` still rendered the inert placeholder, confirming the
> prior run's "Next slice" note. Every decision core the step needed was already shipped and tested
> (`CountryCatalog` since 2026-07-20, `SignupAvailabilityPolicy.phoneStepCanProceed`,
> `RegistrationStepGate`'s PHONE arm, `RegistrationSummary`'s already-present-but-unwired
> `phoneDialCode` input) — this slice is the first real consumer plus three small, directly-required
> wiring fixes. **Added (production, all `apps/android`):** (1) `feature/auth/RegistrationScreen.kt`
> gains `PhoneStepBody` — a country chip (flag + dial code) opening `CountryPickerSheet` (a
> `ModalBottomSheet` search list over `CountryCatalog.build`/`.search`, display-name resolver =
> `java.util.Locale("", iso).displayCountry`, closing the `auth-country-catalog` slice's
> `java.util.Locale`-backed-wiring follow-up), the phone-digits `OutlinedTextField`, an available/taken
> indicator (mirrors `PseudoStepBody`'s pattern), and an in-content Skip button — `RegistrationScreen`'s
> `when` arm now also dispatches `RegistrationStep.PHONE`, and `RegistrationStepContent.implemented`
> gains `PHONE` alongside `PSEUDO`. The Skip button is deliberately inline, not the bottom-bar one:
> `RegistrationNavModel.showSkip` is `false` for PHONE by design (its KDoc already documented "the PHONE
> step carries its own in-content skip affordance, mirroring iOS" from the `registration-nav-chrome`
> slice, unconsumed until now). **(2) New `RegistrationFields.countryIso`** (`:core:model`, default
> `CountryCatalog.priority.first()` = `"FR"`, mirrors iOS `RegistrationViewModel.selectedCountry`) feeds
> three sites that needed it to be a *complete* slice, not just a decorative picker: **the debounced
> availability probe now sends the E.164 dial-code-prefixed number**
> (`CountryCatalog.dialCode(countryIso) + digits`, was digits-only before this slice) — a real,
> pre-existing parity gap: the gateway's `/auth/check-availability` route comment documents "E.164
> format" and falls back to inferring the country from geo-IP when the number carries no explicit
> country context, so a French user picking a non-FR country would have probed under the wrong
> assumption; **`RegistrationViewModel.toRegisterRequest()` now sends the two new nullable
> `RegisterRequest.phoneNumber`/`phoneCountryCode` wire fields** (`:core:model/Auth.kt`, `null` when
> skipped/blank — faithful port of iOS `register()`'s `fullPhone`/`phoneCountryCode` construction, an
> orphan gap since `RegisterRequest` never carried phone at all); and **the recap's
> `RegistrationSummaryInput.phoneDialCode`** (a field `RegistrationSummary` already accepted since the
> `auth-onboarding-shell` slice but no caller ever populated) is now wired from `CountryCatalog.dialCode`.
> **SOTA over iOS:** `onCountryChange` invalidates a stale `phoneAvailable` — iOS's `selectedCountry`
> setter never does, so switching the dial-code country after an already-confirmed probe can silently
> let the wizard proceed under the wrong country there; Android never lets that verdict survive a country
> change (no auto re-probe fires though, mirroring iOS — editing the phone digits again re-triggers the
> existing debounced pipeline). **Deliberately out of scope:** iOS's phone-ownership/recovery-hint
> (`phoneOwnership`, `phoneRecoverySuggested`, the "on dirait ton ancien compte" card on a taken number)
> — a distinct, larger capability needing its own decision core, not part of "field UI + skip".
> **+7 behavioural VM tests** (`RegistrationViewModelTest`: default-country init; `onCountryChange`
> updates the field and invalidates a stale probe; the debounced probe sends the selected country's
> E.164 dial code, both the default-FR and an explicitly-picked-US case; `register()` sends the
> dial-code-prefixed number + ISO when the step was filled, and `null`/`null` when it was skipped; the
> recap's phone row carries the dial-code prefix) **+1 `RegistrationStepContentTest`** (`PHONE` now
> implemented, the "every other step" sweep updated to exclude it too). **One existing probe test
> adapted, not weakened:** the old `validPhone_afterDebounce_probesWithDigitsOnly` typed a dial code
> straight into the phone field (`"+33 6 12 34 56 78"`) because no country picker existed yet — that
> input no longer represents a realistic interaction now that the picker supplies the dial code
> separately, so the test was split into the two dial-code-aware tests above; the new assertions are
> **stricter** (they check the E.164 `+`-prefixed wire value the server actually needs, not a
> digits-only string the old code silently under-delivered). **Mutation (RED proof):** reverting the
> probe to digits-only (dropping the `CountryCatalog.dialCode(...) + ` prefix) fails **exactly** the two
> dial-code probe tests (52 run, 2 failed, no collateral); restored after. **Gate:**
> `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (full `assembleDebug` + all-module
> `testDebugUnitTest`, 943 tasks). Reviewer **PASS** (diff `apps/android` only — `core/model`
> [`RegistrationFields` +1 field, `RegisterRequest` +2 fields, `RegistrationStepContent` +1 entry, no new
> files], `feature/auth` [+2 composables in `RegistrationScreen.kt`, `RegistrationViewModel.kt` wiring,
> ×4 locale strings], `tasks/feature-parity.md`; SDK purity — `CountryCatalog`/`RegistrationSummary`
> stay pure `:core:model` decision cores untouched in shape, the new Composables are ordinary UI glue
> reading ViewModel state, `onCountryChange`/probe wiring is ordinary ViewModel plumbing (not a
> shared-singleton-plus-product-rule combo); SSOT — reuses `CountryCatalog`, `RegistrationSummary`,
> `SignupFieldValidation.phoneDigits`, re-implements none; instant-app — no spinner introduced; UDF —
> unchanged `RegistrationViewModel` + immutable `StateFlow`; no dead end — the picker sheet dismisses
> cleanly, Skip and Back both remain reachable; no tautological tests; no coverage floor lowered, no
> existing test weakened — only adapted for a deliberate, documented behaviour change). **Next slice:**
> the EMAIL step field UI (needs no new core — `SignupAvailabilityPolicy.emailStepCanProceed` +
> the existing probe are already wired), OR IDENTITY (first/last name, needs no new core either), OR the
> §C **inverted-list** message layout (bottom-anchored `reverseLayout`, recurring since
> `chat-pinned-day-header` — re-verify `ChatScreen.kt` line ~487 before committing a run to it, the
> "genuinely large" verdict from two runs ago is itself a hypothesis to re-check), OR the `TagInputField`
> composable + `allTags` corpus hydration (still blocked on a new `tags` wire field on `ApiConversation`),
> OR the tracked **Kover 90% coverage-gate infra**. **Hygiene note (recurring, still unaddressed):**
> `PROGRESS.md`/`NOTES.md` are both well past the ~1500-line archival threshold in `ROUTINE.md` §Hygiène
> (unaddressed since at least the `session-logout-teardown` run) — flagging again rather than bundling an
> archive pass into this slice's commit, per the hygiene section's "separate, dedicated commit" rule.

> On 2026-08-09 the **registration wizard's pager/progress-bar/nav-chrome shell** landed (slice
> `auth-onboarding-shell`, feature-parity §A — slice 1 of the `OnboardingFlowView` Compose scaffold
> decomposition recorded by the previous run, PSEUDO step only). Re-proven before picking: grepped
> `apps/android/feature/auth/` — only `LoginScreen.kt`/`GuestJoinScreen.kt` existed, zero registration
> UI, and `LoginScreen` had no path to it (confirmed by reading the file, not the note). Every decision
> the shell needed (`RegistrationStepGate`, `RegistrationStepNavigator`, `RegistrationProgressBar`,
> `RegistrationNav`, `RegistrationViewModel`) was already shipped and tested — this slice is the first
> real consumer. **Added (production, all `apps/android`):** (1) `feature/auth/RegistrationScreen.kt` —
> a dumb Compose renderer over `RegistrationUiState`: top bar (Close on PSEUDO / Back otherwise, iOS
> `OnboardingFlowView.topBar` parity, `n/8` position pill), an 8-segment tappable progress row
> (`RegistrationStep.ordered` × `state.fill(step)` → colour + jump-back-only tap gate, mirrors iOS
> `InteractiveProgressBar`), bottom bar (`MeeshyPrimaryButton` driven by `RegistrationNavModel` —
> label/enabled/loading, `register()` on RECAP else `next()`; skip button PROFILE-only). PSEUDO is the
> only step with real content (username field + available/taken hint off
> `RegistrationFields.usernameAvailable`); every other step renders an inert "coming soon" placeholder.
> (2) **New pure `:core:model/auth/RegistrationStepContent.isImplemented(step): Boolean`** — the single
> SSOT deciding real-content vs. placeholder per step (today: PSEUDO only), so a future per-step slice
> extends one `Set` + adds one `when` arm in lockstep instead of the two drifting apart. (3)
> `LoginScreen` gains a "Sign up" link (`onSignUp: () -> Unit = {}`, default keeps every existing call
> site source-compatible) → `MeeshyApp.kt`'s new `Routes.REGISTRATION` route. **No dead end:** a
> placeholder step's Next stays correctly disabled (its untouched `RegistrationFields` never satisfies
> `RegistrationStepGate.canProceed` for PHONE/EMAIL/IDENTITY/PASSWORD/LANGUAGE) but Back is always
> reachable off the first step, all the way out via Close — verified by reading `phoneStepCanProceed`
> etc., not assumed. **+2 behavioural tests:** `RegistrationStepContentTest` (pseudo implemented=true;
> every other of the 7 steps implemented=false). **Mutation (RED proof):** widening `implemented` to
> `RegistrationStep.entries.toSet()` fails **exactly** `isImplemented_everyStepOtherThanPseudo_isFalse`
> (2 run, 1 failed, no collateral); RED first proven by the suite failing to compile against the absent
> `RegistrationStepContent`. **The rest of the slice is Compose wiring only** (exempt from the JVM
> coverage gate per `TDD-COVERAGE.md`, and explicitly pre-approved as such by the prior run's scope
> note) — verified by the full, unmodified `RegistrationViewModelTest` suite staying green (45/45)
> alongside the new screen, proving zero regression to the decision layer it reads. **Gate:**
> `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (full `assembleDebug` + all-module
> `testDebugUnitTest`, 943 tasks). Reviewer **PASS** (diff `apps/android` only — `core/model` [+1 new
> core + 1 new test], `feature/auth` [+1 new screen, `LoginScreen` link, ×4 locale strings], `app` [+1
> route]; SDK purity — `RegistrationStepContent` is a stateless `:core:model` lookup, the Composable
> dispatch stays app-side; SSOT — reuses every existing decision core, re-implements none; UDF —
> unchanged `RegistrationViewModel` + immutable `StateFlow`; no dead end — verified above; no
> tautological tests; no coverage floor lowered, no existing test weakened). **Next slice:** slice 2 of
> the onboarding wizard — the PHONE step field UI (country picker + skip, needs
> `RegistrationStepContent.implemented` to gain `PHONE` + a `RegistrationScreen` `when` arm), OR the §C
> **inverted-list** message layout (bottom-anchored `reverseLayout` — re-proven this run: `ChatScreen.kt`
> line 487's `LazyColumn` still has no `reverseLayout`, manages "scroll to bottom" via
> `InitialScrollTarget.of`/`isNearBottom`/`animateScrollToItem(lastIndex)` instead; genuinely large —
> touches `PinnedDayHeader.governingDayMillis`'s scan direction, the `LOAD_OLDER_THRESHOLD` trigger
> polarity, and every index-based `LaunchedEffect` in a 2000+ line file — evaluate whether it decomposes
> the same way the onboarding wizard did, or document a sub-slice breakdown, before committing a run to
> it), OR the `TagInputField` composable + `allTags` corpus hydration (still blocked on a new `tags`
> wire field on `ApiConversation`), OR the tracked **Kover 90% coverage-gate infra**.

