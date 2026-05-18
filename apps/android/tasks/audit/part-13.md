# Meeshy iOS Audit — Part 13

Scope: iPad two-column root, story-notification redirect flow, app entry point, all 5 app extensions (NSE, Share, Widgets, Intents/Siri, Live Activities), WebRTC video bridge, and SDK audio recording/waveform layer.

---

## apps/ios/Meeshy/Features/Main/Views/WebRTCVideoView.swift

**Purpose**: SwiftUI bridge wrapping `RTCMTLVideoView` (Metal-backed WebRTC renderer) for displaying call video tracks.

**Public API surface**:
- `WebRTCVideoView: UIViewRepresentable` (only `#if canImport(WebRTC)`) — props `track: RTCVideoTrack?`, `mirror: Bool`, `contentMode: UIView.ContentMode`; `Coordinator` holds `currentTrack` + `renderer`.
- `CallVideoView: View` — track-agnostic wrapper accepting `Any?` (cast from `CallManager`); falls back to a black view with `video.slash` icon when no track / WebRTC unavailable.

**Key behaviors**:
- `updateUIView` swaps the renderer between old/new tracks using `track.add/remove(view)`; `dismantleUIView` detaches the track on teardown (prevents leaks).
- Front-camera mirroring via `CGAffineTransform(scaleX: -1)`.
- Two compilation branches: real WebRTC vs. a text-only fallback ("Video non disponible").

**Dependencies**: `WebRTC` SPM package (optional); `CallManager` produces the type-erased track.

**Android-port note**: Use `org.webrtc.SurfaceViewRenderer` inside an `AndroidView` composable. Map track attach/detach to `videoTrack.addSink()/removeSink()`. Mirroring: `setMirror(true)`. The `Any?` type-erasure is iOS-specific tech debt — Android can carry a strongly-typed `VideoTrack?` directly.

---

## apps/ios/Meeshy/Features/Main/Views/WidgetPreviewView.swift

**Purpose**: In-app dashboard sheet ("Tableau de bord") — unread count, recent conversations, link stats (affiliate/share/tracking/community), and quick actions. NOT a home-screen widget; an in-app preview of widget-style content.

**Public API surface**: `WidgetPreviewView: View` with optional `onNewConversation` callback. `Notification.Name.openFeedComposer` extension.

**Key behaviors**:
- Animated unread counter: `animateUnreadCounter()` steps from 0 to target in `min(target,30)` increments with staggered `DispatchQueue.asyncAfter` + `.numericText()` content transition.
- Recent conversations: top-3 active sorted by `lastMessageAt`.
- `.task` parallel-loads affiliate tokens, tracking stats, share stats, community links via `async let`.
- Quick actions: new conversation, share link, feed post (NotificationCenter post), settings (router push). All dismiss-then-`asyncAfter(0.3)` before navigating (lets the sheet animation finish).
- `formatRelativeTime` — local "Maintenant / Nmin / Nh / Nj / dd/MM".

**Dependencies**: `ConversationListViewModel`, `Router`, `AffiliateViewModel`, `TrackingLinkService`, `ShareLinkService`, `CommunityLinkService`, `ThemeManager`, `MeeshyColors`, `HapticFeedback`.

**Android-port note**: A Compose bottom-sheet/screen. The 0.3s dismiss-then-navigate hack should be replaced with proper navigation result handling. Use `LaunchedEffect` for parallel loads (coroutines `async`). Counter animation → `animateIntAsState`.

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView.swift

**Purpose**: iPad-only two-column adaptive root. Layout contract: default `[Feed | Conv List]`; conversation open `[Conv List | Conversation]`; hub route `[Feed | Settings/Notifications/...]`.

**Public API surface**: `iPadRootView: View`. State: `activeConversation: Conversation?`, `rightPanelRoute: Route?`, `leftColumnRatio: CGFloat` (resizable 0.30–0.50). Owns `@StateObject`s: `ThemeManager`, `ToastManager`, `StoryViewModel`, `StatusViewModel`, `ConversationListViewModel`, `Router`, `StoryViewerCoordinator`.

**Key behaviors**:
- File split across 5 files (Navigation/Overlays/Panels/Sheets + base).
- `router.onRouteRequested` / `onPopRequested` closures wire Router into the two-column model (`.conversation` route → `openConversation`, others → `rightPanelRoute`).
- `.task`: connects `MessageSocketManager`, subscribes status socket events, starts `ConversationSyncEngine` socket relay, background retention cleanup (5s delay), loads stories/statuses/conversations, refreshes unread count.
- `themedBackground`: gradient + ambient orbs `.drawingGroup()` (Metal rasterization).
- Deep-link `.onChange(initial: true)` covers cold-launch Universal Link race.

**Dependencies**: `DeepLinkRouter`, `CallManager`, `NetworkMonitor`, `NotificationManager`, `ConversationSyncEngine`, all sub-extension files.

**Android-port note**: Android tablet layout — use `WindowSizeClass` (`Expanded` width) to switch between single-pane and a two-pane `Row`. The resizable divider → a draggable splitter persisting ratio in DataStore. `drawingGroup()` → no direct equivalent; orbs can be a static drawable or `Canvas`.

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Navigation.swift

**Purpose**: All navigation & notification routing for iPad root.

**Public API surface (extension methods)**: `openConversation`, `closePanels`, `handleDeepLink`, `joinViaShareLink`, `handleSendMessageToUser`, `handlePushNavigateToRoute`, `handleStoryReply`, `handleNotificationTap(APINotification)`, `handleSocketNotificationTap(SocketNotificationEvent)`, `handlePushNotificationTap(NotificationPayload)`, `navigateToConversationById`, `isStoryPost`, `makeStoryContext(from:)` (x2).

**Key behaviors / business logic**:
- Three parallel notification-tap handlers (APINotification / SocketNotificationEvent / NotificationPayload) — large `switch` over `MeeshyNotificationType` mapping each type to a destination. Heavy legacy enum-case coverage (`.legacy*` aliases everywhere).
- `navigateToConversationById`: cache-hit fast path; otherwise retry-once (600ms sleep) network fetch — handles the gateway-commit-visibility race for freshly created conversations. `ensureUnread` synthesizes `unreadCount = 1`.
- Story-post heuristic (`isStoryPost`): `postType == "STORY"` OR cached post has non-nil `expiresAt`.
- `joinViaShareLink`: authenticated idempotent share-link resolution; maps `MeeshyError` 404/410/forbidden to localized toasts.

**Dependencies**: `ShareLinkService`, `ConversationService`, `StoryService`, `AuthManager`, `ToastManager`, `Router`, `StoryNotificationContext`.

**Android-port note**: This routing logic is the canonical notification→destination map — replicate exactly as a `NotificationRouter` class. The triple-handler duplication (APINotification vs socket vs push payload) is tech debt; Android should normalize all three sources into one `NotificationEvent` value type, then route once. Retry-once race handling must be preserved.

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Overlays.swift

**Purpose**: Overlay layer for iPad root — offline banner, toasts, socket notification toasts, with z-index ordering (190/200/201).

**Public API surface**: `var overlays: some View` extension.

**Key behaviors**: `OfflineBanner` when `networkMonitor.isOffline`; `ToastView` from `ToastManager.currentToast` (tap to dismiss); `NotificationToastView` from `NotificationManager.currentToast` (tap routes via `handleSocketNotificationTap`).

**Dependencies**: `OfflineBanner`, `ToastView`, `NotificationToastView`, `MeeshySpacing`, `MeeshyAnimation`.

**Android-port note**: Compose — a `Box` with `Snackbar`/custom banners. Use a shared `SnackbarHostState` + offline banner driven by connectivity `Flow`. Z-ordering → composition order in the `Box`.

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift

**Purpose**: Right-panel route → screen mapping for iPad hub routes, plus `iPadLeftColumnHeader` and `iPadResizableHandle`.

**Public API surface**:
- `rightPanelContent(for: Route) -> some View` — exhaustive `switch` over `Route` (settings, profile, contacts, community list/detail/create/settings/members/invite, notifications, userStats, links, affiliate, tracking/share/community links, dataExport, postDetail, bookmarks, starredMessages, friendRequests, editProfile, storyNotificationTarget).
- `iPadLeftColumnHeader: View` — title + optional Feed/notifications/settings buttons with badge.
- `iPadResizableHandle: View` — `DragGesture`-driven column splitter, clamps ratio 0.30–0.50.

**Key behaviors**: Community sub-flow navigation is callback-chained (`onSelectCommunity → rightPanelRoute = .communityDetail`). `ConnectionBanner` inset on several panels.

**Android-port note**: The `Route` enum is the full app destination catalog — port it as a sealed class for Navigation Compose. Resizable handle → draggable `Modifier.pointerInput`. The callback-chained community navigation is fragile; prefer a proper nav graph with typed args.

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift

**Purpose**: Sheet & full-screen-cover modifiers for iPad root.

**Public API surface**: `applyingSheets(_ content:) -> some View`.

**Key behaviors / couplings worth preserving**:
- Profile sheet (`UserProfileSheet` with mood emoji), share picker (`SharePickerView`), new conversation, two story-viewer covers (legacy tray path + coordinator-driven path), call full-screen cover (`.fullScreen` mode) + floating call pill (`.pip` mode).
- CRITICAL: SwiftUI sheets/covers do NOT inherit `EnvironmentObject`s — every sheet manually re-injects `conversationViewModel`, `router`, `statusViewModel`. This is a recurring iOS gotcha.
- Swiping the call cover down minimizes (sets `displayMode = .pip`) instead of ending the call.

**Android-port note**: Compose `ModalBottomSheet` / dialog destinations DO share the `CompositionLocal`/ViewModel scope if hosted under the same nav graph — the env-object re-injection problem disappears. Call PiP → Android `PictureInPictureParams` (real OS PiP) or an overlay.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveBridge.swift

**Purpose**: Thin SwiftUI bridge (Phase F) that redirects a story-notification tap into the existing `StoryViewerView`.

**Public API surface**:
- `protocol StoryViewerCoordinating: AnyObject` (`@MainActor`) — `func present(_ request: StoryViewerRequest)`.
- `StoryActiveBridge: View` — inputs `post: APIPost`, `intent: StoryIntent`, `viewerCoordinator: any StoryViewerCoordinating`, `dismiss: () -> Void`.

**Key behaviors**: Body is just `StoryNotificationLoadingView`; `onAppear → handleAppear()` maps `intent` → `StoryViewerInitialAction` (`.comments → showCommentsOverlay`, `.reactions → showViewersSheet`, `.view → nil`), builds a `StoryViewerRequest(id: post.author.id, ...)`, hands it to the coordinator, and self-dismisses (~250ms visible).

**Dependencies**: `StoryViewerRequest`, `StoryNotificationLoadingView`, `APIPost`.

**Android-port note**: Skip the "bridge as a View" pattern — Android can do the redirect directly in the ViewModel/navigation handler. Map intent→initial-action in a pure function. The coordinator protocol → an interface or shared nav event channel.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift

**Purpose**: Empty-state screen when a story-notification points at an expired/deleted/404 story.

**Public API surface**:
- `Notification.Name.openStoryComposer` (public extension).
- `StoryExpiredContent: View` — `storyId: String`, `context: StoryNotificationContext`.
- `static func foregroundOnBackground(_ bg: Color) -> Color` — WCAG luminance threshold 0.6 (testable pure function).

**Key behaviors**: Random background color from `StoryBackgroundPalette` sampled once per instance; adaptive black/white foreground. Composition: actor header (avatar + name + relative time) → trigger visual (emoji for reaction, bubble icon for comment) → comment excerpt (italic) → localized title/subtitle → "Create a story" CTA (dismiss + post `openStoryComposer`) → back link.

**Dependencies**: `StoryNotificationContext`, `StoryBackgroundPalette`, `MeeshyAvatar`, `HapticFeedback`.

**Android-port note**: Compose screen. Luminance helper → port the WCAG formula. Random palette color must be remembered (`remember { palette.random() }`). CTA decoupling via Notification → use a shared event `Flow` / nav callback.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift

**Purpose**: Value types for the story-notification flow.

**Public API surface**:
- `enum StoryIntent: Hashable, Codable` — `.comments / .reactions / .view`.
- `struct StoryNotificationContext: Hashable, Codable` — `actorAvatar: String?`, `actorDisplayName: String`, `trigger: Trigger`, `occurredAt: Date`; nested `enum Trigger` — `.reaction(emoji:)` / `.comment(preview:)`.
- `static func from(_ notification: APINotification) -> StoryNotificationContext` — resilient mapper with fallback chains; private ISO8601 date parser (with/without fractional seconds).

**Android-port note**: Trivial Kotlin port — sealed classes / data classes. The `from()` mapper fallback chain (`reactionEmoji ?? emoji ?? "❤️"`, `commentPreview ?? messagePreview ?? ""`) must be preserved verbatim.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift

**Purpose**: Minimal skeleton shown while the target VM resolves active vs. expired.

**Public API surface**: `StoryNotificationLoadingView: View` — black 60%-opacity overlay + circular spinner + "Loading...".

**Android-port note**: Compose `Box` + `CircularProgressIndicator`. Rarely visible (cache hits hand off in a frame).

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift

**Purpose**: Top-level destination for a story-notification tap; composes loading / active / expired states.

**Public API surface**: `StoryNotificationTargetScreen: View` — init `(storyId, intent, context, storyService: StoryServiceProviding = StoryService.shared)`. Owns `@StateObject vm`, consumes `StoryViewerCoordinator` via `@EnvironmentObject`.

**Key behaviors**: `switch vm.state` → loading skeleton / `StoryActiveBridge` / `StoryExpiredContent`. `.task { await vm.load() }`.

**Android-port note**: Compose screen with a `when(state)`. DI: constructor-inject the story service (Hilt). Coordinator → scoped ViewModel or nav event channel.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift

**Purpose**: Cache-first / network-revalidate VM driving the target screen.

**Public API surface**: `@MainActor StoryNotificationTargetViewModel: ObservableObject` — `enum LoadState { loading, active(APIPost), expired }`, `@Published private(set) var state`, exposes `storyId/intent/context`. `func load() async`.

**Key behaviors / algorithm**:
1. Synchronous cache read (`storyService.cachedPost`) → immediately publishes `.active`/`.expired` (no spinner on hit).
2. Always re-fetch from network; fresh result wins (active cached story may now be expired).
3. Network failure only falls back to `.expired` if state is still `.loading` (never overwrites a usable cached answer).
- `isExpired`: `expiresAt != nil && expiresAt <= now`.
- Idempotent — safe to call multiple times.

**Dependencies**: `StoryServiceProviding` (protocol, injected).

**Android-port note**: Textbook SWR — port as a ViewModel with `StateFlow<LoadState>`. Preserve the "network failure keeps cached answer" rule exactly. Sealed class for `LoadState`.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerCoordinator.swift

**Purpose**: Reference type owning the `@Published` binding that drives the story-viewer full-screen cover; hoisted to root so deep views can present via `@EnvironmentObject`.

**Public API surface**: `@MainActor final class StoryViewerCoordinator: ObservableObject, StoryViewerCoordinating` — `@Published var pendingRequest: StoryViewerRequest?`; `present(_:)` (latest wins), `dismiss()`.

**Android-port note**: A nav-event holder — Android: a shared `SharedFlow<StoryViewerRequest>` or an activity/nav-scoped ViewModel. `Identifiable`-driven `.fullScreenCover(item:)` → emit event → navigate to viewer destination.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerInitialAction.swift

**Purpose**: Side-effect the story viewer performs on first appear when opened from a notification.

**Public API surface**: `enum StoryViewerInitialAction: Hashable` — `.showCommentsOverlay` / `.showViewersSheet`. `nil` = normal open.

**Android-port note**: Kotlin enum; passed as a nav argument to the viewer destination, consumed once in `LaunchedEffect`.

---

## apps/ios/Meeshy/MeeshyApp.swift

**Purpose**: App entry point — boot orchestration, auth gating, splash, deep links, scene-phase lifecycle, login/logout teardown.

**Public API surface**: `@main struct MeeshyApp: App`; `SystemThemeDetector<Content>`; `SplashScreen`.

**Key behaviors / business logic worth preserving**:
- `init()`: registers `CacheBackgroundFlushTask` BGTask BEFORE scene creation (mandatory ordering).
- Root: `AdaptiveRootView` (authed) / `LoginView` (after session check) / `SplashScreen` overlay; `GuestConversationContainer` and `OnboardingView` as full-screen covers.
- Massive `.task` boot sequence: image downsampling config, keychain migration, restore env, focus-filter bridge, `CacheCoordinator.start()`, `PresenceManager` early touch (avoid dropped `presence:snapshot`), `StoryOfflineQueueBootstrap.start()`, configure `OfflineQueue` SQLite pool, **boot crash recovery** (`OfflineQueue.bootRecovery()` resets `.inflight` rows to `.pending`), wire retry-send handler + settings-action flush handler, delete legacy JSON queue files, drain `OutboxFlusher`, parallel friendship hydration + session check, conversations cache preload, push permission + VoIP register, retention purge (6-month message GC).
- Enforced 1.2s minimum splash duration.
- `scenePhase`: `.active` → clear delivered notifications, foreground transition coordinator, widget action flush; `.background` → `BackgroundTransitionCoordinator.enterBackground()` + DB incremental vacuum/optimize.
- `onChange(isAuthenticated)`: login → re-arm coordinators, `StoryPublishService.configure()`, re-hydrate friendship cache, force socket reconnect, push/VoIP re-register, **E2EE public bundle generation + upload**, keychain migration; logout → reset notification managers, **clear friendship cache + wipe Signal/E2EE keys** (prevents cross-account identity leak), `CacheCoordinator.reset()` (purges all disk stores — not namespaced by userId), disconnect sockets.
- Deep links: `magicLink` handled at app level (`validateMagicLink`); guest join/chat links held until `hasCheckedSession`.

**Dependencies**: `DependencyContainer`, `AuthManager`, `ToastManager`, `PushNotificationManager`, `DeepLinkRouter`, `ThemeManager`, `OfflineQueue`, `OutboxFlusher`, `CacheCoordinator`, `E2EEService`, `SessionManager`, `MessagePersistenceActor`, `BackgroundTransitionCoordinator`, GRDB pool.

**Android-port note**: Map to `Application.onCreate` + a main `Activity` / `MainViewModel`. BGTask → `WorkManager` (register periodic work). Splash → `SplashScreen` API (androidx.core.splashscreen). Scene phase → `Lifecycle` observers / `ProcessLifecycleOwner`. CRITICAL: replicate the login/logout teardown — clearing E2EE keys and disk caches on logout is a security requirement (no userId namespacing → must wipe). Boot crash recovery (reset inflight outbox rows) must be ported. Magic-link / guest-link gating-until-session-check logic must be preserved.

---

## apps/ios/Meeshy/MeeshyUIExports.swift

**Purpose**: One line — `@_exported import MeeshyUI` so app files get `MeeshyUI` symbols transitively.

**Android-port note**: No equivalent needed — Gradle module visibility handles this.

---

## apps/ios/MeeshyContextMenu/Examples/MeeshyContextMenuExamples.swift

**Purpose**: Demo/example file (not production) showing the custom `meeshyContextMenu` modifier API — conversation row, message bubble, custom config, programmatic presentation, result-builder syntax.

**Public API surface (referenced, defined elsewhere)**: `MeeshyContextMenuSection`, `MeeshyContextMenuItem`, `MeeshyContextMenuConfiguration`, `MeeshyContextMenuPresenter`, `.meeshyContextMenu(...)` modifier (items / sections / result-builder forms). Local mock models `MockConversation`, `MockMessage`.

**Android-port note**: Examples file — DO NOT port. But the underlying custom context-menu component (long-press → glassmorphic action sheet with sections, destructive items, subtitles) IS a portable feature: Android `ModalBottomSheet` or `DropdownMenu` triggered by `combinedClickable(onLongClick=...)`.

---

## apps/ios/MeeshyIntents/AppIntents.swift

**Purpose**: Siri / Shortcuts / Spotlight integration via App Intents (iOS 16+).

**Public API surface**:
- `MeeshyAppShortcuts: AppShortcutsProvider` — 5 shortcuts (send message, call, translate, recent conversation, check notifications).
- `SendMessageIntent`, `CallContactIntent` (audio/video), `TranslateTextIntent` (10 target languages), `OpenRecentConversationIntent`, `CheckNotificationsIntent` — all build `meeshy://` deep-link URLs and open the app (except CheckNotifications which returns a dialog + snippet view reading from App Group).
- `ContactEntity: AppEntity` + `ContactQuery: EntityQuery` (reads contacts/favorites from App Group UserDefaults).
- `NotificationCheckView`, `SiriTipsView`, `IntentHandler` (legacy stub).

**Key behaviors**: Intents communicate with the app purely via deep-link URLs (`meeshy://send`, `meeshy://call`, `meeshy://translate`, `meeshy://conversations/recent`). Shared data via App Group suite `group.me.meeshy.apps`.

**Android-port note**: Android equivalent is **App Actions / shortcuts.xml + Google Assistant** and `androidx.core` `ShortcutManager` dynamic shortcuts. Translate/send/call → deep-link `Intent`s with the same URI scheme. `ContactEntity`/`EntityQuery` → app shortcut targets backed by a `ContentProvider` or shared `DataStore`. Lower priority feature.

---

## apps/ios/MeeshyNotificationExtension/NSEDataSync.swift

**Purpose**: Lightweight data sync from the Notification Service Extension — fetch the pushed message via REST, persist to App Group; also fire-and-forget background POSTs (delivery receipts).

**Public API surface**: `nonisolated enum NSEDataSync` — `syncMessage(conversationId:messageId:completion:)`, `consumePendingMessages() -> [(conversationId, data)]`, `enqueueBackgroundPost(path:body:)`, `postDeliveryReceipt(conversationId:messageId:)`.

**Key behaviors / SECURITY**:
- API base URL resolved from a strict allowlist (`gate.meeshy.me` / staging / localhost) + App Group UserDefaults, with hardcoded production fallback. **Never trusts a URL from the push payload** (audit 2026-05-11: prevents SSRF / JWT exfiltration).
- Auth token read from shared Keychain; access group resolved at runtime via a discovery item (NSE runs in its own process, must specify `kSecAttrAccessGroup` explicitly).
- Pending messages written to App Group `nse_pending_messages/` dir as `{convId}_{msgId}.json` with `.completeFileProtectionUntilFirstUserAuthentication`.
- Background `URLSession` (per-process UUID identifier) for fire-and-forget POSTs that survive extension suspension; body written to a file (`nse_bg_uploads/`), old files pruned >1h.
- 30s execution budget / 24MB memory limit / no MeeshySDK import.

**Android-port note**: Android push handling runs in `FirebaseMessagingService` (no separate "extension" process, fewer constraints). Replicate: allowlisted base URL (no payload-trusted URL), token from `EncryptedSharedPreferences`/Keystore, message prefetch into Room. Background POST → `WorkManager` one-time work (survives process death). Delivery receipts via WorkManager.

---

## apps/ios/MeeshyNotificationExtension/NSEDecryptor.swift

**Purpose**: Standalone E2EE decryptor for the NSE (no MeeshySDK import).

**Public API surface**: `enum NSEDecryptor` — `nonisolated static func decrypt(encryptedBase64:senderUserId:) -> String?`.

**Key behaviors / algorithm**: AES-GCM (CryptoKit) combined format = nonce(12) + ciphertext + tag(16), requires `count > 28`. Session key loaded from shared Keychain at `me.meeshy.e2ee.session.{userId}` (service `me.meeshy.app`), stored as base64-encoded `SymmetricKey` raw bytes.

**Android-port note**: `javax.crypto.Cipher` with `AES/GCM/NoPadding`, 12-byte IV. Session keys from Android Keystore / `EncryptedSharedPreferences`. Must match the SDK's `E2EEService` key format and the gateway encryption exactly.

---

## apps/ios/MeeshyNotificationExtension/NotificationService.swift

**Purpose**: Rich-push `UNNotificationServiceExtension` — enrich incoming pushes (decrypt, attachments, category actions, badge, threading, Communication Notifications, prefetch, pre-persist, delivery receipts).

**Public API surface**: `nonisolated class NotificationService: UNNotificationServiceExtension` — `didReceive`, `serviceExtensionTimeWillExpire`.

**Key behaviors worth preserving**:
- `applyCategory`: maps backend `type` → iOS category (`MEESHY_MESSAGE`, `MEESHY_MENTION`, `MEESHY_FRIEND_REQUEST`, `MEESHY_SOCIAL`, `MEESHY_CALL`) so quick-action buttons appear; unknown types stay silent (no misleading reply action).
- `applyBadge` (per-push override), `applyThreading` (`threadIdentifier = conversation:{id}` or `post:{id}` → stacked notifications).
- E2EE: decrypt `encryptedContent` → replace body; `didDecrypt` guard prevents the localized "Message chiffré" placeholder from clobbering decrypted plaintext.
- `message_reaction` body reformat: "{sender} a réagi {emoji} à votre message".
- Communication Notifications: builds `INSendMessageIntent` + `INPerson` with avatar → WhatsApp/Telegram-style banner (avatar left, app badge bottom-right). `imageURL` = sender avatar (INPerson.image ONLY), `attachmentUrl` = message media (UNNotificationAttachment with UTI typeHint).
- `prePersistMessage`: writes incoming message directly to App Group GRDB (skips E2EE pushes — placeholder content untrusted), state `.delivered`, `originalLanguage` from payload else "en".
- `postDeliveryReceipt`: ✓→✓✓ upgrade for offline recipients.
- `fileHints`: mime → (extension, UTI typeHint) for image/audio/video.

**Android-port note**: `FirebaseMessagingService.onMessageReceived`. Categories → `NotificationChannel`s + `addAction()` with `RemoteInput` for quick reply. Threading → notification `setGroup()`. Communication style → `NotificationCompat.MessagingStyle` + `Person` (avatar). Pre-persist into Room. Decrypt inline. Delivery receipt → WorkManager. Android has no 30s/24MB extension limit, but keep work bounded.

---

## apps/ios/MeeshyShareExtension/ShareViewController.swift

**Purpose**: Share Extension — receive shared content (text/URL/image/video) from other apps, pick a contact, hand off to the main app.

**Public API surface**: `ShareViewController: UIViewController` (hosts SwiftUI). `ShareContentView`, `SharedItemPreview`, `ContactRow`. Models: `SharedItem`/`SharedItemType`, `SharedContentData`, `SharedItemData`, `ContactPreview`.

**Key behaviors**: `extractSharedItems` walks `NSExtensionItem.attachments`, dispatch-group async extraction per UTType. On send: saves `SharedContentData` to App Group (`pending_shared_content` key, images written to container as JPEG), opens `meeshy://share?contactId=...` via responder-chain `UIApplication.open`, completes the extension. Contacts loaded from App Group (`recent_contacts`) with sample-data fallback.

**Android-port note**: Android — an `Activity` with `intent-filter` for `ACTION_SEND` / `ACTION_SEND_MULTIPLE` (text/image/video MIME types). No App Group needed (same process / shared storage); pass data via `Intent` extras or a shared DB. Contact picker is a normal Compose screen. The `meeshy://share` deep-link hop is unnecessary on Android — launch the conversation directly.

---

## apps/ios/MeeshyWidgets/LiveActivities.swift

**Purpose**: Live Activities (Dynamic Island + lock screen) for calls, message delivery, translation progress.

**Public API surface**:
- `MeeshyActivityAttributes: ActivityAttributes` — `ContentState` (activityType, contactName, avatar, duration, messageStatus, translationProgress, source/targetLanguage); enums `ActivityType` (call/messageDelivery/translation), `MessageStatus` (sending/sent/delivered/read/failed).
- `MeeshyLiveActivity: Widget` (iOS 16.2+) — lock-screen + Dynamic Island (expanded leading/trailing/bottom, compact, minimal).
- `LiveActivityManager` singleton — `startCallActivity`, `updateCallDuration`, `startMessageDeliveryActivity`, `updateMessageStatus`, `startTranslationActivity`, `updateTranslationProgress`, `endActivities`.

**Key behaviors**: Call shows live timer; message delivery auto-ends 2s after delivered/read; translation auto-ends 1s after 100%. Action buttons via `Link` deep-links (`meeshy://call/mute`, `meeshy://call/end`, `meeshy://conversation/{id}`). Uses `print()` for logging (tech debt).

**Android-port note**: No 1:1 equivalent. Closest: an **ongoing foreground-service notification** with `MessagingStyle`/custom layout and a chronometer (`setUsesChronometer`) for calls; progress notifications for translation. Dynamic Island has no Android counterpart. Lower priority — calls warrant a proper foreground-service notification with mute/end actions.

---

## apps/ios/MeeshyWidgets/MeeshyWidgets.swift

**Purpose**: Home-screen widgets — Recent Conversations, Unread Count, Quick Reply, Favorite Contacts.

**Public API surface**:
- `@main MeeshyWidgetBundle: WidgetBundle`.
- `RecentConversationsWidget` (small/medium/large), `UnreadCountWidget` (small + accessory circular/rectangular/inline = Lock Screen widgets), `QuickReplyWidget` (medium/large), `FavoriteContactsWidget` (medium/large).
- `ConversationProvider` / `FavoriteContactsProvider: TimelineProvider`; entries `ConversationEntry`, `FavoriteContactsEntry`; models `Conversation`, `FavoriteContact` (widget-local Codable copies).
- `MarkConversationReadIntent: AppIntent` (iOS 17+) — interactive widget button: clears unread in App Group, decrements count, queues `pending_mark_read`, reloads timelines.
- `InitialsAvatar`, widget-local `WidgetColors` + `Color(hex:)` (widget can't import MeeshyUI).

**Key behaviors**: All data from App Group UserDefaults (`recent_conversations`, `unread_count`, `favorite_contacts`) with ISO8601 JSON decoding + sample-data fallback. Timeline refresh every 15min (conversations) / 1h (favorites). Deep links via `widgetURL` / `Link` (`meeshy://conversation/{id}`, `meeshy://quickreply/{id}?text=`, `meeshy://contact/{id}`). Quick replies: 👍 / OK / Thanks! / Call me.

**Android-port note**: Android `AppWidgetProvider` or **Glance** (`androidx.glance.appwidget`) for a Compose-style API. Data → shared `DataStore` updated by the app. Interactive mark-as-read button → Glance `actionRunCallback`. Lock-screen accessory widgets have no direct Android equivalent (could be a Wear/complication). Deep links via `PendingIntent`. The widget-local model duplication is necessary on iOS (target boundary) — on Android the widget module can depend on a shared data module.

---

## apps/ios/Package.swift

**Purpose**: SPM manifest for the Meeshy app target.

**Key contents**: Swift tools 6.2, iOS 17+, Swift 6 language mode, `defaultIsolation(MainActor)` (SE-0466) + upcoming features (NonisolatedNonsendingByDefault, InferIsolatedConformances, MemberImportVisibility). Dependencies: Firebase iOS SDK 12.12.1 (Core/Analytics/Crashlytics/Messaging/Performance + CrashlyticsPlugin for dSYM upload), Socket.IO 16.1, WebRTC (stasel) 141, WhisperKit 0.9. Note: ONNX Runtime for voice cloning needs manual integration.

**Android-port note**: Gradle `build.gradle.kts`. Equivalents: Firebase Android BoM, an Android WebRTC artifact (`io.github.webrtc-sdk` or Stream's), a Socket.IO Java client (`io.socket:socket.io-client`), and on-device speech (Android `SpeechRecognizer` or Whisper via TFLite/whisper.cpp). MainActor-by-default isolation → coroutine `Dispatchers.Main` discipline.

---

## apps/ios/WebRTCStubs.swift

**Purpose**: Compile-time stub types for the entire WebRTC API, guarded by `#if !canImport(WebRTC)` — only compiled when the WebRTC package is absent (e.g. CI without WebRTC).

**Public API surface**: Stub re-declarations of ~40 WebRTC types (`RTCPeerConnection`, `RTCVideoTrack`, `RTCAudioTrack`, `RTCMediaStream`, `RTCSessionDescription`, `RTCIceCandidate`, `RTCConfiguration`, factories, delegates, enums, stats) with no-op implementations returning stub SDP.

**Android-port note**: DO NOT port — this is a build-system workaround. Android always links the real WebRTC artifact. If a no-WebRTC build flavor is needed, use a Gradle product flavor with a stub source set, but generally unnecessary.

---

## packages/MeeshySDK/Package.swift

**Purpose**: SPM manifest for the dual-target SDK (`MeeshySDK` core + `MeeshyUI`).

**Key contents**: Swift tools 6.2, `defaultLocalization: "fr"`, iOS 17+. `MeeshySDK` core keeps `nonisolated` default isolation (actors, URLSession delegates, socket callbacks off-main); `MeeshyUI` flips to `defaultIsolation(MainActor)`. Dependencies: Socket.IO 16.1.1 (exact), GRDB 6.29.3 (exact), WebRTC 146 (exact), swift-snapshot-testing 1.17.6. `MeeshyUI` processes `Resources` + `Story/Canvas/Metal` shaders. Test targets keep `nonisolated` to match XCTestCase isolation.

**Android-port note**: Two Gradle modules — `:sdk-core` (pure Kotlin/coroutines, networking, Room, sockets) and `:sdk-ui` (Compose components). GRDB → Room; Metal shaders → AGSL/RenderEffect or GLSL; snapshot tests → Paparazzi/Roborazzi.

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioRecordingProviding.swift

**Purpose**: Protocol + value types for audio recording across the app.

**Public API surface**:
- `@MainActor protocol AudioRecordingProviding: AnyObject, ObservableObject` — `isRecording`, `duration`, `audioLevels: [CGFloat]`, `recordedFileURL: URL?`; `startRecording()`, `stopRecording() -> URL?`, `cancelRecording()`.
- `struct AudioRecordingResult: Sendable` — url, duration, data.
- `struct AudioRecordingSettings: Sendable` — maxDuration, minimumDuration, sampleRate, channels, bitRate. Presets: `.standard` (no max, 0.5s min, 44.1kHz/1ch/64kbps), `.story` (60s max), `.voiceSample` (10s min, 96kbps).

**Android-port note**: Kotlin interface backed by `StateFlow` instead of `ObservableObject`. Settings presets → data class with companion presets. Concrete impl lives in app layer (DI).

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/DefaultSDKAudioRecorder.swift

**Purpose**: Default `AudioRecordingProviding` implementation (fallback when no external recorder injected).

**Public API surface**: `@MainActor public final class DefaultSDKAudioRecorder: ObservableObject, AudioRecordingProviding` — `@Published isRecording/duration/audioLevels` (15-bar history).

**Key behaviors**: `AVAudioSession.playAndRecord` (defaultToSpeaker + bluetoothA2DP); records to temp `voice_{epoch}.m4a` (MPEG4-AAC, settings from `.standard`); 0.05s metering timer; `updateMetering` normalizes `averagePower` over a −50dB floor into a 15-element rolling level array. Cancel deletes the file.

**Android-port note**: `MediaRecorder` (or `AudioRecord` for raw PCM + level metering — `MediaRecorder.getMaxAmplitude()` gives levels). Output `.m4a` AAC. Audio focus via `AudioManager`. Levels → `StateFlow<List<Float>>`, normalize amplitude similarly. Recording timer → coroutine `flow` with `delay`.

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformCache.swift

**Purpose**: Unified waveform sample extraction with persistent disk cache (replaced `WaveformGenerator` URL-based + `AudioWaveformAnalyzer` Data-based).

**Public API surface**: `public actor WaveformCache` (singleton `.shared`) — `samples(from url:count:)`, `samples(from data:count:)`, `waveformImageData(from url/data:width:height:)`, `clearMemoryCache()`, `clearAllCaches()`.

**Key behaviors / algorithm**:
- Two-tier cache: in-memory `[String:[Float]]` + disk (`Caches/com.meeshy.waveforms/{key}.waveform`, raw Float bytes). Key = `{identifier}_{count}` (filename for URLs, FNV-1a hash of first 8KB for Data).
- `extractSamples`: `AVAssetReader` streaming PCM (16-bit linear), buckets `count` averages of `abs` sample amplitude, normalizes by max; `Task.checkCancellation()` in the read loop.
- `renderWaveformImage`: 2× scale `CGContext`, indigo (#6366F1) bars, transparent background → PNG (used as thumbhash).

**Android-port note**: Kotlin `object` / repository with a coroutine `Mutex`. Use `MediaExtractor` + `MediaCodec` to decode PCM, bucket-average identically. Disk cache → app `cacheDir`. Waveform image → Android `Bitmap` + `Canvas` → PNG. Preserve FNV-1a hashing for Data-keyed entries so cache keys are stable.

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformGenerator.swift

**Purpose**: Deprecated backward-compat shim delegating to `WaveformCache`.

**Public API surface**: `@available(*, deprecated) public actor WaveformGenerator` — `generateSamples(from url:sampleCount:)` → `WaveformCache.shared.samples`.

**Android-port note**: DO NOT port — deprecated. Use the `WaveformCache` equivalent directly.

---

## Architecture observations

**State management**
- Singletons everywhere via `.shared` (AuthManager, CacheCoordinator, OfflineQueue, ThemeManager, NotificationManager, MessageSocketManager...). Lightweight DI is constructor-injected protocol defaults (`storyService: StoryServiceProviding = StoryService.shared`). Android: replace with Hilt/Koin DI graph + scoped ViewModels; keep protocol-first design.
- `@StateObject` ownership at root (`iPadRootView`, `MeeshyApp`), passed down via `@EnvironmentObject`. CRITICAL gotcha repeatedly handled: SwiftUI sheets/covers do NOT inherit `EnvironmentObject`s — every sheet manually re-injects them. Compose's `CompositionLocal` under one nav graph removes this entirely.

**Caching / SWR**
- `StoryNotificationTargetViewModel` is a clean cache-first / network-revalidate reference implementation: synchronous cache read → publish → background fetch → fresh wins, network failure never overwrites a usable cached answer. Port the pattern verbatim.
- Extensions (NSE, Widgets) share state with the app via App Group UserDefaults + a shared GRDB pool + shared Keychain. Android: a shared `DataStore`/Room module — far simpler since extensions aren't separate processes.

**Concurrency**
- Swift 6 strict concurrency: core SDK `nonisolated`-by-default (background actors/sockets), UI/app `MainActor`-by-default (SE-0466). `WaveformCache` and recorders are actors / `@MainActor`. Android maps cleanly to coroutine dispatchers + `Mutex`-guarded shared state.
- Pervasive `dismiss()` + `DispatchQueue.asyncAfter(0.3)` before navigation is a recurring anti-pattern (waiting for sheet animation) — Android should use proper navigation results, not delays.

**Navigation**
- Hybrid: NavigationStack + `Router` closures (`onRouteRequested`/`onPopRequested`) wiring into the iPad two-column model. `Route` enum is the full destination catalog. Notification routing (`iPadRootView+Navigation`) is the canonical notification→destination map but is triplicated across APINotification / SocketNotificationEvent / NotificationPayload — Android should normalize all three into one event type and route once.

**Boot & lifecycle (security-critical)**
- `MeeshyApp.task` boot: BGTask registration before scene, offline-queue SQLite config + crash recovery (reset `.inflight`→`.pending`), outbox flush, E2EE bundle upload on login, full E2EE-key + cache wipe on logout (stores are NOT userId-namespaced — wiping is mandatory to prevent cross-account leaks). All of this must be faithfully reproduced on Android.
- NSE security hardening (audit 2026-05-11): API base URL strictly allowlisted, never trusted from push payload (SSRF/JWT-exfil prevention); E2EE pushes skip pre-persist (untrusted placeholder content).

**Performance techniques**
- `themedBackground` uses `.drawingGroup()` (offscreen Metal rasterization for ambient orbs). Background DB maintenance (`incrementalVacuum`/`optimize`) on every background transition. 6-month message retention purge at cold start. Splash min-duration to avoid flicker on hot cache. Waveform two-tier cache avoids re-decoding audio.

**Anti-patterns / tech debt — do NOT carry over**
- `MeeshyContextMenuExamples.swift` and `WebRTCStubs.swift` are non-production (examples / build workaround) — skip entirely.
- `WaveformGenerator` is a deprecated shim — port only `WaveformCache`.
- `LiveActivityManager` uses `print()` instead of `Logger`.
- `Any?`-typed track in `CallVideoView` defeats type safety — Android should keep `VideoTrack?`.
- Triplicated notification-tap handlers; 0.3s navigation delays; callback-chained community navigation.

### Portable user-facing features / capabilities
- [ ] iPad/tablet two-column adaptive layout (feed + conversation list/detail) with resizable splitter
- [ ] In-app dashboard ("Tableau de bord"): animated unread count, recent conversations, link stats, quick actions
- [ ] Story-related notification deep-linking (active story → viewer with comments/reactions surface; expired → empty-state with "create a story" CTA)
- [ ] Cache-first story-notification target resolution (instant on cache hit, network revalidation)
- [ ] Splash screen with brand animation + minimum display duration
- [ ] Magic-link / guest-join-link / share-link deep linking with idempotent authenticated join
- [ ] Rich push notifications: decryption, message-media attachments, sender-avatar Communication style, category quick actions (reply / mark-read / accept-friend / call), conversation threading, per-push badge
- [ ] Offline delivery-receipt acknowledgement (✓→✓✓ for offline recipients)
- [ ] Push message prefetch + pre-persist into local DB for instant cold-launch access
- [ ] E2EE message decryption in push extension
- [ ] Share-to-Meeshy from other apps (text / URL / image / video → contact picker)
- [ ] Home-screen widgets: recent conversations, unread count, quick reply, favorite contacts
- [ ] Lock-screen / accessory widgets (unread count) — Android: limited equivalent
- [ ] Interactive widget mark-as-read button
- [ ] Live Activities / Dynamic Island for calls, message delivery, translation progress — Android: foreground-service notifications
- [ ] Siri / Shortcuts / Spotlight intents (send message, call, translate, recent conversation, check notifications) — Android: App Actions / dynamic shortcuts
- [ ] WebRTC call video rendering with front-camera mirroring
- [ ] Audio voice-message recording with live waveform levels (standard / story / voice-sample presets)
- [ ] Audio waveform extraction + cached waveform thumbnail images
- [ ] Custom long-press context menu (sectioned, destructive items, subtitles)
- [ ] Offline write queue with boot crash recovery
- [ ] Login/logout teardown wiping E2EE keys and per-user caches
