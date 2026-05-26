# Meeshy iOS Audit — Part 01

Scope: App bootstrap, dependency container, image config, Auth/Onboarding,
Email verification, Contacts hub (4 tabs + VMs), and a slice of Main/Components
(camera, composer models, connection banner, contact card, conversation dashboard).

25 files covered.

---

## apps/ios/Meeshy.xcodeproj/ProfileSupportViews.swift

**Purpose:** Supporting SwiftUI sheets/screens for the unified profile screen — QR code, share profile, blocked users list, app icon selector, chat background selector. iOS 16+ compatible.

**Public API surface:**
- `QRCodeView(user: User?)` — modal sheet with a placeholder QR image, "Save" / "Share" buttons.
- `ShareProfileView(user: User?)` — list of share channels (Message, Email, Copy Link, More).
- `BlockedUsersView` — `List` of blocked users with `Unblock` buttons; `ContentUnavailableView` empty state.
- `AppIconSelectorView` — 4 hardcoded icon choices.
- `ChatBackgroundView` — 4 hardcoded background color choices.
- `extension Bundle { var appVersion: String }`.

**Key behaviors / logic:** All largely placeholder/skeleton UI — QR is `Image(systemName: "qrcode")`, action button closures are empty. `BlockedUsersView` holds local `@State` empty array (not wired to a service). Selection state for icon/background is local-only and not persisted.

**Dependencies & couplings:** `User` model (avatarURL, initials, displayName, username). Located under `.xcodeproj` directory — unusual file placement (likely a build accident).

**Android-port note:** Map to Compose: QR code screen should use a real generator (ZXing) — do NOT carry the placeholder. App icon switching has no first-class Android equivalent (use launcher-alias activities, niche). Chat background should persist via DataStore. These are mostly tech-debt stubs — rebuild properly, do not port the empty closures.

- [ ] Profile QR code display + save/share
- [ ] Share profile via channels (message/email/copy link)
- [ ] Blocked users list with unblock
- [ ] App icon selection
- [ ] Chat background selection

---

## apps/ios/Meeshy/AppDelegate.swift

**Purpose:** UIKit `UIApplicationDelegate` — crash reporting bootstrap, push notification registration, silent-push handling, universal link cold-launch routing, notification categories/actions.

**Public API surface:**
- `class AppDelegate: NSObject, UIApplicationDelegate` — lifecycle, remote-notification, and universal-link delegate methods.
- `enum MeeshyNotificationCategory: String` — message / mention / friendRequest / social / call.
- `enum MeeshyNotificationAction: String` — reply / markRead / view / accept / decline / callback / answerCall / declineCall.
- `@MainActor final class SilentPushState` — actor-like guard ensuring `completionHandler` fires exactly once and `endBackgroundTask` always runs.
- `UNUserNotificationCenterDelegate` extension — `willPresent` (foreground) + `didReceive` (interaction).

**Key behaviors / logic:**
- Firebase/Crashlytics configured synchronously before custom signal handlers; DEBUG builds use `NoOpCrashReporter` to avoid polluting prod dashboards.
- Boot wires `CrashDiagnosticsManager`, `StoryFilteredLayer.preheatAllPipelines()` (Metal pipeline precompile), `MeeshyMetricsSubscriber` (MetricKit), `NotificationCoordinator`, `BackgroundTaskManager`.
- `UIRefreshControl.appearance().tintColor = .clear` — hides native spinner so brand `MeeshyPullIndicator` is the only visible refresh UI.
- Silent push: wraps the full async chain in `beginBackgroundTask` for the ~25s budget; runs a `TaskGroup` that syncs `NotificationCoordinator`, sends a delivery receipt (`PushDeliveryReceiptService`), and ensures messages via `ConversationSyncEngine`. Logs perf signposts.
- Foreground notification policy: suppress system banner if user is in the referenced conversation; suppress duplicate banner for friend events when socket is connected (in-app toast covers it).
- Interactive actions: inline reply sends a message, mark-read updates coordinator + REST + removes delivered banners; call actions route via deep-link router.
- Universal links: parse synchronously via `DeepLinkParser.isMeeshyDeepLink`, route via `DeepLinkRouter` on MainActor.

**Dependencies & couplings:** Firebase, MetricKit, `CrashDiagnosticsManager`, `NotificationCoordinator`, `PushNotificationManager`, `PushDeliveryReceiptService`, `ConversationSyncEngine`, `WidgetDataManager`, `MessageSocketManager`, `NotificationManager`, `OrientationManager`, `DeepLinkRouter`, `MessageService`, `ConversationService`, `BackgroundTaskManager`.

**Android-port note:** Map to `Application.onCreate()` + a Firebase Messaging `FirebaseMessagingService`. Notification categories → notification channels + `RemoteInput` (inline reply) + action buttons. Silent push (`data` messages) → `onMessageReceived` with `WorkManager` for the bounded background work. Universal links → App Links + deep-link nav graph. Crashlytics maps directly. The "suppress banner if in conversation" + "suppress duplicate friend banner if socket connected" logic is important UX — preserve it.

- [ ] Push notification registration + device token
- [ ] Silent push -> unread/badge sync + delivery receipt
- [ ] Interactive notification actions (reply, mark read, accept/decline friend, call actions)
- [ ] Foreground notification de-duplication policy
- [ ] Universal/deep link cold-launch routing
- [ ] Crash reporting (prod only)

---

## apps/ios/Meeshy/Core/DependencyContainer.swift

**Purpose:** App-level DI container — owns the GRDB SQLite database pool and the persistence/retry/media singletons.

**Public API surface:**
- `@MainActor final class DependencyContainer` (singleton `.shared`).
- Public lets: `dbPool: DatabasePool`, `messagePersistence: MessagePersistenceActor`, `feedPersistence: FeedPersistenceActor`, `retryEngine: RetryEngine`, `thumbnailPrefetcher: ThumbnailPrefetcher`, `mediaSnapshotStore: MediaSnapshotStore`.
- `static func databasePath()`, `nonisolated static func dbConfig()`.

**Key behaviors / logic:**
- DB stored in **App Group container** (`group.me.meeshy.apps`) → `Database/meeshy_messages.sqlite`, shared with extensions (notification/share/widget).
- Runs `MessageDatabaseMigrations` + `FeedDatabaseMigrations`, applies `DatabaseMaintenance.applyTuning`.
- SQLite PRAGMAs: `synchronous=NORMAL`, `journal_size_limit=16MB`, `wal_autocheckpoint=1000`; reader pool sized `min(cores*2, 16)`.
- One-shot incremental auto-vacuum gated by a `UserDefaults` flag, run on a detached background task.
- `fatalError` on DB init failure.
- `MessageRESTSender` is a **stub** that throws "NotImplemented" — REST send not yet wired through the retry engine.

**Dependencies & couplings:** GRDB, `MessagePersistenceActor`, `FeedPersistenceActor`, `RetryEngine`, `MessageDatabaseMigrations`, `FeedDatabaseMigrations`, `DatabaseMaintenance`, `ThumbnailPrefetcher`, `MediaSnapshotStore`, `MessageSending` protocol.

**Android-port note:** GRDB `DatabasePool` → **Room** (with WAL enabled). App Group shared DB → store DB in a path accessible to a content-provider or just keep a single-process DB if extensions are minimal on Android. The `MessageRESTSender` stub is tech debt — wire a real implementation. Migrations → Room `Migration` objects. Use Hilt for DI instead of a hand-rolled singleton.

- [ ] Shared local SQLite database (messages + feed)
- [ ] Background DB maintenance / vacuum

---

## apps/ios/Meeshy/Core/ImageDownsamplingConfig.swift

**Purpose:** Centralizes image memory budget and downsampling sizing for the custom image pipeline (no Kingfisher).

**Public API surface:**
- `enum ImageDownsamplingConfig`.
- `static let recommendedMemoryCacheLimitBytes = 60MB`.
- `static func applyGlobal()` — call once at launch; routes budget to `CacheCoordinator.configureImageMemory`.
- `static func maxPixelSize(for pointSize: CGSize) -> CGFloat` — point-size → pixel-size for `CGImageSourceCreateThumbnailAtIndex`.

**Key behaviors / logic:** 60 MB memory budget split 50 MB UIImage / 10 MB CGImage. `maxPixelSize` = larger dimension × screen scale (e.g. 40pt @3× → 120px) to avoid loading 4K images for avatars.

**Dependencies & couplings:** `CacheCoordinator` (3-tier image cache in MeeshySDK), `DiskCacheStore`.

**Android-port note:** Map to **Coil** `ImageLoader` config — set `memoryCachePolicy`, `MemoryCache.Builder().maxSizeBytes(...)`, and use `size()` on requests for downsampling. Coil handles thumbnailing natively; the explicit pixel-size helper is mostly unnecessary on Android (Coil downsamples to the target `Size`).

- [ ] Bounded in-memory image cache (60 MB)
- [ ] Per-view image downsampling

---

## apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift

**Purpose:** Decorative/animated UI for the multi-step registration flow — per-step animated background, progress bar, CTA button.

**Public API surface:**
- `AnimatedStepBackground(step: RegistrationStep)` — gradient + per-step animation (concentric circles, signal waves, floating envelopes, silhouettes, shield, globe with flags, photo frame, confetti) + floating particles + animated `WaveShape` overlay.
- `WaveShape: Shape` with `animatableData` — sine-wave path.
- `InteractiveProgressBar(currentStep:, onStepTapped:)` — tappable per-step segments; only past/current steps enabled; press scaling + haptics.
- `GlowingButton(title:, icon:, accentColor:, isEnabled:, isLoading:, action:)` — gradient CTA with glow blur, press scaling, loading spinner, haptics.

**Key behaviors / logic:** Animations start/restart on appear/step-change with a 0.1–0.15s delay; `stopAnimations` uses a `Transaction` with `disablesAnimations`. Confetti, particles, waves all `repeatForever`. Each `RegistrationStep` has `accentColor` and `iconName`.

**Dependencies & couplings:** `RegistrationStep` enum (from MeeshySDK/MeeshyUI), `MeeshyUI`.

**Android-port note:** Pure decorative — recreate with Compose `Canvas` + `rememberInfiniteTransition` / `animateFloatAsState`. `WaveShape` → `Path` drawn in `Canvas`. `GlowingButton` → custom Composable with `Brush.linearGradient` + `Modifier.shadow`/blur. Not load-bearing — replicate visually but don't over-invest.

- [ ] Animated onboarding step backgrounds
- [ ] Interactive step progress bar (tap to jump back)

---

## apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift

**Purpose:** Container orchestrating the 8-step registration wizard.

**Public API surface:**
- `OnboardingFlowView(onComplete: (() -> Void)?)`.
- Owns `@StateObject RegistrationViewModel`; `@EnvironmentObject AuthManager`.

**Key behaviors / logic:**
- `TabView` (`.page` style, no index) bound to `viewModel.currentStep` over 8 steps: pseudo, phone, email, identity, password, language, profile, recap.
- Top bar: back button (or close on first step), step icon, "n/total" pill.
- `InteractiveProgressBar` lets the user jump back to completed steps.
- Bottom bar `GlowingButton` — title/icon vary by step (recap = "Creer mon compte" + sparkles, else "C'est bon, suivant!"); profile step shows a "Passer cette etape" skip link.
- Keyboard observer via `NotificationCenter` adjusts bottom padding.
- On `authManager.isAuthenticated` flipping true, waits 1s then calls `onComplete` + dismisses.

**Dependencies & couplings:** `RegistrationViewModel` (NOT in this chunk — defines `currentStep`, `canProceed`, `isLoading`, `register()`, `nextStep`/`previousStep`, `totalSteps`, validation fields), `AuthManager`.

**Android-port note:** Map to a Compose `HorizontalPager` (Accompanist/Foundation) gated to forward swipes, or a nav-graph wizard. ViewModel → Android `ViewModel` with a `StateFlow<RegistrationStep>`. Keyboard insets → `WindowInsets.ime`. The auth-success-then-dismiss is a navigation side-effect — handle via a one-shot event channel.

- [ ] Multi-step registration wizard (8 steps)
- [ ] Jump-back navigation between completed steps

---

## apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift

**Purpose:** All 8 registration step screens + shared input components.

**Public API surface:**
- `GlassTextField` — icon + text/secure field, validation spinner, availability checkmark/cross, error row.
- `StepIllustration(iconName:, accentColor:)`.
- `FlowLayout: Layout` — wrapping flow layout (used for username suggestion chips).
- Step views: `StepPseudoView`, `StepPhoneView`, `StepEmailView`, `StepIdentityView`, `StepPasswordView`, `StepLanguageView`, `StepProfileView`, `StepRecapView`.
- `enum PasswordStrength { weak, fair, good, strong }` + `static func evaluate(_:)`; `PasswordStrengthBar`.

**Key behaviors / logic:**
- **Pseudo:** username field with async availability check + server suggestion chips; tips card.
- **Phone:** country-code picker sheet (`CountryPicker.countries`), phone availability check, skippable.
- **Email:** email field with availability check.
- **Identity:** first/last name, `textContentType` autofill.
- **Password:** strength bar (6-point score: length≥8, upper, lower, digit, special, length≥12), confirm field appears once ≥8 chars, requirements checklist, auto-focus to confirm.
- **Language:** system + regional language selectors with search + grid (`LanguageSelector.defaultLanguages`), live translated-example preview card per language (Prisme Linguistique demo). Hardcoded translated example strings for 11 languages.
- **Profile:** profile photo + banner via `PhotosPicker`, bio with 150-char counter, profile preview card, summary.
- **Recap:** loading/error/summary states, terms-acceptance checkbox, inline T&C sheet.

**Dependencies & couplings:** `RegistrationViewModel` (all fields), `CountryPicker`, `LanguageSelector`, `MeeshyUI.LanguageOption`, PhotosUI.

**Android-port note:** Each step → a Composable screen. `GlassTextField` → custom `OutlinedTextField` wrapper. `FlowLayout` → Compose `FlowRow`. `PhotosPicker` → `ActivityResultContracts.PickVisualMedia` / Photo Picker. Password strength evaluation is pure logic — port verbatim to Kotlin. Country picker → bottom sheet with a static country list. Keep async username/email/phone availability checks (debounced).

- [ ] Username availability check + suggestions
- [ ] Phone with country-code picker (skippable)
- [ ] Email availability check
- [ ] First/last name capture
- [ ] Password strength meter + requirements checklist
- [ ] System + regional language selection with live translation preview
- [ ] Profile photo / banner / bio (optional step)
- [ ] Registration recap + terms acceptance

---

## apps/ios/Meeshy/Features/Auth/ViewModels/EmailVerificationViewModel.swift

**Purpose:** ViewModel for the 6-digit email verification screen.

**Public API surface:**
- `@MainActor final class EmailVerificationViewModel: ObservableObject`.
- `@Published`: `isVerifying`, `isResending`, `resendSuccess`, `verificationSuccess`, `error`.
- `init(email: String, authService: AuthServiceProviding = AuthService.shared)`.
- `func verifyCode(_:) async`, `func resendCode() async`.

**Key behaviors / logic:** `verifyCode` calls `authService.verifyEmailWithCode`; maps `MeeshyError` to localized description. `resendCode` shows a transient `resendSuccess` flag for 3s. Protocol-injected service for testability.

**Dependencies & couplings:** `AuthServiceProviding` / `AuthService` (MeeshySDK), `MeeshyError`.

**Android-port note:** Direct map to Android `ViewModel` + `StateFlow` for each published prop, or a single `UiState` data class. `authService` → injected repository interface. The 3s transient flag → `delay()` in a coroutine.

- [ ] Email verification by 6-digit code
- [ ] Resend verification code

---

## apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift

**Purpose:** SwiftUI screen for entering the 6-digit email verification code.

**Public API surface:** `EmailVerificationView(email:, authService:)` — owns `@StateObject EmailVerificationViewModel`.

**Key behaviors / logic:** Monospaced centered code field; `textContentType(.oneTimeCode)` for OTP autofill; `onChange` filters non-digits and caps at 6 chars; verify button enabled only when 6 digits; error row; full-screen success overlay with `symbolEffect(.bounce)`. Uses `ThemeManager.shared` + `MeeshyColors`.

**Dependencies & couplings:** `EmailVerificationViewModel`, `ThemeManager`, `MeeshyColors`/`MeeshyUI`.

**Android-port note:** Compose screen with an OTP `TextField` (or a 6-cell OTP component). OTP autofill → `autofill` semantics / SMS Retriever API (for SMS) — here it's email so just `KeyboardType.Number`. Success overlay → animated `AnimatedVisibility`.

- [ ] 6-digit code entry with OTP autofill + success animation

---

## apps/ios/Meeshy/Features/Contacts/BlockedTab.swift

**Purpose:** Blocked-users tab in the Contacts hub.

**Public API surface:** `BlockedTab(viewModel: BlockedViewModel)` — `@ObservedObject` (VM owned by parent hub).

**Key behaviors / logic:** Loading spinner only on empty+loading; `LazyVStack` list with `MeeshyAvatar`, unblock button → confirm `alert`. Staggered spring entry animation (0.04s/index). Empty state with `hand.raised.slash`. `.task` triggers `loadBlocked()`.

**Dependencies & couplings:** `BlockedViewModel`, `BlockedUser` model, `MeeshyAvatar`, `DynamicColorGenerator`, `ThemeManager`, `MeeshyColors`.

**Android-port note:** Compose `LazyColumn`; unblock confirm → `AlertDialog`. Staggered animation → per-item `animateItemPlacement` / index-delayed `animateFloatAsState`. Avatar with dynamic color → custom Composable.

- [ ] Blocked users list with confirm-to-unblock

---

## apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift

**Purpose:** ViewModel for blocked users — cache-first load + optimistic unblock.

**Public API surface:**
- `@MainActor final class BlockedViewModel: ObservableObject`.
- `@Published`: `blockedUsers: [BlockedUser]`, `loadState: LoadState`.
- `init(blockService: BlockServiceProviding = BlockService.shared)`.
- `func loadBlocked() async`, `func unblock(userId:) async`.

**Key behaviors / logic:**
- Uses `CacheFirstLoader` over `CacheCoordinator.shared.blockedUsers` store (SWR pattern); maps loader states into a reduced `.loading`/`.loaded`/`.offline`/`.error` surface — no spinner when cache hit.
- `unblock`: optimistic removal with snapshot rollback on failure; haptics + toast.
- Cancels `revalidationTask` on `deinit`.

**Dependencies & couplings:** `BlockServiceProviding`, `CacheCoordinator`, `CacheFirstLoader`, `LoadState` (MeeshySDK), `HapticFeedback`, `ToastManager`.

**Android-port note:** SWR `CacheFirstLoader` → a repository emitting `Flow<Resource<List<BlockedUser>>>` (Loading/Success-stale/Success-fresh/Error) backed by Room + network. Optimistic update + rollback → keep snapshot in VM, revert on exception. `deinit` cancel → `viewModelScope` auto-cancels.

- [ ] Cache-first blocked-users load with background revalidation
- [ ] Optimistic unblock with rollback

---

## apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift

**Purpose:** Top-level Contacts screen — collapsible header + 4-tab pager.

**Public API surface:** `ContactsHubView(initialTab: ContactsTab = .contacts)`. Owns 4 `@StateObject` VMs (contacts list, requests, discover, blocked).

**Key behaviors / logic:** `CollapsibleHeader` (scroll-driven). Custom tab bar with icon + label + numeric badge (friend count / pending received count via `FriendshipCache.shared`), animated underline. `TabView` `.page` style for tab content. `@EnvironmentObject Router` for back.

**Dependencies & couplings:** `Router`, `ThemeManager`, `MeeshyColors`, `CollapsibleHeader` (MeeshyUI), `FriendshipCache`, the 4 tab VMs/views.

**Android-port note:** Compose `Scaffold` + collapsing toolbar (`TopAppBar` with `enterAlwaysScrollBehavior` or custom). Tab bar → `TabRow` with badge support; tab content → `HorizontalPager`. Badge counts driven by an observable `FriendshipCache` singleton → expose as `StateFlow`. Router → Navigation Compose.

- [ ] Contacts hub with 4 tabs (Contacts / Requests / Discover / Blocked)
- [ ] Tab badges for friend count + pending requests
- [ ] Collapsible header

---

## apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift

**Purpose:** Friends/contacts list tab with filter chips + search.

**Public API surface:** `ContactsListTab(viewModel: ContactsListViewModel)` — `@ObservedObject`; `@EnvironmentObject Router`, `StatusViewModel`.

**Key behaviors / logic:**
- Horizontal filter chips (`ContactFilter`: all, online, offline, phonebook, affiliates) — phonebook/affiliates are "Bientot disponible" placeholders (toast). All/online chips show counts.
- Search bar filters locally. `LazyVStack` list of `contactRow` → `MeeshyAvatar` with mood emoji + presence dot + mood-tap handler, online/last-active text, chevron.
- Row tap sets `router.deepLinkProfileUser` (opens profile sheet).
- Staggered spring entry animation.

**Dependencies & couplings:** `ContactsListViewModel`, `Router`, `StatusViewModel` (mood/status per user), `FriendRequestUser` model, `MeeshyAvatar`, `DynamicColorGenerator`, `ContactFilter`.

**Android-port note:** `LazyColumn` + a horizontal `LazyRow` of `FilterChip`s. Avatar with presence + mood overlay → custom Composable. Profile deep-link → navigation event. `StatusViewModel` is a shared/env VM — on Android inject the same shared VM or a status repository.

- [ ] Contacts list with online/offline filters + counts
- [ ] Contact search
- [ ] Per-contact presence + mood-emoji indicator
- [ ] Tap contact -> profile

---

## apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift

**Purpose:** ViewModel for the friends list — cache-first load, friendship-cache reconciliation, filtering.

**Public API surface:**
- `@MainActor final class ContactsListViewModel: ObservableObject`.
- `@Published`: `friends`, `loadState`, `activeFilter`, `searchQuery`.
- Computed `filteredFriends` (filter + search).
- `init(friendService:, currentUserId:, friendshipCache:)`.
- `loadFriends() async`, `setFilter(_:)`, `search(_:)`.

**Key behaviors / logic:**
- `loadFriends`: explicit `CacheResult` switch (`.fresh`/`.stale`/`.expired`/`.empty`) over `CacheCoordinator.shared.friends`; `.fresh` still triggers a background revalidate if the in-memory `FriendshipCache` disagrees with the persisted set (`cacheLagsBehindFriendship`).
- Subscribes to `FriendshipCache.$version` (Combine) → `reconcileWithCache`: removals applied locally + persisted; additions trigger a silent SWR refetch (the full user record lives only on the gateway).
- Network fetch: derives friends from accepted received+sent friend requests (dedup into `friendMap`, exclude current user), sorts online-first then by `lastActiveAt`.
- Persists snapshots to GRDB cache.

**Dependencies & couplings:** `FriendServiceProviding`, `CacheCoordinator` (`friends` store), `FriendshipCache` (in-memory observable), `FriendRequestUser`, `AuthManager`, `ContactFilter`.

**Android-port note:** This is the canonical SWR + cross-screen-reconciliation pattern. On Android: single-source-of-truth repository emitting `Flow`, with the friends list **derived from Room** and `FriendshipCache` as a separate in-memory `StateFlow`; reconcile by `combine`-ing the two flows. The "derive friends from accepted friend requests" is a server-shape quirk — preserve. `friendshipCache.$version` → `StateFlow` collected in VM.

- [ ] Cache-first friends list with cross-screen reconciliation
- [ ] Online-first sorting

---

## apps/ios/Meeshy/Features/Contacts/ContactsShared.swift

**Purpose:** Shared enums + a `Date` extension for the Contacts feature.

**Public API surface:**
- `enum ContactsTab: String, CaseIterable` — contacts/requests/discover/blocked + `icon`.
- `enum ContactFilter: String, CaseIterable` — all/online/offline/phonebook/affiliates.
- `enum RequestFilter: String, CaseIterable` — received/sent.
- `extension Date { var relativeTimeString: String }` — "A l'instant" / "Il y a Nmin/h/j" / "dd MMM" (French).

**Key behaviors / logic:** `LoadState` deliberately NOT redefined here (lives in MeeshySDK — single source of truth). Relative-time uses hardcoded `fr_FR` locale.

**Android-port note:** Enums → Kotlin `enum class`. `relativeTimeString` → use `DateUtils.getRelativeTimeSpanString` or a localized formatter — do NOT hardcode French; pull from string resources.

- [ ] Relative time-ago formatting

---

## apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift

**Purpose:** Discover tab — invite by email/SMS, import contacts, search Meeshy users.

**Public API surface:**
- `DiscoverTab(viewModel: DiscoverViewModel)`.
- `SMSComposerView: UIViewControllerRepresentable` — wraps `MFMessageComposeViewController`.

**Key behaviors / logic:**
- Email invite card (text field + send), SMS invite card (`MFMessageComposeViewController` if `canSendText()`), "Importer mes contacts" button = "Bientot disponible" placeholder.
- Search section: debounced search (≥2 chars), result rows with `MeeshyAvatar` (mood + presence), `ConnectionActionView` (add/accept/etc.), empty state.
- Row tap → `router.deepLinkProfileUser`.

**Dependencies & couplings:** `DiscoverViewModel`, `Router`, `StatusViewModel`, `MeeshyAvatar`, `ConnectionActionView`, `UserSearchResult`, MessageUI, `ToastManager`.

**Android-port note:** SMS composer → `Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:..."))` with `sms_body` extra (no permission needed). Email invite → backend call. Contact import → `ContactsContract` + READ_CONTACTS permission (the placeholder here should become a real feature on Android). Search → debounced `Flow`.

- [ ] Invite by email
- [ ] Invite by SMS
- [ ] Import phone contacts (placeholder -> implement on Android)
- [ ] Search Meeshy users with inline connect action

---

## apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift

**Purpose:** ViewModel for Discover — user search, friend-request actions, email invitation.

**Public API surface:**
- `@MainActor final class DiscoverViewModel: ObservableObject`.
- `@Published`: `searchResults`, `searchQuery`, `loadState`, `emailText`, `phoneText`, `isSendingInvite`. Derived `isSearching`.
- `performSearch()`, `loadSuggestions()`, `relationshipState(for:)`, `sendRequest(to:)`, `acceptReceivedRequest(from:)`, `sendEmailInvitation()`, `smsMessage`.

**Key behaviors / logic:**
- `performSearch`: network-only (query space unbounded, NOT cached), ≥2 chars.
- `loadSuggestions`: cache-first SWR for the empty-query "discover" list via `CacheFirstLoader` + `CacheCoordinator.shared.userSearch`.
- Bridges `FriendshipCache.$version` + `BlockService.$blockedUserIds` into `objectWillChange` so relationship badges flip on cross-screen mutations.
- `sendRequest`/`acceptReceivedRequest`: optimistic cache mutation (`didSendRequest`/`didAcceptRequest`) with rollback on failure.
- `relationshipState` delegates to shared `UserRelationshipResolver`.

**Dependencies & couplings:** `FriendServiceProviding`, `UserServiceProviding`, `FriendshipCache`, `BlockService`, `UserRelationshipResolver`, `CacheCoordinator`, `CacheFirstLoader`, `ToastManager`, `HapticFeedback`.

**Android-port note:** Search results not cached; suggestions cache-first. The Combine bridge of two singletons into `objectWillChange` → on Android `combine(friendshipCache.flow, blockService.flow)` and re-derive row state. `UserRelationshipResolver` is a shared decision function — port as a pure utility.

- [ ] Discover suggestions (cache-first)
- [ ] Live user search
- [ ] Send / accept friend request with optimistic UI
- [ ] Send email invitation

---

## apps/ios/Meeshy/Features/Contacts/RequestsTab.swift

**Purpose:** Friend requests tab — received vs sent sub-filter.

**Public API surface:** `RequestsTab(viewModel: RequestsViewModel)`; local `@State activeFilter: RequestFilter`.

**Key behaviors / logic:**
- Filter pills (Received/Sent) with counts.
- Received rows: avatar + name + message + time-ago + reject (X) / accept (✓ gradient) buttons.
- Sent rows: avatar + name + time-ago + "En attente" badge + "Annuler" button.
- Empty states per filter. Staggered animations; received rows have a move-out transition.
- `.task` loads both received + sent.

**Dependencies & couplings:** `RequestsViewModel`, `StatusViewModel`, `FriendRequest` model, `MeeshyAvatar`, `DynamicColorGenerator`, `MeeshyColors`.

**Android-port note:** `LazyColumn` + segmented filter. Accept/reject buttons → icon buttons. Row removal transition → `animateItemPlacement`.

- [ ] Received friend requests with accept/reject
- [ ] Sent friend requests with cancel

---

## apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift

**Purpose:** ViewModel for friend requests — cache-first paginated lists + offline-queue-backed accept/reject.

**Public API surface:**
- `@MainActor final class RequestsViewModel: ObservableObject`.
- `@Published`: `receivedRequests`, `sentRequests`, `loadState`, `receivedHasMore`, `sentHasMore`.
- `loadReceived()`, `loadMoreReceived()`, `loadSent()`, `loadMoreSent()`, `accept(requestId:)`, `reject(requestId:)`, `cancel(requestId:)`.

**Key behaviors / logic:**
- `loadReceived`/`loadSent`: cache-first via `CacheFirstLoader` over `CacheCoordinator.shared.friendRequests`; sent list filtered to `status == "pending"`; received list drives `loadState`, sent list does not.
- Pagination (`pageSize 30`) with offset tracking; note: `sentOffset` tracks the **filtered** count (deliberate, documented).
- **Accept/Reject go through the offline outbox** (`OfflineQueue.shared.enqueue(.respondFriendRequest)`) with a `ClientMutationId` for idempotent retry; optimistic list mutation + `FriendshipCache` flip + GRDB friend-cache invalidate-then-persist (ordering matters — invalidate FIRST so optimistic write isn't masked).
- `observeOutcome`: subscribes to `OfflineQueue.outcomeStream(for: cmid)`; rolls back on `.exhausted`.
- `cancel`: direct `friendService.deleteRequest` with optimistic removal + rollback (NOT via outbox).
- `persistAcceptedFriend`: merges accepted sender into the persistent `friends_list` GRDB cache so the new contact survives an offline relaunch.

**Dependencies & couplings:** `FriendServiceProviding`, `CacheCoordinator`, `CacheFirstLoader`, `FriendshipCache`, `OfflineQueue`, `ClientMutationId`, `RespondFriendRequestPayload`, `ToastManager`, `HapticFeedback`.

**Android-port note:** This is the **offline-write architecture** — critical to port faithfully. `OfflineQueue` → a `WorkManager`-backed outbox table (Room) with `clientMutationId` for idempotency; `outcomeStream` → a `Flow` of per-mutation outcomes. The invalidate-before-persist ordering and optimistic-cache nuances must be preserved exactly. Pagination → `Paging 3` or manual offset.

- [ ] Cache-first paginated received/sent requests
- [ ] Offline-queued accept/reject with idempotent retry + rollback
- [ ] Optimistic friend persistence (survives offline relaunch)

---

## apps/ios/Meeshy/Features/Main/Components/AddParticipantSheet.swift

**Purpose:** Bottom sheet to search users and add them to a conversation.

**Public API surface:**
- `AddParticipantSheet(conversationId:, accentColor:, existingMemberIds:, onAdded:)`.
- Private `UserSearchResult` / `UserSearchResponse` decodables.

**Key behaviors / logic:** Debounced search (≥2 chars) hitting `GET /users/search`; skeleton shimmer rows while searching; rows show "Membre" (already in conv) / spinner / "Ajouter" button; add → `POST /conversations/{id}/participants` with `{userId}` body. Haptics + error message. Uses conversation `accentColor`.

**Dependencies & couplings:** `APIClient` (direct REST, not a service protocol — slight inconsistency), `APIResponse`, `MeeshyAvatar`, `DynamicColorGenerator`, `ThemeManager`, custom `Logger`.

**Android-port note:** `ModalBottomSheet` in Compose. Search → debounced `Flow`. The direct `APIClient` usage (vs a service protocol) is a minor anti-pattern — on Android route through a repository. Skeleton shimmer → a shimmer modifier.

- [ ] Search + add participants to a conversation

---

## apps/ios/Meeshy/Features/Main/Components/CameraView.swift

**Purpose:** Full-screen in-app camera for photo + video capture.

**Public API surface:**
- `enum CameraResult { case photo(UIImage); case video(URL) }`.
- `CameraView(onCapture: (CameraResult) -> Void)`.
- `@MainActor final class CameraModel: NSObject, ObservableObject` — AVFoundation session wrapper; conforms to `AVCapturePhotoCaptureDelegate` + `AVCaptureFileOutputRecordingDelegate`.
- `CameraPreviewLayer: UIViewRepresentable` — `AVCaptureVideoPreviewLayer` host.

**Key behaviors / logic:**
- Requests video + audio permissions; sets up `AVCaptureSession` (`.high` preset) with photo + movie outputs; `startRunning` on a detached task (off main).
- Photo/Video mode switch, front/back camera toggle, 3-state flash (off/on/auto), recording timer (0.5s tick), recording indicator with `m:ss`.
- Capture results delivered via `@Published` id changes (`capturedPhotoId`/`capturedVideoId`) observed by the View → `onCapture` + dismiss.
- Video saved to `temporaryDirectory`.

**Dependencies & couplings:** AVFoundation, `HapticFeedback`, `MeeshyUI`.

**Android-port note:** Map to **CameraX** (`PreviewView`, `ImageCapture`, `VideoCapture`/`Recorder`). Permissions → `ActivityResultContracts.RequestMultiplePermissions` (CAMERA, RECORD_AUDIO). Flash → `ImageCapture.flashMode` / `CameraControl.enableTorch`. Front/back → `CameraSelector`. Recording timer → coroutine. Note `nonisolated(unsafe)` session is an iOS concurrency workaround — N/A on Android.

- [ ] In-app camera: photo capture
- [ ] In-app camera: video recording
- [ ] Flash control + front/back toggle

---

## apps/ios/Meeshy/Features/Main/Components/ComposerModels.swift

**Purpose:** Value models + helpers for the universal message composer.

**Public API surface:**
- `enum ComposerAttachmentType` — image/file/voice/location/video.
- `struct ComposerAttachment: Identifiable, Equatable` — id, type, name, url, size, duration, lat/lng, thumbnailColor; factory methods `voice`/`location`/`image`/`file`.
- `struct LanguageOption` + `static let defaults` (10 languages).
- `enum DefaultComposerLanguage { static func resolve() -> String }` — keyboard-layout-based source language, `"fr"` fallback; deliberately ignores `Locale.current`.
- `@MainActor class KeyboardObserver: ObservableObject` — `@Published height`, `isVisible`, plus `lastKnownHeight`.
- `ComposerWaveformBar` — animated recording waveform bar.

**Key behaviors / logic:** `DefaultComposerLanguage.resolve` reads `UITextInputMode.activeInputModes.first?.primaryLanguage` — a Prisme Linguistique rule (UI locale must NOT drive content language). `KeyboardObserver` tracks keyboard frame via `NotificationCenter`, keeps `lastKnownHeight` for emoji-panel sizing. Equatable on `ComposerAttachment` is id-only.

**Dependencies & couplings:** AVFoundation, Combine, `Color(hex:)`.

**Android-port note:** `ComposerAttachment` → Kotlin `data class` (id-based equality → override `equals`). `DefaultComposerLanguage` → resolve from the active IME subtype (`InputMethodManager` / `InputMethodSubtype.locale`), fallback `"fr"`, never device locale — **Prisme rule must be preserved**. `KeyboardObserver` → `WindowInsets.ime` (no manual `NotificationCenter` needed). Waveform → `Canvas` animation.

- [ ] Composer attachments (image/file/voice/location/video)
- [ ] Keyboard-layout-based composer source language
- [ ] Recording waveform animation

---

## apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift

**Purpose:** Small transient pill showing socket connection / sync status.

**Public API surface:** `ConnectionBanner` — owns `@StateObject ConnectionStatusViewModel`.

**Key behaviors / logic:** Shows a "Synchronisation..." pill when `.syncing`, or a "Reconnexion..." pill when `.disconnected` **but only after a 10s grace delay** (avoids flicker on brief drops). Animated dots (0.5s timer) + pulsing dot. The 10s delay uses `.task(id:)` + `Task.sleep`, cancelled if reconnected.

**Dependencies & couplings:** `ConnectionStatusViewModel` (not in chunk), `MeeshyColors`, `MeeshyUI`.

**Android-port note:** Compose `AnimatedVisibility` pill driven by a `StateFlow<ConnectionStatus>`. The 10s debounce → `flow { ... }.debounce()` or a delayed coroutine cancelled on state change. Preserve the grace period — important UX (no flicker on transient drops).

- [ ] Connection/sync status banner with 10s reconnect grace period

---

## apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift

**Purpose:** Renders a shared-contact card inside a message bubble + a UIKit contact picker wrapper.

**Public API surface:**
- `ContactCardView(contact: SharedContact, accentColor: String, onTap:)`.
- `ContactPickerView: UIViewControllerRepresentable` — wraps `CNContactPickerViewController`.

**Key behaviors / logic:** Card shows avatar circle, "Contact partage" label, full name, phone numbers (green), emails (blue), glass background tinted by conversation `accentColor`. Picker coordinator maps a `CNContact` → `SharedContact(fullName, phoneNumbers, emails)`.

**Dependencies & couplings:** Contacts/ContactsUI frameworks, `SharedContact` model, `ThemeManager`, `Color(hex:)`, `HapticFeedback`.

**Android-port note:** `ContactCardView` → a Composable card. `ContactPickerView` → `ActivityResultContracts.PickContact` + a `ContactsContract` query to extract phones/emails (needs READ_CONTACTS for the detail query). `SharedContact` → Kotlin `data class`.

- [ ] Shared-contact card in message bubble
- [ ] Pick a device contact to share

---

## apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift

**Purpose:** Rich analytics dashboard for a conversation — AI analysis, stats, activity chart, participant profiles, sentiment, content types.

**Public API surface:** `ConversationDashboardView(conversationId:, messages:, accentColor:, participants:)`. Private helper structs/views: `ActivityPoint`, `ParticipantStat`, `SentimentResult`, `ContentTypeStat`, `StatRing`, `ArcGauge`, `ArcShape`, `staggerIn` modifier.

**Key behaviors / logic:**
- Loads server data in parallel (`async let`): `ConversationAnalysisService.fetchAnalysis` (AI) + `fetchStats`.
- **Hero AI card:** health score `ArcGauge`, engagement/conflict pills, summary text, current topics, dominant emotions, overall tone, "dynamique".
- **Stats rings:** messages / words / photos / audio / videos / links / documents — `StatRing` circular progress; **server-first with client fallback** (`effective*` computed props).
- **Activity chart:** `Swift Charts` line+area; period picker (7j/30j/Tout); server `dailyActivity` or client-computed grouping by day/week.
- **Participant profiles:** AI persona summary, tone, vocabulary level, trait bars (communication/personality/interpersonal/emotional — extracted via `Mirror` reflection), catchphrases, topics, common emojis.
- **Participant breakdown:** ranked message-count bars, server-first or client-computed.
- **Sentiment:** on-device `NLTagger` (`.sentimentScore`) over messages (sampled to 200 if more), positive/neutral/negative split with bar.
- **Content types:** text/photo/audio/video/file counts.
- Staggered section entry + animated rings.

**Dependencies & couplings:** Swift Charts, NaturalLanguage (`NLTagger`), `ConversationAnalysisService`, models `ConversationAnalysis`/`ConversationMessageStatsResponse`/`ParticipantProfile`/`ParticipantTraits`/`TraitScore`, `Message`, `PaginatedParticipant`, `DynamicColorGenerator`, `FlowLayout`.

**Android-port note:** Charts → **Vico** or `compose-charts`. On-device sentiment (`NLTagger`) → ML Kit (no direct sentiment API) or a small TFLite model, or rely on server-side sentiment — Apple's `NLTagger` has no Android equivalent; prefer server-provided sentiment. **`Mirror`-based trait extraction is reflection tech debt** — on Android model `ParticipantTraits` as an explicit list/map, do NOT reflect. Keep the server-first/client-fallback pattern. `StatRing`/`ArcGauge` → `Canvas` composables. Uses `print()` for errors — replace with proper logging.

- [ ] Conversation AI analysis (health score, summary, topics, tone)
- [ ] Conversation stats rings (messages/words/media counts)
- [ ] Activity-over-time chart with period selector
- [ ] AI participant persona profiles + trait bars
- [ ] Per-participant activity breakdown
- [ ] Sentiment analysis
- [ ] Content-type breakdown

---

## Architecture observations

**State management & MVVM.** Consistent MVVM: every screen has a `@MainActor ObservableObject` ViewModel with `@Published` state and protocol-injected services (`*Providing` defaulting to `.shared`). ViewModels expose a shared `LoadState` enum from MeeshySDK (single source of truth). Android: map each VM 1:1 to an Android `ViewModel`, services → repository interfaces injected via Hilt, `@Published` → `StateFlow` (prefer one `UiState` data class per screen over many flows).

**Cache-first / SWR is pervasive and load-bearing.** `CacheFirstLoader` + `CacheCoordinator` stores back nearly every list (blocked users, friends, requests, discover suggestions, images). The contract: serve cache immediately, never spinner on cache hit, silently revalidate, distinguish `.fresh`/`.stale`/`.expired`/`.empty`. `ContactsListViewModel` goes further with cross-screen reconciliation between an in-memory `FriendshipCache` and the persisted GRDB cache. Android: implement a `Resource<T>`-emitting repository pattern (Room as SoT + NetworkBoundResource); this is the single most important pattern to port faithfully.

**Offline-first writes.** Friend request accept/reject flow through an `OfflineQueue` outbox with `ClientMutationId` for idempotent retry and an outcome stream for rollback on exhaustion; optimistic UI everywhere with snapshot rollback. Friend cache invalidate-before-persist ordering is deliberate. Android: a Room-backed outbox + `WorkManager` with unique work + client mutation IDs. This (plus SWR) is the architectural backbone.

**Persistence & concurrency.** GRDB `DatabasePool` in an App Group container shared with extensions; tuned PRAGMAs (WAL, NORMAL sync); `MessagePersistenceActor`/`FeedPersistenceActor` actors; structured concurrency (`async let`, `TaskGroup`) throughout. Android: Room with WAL; `viewModelScope`/`Dispatchers.IO`. The App Group sharing concept barely applies to Android — keep a single-process DB unless extensions genuinely need it.

**Tech debt / do NOT carry over:** (1) `ProfileSupportViews` is mostly placeholder UI with empty action closures and a fake QR code — rebuild properly. (2) `MessageRESTSender` in `DependencyContainer` is a `throw NotImplemented` stub. (3) `ConversationDashboardView` extracts trait scores via `Mirror` reflection — model traits explicitly on Android. (4) `AddParticipantSheet` calls `APIClient` directly instead of a service protocol — route through a repository. (5) `print()` used for error logging in the dashboard — use structured logging. (6) Hardcoded `fr_FR` locale and hardcoded French strings (relative time, onboarding, translated examples) — Android must use string resources / localized formatters. (7) Contact import is a "Bientot disponible" placeholder — should become a real feature on Android.

**Performance techniques worth preserving:** `LazyVStack` for all lists; staggered entry animations (0.04–0.08s/index); image downsampling + bounded 60 MB memory cache; Metal pipeline preheat at launch; sentiment sampling capped at 200 messages; server-first/client-fallback for expensive stats; 10s grace period on the reconnect banner to avoid flicker. Android equivalents: `LazyColumn` + `key`, Coil downsampling, debounced flows.
