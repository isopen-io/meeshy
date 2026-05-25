# iOS Audit — Part 05

Scope: WebRTC calling stack (audio effects, media config, pipeline hooks, custom audio processing module, P2P client, service wrapper), Widget bridge services, GRDB-backed local-first Stores (Comment / Feed / Message), and Main-feature ViewModels (Bookmarks, ConnectionStatus, ConversationList, ConversationOptions, ConversationSocketHandler).

---

## apps/ios/Meeshy/Features/Main/Services/WebRTC/CallAudioEffectsService.swift

Purpose: Real-time in-call voice-effects + background-sound engine built on `AVAudioEngine`. Applies pitch/EQ/distortion/reverb chains and loops ambient sound files into the call audio path.

Public API surface:
- `final class CallAudioEffectsService: CallAudioEffectsServiceProviding`
- State: `activeVoiceEffect: AudioEffectType?`, `isBackSoundActive: Bool`, `isAutoDegraded: Bool`, `isEffectsActive: Bool`, `activeNodeChain: [AVAudioNode]`, `lastProcessingTimeMs: Double?`
- Methods: `setEffect(_:)`, `clearVoiceEffect()`, `clearBackSound()`, `updateParams(_:)`, `processAudioBuffer(_:) -> AVAudioPCMBuffer`, `reset()`, `reportProcessingTime(ms:)`
- Effect types referenced: `AudioEffectConfig` (`.voiceCoder`, `.babyVoice`, `.demonVoice`, `.backSound`), `VoiceCoderParams`, `BabyVoiceParams`, `DemonVoiceParams`, `BackSoundParams`, `AudioEffectsConstants`, `AudioEffectsError`.

Key behaviors / algorithms:
- Three-thread safety model: `configQueue` (serial DispatchQueue for graph mutation), `os_unfair_lock` `stateLock` for fast flag reads, and a **lock-free render path** — the audio thread snapshots an atomically swapped `[(AURenderBlock, AVAudioFormat)]` array.
- Voice chains built from `AVAudioUnitTimePitch`/`Delay`/`EQ`/`Distortion`/`Reverb`. Pitch param is semitones × 100 (cents).
- Pre-allocated `renderBufferPool` so the audio thread does zero malloc; processing routes through raw `AURenderBlock` + `AURenderPullInputBlock` copying audio buffer lists.
- Auto-degradation: if processing exceeds `maxProcessingTimeMs` for `overBudgetThreshold` consecutive frames, effects bypass; restores after `underBudgetThreshold` under-budget frames.
- BackSound looping: `nTimes` or `nMinutes` mode computes loop count from file duration.
- Simulator guard: skips engine graph rebuild when `inputNode` format has sampleRate/channelCount == 0 (Obj-C `NSException` would otherwise crash).

External deps: `AVFoundation`, `os.Logger`, `BackSoundFileProviding`/`BundleBackSoundFileProvider`.

Android-port note: Map to a custom audio effect chain. Android equivalents: `android.media.audiofx` (limited — `PitchShifter` not native) so realistically use **Oboe (AAudio/OpenSL ES)** + a DSP library (e.g. Superpowered, TarsosDSP, or custom) for pitch/formant; or apply effects on the WebRTC `AudioProcessing` path via libwebrtc's `AudioProcessing` module / a custom `AudioDeviceModule`. Lock-free pointer-swap of the effect chain maps cleanly to an `AtomicReference<EffectChain>`. The auto-degradation watchdog is portable verbatim. Background-sound looping → `ExoPlayer`/`AudioTrack` mixed into the upstream buffer.

---

## apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift

Purpose: Extensible, value-type call-media configuration consumed by the WebRTC engine and mutable by media pipeline hooks.

Public API surface (all `Sendable` structs):
- `CallMediaConfig { audio: AudioConfig, video: VideoConfig?, dataChannels: [DataChannelConfig], preferredCodecs: CodecPreferences }`
- `AudioConfig { dtx, maxBitrateBps, minBitrateBps }` — default DTX on, 64k/16k.
- `VideoConfig { maxResolution: CGSize, maxFrameRate, preferHardwareCodec }` — preset `hd720p30`.
- `DataChannelConfig { label, isOrdered, maxRetransmits?, maxPacketLifeTime? }`
- `CodecPreferences { audioCodecs, videoCodecs }` — default audio `["opus","red"]`, video `["H264","VP8","VP9"]`.

Android-port note: Plain Kotlin `data class`es. `CGSize` → `android.util.Size`. These are pure config DTOs — straight 1:1 port.

---

## apps/ios/Meeshy/Features/Main/Services/WebRTC/MediaPipelineHook.swift

Purpose: Protocol-based extensibility bus for in-call cross-cutting features (transcription, translation, recording, AI, AR, E2EE). Hooks observe well-defined seams in the media flow.

Public API surface:
- `enum CallRole { caller, callee }`, `typealias PeerID = String`
- `struct CallContext { callId, isVideo, role, peerId }` (read-only snapshot)
- `protocol MediaPipelineHook: Sendable` with `nonisolated var identifier`, plus async seams: `willConfigure(call:config:inout)`, `processLocalAudio`, `processRemoteAudio(from:)`, `processLocalVideoPreFilter`, `processLocalVideoPostFilter`, `callDidTransition(_:in:)` — all with default no-op extension implementations.

Key behavior: `willConfigure` takes `inout CallMediaConfig` so hooks can request extra codecs/data channels. Audio buffers are `CMSampleBuffer` PCM Int16 48kHz mono; video frames are `CVPixelBuffer`.

Android-port note: Kotlin `interface` with `suspend` functions and default implementations. `CMSampleBuffer` → WebRTC `AudioFrame` / `ByteBuffer`; `CVPixelBuffer` → `VideoFrame`. `inout` config → return-modified-copy or a builder. This is a clean Strategy/observer pattern — preserve it as the Android calls extensibility seam.

---

## apps/ios/Meeshy/Features/Main/Services/WebRTC/MeeshyAudioProcessingModule.swift

Purpose: Custom audio-processing module that intercepts WebRTC's capture pipeline to (a) fork a CLEAN copy of mic audio to transcription and (b) apply effects on the EFFECTS path before encoding. Dual-stream architecture.

Public API surface:
- `final class MeeshyAudioProcessingModule: NSObject`
- `let effectsService: CallAudioEffectsServiceProviding`, `var onCleanAudioBuffer: ((AVAudioPCMBuffer) -> Void)?`, `var isEffectsActive: Bool`
- `func processAudioBuffer(_ buffer: AVAudioPCMBuffer)`

Key behaviors:
- Clean path: copies buffer (RTCAudioBuffer memory only valid in-callback) and dispatches to a `.userInitiated` `transcriptionQueue` — never blocks the real-time audio thread.
- Effects path: processes via `effectsService`, copies processed contents back into the in-place WebRTC buffer.
- The `RTCAudioCustomProcessingDelegate` conformance is `#if false`-gated — **requires a custom WebRTC build with ADM exposed; not active in the public SDK build.** This is dead-but-documented code: the dual-stream design exists but is not wired into the shipping WebRTC framework.

Android-port note: Android's libwebrtc DOES expose `AudioProcessing` / custom `AudioDeviceModule` and `JavaAudioDeviceModule.AudioSamplesReadyCallback` / `setSamplesReadyCallback` — so the dual-stream design is MORE feasible on Android than iOS. Map clean-path to a callback consumer fed to the transcription pipeline; effects-path to in-place modification of the recorded `AudioSamples`. Tech-debt note: do not port the `#if false` block — re-implement against the real Android ADM API.

---

## apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift

Purpose: Concrete WebRTC peer-connection client — the SDP/ICE/media engine for 1:1 calls. Heavily performance- and bug-annotated.

Public API surface:
- `final class P2PWebRTCClient: NSObject, WebRTCClientProviding, @unchecked Sendable` (+ a `#else` no-op fallback when `WebRTC` framework absent)
- `weak var delegate: WebRTCClientDelegate?`, `isConnected`, `localVideoTrack`/`remoteVideoTrack` (`Any?`), `videoFilterPipeline`, `audioEffectsService`
- `configure(iceServers:)`, `updateIceServers(_:)`, `startLocalMedia(type:)`, `createOffer()`, `createAnswer(for:)`, `setRemoteAnswer(_:)`, `addIceCandidate(_:)`, `toggleAudio/Video`, `switchCamera()`, `getStats()`, `createDataChannel(label:)`, `sendDataChannelMessage(_:)`, `setAudioEffect`/`updateAudioEffectParams`, `disconnect()`
- Static SDP munging helpers: `mungeOpusSDP`, `addAudioRedundancy` (deprecated), `addTransportCC`, `addVideoBitrateHints`, `enableSimulcast`.
- Conforms `RTCPeerConnectionDelegate` + `RTCDataChannelDelegate`.

Key behaviors / hard-won lessons (preserve all):
- **PERF-001**: process-wide cached `RTCPeerConnectionFactory` + one-time `RTCInitializeSSL()` (saves ~150-250ms/call). `RTCCleanupSSL()` must NOT be called per-deinit.
- **PERF-002**: encoder pinned to hardware H.264 when available.
- **PERF-003**: `iceCandidatePoolSize = 4` pre-warms ICE gathering.
- Unified-plan, maxBundle, rtcpMux required, continual gathering.
- Manual audio mode (`RTCAudioSession.useManualAudio = true`, `isAudioEnabled = false`) — CallKit owns the `AVAudioSession` lifecycle.
- Phase 2: `addTransceiver` (not implicit `add(track:)`) so `setCodecPreferences` is reliable. Audio codecs Opus+RED; video H264>VP8>VP9 (AV1 excluded). Uses `rtpSenderCapabilities` (sender, not receiver) caps.
- `invokeSetCodecPreferences`: dynamic ObjC IMP dispatch to force the throwing `setCodecPreferences:error:` selector (Swift overload resolution silently picked the deprecated void variant and swallowed errors).
- Opus tuned via SDP fmtp munging: `usedtx=1`, `useinbandfec=1`, `maxaveragebitrate=64000`, `stereo=1`. RED via `setCodecPreferences` (SDP munging path disabled — caused PT/PT silent-audio bug commit 9e663039).
- Camera format selection caps ≤720p AND requires 30fps support to avoid slow-mo 120/240fps formats that crash `startCapture` (`FigCaptureSourceRemote err=-17281`).
- `toggleVideo(false)` also stops the capturer (battery: ~80-150mA savings).
- Simulator: video unsupported — throws `WebRTCError.simulatorVideoUnsupported`.
- All `RTCPeerConnectionDelegate`/`RTCDataChannelDelegate` methods are `nonisolated` (callbacks arrive off-main from WebRTC signaling thread; would trap under Swift 6 MainActor default isolation). State mutation re-dispatched via `DispatchQueue.main.async`.
- `getStats()` parses `candidate-pair` (RTT), `inbound-rtp` (loss, bytes/packets received, codec), `outbound-rtp` (bytes/packets sent).

External deps: `WebRTC` framework (`@preconcurrency import`), `AVFoundation`, `VideoFilterPipeline`, `VideoFilterCapturerDelegate`, `CallAudioEffectsService`, `MeeshyAudioProcessingModule`.

Android-port note: Android libwebrtc (`org.webrtc.*`) maps directly: `PeerConnectionFactory`, `PeerConnection`, `RtpTransceiver.setCodecPreferences` (exposed properly on Android — no IMP hack needed, drop `invokeSetCodecPreferences`), `Camera2Enumerator`/`CameraVideoCapturer`, `VideoSource`/`AudioSource`. SDP munging is plain string manipulation — port verbatim. ICE/codec/perf decisions are platform-agnostic and should be preserved. CallKit manual-audio dance → Android `ConnectionService`/`Telecom` + `AudioManager` mode (`MODE_IN_COMMUNICATION`); WebRTC Android ADM handles audio session itself, simpler than iOS. Process-wide factory singleton → keep. Off-thread delegate concern disappears (Java threading model).

---

## apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift

Purpose: Framework-agnostic call domain types and constants — no `WebRTC` import, so testable and shareable.

Public API surface:
- `enum SDPType` (offer/answer/pranswer/ice-restart), `struct SessionDescription`, `struct IceCandidate`, `struct IceServer` (+ Google STUN `defaultServers`), `struct MediaTracks`, `enum CallMediaType` (audioOnly/audioVideo)
- `enum PeerConnectionState` (new/connecting/checking/connected/disconnected/reconnecting/failed/closed)
- `struct CallStats { roundTripTimeMs, packetsLost, bandwidth, codec?, inboundPacketsReceived }`
- `protocol WebRTCClientProviding` + `protocol WebRTCClientDelegate` (with `sending` Swift-6 transfer annotation on track params)
- `struct DataChannelTranscriptionMessage` (transcription-segment wire model)
- `enum CallEndReason`, `enum CallDisplayMode` (fullScreen/pip)
- `enum QualityThresholds` — constants: RTT tiers (100/250/500ms), packet-loss tiers, bitrate min/default/max, `statsIntervalSeconds=5`, `heartbeatIntervalSeconds=10`, `heartbeatLostThresholdSeconds=30`, `heartbeatAckTimeoutSeconds=5`, `maxReconnectAttempts=3`, RTP-gate (`pollInterval=2s`, `maxAttempts=5`, `requiredPackets=5`), `outgoingRingTimeoutSeconds=45`.
- `enum VideoQualityLevel` (excellent/good/fair/poor/critical) — `Comparable`, with `targetResolutionHeight`/`targetFPS`/`targetVideoBitrate` per level and `from(rtt:packetLoss:)` classifier.
- `enum WebRTCError: LocalizedError`.

Key behaviors: RTP gate (ICE connected ≠ media flowing — poll stats, require ≥5 inbound RTP packets before declaring connected). Heartbeat/reconnect tuned for cellular (WhatsApp/Telegram-parity).

Android-port note: Pure Kotlin enums/data classes — direct port and a strong candidate for a shared `commonMain` module if KMP is ever considered. All thresholds are platform-agnostic and must be preserved exactly (they encode call-quality UX policy).

---

## apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift

Purpose: `@MainActor` orchestration wrapper around `WebRTCClientProviding` — ICE-candidate buffering, quality monitoring, adaptive bitrate, transcription data channel, ICE restart.

Public API surface:
- `protocol WebRTCServiceDelegate` (candidate, connection-state, connect/disconnect, quality-level change, remote video track, transcription data)
- `@MainActor final class WebRTCService`
- `configure(isVideo:iceServers:)`, `updateIceServers`, `createOffer()`, `createAnswer(from:)`, `setRemoteDescription`, `addICECandidate`, `startLocalMedia(isVideo:)`, `muteAudio`, `enableVideo`, `switchCamera`, `handleRemoteAudioMuted`, `getStats()`, `startQualityMonitor`/`stopQualityMonitor`, `createTranscriptionChannel`, `sendTranscription`, `setAudioEffect`/`updateAudioEffectParams`, `performICERestart()`, `close()`.

Key behaviors:
- ICE candidates buffered until remote description set, then flushed in order.
- Quality monitor is a cancellable `Task` loop (not `Timer` — App-Nap-friendly, structured cancellation) polling stats every 5s.
- `adjustBitrate`: maps RTT/loss → bitrate tier + `VideoQualityLevel`; 5s debounce on level changes; auto-disables video on `.critical`.
- `@MainActor` isolation fixes a TSAN data race (was `@unchecked Sendable` with no lock); delegate methods `nonisolated`, hop via `Task { @MainActor }`.

Android-port note: Kotlin class with a `CoroutineScope` (replaces `Task` loop), `StateFlow` for connection/quality state, an interface for the delegate (or `Flow` events). ICE buffering, adaptive-bitrate ladder, and ICE-restart logic port directly. Use `viewModelScope`/`lifecycleScope` for the quality-monitor coroutine.

---

## apps/ios/Meeshy/Features/Main/Services/WidgetActionFlusher.swift

Purpose: Drains widget-extension-queued actions (mark-as-read) when the main app foregrounds — the widget process lacks the auth token for authenticated REST.

Public API surface: `@MainActor final class WidgetActionFlusher` (singleton `.shared`); `func flush() async`.

Key behaviors: Reads `pending_mark_read` string array from App Group `UserDefaults` (`group.me.meeshy.apps`), calls `ConversationService.shared.markRead` per id, notifies `NotificationCoordinator` + posts `.conversationMarkedRead`. Failures retained in the queue for next-flush retry (server-idempotent).

Android-port note: Android widgets (`AppWidgetProvider`) can often run authenticated work directly, but the queue-and-flush pattern still applies when the widget process can't reach the token. Use `SharedPreferences` (or DataStore) in a shared file, drain on `Activity.onResume` / process start, or — better — a `WorkManager` job triggered by the widget's `RemoteViews` `PendingIntent`. App Group → shared `SharedPreferences`/ContentProvider or a common DataStore.

---

## apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift

Purpose: Bridges `NotificationCoordinator` to the widget shared container + `WidgetKit` timeline reload. Passive sink — receives pushes, keeps the App Group store aligned.

Public API surface:
- `struct WidgetConversation` / `struct WidgetFavoriteContact` (Codable widget DTOs)
- `@MainActor final class WidgetDataManager: NotificationWidgetSink` (singleton)
- `publishConversations`, `publishFavoriteContacts`, `publishUnreadCount`, `reloadTimelines`; legacy shims `updateConversations`/`updateFavoriteContacts`/`updateUnreadCount`.

Key behaviors: Writes top-10 conversations (pinned-first, then `lastMessageAt`) and top-8 pinned direct contacts to App Group `UserDefaults` as ISO8601-encoded JSON; computes a last-message preview string (sender prefix for groups, attachment-count fallback).

Android-port note: Map to `AppWidgetManager` + Glance (Jetpack Compose for widgets) or classic `RemoteViews`. Shared store → DataStore/`SharedPreferences` readable by the widget. `reloadAllTimelines()` → `AppWidgetManager.updateAppWidget` / `GlanceAppWidget.updateAll`. DTOs port as Kotlin `data class`es (`@Serializable`).

---

## apps/ios/Meeshy/Features/Main/Stores/CommentStore.swift

Purpose: `@Observable @MainActor` store for a post's threaded comments, backed by GRDB via `FeedPersistenceActor`.

Public API surface:
- `@Observable @MainActor public final class CommentStore`
- State: `topLevelComments: [CommentRecord]`, `expandedThreads: Set<String>` (private repliesCache)
- `init(postId:persistence:)`, `loadInitial()`, `replies(for:)`, `toggleThread(_:)`, `loadMore() -> Bool`
- File-scope GRDB query helpers `fetchTopLevelComments` / `fetchReplies`.

Key behaviors: Top-level comments = `parentId == nil` ordered by `createdAt DESC`, page 30 then 20. Thread expansion lazily loads up to 50 replies (`createdAt ASC`). Cursor pagination by `createdAt < before`.

External deps: `GRDB` (`@preconcurrency`), `FeedPersistenceActor`, `CommentRecord`.

Android-port note: Room `@Dao` with `@Query` on a `comments` table; expose `Flow<List<CommentEntity>>`. Store → a `ViewModel`-scoped class or part of a feed VM. The Swift-6 GRDB-isolation workaround (file-scope closures) is iOS-specific tech debt — irrelevant on Android; Room handles threading.

---

## apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift

Purpose: `@Observable @MainActor` store for the feed post list, backed by GRDB. Observes DB commits via NotificationCenter (not GRDB observation).

Public API surface:
- `@Observable @MainActor public final class FeedStore`
- `posts: [PostRecord]`, `postsDidChange: PassthroughSubject<Void,Never>`
- `init(persistence:)`, `startObserving(dbPool:)`, `stopObserving()`, `loadInitial()`, `loadOlder() -> Bool`
- Private `FeedStoreWeakBox` (`@unchecked Sendable` non-generic weak box).

Key behaviors: Initial window 50, grows +20 per `loadOlder`. **GRDB `ValueObservation` crashes under Swift 6 strict concurrency** (`_swift_task_checkIsolatedSwift` fires from GRDB's dispatch queue) — workaround is subscribing to a `.feedStoreShouldRefresh` NotificationCenter signal posted by `FeedPersistenceActor` after every commit. `posts` only reassigned when content actually changed (`!=` guard).

Android-port note: Room observation works natively — use `Flow<List<PostEntity>>` from a `@Query`; the entire NotificationCenter workaround and `WeakBox` disappear. Pagination → Paging 3 library (`PagingSource`) or simple `LIMIT` growth. The non-generic-box / optimizer-crash notes are iOS-only and must NOT be carried over.

---

## apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift

Purpose: `@Observable @MainActor` store for a conversation's message window — the hot list backing the chat UI. Windowed loading (latest vs jump-around), section grouping by day, O(1) id lookup.

Public API surface:
- `enum WindowMode { latest, around(date:) }`
- `@Observable @MainActor public final class MessageStore`
- State: `messages: [MessageRecord]`, `sections: [MessageSection]`, `unreadBelowCount`, `currentVisibleMessageIds: Set<String>`, `isUserScrolling`, `windowMode`
- `struct MessageSection { date: DateComponents, messageIds: [String] }`
- `init(conversationId:persistence:)`, `startObserving(dbPool:)`, `stopObserving()`, `refreshFromDB()`, `loadInitial()`, `loadOlder(before:) -> Bool`, `loadWindow(around:)`, `restoreLatestWindow()`, `index(of:)`, `message(for:)`, `post(for:)`
- `messagesDidChange: PassthroughSubject` (for UICollectionView observation).
- Private `WeakBox` + `ObservationTokens` (`@unchecked Sendable`, accessible from `nonisolated deinit`).

Key behaviors:
- `initialWindowSize = 200`, `prefetchThreshold = 30`. `.latest` with no anchor = newest 200; with an anchor (after scroll-up) loads ALL messages from anchor → newest (uncapped growing window). `.around(date:)` loads `half` before + `half` after a center date for jump-to-message.
- Same GRDB-observation Swift-6 crash workaround as FeedStore — NotificationCenter `.messageStoreShouldRefresh` filtered by `conversationId`.
- `refreshFromDB` does `yieldToRunLoop()` before mutating `@Observable messages` to avoid "Publishing changes from within view updates" (which silently blanked the bubble list).
- `loadOlder` uses `Task.detached` for the GRDB read (only path that does so).
- Day-section grouping recomputed on every change; `_idIndex` lazily built dictionary.

Android-port note: Room `@Query` with `Flow`; for the growing window use Paging 3 or an explicit `LIMIT/OFFSET`. The `.around(date:)` jump window maps to a centered query. Day-section grouping → compute in the ViewModel/adapter; for the hot list use a `RecyclerView` (the iOS code explicitly notes UICollectionView usage — Android should use `RecyclerView` with `DiffUtil`/`ListAdapter`, NOT a naive Compose `LazyColumn` for very long histories). All the runloop-yield / `WeakBox` / `nonisolated deinit` machinery is iOS-only — drop it.

---

## apps/ios/Meeshy/Features/Main/ViewModels/BookmarksViewModel.swift

Purpose: `@MainActor ObservableObject` for the saved-posts (bookmarks) screen — cache-first, cursor-paginated, optimistic remove.

Public API surface:
- `posts: [FeedPost]`, `isLoading`, `hasMore`
- `init(postService:languageProvider:)`, `loadBookmarks()`, `removeBookmark(_:)`, `refresh()`.

Key behaviors:
- Cache-first via `CacheCoordinator.shared.feed.load(for: "bookmarks")` — `.fresh` returns immediately, `.stale` returns + background revalidate, `.expired/.empty` fetch network.
- Pagination via `nextCursor`; dedups by id; persists to cache when first page or fully loaded.
- `removeBookmark`: optimistic removal with snapshot rollback on failure; toast on error.
- Posts converted with `preferredLanguages` (Prisme Linguistique) via `LanguageProviding`.

Android-port note: Kotlin `ViewModel` + `StateFlow<BookmarksUiState>`. Cache-first → a repository returning a `CacheResult` sealed class. Optimistic update with snapshot rollback ports directly. `ToastManager` → a one-shot event `Channel`/`SharedFlow`.

---

## apps/ios/Meeshy/Features/Main/ViewModels/ConnectionStatusViewModel.swift

Purpose: Aggregates network + socket + offline-queue state into one `Status` for a connection-health banner.

Public API surface:
- `enum Status { connected, syncing, disconnected, offline }`
- `status: Status` (`@Published private(set)`)
- Designated `init(isOnlinePublisher:isConnectedPublisher:pendingCountPublisher:)` (full DI for tests) + convenience `init` wiring `NetworkMonitor`/`MessageSocketManager`/`OfflineQueue` singletons.
- `static func derive(online:connected:pending:) -> Status` (pure, unit-testable).

Key behaviors: `CombineLatest3` of online/connected/pending → derive: not online → offline; not connected → disconnected; pending > 0 → syncing; else connected.

Android-port note: Kotlin `ViewModel`; `combine(networkFlow, socketFlow, pendingCountFlow)` → `StateFlow<Status>`. `derive` is a pure function — port verbatim and unit-test directly. Excellent DI shape — keep it.

---

## apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift

Purpose: The conversation-list (home) ViewModel — the single largest/most-coupled VM in this chunk. Cache-first loading, cursor pagination, real-time socket merging, filtering/grouping/sorting, drafts, optimistic preference mutations, prefetching.

Public API surface (selected):
- Published: `conversations: [Conversation]`, `userCategories`, `isLoading`, `loadFailed`, `loadState: LoadState`, `paginationState: PaginationState`, `hasMore`, `searchText`, `selectedFilter: ConversationFilter`, `groupedConversations`, `draftSummaries`; non-published `typingUsernames`, `previewMessages`.
- `totalUnreadCount` computed.
- `enum ConversationDiscoverySource` (socketNew/socketNotification/socketUpdated/pushNotification/syncDelta/pullRefresh/coldCache).
- List mutators: `setConversations`, `appendConversations`, `bumpToTop`, `fetchAndPrependMissingConversation`, `schedulePersist`.
- Loading: `loadConversations()`, `forceRefresh()`, `refresh()`, `loadMore()`, `pullToRefresh()`, `loadCategories()`, `reloadFromCache()`.
- Mutations (optimistic + rollback): `togglePin`, `toggleMute`, `markAsRead`, `markAsUnread`, `archiveConversation`, `unarchiveConversation`, `deleteConversation`, `moveToSection`, `setFavoriteReaction`, `persistCategoryExpansion`.
- Prefetch: `loadPreviewMessages`, `prefetchTopConversationMessages`, `prefetchRecentStories`, `refreshStoriesPrefetch`, `handleForegroundReturn`, `handleForegroundReactivation`.
- Static pure helpers: `filterConversations`, `groupConversations`, `conversationsAreInOrder`.

Key behaviors / business logic:
- Cache-first: restores cursor THEN loads cache; `.fresh`→paint, `.stale`→paint + delta sync, `.expired/.empty`→`fullSync()` then reload, `loadFailed` for retryable cold-start failure.
- `mergePreservingRecentlyCreated`: a freshly created conversation is force-kept across destructive snapshots for a 30s TTL (`recentlyCreatedAt`) to defend against gateway aggregate eventual-consistency lag.
- Total list ordering: pinned first; among unpinned, conversations with an active draft float to top (most-recently-edited first); then `lastMessageAt DESC`.
- Unified single-pass pipeline: `CombineLatest4($conversations,$searchText,$selectedFilter,$userCategories)` debounced 150ms → filter (main) + group (`Task.detached`) → one `groupedConversations` publish.
- `pageLimit = 100` (gateway max — covers most users in one page); `loadMore` has a zero-progress loop guard (May 2026 `fast-json-stringify` cursor-strip bug) that forces `.exhausted` and persists it.
- Real-time socket subscriptions: typing, `userPreferencesUpdated`, `conversationUpdated` (bump-to-top + metadata), `conversationNew` + legacy `notification:new` discovery, participant left/banned/unbanned member-count deltas.
- O(1) `_convIdIndex` lookup; `schedulePersist` debounced (200ms) coalesced GRDB write of list + cursor + hasMore.
- Pull-to-refresh invalidates 11 caches (conversations, messages, participants, stories, prefs, categories, tags, profiles, images, thumbnails, translation caches).
- Optimistic mutations everywhere with snapshot rollback on failure.
- `markAsRead` gated by `UserPreferencesManager.privacy.showReadReceipts`.

External deps: `APIClient`, `ConversationService`, `PreferenceService`, `MessageSocketManager`, `MessageService`, `AuthManager`, `StoryService`, `ConversationSyncEngine`, `PushNotificationManager`, `DraftStore`, `CacheCoordinator`, `NotificationCoordinator`, `PresenceManager`, `ConversationPreferencesBroadcaster`, `UserPreferencesManager`.

Android-port note: This is a large VM — consider splitting on Android (list-loading/pagination repo, real-time-merge handler, filter/group use-case, prefetch worker). Kotlin `ViewModel`; `StateFlow` per published field or a single `HomeUiState`. `CombineLatest4` → `combine(...)` with `.debounce(150)`; off-main grouping → `flowOn(Dispatchers.Default)`. Optimistic+rollback ports directly. Prefetch → `WorkManager`/coroutines. The `recentlyCreatedAt` TTL anti-clobber and the `loadMore` zero-progress loop guard are battle-tested business rules — port them exactly. Cursor pagination → Paging 3 or manual. Cache invalidation scope list must be preserved as the pull-to-refresh contract.

---

## apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift

Purpose: `@MainActor ObservableObject` for the conversation-options sheet — pin/mute/mention/archive toggles, custom name, reaction, category, tags, delete/leave. Cache-first + optimistic.

Public API surface:
- Published: `prefs: APIConversationPreferences`, `categories`, `allTags`, `loadState: LoadState`, `errorMessage`, `didDelete`, `didLeave`
- `enum LoadState { idle, loading, loaded, error(String) }`
- `load()`; setters returning `Task<Void,Never>`: `setPinned`, `setMuted`, `setMentionsOnly`, `setCustomName`, `setReaction`, `setCategory`, `addTag`, `removeTag`, `setTags`, `toggleArchive`; `createCategoryAndSelect(name:)`, `deleteForMe()`, `leave()`.
- `APIConversationPreferences.empty` extension.

Key behaviors:
- Cache-first parallel load (`async let` of cached prefs/categories/tags) → paint stale immediately, then parallel `revalidate…` (which also persist to L2). Keeps cached data visible on revalidate failure.
- Every setter mutates `prefs` synchronously then `persistAsync` in a detached Task with rollback closure on failure; returned `Task` lets tests await persistence.
- `setCustomName` debounced 500ms via `PassthroughSubject` (one PUT per typing burst).
- `setTags` replaces the whole tag set in one call to avoid add/remove fan-out last-write-wins races.
- On success, broadcasts new prefs via `ConversationPreferencesBroadcaster` (list/section headers update without refetch) and persists to L2.

External deps: `PreferenceService`, `ConversationService`, `ConversationPreferencesBroadcaster`, `MeeshySDK` (`APIConversationPreferences`, `UpdateConversationPreferencesRequest`, `ConversationCategory`).

Android-port note: Kotlin `ViewModel`; setters return `Job` (instead of `Task`). `StateFlow` for prefs/loadState. Debounce → a `Flow` debounce on a text input or `MutableStateFlow` + `debounce`. Optimistic+rollback and broadcaster pattern (→ a shared `SharedFlow`/event bus or repository-backed `Flow`) port directly. Whole-tag-set replacement is an important race-fix — keep it.

---

## apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift

Purpose: `@MainActor` component owning all per-conversation real-time socket wiring — message receive/edit/delete, reactions, typing (in + out), read-status, roles, attachments, view-once, translations, transcriptions, audio translations, live location, conversation-closed/join-error. Writes through `MessagePersistenceActor`; the store observation surfaces changes to the VM.

Public API surface:
- `@MainActor protocol ConversationSocketDelegate` — exposes `messages`, `typingUsernames`, `lastUnreadMessage`, `newMessageAppended`, `messageTranslations`, `messageTranscriptions`, `messageTranslatedAudios`, `activeLiveLocations`, `isConversationClosed`, `pendingServerIds`; methods `messageIndex(for:)`, `containsMessage(id:)`, `evictViewOnceMedia`, `markMessageAsConsumed`, `handleParticipantRoleUpdated`, `syncMissedMessages()`, `decryptMessagesIfNeeded(_:inout)`, `persistMessagesUsingServerIds()`, `handleSocketAccessRevoked(reason:)`, `markAsRead()`.
- `@MainActor final class ConversationSocketHandler`
- `var persistence: MessagePersistenceActor?`, `weak var delegate`
- `init(conversationId:currentUserId:messageSocket:)`, `armSocketSubscriptions()`, `onTextChanged(_:)`, `stopTypingEmission()`.

Key behaviors / business logic:
- Joins the conversation socket room on a deferred `DispatchQueue.main.async` (avoids "Publishing changes from within view updates" that dismissed the nav push).
- Message dedup: sliding window of last 1000 message ids (`Set` + ordered array).
- `message:new` handling: (a) if it matches a pending optimistic row (`pendingServerIds`), upgrades **in place** — keeps the SwiftUI `id` as the optimistic `tempId` to avoid bubble unmount/flash, persists server-ack state machine event + server-acked fields; (b) if already present, refreshes attachments for own messages; (c) own messages otherwise ignored; (d) others' messages decrypted, buffered to persistence, set `lastUnreadMessage` + `newMessageAppended`, clear sender from typing, fire `markAsRead` (sender's check upgrades delivered→read).
- Typing emission: 3s debounce, 3s re-emit interval, 15s per-user safety timeout; gated by `privacy.showTypingIndicator`.
- Edits/deletes/reactions/read-status/attachment-status/view-once all write through `MessagePersistenceActor`; store observation surfaces them — handler does not mutate `messages` directly for those.
- Translations: `.collect(.byTime(80ms))` coalesces translation bursts (server fans out 5+ languages) into one `@Published` write (~80% fewer body re-evals); merges by `targetLanguage`; persists `TranslationRecord`.
- Transcriptions / audio translations (3 events share one handler) merge by `targetLanguage`.
- Live location: started/updated/stopped maintain `activeLiveLocations`.
- `conversationJoinError` → `handleSocketAccessRevoked` (mirrors REST 403 path).
- Reconnect → `syncMissedMessages()` + `PendingStatusQueue.flush()`.
- `deinit` leaves room, stops typing, invalidates timers.

External deps: `MeeshySDK` (`Message`, `MessageTranslation`, `MessageTranscription`, `MessageTranslatedAudio`, `ActiveLiveLocation`, `MessagePersistenceActor`, records, events), `MessageSocketManager`, `NotificationManager`, `NotificationCoordinator`, `UserPreferencesManager`, `AuthManager`, `PendingStatusQueue`.

Android-port note: Map to a Kotlin class collecting Socket.IO event `Flow`s within a `CoroutineScope`. The delegate protocol → an interface or shared `MutableStateFlow`s held by the VM. Persistence-write-then-observe (CQRS-ish) pattern ports cleanly with Room + `Flow`. Burst coalescing (`.collect(.byTime)`) → Kotlin `Flow` `.chunked`/buffered with a timeout (e.g. `sample`/custom windowing). The optimistic in-place server-id upgrade keeping a stable list key is critical for avoiding RecyclerView item flicker — preserve `tempId` as the `DiffUtil` key. Dedup sliding window and typing debounce/re-emit/safety-timeout port verbatim.

---

## Architecture observations

### Portable user-facing features / capabilities
- [ ] 1:1 audio + video calls (WebRTC P2P, ICE/STUN, H.264 hardware codec)
- [ ] In-call voice effects (voice-coder / baby-voice / demon-voice) with pitch/EQ/distortion/reverb
- [ ] In-call background ambient sound looping (n-times / n-minutes)
- [ ] Adaptive call quality (bitrate ladder, video auto-disable on critical link)
- [ ] In-call live transcription + translation data channel (dual-stream clean audio)
- [ ] Call media pipeline hook bus (extensible: transcription, translation, recording, AR, E2EE)
- [ ] Home-screen widgets: recent conversations, favorite contacts, unread badge
- [ ] Widget mark-as-read action (queued, flushed on app foreground)
- [ ] Conversation list: cache-first instant load, infinite cursor pagination, pull-to-refresh
- [ ] Conversation filtering (all/unread/personal/private/open/global/channels/favorites/archived) + search
- [ ] Conversation grouping into user categories + pinned section
- [ ] Draft-aware conversation ordering (drafts float to top)
- [ ] Conversation options: pin / mute / mention-only / archive / custom name / reaction / category / tags
- [ ] Connection-health banner (offline / disconnected / syncing / connected)
- [ ] Bookmarks (saved posts) screen
- [ ] Threaded feed comments with lazy reply expansion
- [ ] Real-time chat: typing indicators, edits, deletes, reactions, read receipts, view-once, live location
- [ ] Multilingual message translations + audio (TTS) translations + voice transcriptions per message
- [ ] Optimistic message send with in-place server-ACK upgrade (no UI flicker)

### State management
- Two generations coexist: legacy `ObservableObject` + `@Published` (ViewModels) and newer `@Observable` macro (Stores). Android: standardize on `ViewModel` + `StateFlow`/`UiState` — no equivalent split needed.
- CQRS-ish pattern: socket handler & VMs WRITE through `MessagePersistenceActor`/GRDB; the `MessageStore`/`FeedStore` OBSERVE the DB and surface changes. This single-source-of-truth design is excellent and maps perfectly to Room `Flow` + a repository on Android.
- Cross-VM eventing via `ConversationPreferencesBroadcaster`, `NotificationCenter` names, `PassthroughSubject` — Android: a shared `SharedFlow` event bus or repository-backed `Flow`.

### Caching / SWR
- `CacheCoordinator` 3-tier with `CacheResult` (`.fresh`/`.stale`/`.expired`/`.empty`); every loading VM is cache-first (paint stale, silent revalidate). Cursor + hasMore persisted alongside the list blob. Android: a repository returning a `sealed class CacheResult`, Room as L2, an LRU memory L1.
- Coalesced debounced persistence (`schedulePersist`, 200ms) collapses mutation bursts into one DB write — port the pattern.

### Concurrency
- Swift-6 strict-concurrency scars are pervasive and iOS-only: `@preconcurrency import GRDB`, file-scope query closures, `WeakBox`/`ObservationTokens` `@unchecked Sendable`, `nonisolated` WebRTC delegate methods, `yieldToRunLoop()`. **None of this carries to Android** — Room + coroutines + Java threading model eliminate the entire class of problems. Do not replicate the workarounds; just use idiomatic Kotlin.
- Real-time audio: lock-free pointer-swap of the effect chain + os_unfair_lock fast-flag reads + pre-allocated buffer pool. Port the lock-free `AtomicReference` swap and zero-malloc render path to Oboe/AAudio on Android.
- Quality monitor migrated from `Timer` to cancellable `Task` (App-Nap-friendly) — Android: a cancellable coroutine on `viewModelScope`.

### Navigation / DI
- Constructor DI with `.shared` singleton defaults throughout — clean, testable. Android: Hilt with the same protocol-first shape (`ServiceProviding` → Kotlin interfaces).

### Performance techniques (preserve)
- Process-wide cached `RTCPeerConnectionFactory` + one-time SSL init (PERF-001).
- ICE candidate pool pre-warming (PERF-003), hardware H.264 pinning (PERF-002).
- O(1) id-index dictionaries (`_convIdIndex`, `_idIndex`) — Android: `HashMap` or `DiffUtil`.
- Burst coalescing of translation events (`.collect(.byTime 80ms)`) — ~80% fewer re-renders.
- Single-pass unified filter/group pipeline (replaced a 3-broadcast chain).
- Hot lists explicitly use UICollectionView (`messagesDidChange` subject) — Android: `RecyclerView` + `ListAdapter`/`DiffUtil` for long message histories, not naive `LazyColumn`.
- `MessageStore` growing window (uncapped after first scroll-up) — watch memory; Android should prefer Paging 3.

### Anti-patterns / tech debt — do NOT carry over
- `MeeshyAudioProcessingModule`'s `RTCAudioCustomProcessingDelegate` is `#if false`-disabled — the dual-stream effect/transcription split is designed but NOT active on iOS (public WebRTC build lacks ADM access). Android libwebrtc DOES expose the ADM — re-implement properly rather than porting dead code.
- `invokeSetCodecPreferences` ObjC-runtime IMP hack is an iOS Swift-overload-resolution bug workaround — Android's `RtpTransceiver.setCodecPreferences` is clean; drop the hack.
- `print(...)` debug/diag statements (`[DIAG]`, `[SocketRecv]`) left in production paths (`MessageStore`, `ConversationSocketHandler`) — use structured logging only.
- `deprecated` `addAudioRedundancy` SDP munging kept "for diagnostic comparison" — don't port; RED via codec preferences is the correct path.
- Legacy `notification:new` discovery fallback + `WidgetDataManager` "legacy shim" methods are deprecation-window cruft — port only the typed/primary paths.
- The large `ConversationListViewModel` (~1600 lines, ~20 collaborators) is a god-object risk — split it on Android into pagination/real-time-merge/grouping/prefetch units.
