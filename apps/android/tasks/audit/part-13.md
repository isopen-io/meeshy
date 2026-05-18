# Meeshy iOS Audit — Part 13

Scope: WebRTC video rendering, iPad two-column root, story-notification routing, app entry point + lifecycle, App Extensions (NSE rich push, Share, Widgets, Live Activities, Siri AppIntents), SPM manifests, SDK audio recording + waveform.

---

## apps/ios/Meeshy/Features/Main/Views/WebRTCVideoView.swift

**Purpose**: SwiftUI wrapper to render a WebRTC video track in a Metal view; provides a track-agnostic `CallVideoView` plus a no-WebRTC fallback.

**Public API surface**:
- `WebRTCVideoView: UIViewRepresentable` — wraps `RTCMTLVideoView`; props `track: RTCVideoTrack?`, `mirror: Bool`, `contentMode: UIView.ContentMode`. Has `Coordinator` holding `currentTrack`/`renderer`.
- `CallVideoView: View` — accepts `track: Any?` (cast to `RTCVideoTrack`), `mirror`, `contentMode`. Compiled twice: real WebRTC path + fallback (`Color.black` + "Video non disponible").

**Key behaviors**: `updateUIView` swaps the renderer between tracks (remove old / add new); `dismantleUIView` detaches track to avoid leak; mirror via `CGAffineTransform(scaleX:-1)`. `#if canImport(WebRTC)` guards.

**Dependencies**: WebRTC SDK (`RTCVideoTrack`, `RTCMTLVideoView`); CallManager passes `Any?` track to decouple.

**Android-port note**: Use `org.webrtc.SurfaceViewRenderer` (or `VideoTextureViewRenderer`) inside a Compose `AndroidView`. `track.addSink(renderer)` / `removeSink`. Mirror via `SurfaceViewRenderer.setMirror(true)`. Provide a fallback Composable when WebRTC lib absent. Track type `org.webrtc.VideoTrack`.

- [ ] Render live WebRTC video track (call view)
- [ ] Mirror local camera feed
- [ ] Graceful no-video fallback placeholder

---

## apps/ios/Meeshy/Features/Main/Views/WidgetPreviewView.swift

**Purpose**: In-app "Tableau de bord" dashboard sheet — animated unread counter, recent conversations, links overview (parrainage/partage/tracking/communauté), quick actions, and a hint banner promoting home-screen widgets.

**Public API surface**: `WidgetPreviewView: View` with optional `onNewConversation: (() -> Void)?`. Adds `Notification.Name.openFeedComposer`.

**Key behaviors**:
- `recentConversations`: filter `isActive`, sort by `lastMessageAt` desc, take 3.
- `animateUnreadCounter()`: counts up from 0 to total in ≤30 steps over 0.4s using chained `DispatchQueue.asyncAfter` + `contentTransition(.numericText())`.
- `.task` parallel-loads affiliate tokens, tracking stats, share-link stats, community links via `async let`.
- Quick actions: new conversation, create share link, post (`.openFeedComposer`), settings — all dismiss then `asyncAfter(0.3)` to route after sheet closes.
- `formatRelativeTime`: Maintenant / Xmin / Xh / Xj / dd/MM.

**Dependencies**: `ConversationListViewModel`, `Router` (EnvironmentObjects); `AffiliateViewModel`; `TrackingLinkService`, `ShareLinkService`, `CommunityLinkService`; `ThemeManager`, `MeeshyColors`, `MeeshyAvatar`, `EmptyStateView`, `HapticFeedback`, `CreateShareLinkView`.

**Android-port note**: Compose screen with a `LazyColumn`; counter animation via `animateIntAsState`. Stats loaded in a ViewModel `init` with `coroutineScope` + `async`. Dismiss-then-navigate maps to `bottomSheet.hide()` then `navController.navigate`. Staggered entrance → per-index `AnimatedVisibility` delay.

- [ ] Dashboard sheet with animated unread counter
- [ ] Recent conversations quick-access (top 3)
- [ ] Links overview cards (referral/share/tracking/community stats)
- [ ] Quick actions grid (new conv, share link, post, settings)

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView.swift

**Purpose**: iPad two-column "feed-first" root layout. Default = [Feed | Conversation List]; conversation open = [Conv List | Conversation]; hub route = [Feed | hub screen]. Resizable split.

**Public API surface**: `iPadRootView: View`. State: `activeConversation: Conversation?`, `rightPanelRoute: Route?`, `showStoryViewerFromConv`, `selectedStoryUserIdFromConv`, `showSharePicker`, `showNewConversation`, `leftColumnRatio: CGFloat=0.38`. Owns `@StateObject` for ThemeManager, ToastManager, StoryViewModel, StatusViewModel, ConversationListViewModel, Router, StoryViewerCoordinator.

**Key behaviors**:
- `body` wraps `applyingSheets(...)` over `ZStack { themedBackground; GeometryReader{ leftColumn | iPadResizableHandle | rightColumn }; overlays }`.
- `.onAppear` wires `router.onRouteRequested` (dispatch `.conversation` → openConversation, else → `rightPanelRoute`) and `router.onPopRequested` (pop right panel, then conversation).
- `.task`: connect MessageSocketManager, subscribe status socket, start `ConversationSyncEngine` relay, detached retention cleanup after 5s, observe sync, load stories/statuses/conversations, refresh unread.
- 7 `NotificationCenter` observers (navigateToConversation, handlePushNotification, sendMessageToUser, openProfileSheet, pushNavigateToRoute, openStoryComposer) + `.onOpenURL` (share only) + `.onChange(deepLinkRouter.pendingDeepLink, initial: true)`.
- `themedBackground`: gradient + ambient orbs in `drawingGroup()`.

**Dependencies**: Router, all the hub views, ConversationView, FeedView, ConversationListView, ConversationSyncEngine, MessageSocketManager.

**Android-port note**: Use `WindowSizeClass` to branch tablet layout. Two-pane = a Compose adaptive layout (`ListDetailPaneScaffold` or custom `Row` with draggable splitter). `rightPanelRoute` = a nested `NavHost` for the detail pane. `leftColumnRatio` persisted via DataStore; drag handle via `Modifier.draggable`. Router callbacks → a shared navigation event channel.

- [ ] iPad/tablet two-column adaptive layout
- [ ] Resizable column splitter (0.30–0.50 ratio)
- [ ] Feed-first default with feed↔conversation-list swap

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Navigation.swift

**Purpose**: All deep-link + notification-tap navigation handlers for the iPad root.

**Public API surface** (extension methods): `openConversation`, `closePanels`, `handleDeepLink`, `joinViaShareLink`, `handleSendMessageToUser`, `handlePushNavigateToRoute`, `handleStoryReply`, `handleNotificationTap(APINotification)`, `handleSocketNotificationTap(SocketNotificationEvent)`, `handlePushNotificationTap(NotificationPayload)`, `navigateToConversationById`, `isStoryPost`, `makeStoryContext`.

**Key behaviors**:
- Three near-identical notification routers (`APINotification`, socket event, push payload) — each switches a large `MeeshyNotificationType` enum (incl. many `legacy*` variants) to conversation / profile sheet / postDetail / story-notification-target / userStats / affiliate.
- `joinViaShareLink`: server-side resolve via `ShareLinkService.joinAuthenticated`; maps `MeeshyError` 404/410/forbidden to localized toasts.
- `navigateToConversationById`: cache-hit fast path; else fetch with **retry-once after 600ms** (handles gateway commit race for freshly created conversations); `ensureUnread` bumps `unreadCount` to 1.
- Story heuristic `isStoryPost`: `postType=="STORY"` OR cached post has non-nil `expiresAt`.
- `handleDeepLink` validates conversation existence before opening to avoid empty-pane infinite re-fire.

**Android-port note**: Centralize push/deep-link routing in one `NotificationRouter` consuming a sealed `NotificationType`. The retry-once-on-race pattern is portable and worth preserving. `MeeshyError` cases map to a sealed Kotlin error type.

- [ ] Deep link → conversation/join/chat/magic link routing
- [ ] Push notification tap routing (messages, social, calls, stories)
- [ ] Story-related notification → dedicated target screen
- [ ] Retry-once navigation for freshly-created conversations

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Overlays.swift

**Purpose**: Top-aligned overlay layer for the iPad root: offline banner, toast, notification toast.

**Public API surface**: `iPadRootView.overlays: some View`.

**Key behaviors**: `OfflineBanner` when `networkMonitor.isOffline` (zIndex 190); `ToastView` (zIndex 200, tap to dismiss); `NotificationToastView` (zIndex 201, tap dismisses + `handleSocketNotificationTap`). Spring move/opacity transitions.

**Android-port note**: A `Box` overlay or Compose `Snackbar`/custom toast host; offline banner as a sticky top bar driven by connectivity flow.

- [ ] Offline banner overlay
- [ ] Toast overlay (tap to dismiss)
- [ ] In-app notification toast (tap to navigate)

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift

**Purpose**: Right-panel hub-route content router + iPad left-column header + resizable handle.

**Public API surface**:
- `iPadRootView.rightPanelContent(for: Route)` — big `switch` over `Route` mapping to Settings/Profile/ContactsHub/Community*/Notifications/UserStats/Links*/DataExport/PostDetail/Bookmarks/StarredMessages/FriendRequests/EditProfile/StoryNotificationTarget views; most hide nav bar; some add `ConnectionBanner` safe-area inset.
- `iPadLeftColumnHeader: View` — title, optional Feed button, notifications bell with badge (capped 99), settings gear.
- `iPadResizableHandle: View` — `@Binding ratio`, `DragGesture` clamps 0.30–0.50, visual line + grab pill.

**Android-port note**: `rightPanelContent` = nested `NavHost` composable map. Header = a `TopAppBar` variant. Handle = draggable splitter Composable.

- [ ] Tablet hub-route detail panels (settings, profile, community, links, etc.)
- [ ] Left-column header with notification badge

---

## apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift

**Purpose**: All sheet / fullScreenCover modifiers for the iPad root.

**Public API surface**: `iPadRootView.applyingSheets(_:)`.

**Key behaviors**: profile sheet (`deepLinkProfileUser`, medium/large detents), share picker (`pendingShareContent` → `SharePickerView`, re-injects 3 EnvironmentObjects since sheets do NOT inherit them), new conversation sheet, two story-viewer fullScreenCovers (legacy tray path + coordinator-driven `pendingRequest`), call fullScreenCover bound to `callState.isActive && displayMode==.fullScreen` (swipe-down → `.pip`), floating call pill overlay.

**Android-port note**: Critical reuse note — Android dialogs/bottom-sheets DO share the Compose `CompositionLocal`/ViewModel scope, so the EnvironmentObject re-injection workaround is unnecessary. Story viewer = full-screen destination; call = full-screen destination + PiP fallback (Android PictureInPicture API).

- [ ] User profile bottom sheet from notification
- [ ] Share picker sheet
- [ ] Story viewer full-screen presentation
- [ ] Active call full-screen / PiP pill

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveBridge.swift

**Purpose**: Thin invisible bridge view that, on appear, redirects a story-notification into the existing StoryViewer with the correct initial action, then dismisses itself.

**Public API surface**: `StoryViewerCoordinating` protocol (`@MainActor`, class-bound; `present(StoryViewerRequest)`); `StoryActiveBridge: View` (`post: APIPost`, `intent: StoryIntent`, `viewerCoordinator`, `dismiss`).

**Key behaviors**: `handleAppear()` maps `intent` → `StoryViewerInitialAction` (.comments→showCommentsOverlay, .reactions→showViewersSheet, .view→nil), builds `StoryViewerRequest(id: post.author.id, initialAction:)`, calls `coordinator.present`, dismisses. Body is just the loading skeleton.

**Android-port note**: Replace with a navigation side-effect in a `LaunchedEffect` — compute the viewer route + initial action, navigate, pop self. No "bridge view" needed; this is an iOS sheet-stacking workaround.

- [ ] Story notification → auto-open viewer at correct surface (comments/reactions)

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift

**Purpose**: Empty-state screen when a story notification targets an expired/deleted story.

**Public API surface**: `StoryExpiredContent: View` (`storyId`, `context: StoryNotificationContext`); static `foregroundOnBackground(_:) -> Color`; adds `Notification.Name.openStoryComposer`.

**Key behaviors**: random background from `StoryBackgroundPalette`; WCAG-luminance-based foreground (>0.6 → black else white); actor header (avatar 32 + name + relative time), trigger visual (emoji for reaction / bubble icon for comment), optional italic comment excerpt, localized title/subtitle, "Create a story" CTA (dismiss + post `.openStoryComposer`), back link.

**Android-port note**: Compose screen; luminance check is portable (`ColorUtils.calculateLuminance`). Random bg from palette. CTA → navigation event to story composer.

- [ ] Expired-story empty state with create-story CTA

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift

**Purpose**: Value types for story-notification routing.

**Public API surface**: `StoryIntent` enum (`comments`/`reactions`/`view`, Hashable+Codable); `StoryNotificationContext` struct (`actorAvatar?`, `actorDisplayName`, `trigger`, `occurredAt`) with nested `Trigger` enum (`reaction(emoji:)`/`comment(preview:)`); `StoryNotificationContext.from(APINotification)` mapping with ISO8601 fallback parsing.

**Android-port note**: Kotlin `sealed interface` for Trigger; data classes; `@Serializable`. Mapping function ported directly with `Instant`/ISO parsing.

- [ ] Story notification context model (actor + trigger snapshot)

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift

**Purpose**: Minimal loading skeleton shown while the story target is resolved.

**Public API surface**: `StoryNotificationLoadingView: View`.

**Android-port note**: A `Box` with `CircularProgressIndicator` + "Loading…" on a dimmed background.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift

**Purpose**: Top-level destination for tapping a story-related notification; composes loading/active/expired states.

**Public API surface**: `StoryNotificationTargetScreen: View` — `init(storyId, intent, context, storyService: StoryServiceProviding = .shared)`. Owns `StoryNotificationTargetViewModel` `@StateObject`; consumes `StoryViewerCoordinator` via `@EnvironmentObject`.

**Key behaviors**: switches `vm.state`: `.loading`→skeleton, `.active(post)`→`StoryActiveBridge`, `.expired`→`StoryExpiredContent`. `.task { vm.load() }`.

**Android-port note**: A destination Composable observing a `StateFlow<LoadState>`; coordinator via shared ViewModel/nav events.

- [ ] Story-notification target screen (loading/active/expired states)

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift

**Purpose**: Cache-first / network-revalidate resolver for the notification's underlying story.

**Public API surface**: `@MainActor StoryNotificationTargetViewModel: ObservableObject`; `LoadState` enum (`loading`/`active(APIPost)`/`expired`); `@Published state`; `load()`.

**Key behaviors**: `load()` reads `storyService.cachedPost` synchronously (immediate `.active`/`.expired`, no spinner), then always re-fetches `fetchPost`; fresh result wins; on fetch failure falls back to `.expired` only if still `.loading`. `isExpired`: `expiresAt <= now`. Idempotent.

**Android-port note**: ViewModel with `StateFlow<LoadState>`; cache read sync from in-memory store, network refresh in `viewModelScope`. Pattern is a clean SWR example — preserve.

- [ ] Cache-first story resolution with network revalidation

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerCoordinator.swift

**Purpose**: Concrete coordinator owning the `pendingRequest` that drives the story-viewer fullScreenCover.

**Public API surface**: `@MainActor StoryViewerCoordinator: ObservableObject, StoryViewerCoordinating`; `@Published pendingRequest: StoryViewerRequest?`; `present(_:)`, `dismiss()`.

**Android-port note**: A nav-event holder (`MutableSharedFlow<StoryViewerRequest?>`) or scoped ViewModel. Latest-wins semantics.

---

## apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerInitialAction.swift

**Purpose**: Side-effect the StoryViewer performs on first appear when opened from a notification.

**Public API surface**: `StoryViewerInitialAction` enum (`showCommentsOverlay`/`showViewersSheet`, Hashable).

**Android-port note**: Kotlin enum; passed as a nav argument to the viewer destination.

---

## apps/ios/Meeshy/MeeshyApp.swift

**Purpose**: App entry point. Owns splash, auth-gated root selection, full app boot sequence, scene-phase lifecycle, deep-link/guest-link handling, crash-report surfacing.

**Public API surface**: `@main MeeshyApp: App`; `SystemThemeDetector<Content>`; `SplashScreen`.

**Key behaviors** (architecturally critical):
- `init()` registers `CacheBackgroundFlushTask` (BGTaskScheduler must register before launch finishes).
- Root: `AdaptiveRootView` if authenticated, else `LoginView` after `hasCheckedSession`; splash overlaid until boot finishes.
- Splash policy: always shown on cold start; dismissed by `.task` after a **1.2s minimum** elapsed time so the animation never flashes on hot cache.
- Massive `.task` boot sequence: image downsampling config, keychain migration, restore environment, focus-filter bridge, `CacheCoordinator.start()`, touch `PresenceManager` early (avoid dropped first snapshot), `StoryOfflineQueueBootstrap`, configure `OfflineQueue` with SQLite pool, **boot crash recovery** (reset inflight outbox rows to pending), wire retry-send + settings-action flush handlers, delete legacy JSON queue files once, drain outbox via `OutboxFlusher`, parallel friendship hydration + session check, on auth: preload conversations cache, request push permission, register VoIP push, refresh unread, `NotificationCoordinator.syncNow`; enforce splash min duration; surface crash reports; detached message-retention purge (6 months).
- `scenePhase`: `.active` → clear delivered notifications, `handleForegroundTransition` (BackgroundTransitionCoordinator.resume), flush widget actions; `.background` → `BackgroundTransitionCoordinator.enterBackground` + detached DB incremental-vacuum/optimize.
- `onChange(isAuthenticated)`: on login re-arm coordinators, force socket reconnect, re-register push/VoIP, upload E2EE bundle, migrate keychain; on logout reset NotificationManager/Coordinator, clear FriendshipCache, **wipe E2EE/Signal material** (cross-account identity-leak prevention), `CacheCoordinator.reset()` (stores not namespaced by user), disconnect sockets.
- Deep links: `magicLink` handled at app level (validate token); join/chat held until `hasCheckedSession`, then opens guest session if unauthenticated.
- `SplashScreen`: staggered logo/title/subtitle entrance, ambient orbs, glow pulse.

**Dependencies**: `DependencyContainer`, AuthManager, ToastManager, PushNotificationManager, DeepLinkRouter, ThemeManager, CacheCoordinator, OfflineQueue, OutboxFlusher, E2EEService/E2EAPI, SessionManager, NotificationCoordinator, VoIPPushManager, BackgroundTransitionCoordinator, MessagePersistenceActor, DatabaseMaintenance, CrashDiagnosticsManager.

**Android-port note**: This maps to `Application.onCreate` + a single-Activity `setContent`. Boot sequence → a `BootCoordinator` running in `applicationScope`. `WorkManager` replaces `BGTaskScheduler` for background flush/vacuum/retention. `scenePhase` → `ProcessLifecycleOwner` / `Lifecycle` observers. Splash → AndroidX `SplashScreen` API + keep-on-screen condition tied to boot completion. Auth-state effects (E2EE wipe, cache reset, socket reconnect) are essential and must be ported faithfully — the cross-account leak prevention is a hard requirement.

- [ ] Splash screen with min-duration + boot gating
- [ ] Cold-start boot sequence (cache hydration, offline-queue recovery)
- [ ] Crash/hang report surfacing on next launch
- [ ] Scene/process lifecycle connection management
- [ ] Login/logout coordinator re-arm + full data + E2EE wipe
- [ ] Magic-link / guest-link deep link handling

---

## apps/ios/Meeshy/MeeshyUIExports.swift

**Purpose**: One line — `@_exported import MeeshyUI` so the app target transitively re-exports the UI module.

**Android-port note**: No equivalent needed (Gradle module visibility handles this).

---

## apps/ios/MeeshyContextMenu/Examples/MeeshyContextMenuExamples.swift

**Purpose**: Example/demo file for the custom `meeshyContextMenu` component (conversation row, message bubble, custom config, programmatic presentation, result-builder syntax, full demo). Not production code.

**Public API surface** (examples only): `ConversationRowExample`, `MessageBubbleExample`, `CustomConfigExample`, `ProgrammaticExample`, `ResultBuilderExample`, `MeeshyContextMenuDemoView`, `MockConversation`, `MockMessage`. Demonstrates real APIs: `meeshyContextMenu(sections:)`/`(items:)`/result-builder, `MeeshyContextMenuItem`, `MeeshyContextMenuSection`, `MeeshyContextMenuConfiguration`, `MeeshyContextMenuPresenter`.

**Android-port note**: Skip the examples file. The underlying capability — a custom long-press context menu with sections, destructive items, icons, subtitles, configurable styling — should be a Compose `DropdownMenu`/custom popup. Note context-menu actions used: pin/unpin, mark read/unread, mute, archive, hide, delete; message: reply, copy, forward, star, delete.

- [ ] Custom long-press context menu (sectioned, destructive items, icons)

---

## apps/ios/MeeshyIntents/AppIntents.swift

**Purpose**: Siri / Shortcuts / Spotlight integration via AppIntents.

**Public API surface**: `MeeshyAppShortcuts: AppShortcutsProvider` (5 shortcuts); intents `SendMessageIntent`, `CallContactIntent` (audio/video `CallType` enum), `TranslateTextIntent` (10-language `LanguageOption` enum), `OpenRecentConversationIntent`, `CheckNotificationsIntent` (returns dialog + `NotificationCheckView` snippet); `ContactEntity: AppEntity` + `ContactQuery: EntityQuery`; `ContactData`; `SiriTipsView` + `SiriTip`.

**Key behaviors**: Most intents build a `meeshy://` deep-link URL and return `OpensIntent`. `CheckNotificationsIntent` reads `unread_count`/`recent_unread_messages` from App Group `UserDefaults` (suite `group.me.meeshy.apps`). `ContactQuery` decodes `contacts`/`favorite_contacts` JSON from the App Group.

**Android-port note**: Map to App Actions / `androidx.appactions` shortcuts, or Google Assistant App Actions + `shortcuts.xml`. Deep-link URLs map to Android deep links. App Group `UserDefaults` → a shared `SharedPreferences`/DataStore (or `ContentProvider`) readable by the assistant integration. Translate/quick-reply intents are good Shortcuts candidates.

- [ ] Siri/Assistant: send message, call contact, translate, open recent, check notifications
- [ ] Contact entity provider for voice shortcuts

---

## apps/ios/MeeshyNotificationExtension/NSEDataSync.swift

**Purpose**: Lightweight data sync inside the Notification Service Extension — fetches the pushed message from REST, persists a compact JSON blob to the App Group for the main app to merge; also posts background delivery receipts.

**Public API surface**: `enum NSEDataSync`; `syncMessage(conversationId:messageId:completion:)`, `consumePendingMessages() -> [(conversationId, Data)]`, `enqueueBackgroundPost(path:body:)`, `postDeliveryReceipt(conversationId:messageId:)`.

**Key behaviors** (security-critical):
- **Never trusts a URL from the push payload** — base URL resolved from a strict allowlist (`gate.meeshy.me` / `gate.staging.meeshy.me` / `localhost:3000`) read from App Group UserDefaults, with hardcoded production fallback (SSRF / JWT-exfiltration mitigation).
- Auth token read from shared Keychain; access group resolved at runtime via a discovery item (`<TEAMID>.me.meeshy.app`).
- Pending message JSON written to `nse_pending_messages/` in App Group with `.completeFileProtectionUntilFirstUserAuthentication`.
- Delivery receipts via a per-process background `URLSession` (survives extension teardown); body files written to `nse_bg_uploads/`, pruned >1h old.
- 30s execution budget, 24MB memory, no MeeshySDK import.

**Android-port note**: Android has no exact NSE equivalent — `FirebaseMessagingService.onMessageReceived` runs in-process and can fetch + persist directly to the shared Room DB (no extension/App Group needed; the whole app process is available). Keep: allowlist for base URL, token from `EncryptedSharedPreferences`/Keystore, delivery-receipt POST. Background-survival concern is reduced; can use `WorkManager` for guaranteed receipt delivery.

- [ ] Push-time message prefetch into local DB
- [ ] Offline delivery-receipt POST from push handler

---

## apps/ios/MeeshyNotificationExtension/NSEDecryptor.swift

**Purpose**: Lightweight E2EE decryptor for the NSE — AES-GCM decrypt of pushed encrypted content without importing MeeshySDK.

**Public API surface**: `enum NSEDecryptor`; `decrypt(encryptedBase64:senderUserId:) -> String?`.

**Key behaviors**: loads per-sender session key from shared Keychain (`me.meeshy.e2ee.session.{userId}`, service `me.meeshy.app`); AES-GCM combined format = 12-byte nonce + ciphertext + 16-byte tag (min length 28); `AES.GCM.SealedBox(combined:)` → `open`; returns nil on any failure.

**Android-port note**: Use `javax.crypto.Cipher` with `AES/GCM/NoPadding`; combined-format parsing identical (12-byte IV prefix, 16-byte tag suffix). Session keys from Android Keystore-protected store. Runs directly in `FirebaseMessagingService`.

- [ ] On-device E2EE decryption of rich-push content

---

## apps/ios/MeeshyNotificationExtension/NotificationService.swift

**Purpose**: Rich-push service extension — downloads attachments, sets category for quick actions, badge, threading, Communication Notification styling, E2EE decryption, GRDB pre-persist, delivery receipts.

**Public API surface**: `NotificationService: UNNotificationServiceExtension` (`didReceive`, `serviceExtensionTimeWillExpire`).

**Key behaviors**:
- `applyCategory`: maps backend `type` → iOS category (`MEESHY_MESSAGE`/`MENTION`/`FRIEND_REQUEST`/`SOCIAL`/`CALL`) for quick-action buttons; unknown types stay quiet.
- `applyBadge`, `applyThreading` (`conversation:{id}` / `post:{id}` thread identifier — stacks like Messages).
- `updateSharedUnreadCount` → App Group.
- E2EE: decrypt `encryptedContent` via `NSEDecryptor`; `didDecrypt` guard prevents the localized "Message chiffré" placeholder from clobbering decrypted plaintext.
- `message_reaction`: reformats emoji-only body to "<sender> a réagi <emoji> à votre message".
- Communication Notifications: builds `INSendMessageIntent` with `INPerson` (avatar from `imageURL`) → WhatsApp/Telegram-style banner; group vs. direct distinction.
- `imageURL` (avatar) only fed to `INPerson.image`; `attachmentUrl`+`attachmentMimeType` downloaded as `UNNotificationAttachment` with UTI typeHint (image/audio/video native renderers).
- `prePersistMessage`: writes incoming message directly to App Group GRDB (skipped for E2EE pushes — placeholder content untrustworthy); state `.delivered`.
- `prefetchMessageData` → NSEDataSync; `postDeliveryReceipt` for delivery-type pushes.
- `fileHints`: mime → (extension, UTI) mapping.

**Android-port note**: Android `FirebaseMessagingService` builds the notification directly. Map: category → notification channel + action buttons (`addAction`); threading → `setGroup`; Communication style → `NotificationCompat.MessagingStyle` (`Person` with avatar `IconCompat`); badge → `setNumber`; attachments → `setLargeIcon`/`BigPictureStyle`/media; pre-persist → write to Room. E2EE decrypt inline. All in-process — much simpler than the iOS extension model.

- [ ] Rich push with sender avatar (MessagingStyle)
- [ ] Push quick-action buttons per type (reply/mark-read/accept/etc.)
- [ ] Notification grouping/threading by conversation
- [ ] Inline media attachment in push (image/audio/video)
- [ ] Badge sync from push

---

## apps/ios/MeeshyShareExtension/ShareViewController.swift

**Purpose**: iOS Share Extension — accept text/URL/image/video shared from other apps, pick a contact, hand off to the main app.

**Public API surface**: `ShareViewController: UIViewController`; `SharedItem`/`SharedItemType`, `SharedContentData`, `SharedItemData`; SwiftUI `ShareContentView`, `SharedItemPreview`, `ContactRow`, `ContactPreview`.

**Key behaviors**: extracts `NSItemProvider` attachments by UTType; saves `SharedContentData` JSON + image files to App Group; opens main app via `meeshy://share?contactId=` URL (walks responder chain to find `UIApplication`); loads recent contacts from App Group (`recent_contacts`) with sample fallback.

**Android-port note**: Android uses a `ShareActivity` with `intent-filter` `ACTION_SEND`/`ACTION_SEND_MULTIPLE` for text/image/video MIME types. No App Group hop needed — the activity runs in-process; pass shared content directly via Intent extras / persist to Room. Contact picker = a normal Compose screen.

- [ ] Share-to-Meeshy from other apps (text/url/image/video)
- [ ] Contact picker in share flow

---

## apps/ios/MeeshyWidgets/LiveActivities.swift

**Purpose**: Live Activity (Dynamic Island + lock-screen) for calls, message delivery, and translation progress.

**Public API surface**: `MeeshyActivityAttributes: ActivityAttributes` (ContentState: activityType/contactName/avatar/duration/messageStatus/translationProgress/source+targetLanguage; enums `ActivityType`, `MessageStatus`); `MeeshyLiveActivity: Widget`; lock-screen + Dynamic Island region views; `LiveActivityManager` singleton (`startCallActivity`, `updateCallDuration`, `startMessageDeliveryActivity`, `updateMessageStatus`, `startTranslationActivity`, `updateTranslationProgress`, `endActivities`).

**Key behaviors**: call shows live timer; message-delivery auto-ends 2s after delivered/read; translation auto-ends 1s after 100%. Uses `Activity<...>.request/update/end` with `pushType: .token`.

**Android-port note**: No direct equivalent. Closest: ongoing/foreground-service notifications with `setOngoing(true)`, custom `RemoteViews`, and chronometer (`setUsesChronometer`) for call duration. Android 14+ has no Dynamic Island; consider a persistent notification with `ProgressBar` for translation/delivery. CallStyle notification (`NotificationCompat.CallStyle`) for the call case.

- [ ] Live call activity with running timer
- [ ] Message-delivery status live activity
- [ ] Translation-progress live activity

---

## apps/ios/MeeshyWidgets/MeeshyWidgets.swift

**Purpose**: Home-screen widget bundle — Recent Conversations, Unread Count, Quick Reply, Favorite Contacts.

**Public API surface**: `MeeshyWidgetBundle: WidgetBundle` (`@main`); `RecentConversationsWidget` (small/medium/large), `UnreadCountWidget` (small + accessory circular/rectangular/inline), `QuickReplyWidget` (medium/large), `FavoriteContactsWidget` (medium/large); `ConversationProvider`/`FavoriteContactsProvider` TimelineProviders; `MarkConversationReadIntent: AppIntent` (iOS 17+ interactive); models `Conversation`, `FavoriteContact`, `ConversationEntry`, `FavoriteContactsEntry`; `InitialsAvatar`, `WidgetColors`, widget-local `Color(hex:)`.

**Key behaviors**: data loaded from App Group `UserDefaults` (suite `group.me.meeshy.apps`, keys `recent_conversations`/`unread_count`/`favorite_contacts`) with sample fallback; timeline refreshes every 15 min (conversations) / hourly (favorites). `MarkConversationReadIntent` mutates the shared conversation list, decrements unread count, queues `pending_mark_read`, reloads timelines — interactive widget button without opening app. Deep links via `widgetURL`/`Link` (`meeshy://conversation/{id}`, `meeshy://quickreply/{id}?text=`, etc.). Widget can't import MeeshyUI → mirrors brand colors locally.

**Android-port note**: Use Jetpack Glance (`GlanceAppWidget`) for the four widgets, or classic `AppWidgetProvider` + `RemoteViews`. Data source = shared DataStore / Room (Glance can read suspend-fns). `MarkConversationReadIntent` → Glance `actionRunCallback`. Timeline refresh → `updateAppWidget` schedule / `WorkManager`. Accessory (Lock-screen) widgets → Android 12+ keyguard widgets are limited; main app widgets are the priority.

- [ ] Recent conversations home-screen widget (3 sizes)
- [ ] Unread count widget (incl. lock-screen accessory)
- [ ] Quick-reply widget with canned responses
- [ ] Favorite contacts widget
- [ ] Interactive "mark as read" from widget (no app launch)

---

## apps/ios/Package.swift

**Purpose**: SPM manifest for the Meeshy app target.

**Key facts**: swift-tools 6.2, Swift 6 language mode, `defaultIsolation(MainActor)`, upcoming features SE-0461/0470/0444. iOS 17 min. Dependencies: Firebase iOS SDK 12.12.1 (Core, Analytics, Crashlytics, Messaging, Performance + CrashlyticsPlugin build tool for dSYM upload), Socket.IO 16.1, WebRTC (stasel) 141.0, WhisperKit 0.9 (on-device speech). Image caching = native AsyncImage + custom DiskCacheStore (Kingfisher removed). ONNX Runtime for voice cloning noted as manual integration.

**Android-port note**: Gradle dependency map — Firebase Android BoM (analytics/crashlytics/messaging/perf), `socket.io-client` Java, `io.getstream:stream-webrtc-android` or Google's WebRTC, on-device speech via Whisper Android port (whisper.cpp JNI) or `SpeechRecognizer`. Coil for image caching. ONNX Runtime Android for voice cloning.

---

## apps/ios/WebRTCStubs.swift

**Purpose**: Compile-time stub types for the entire WebRTC API, compiled ONLY when `!canImport(WebRTC)` (CI / builds without the WebRTC package).

**Public API surface**: stub classes/enums for `RTCVideoFrame`, `RTCVideoSource`, `RTCVideoTrack`, `RTCCameraVideoCapturer`, `RTCMTLVideoView`, `RTCPeerConnectionFactory`, `RTCPeerConnection`, `RTCSessionDescription`, `RTCIceCandidate`, `RTCConfiguration`, `RTCMediaStream`, `RTCDataChannel`, `RTCRtpSender/Receiver/Parameters`, plus all enums and `RTCInitializeSSL`/`RTCCleanupSSL`.

**Android-port note**: Do NOT port — pure iOS build-system artifact. Android can simply make WebRTC a normal Gradle dependency; if a no-WebRTC flavor is wanted, use a build flavor with stub source set.

---

## packages/MeeshySDK/Package.swift

**Purpose**: SPM manifest for the dual-target SDK (`MeeshySDK` core + `MeeshyUI`).

**Key facts**: swift-tools 6.2, `defaultLocalization: "fr"`, iOS 17. Core target keeps `nonisolated` default isolation (actors, URLSession delegates, socket callbacks); UI target flips to `MainActor` default (SE-0466). Dependencies: Socket.IO 16.1.1, GRDB.swift 6.29.3 (SQLite), WebRTC (stasel) 146.0, swift-snapshot-testing 1.17.6 (tests). `MeeshyUI` processes `Resources` + `Story/Canvas/Metal` resources. Test targets keep `nonisolated` to match XCTestCase.

**Android-port note**: Mirror the dual-module split as two Gradle modules — `:sdk-core` (no Compose; networking/sockets/cache/models) and `:sdk-ui` (Compose components depending on core). GRDB → Room; Socket.IO Java client; WebRTC Android. Metal shaders for story canvas → AGSL/RenderEffect or OpenGL/Vulkan on Android. `fr` default localization → Android resource defaults.

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioRecordingProviding.swift

**Purpose**: Unified protocol + value types for audio recording across the app/SDK.

**Public API surface**: `@MainActor AudioRecordingProviding: AnyObject, ObservableObject` (`isRecording`, `duration`, `audioLevels: [CGFloat]`, `recordedFileURL`; `startRecording()`, `@discardableResult stopRecording() -> URL?`, `cancelRecording()`); `AudioRecordingResult` (url/duration/data, Sendable); `AudioRecordingSettings` (maxDuration/minimumDuration/sampleRate/channels/bitRate) with presets `standard`, `story` (60s cap), `voiceSample` (10s min, 96kbps).

**Android-port note**: Kotlin `interface AudioRecorder` with `StateFlow<Boolean> isRecording`, `StateFlow<Long> duration`, `StateFlow<List<Float>> audioLevels`. Settings = data class with companion presets. DI via constructor injection.

- [ ] Audio recording abstraction with story/voice-sample presets

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/DefaultSDKAudioRecorder.swift

**Purpose**: Default `AudioRecordingProviding` implementation using `AVAudioRecorder`.

**Public API surface**: `@MainActor DefaultSDKAudioRecorder: ObservableObject, AudioRecordingProviding`.

**Key behaviors**: configures `AVAudioSession` (.playAndRecord, defaultToSpeaker, allowBluetoothA2DP); records to temp `voice_{epoch}.m4a` (MPEG4-AAC, 44.1kHz mono, 64kbps, medium quality); 0.05s metering timer; `updateMetering` normalizes `averagePower` from -50dB floor to 0..1, keeps a rolling 15-sample level history; `stopRecording` deactivates session and returns URL; `cancelRecording` deletes the file.

**Android-port note**: `MediaRecorder` (or `AudioRecord` for raw PCM levels) with `AAC`/`MPEG_4` container, 44.1kHz mono 64kbps. Amplitude via `MediaRecorder.maxAmplitude` polled on a coroutine ticker (~50ms). Manage `AudioManager`/audio focus. 15-sample rolling history → a small deque.

- [ ] Voice message recording (m4a, with live level meter)

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformCache.swift

**Purpose**: Unified waveform-sample extraction with persistent disk cache; also renders a compact waveform PNG (thumbhash-style).

**Public API surface**: `actor WaveformCache` (`shared`); `samples(from url:count:)`, `samples(from data:count:)`, `waveformImageData(from url/data:width:height:)`, `clearMemoryCache()`, `clearAllCaches()`.

**Key behaviors**: two-level cache (in-memory dict + disk `.waveform` files in `Caches/com.meeshy.waveforms`); cache key = identifier + sampleCount; Data variant keyed by an FNV-1a hash of the first 8KB. `extractSamples`: `AVAssetReader` streams 16-bit PCM, buckets `abs` amplitude into `count` buckets, averages, normalizes by max; cancellation-aware. `renderWaveformImage`: `CGContext` bars in indigo `#6366F1`, 2× scale, PNG via `CGImageDestination`.

**Android-port note**: Kotlin object/singleton with a mutex-guarded map + disk cache in `cacheDir`. Extraction via `MediaExtractor` + `MediaCodec` decode to PCM, or `ExoPlayer`'s extractor. Bucketing/normalization logic ports directly. Waveform PNG via `Canvas`/`Bitmap`. FNV-1a hash trivially ported.

- [ ] Audio waveform sample extraction (cached)
- [ ] Waveform thumbnail image generation

---

## packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformGenerator.swift

**Purpose**: Deprecated backward-compat shim delegating to `WaveformCache.shared`.

**Public API surface**: `@available(*, deprecated) actor WaveformGenerator` (`shared`, `generateSamples(from:sampleCount:)`).

**Android-port note**: Do not port — start directly from the `WaveformCache` equivalent.

---

## Architecture observations

**State management & DI**: Pervasive singleton managers (`AuthManager.shared`, `CacheCoordinator.shared`, socket managers, `ThemeManager`, etc.) accessed directly, with light protocol-based DI at seams (`StoryServiceProviding`, `AudioRecordingProviding`, `StoryViewerCoordinating`) using `.shared` defaults for testability. ViewModels are `@MainActor ObservableObject`. For Android: replace singletons with Hilt/Koin scoped dependencies; keep the protocol-at-seams pattern (Kotlin interfaces). The `EnvironmentObject` re-injection into sheets/covers (iPadRootView+Sheets) is a SwiftUI quirk with **no Android equivalent** — do not carry it over.

**Caching / SWR**: `StoryNotificationTargetViewModel` and the app boot path are clean cache-first / stale-while-revalidate examples — synchronous in-memory cache read for instant paint, always-revalidate from network, fresh wins, graceful fallback. The whole architecture relies on a unified `CacheCoordinator` (GRDB + DiskCache) and an SQLite-backed `OfflineQueue`/outbox with boot crash recovery (inflight rows reset to pending; gateway dedup on `(conversationId, clientMessageId)`). Android: Room as the L2 store, `StateFlow` for L1, WorkManager for the outbox flusher; the dedup contract and boot-recovery sweep must be preserved.

**Concurrency**: Swift 6 strict concurrency, actors for caches/waveform, `@MainActor` for UI, detached background tasks for retention/vacuum/outbox. Android: coroutines + `Dispatchers.IO`, `Mutex`-guarded singletons, `WorkManager` for deferrable work.

**Navigation**: iPhone uses NavigationStack+ZStack; iPad uses a bespoke two-column layout with `Route?` panels + a `Router` callback bridge (`onRouteRequested`/`onPopRequested`). Push/deep-link routing is triplicated across `APINotification`/socket-event/push-payload variants over a very large `MeeshyNotificationType` enum (with many `legacy*` aliases — tech debt). Android: an adaptive `NavHost` with `WindowSizeClass`-driven list-detail; **consolidate the three notification routers into one** `NotificationRouter` over a single sealed type, and drop the legacy enum aliases unless the backend still emits them.

**App Extensions**: Heavy use of iOS-specific extension processes (NSE, Share, Widgets, Live Activities, AppIntents) all communicating through App Group `UserDefaults`/Keychain/SQLite. On Android most of this collapses: `FirebaseMessagingService`, a `ShareActivity`, Glance widgets, and App Actions all run **in-process** — the App-Group data-hop indirection is unnecessary and should be replaced with direct shared DataStore/Room access. The NSE security hardening (URL allowlist, no payload-supplied base URL, file protection, runtime keychain-group resolution) reflects a real SSRF/JWT-exfiltration audit and the *intent* (never trust push-payload URLs, encrypt at rest) must be preserved even though the process model differs.

**Performance techniques**: `drawingGroup()` for the ambient-orb background; `staggeredAppear` index-based entrance delays; `contentTransition(.numericText())` animated counter; two-level waveform cache; splash min-duration to avoid flicker; widget timeline refresh budgeting. Android equivalents: `graphicsLayer`/render-to-bitmap, per-index `AnimatedVisibility`, `animateIntAsState`.

**Tech debt / do-not-port**: `WebRTCStubs.swift` (build artifact); `WaveformGenerator` (deprecated shim); `MeeshyContextMenuExamples` (demo, uses `print()`); the triplicated notification routers and `legacy*` enum cases; `ShareViewController` sample/placeholder contacts. The SDK CLAUDE.md still flags "tokens in UserDefaults" as debt but `MeeshyApp` shows Keychain migration is implemented — the doc is stale.
