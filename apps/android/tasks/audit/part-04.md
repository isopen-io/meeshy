# iOS Audit — Part 04 (Main/Services, chunk-04)

Scope: 37 service-layer files under `apps/ios/Meeshy/Features/Main/Services/`.
Domain clusters: WebRTC calling stack, E2EE encryption, offline outbox/mutation
sync, presence, media compression, video filters, crash diagnostics, local
persistence stores (drafts/starred/hidden/edit-history), Live Activities, VoIP
push, Focus filters, Stories export.

---

## apps/ios/Meeshy/Features/Main/Services/CallManager.swift

Purpose: Central singleton finite-state machine for 1:1 audio/video calls.
Orchestrates CallKit, WebRTC signaling over Socket.IO, audio session lifecycle,
reconnection, transcription, thermal/network monitoring.

Public API:
- `enum CallState`: `.idle`, `.ringing(isOutgoing:)`, `.offering`, `.connecting`,
  `.connected`, `.reconnecting(attempt:)`, `.ended(reason:)`; computed `isActive`,
  `isRinging`.
- `@MainActor final class CallManager: ObservableObject`, `.shared` singleton.
- `@Published`: `callState`, `transcriptionService`, `remoteUserId/Username`,
  `isVideoEnabled`, `isMuted`, `isSpeaker`, `callDuration`, `currentCallId`,
  `connectionQuality` (`PeerConnectionState`), `displayMode` (`CallDisplayMode`),
  `activeAudioEffect`, `hasLocalVideoTrack`, `hasRemoteVideoTrack`,
  `pendingIncomingCall`, `showCallWaitingBanner`.
- Methods: `startCall(conversationId:userId:displayName:isVideo:)`,
  `reportIncomingVoIPCall(...)`, `reportPhantomVoIPCall(...)`,
  `handleIncomingCallNotification(...)`, `handleSignalOffer/IncomingOffer`,
  `answerCall()`, `answerCallReady() async`, `rejectCall()`, `endCall()`,
  `toggleMute/Speaker/Video()`, `switchCamera()`, `toggleTranscription()`,
  `setAudioEffect/updateAudioEffectParams/clearAudioEffect`,
  `rejectPendingCall()`, `endCurrentAndAnswerPending()`,
  `handleRemoteAnswer/ICECandidate/Reject/End`, `formattedDuration`.

Key behaviors / business logic:
- FSM transitions: `ringing → offering → connecting → connected`, plus
  `reconnecting`. `.connected` is reached on ICE-connected (single source of
  truth), with a non-blocking RTP gate poll for quality info only.
- CallKit is the audio-session owner: `provider:didActivate/didDeactivate`
  flips `RTCAudioSession.isAudioEnabled`; app never calls `setActive(true)`.
- Audio fallback in `transitionToConnected`: if CallKit `didActivate` never
  fired (simulator/edge case), manually activates `RTCAudioSession`.
- VoIP push freshness check: REST `GET /calls/:id` to drop stale phantom calls.
- Outgoing ring timeout (`QualityThresholds.outgoingRingTimeoutSeconds`, 45s),
  SDP-offer 30s timeout, heartbeat task, reconnection via ICE restart (max
  attempts), audio-interruption observer, screen-capture detection,
  background/foreground signaling, thermal degradation of filters.
- Optimistic mute with rollback if CallKit refuses the transaction.
- Settle token: after `.ended`, holds state 1.5s for UI then resets to `.idle`;
  token bumped if a new call arrives within the window.
- Heavy use of cancellable `Task` slots replacing `Timer` (PERF-011).
- Maps gateway `call:ended` reason strings → `CXCallEndedReason` + `CallEndReason`.

External deps: WebRTC, CallKit, Network (`NWPathMonitor`), AVFoundation,
`MessageSocketManager` (Socket.IO signaling), `WebRTCService`,
`CallTranscriptionService`, `RingbackTonePlayer`, `ThermalStateMonitor`,
`CallEventQueue` (scaffold), `AuthManager`, `MeeshyConfig`, `HapticFeedback`.

Android-port note: Map to a `CallManager` Kotlin singleton (Hilt) +
`StateFlow<CallState>`. Use Android `ConnectionService`/`Telecom` API as the
CallKit analogue (self-managed `ConnectionService`), `google-webrtc`/`stream-webrtc`
for the PeerConnection layer, `ConnectivityManager.NetworkCallback` for network
monitoring, `PowerManager`/thermal API for `ThermalStateMonitor`.
FCM high-priority data message replaces PushKit VoIP push (Android has no
PushKit; use a foreground service + full-screen intent for incoming-call UI).
The FSM, timeout logic, reconnection, and reason-mapping are platform-agnostic
and should be ported verbatim. This is the single most complex file in the
chunk — budget significant effort.

## apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift

Purpose: Live in-call speech-to-text for both local and remote audio streams
using on-device `SFSpeechRecognizer`, with leader/follower role negotiation so
only the more-capable peer transcribes and shares segments.

Public API:
- `struct TranscriptionSegment` (id, text, speakerId, start/endTime, isFinal,
  confidence, language, translatedText?, translatedLanguage?).
- `enum TranscriptionPermission`, `enum TranscriptionError`,
  `enum TranscriptionRole` (`.undecided/.leader/.follower`),
  `enum TranscriptionCapabilityLevel` (`none/basic/standard/advanced`, Comparable).
- `protocol CallTranscriptionServiceProviding`.
- `@MainActor final class CallTranscriptionService: ObservableObject`:
  `segments`, `displayedSegments` (last 5), `isTranscribing`, `permission`,
  `lastError`, `role`, `localCapability`, `isShowingOverlay`.
- `startTranscribing/stopTranscribing`, `requestPermission() async`,
  `appendLocal/RemoteAudioBuffer`, `detectLocalCapability`,
  `supportedOnDeviceLanguages`, `resolveRole`, `receiveRemoteSegment`.

Key behaviors:
- Two `StreamRecognizer` instances (local + remote), each with its own
  `SFSpeechAudioBufferRecognitionRequest`; prefers on-device recognition.
- PERF-005: partial-result processing gated on `isShowingOverlay` to skip UI
  churn when the panel is hidden; finals always processed.
- Recognition request rotation on each `isFinal` to avoid SF buffer limits.
- Role negotiation: leader transcribes both streams; capability tie broken by
  initiator flag. Segment retention cap 50, displayed cap 5.
- Nonisolated callback extracts Sendable scalars off-MainActor.

External deps: Speech framework, Combine. Coupled to `CallManager` (owns it).

Android-port note: Android lacks an exact `SFSpeechRecognizer` streaming-buffer
equivalent. Options: ML Kit on-device speech, Android `SpeechRecognizer`
(intent-based, not buffer-streamed — weak), or Whisper/WhisperKit-equivalent
(`whisper.cpp` JNI) for true streaming. Capability detection + leader/follower
role negotiation + segment retention are pure logic — port directly. This is a
nice-to-have feature; consider deferring to a later milestone.

## apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift

Purpose: App-lock for individual conversations — a 6-digit master PIN plus
per-conversation 4-digit PINs, hashed (SHA-256) and stored in Keychain.

Public API: `@MainActor class ConversationLockManager: ObservableObject`,
`.shared`. `@Published lockedConversationIds: Set<String>`,
`masterPinConfigured: Bool`. Methods: `hasMasterPin`, `setMasterPin`,
`verifyMasterPin`, `removeMasterPin`/`forceRemoveMasterPin`, `isLocked`,
`setLock`, `verifyLock`, `removeLock`, `removeAllLocks`.

Key behaviors: PIN stored as SHA-256 hex in Keychain (`kSecClassGenericPassword`,
`WhenUnlockedThisDeviceOnly`); locked IDs list mirrored to UserDefaults for
fast load. Master PIN cannot be removed while conversations are still locked.

Android-port note: Use Android Keystore + `EncryptedSharedPreferences` for the
hashed PINs; `BiometricPrompt` can augment. SHA-256 via `MessageDigest`. Simple
direct port. Consider hashing with a salt + a slow KDF (PBKDF2/Argon2) for the
Android version — plain SHA-256 of a 4/6-digit PIN is brute-forceable; do NOT
carry that weakness over.

## apps/ios/Meeshy/Features/Main/Services/ConversationPreferencesBroadcaster.swift

Purpose: Lightweight cross-ViewModel notifier so a preferences update from the
options sheet propagates immediately to the conversation list row.

Public API: `@MainActor final class ConversationPreferencesBroadcaster`,
`.shared`. `struct Event { conversationId, prefs: APIConversationPreferences }`.
`let updates = PassthroughSubject<Event, Never>`; `broadcast(...)`.

Android-port note: Replace Combine subject with a shared `MutableSharedFlow<Event>`
(or an event bus). Trivial port.

## apps/ios/Meeshy/Features/Main/Services/CrashDiagnosticsManager.swift

Purpose: Captures crash/hang/CPU/disk-write diagnostics via MetricKit +
`NSSetUncaughtExceptionHandler`, persists JSON to `Documents/crash_diagnostics/`,
surfaces a one-shot toast on next launch, and forwards to a pluggable remote
reporter.

Public API:
- `protocol CrashReporting: Sendable` (`record`, `setUserID`, `log`).
- `struct NoOpCrashReporter`, `struct CrashDiagnostic` (Codable; `Kind` enum:
  nsException/crash/hang/cpuException/diskWriteException).
- `@MainActor final class CrashDiagnosticsManager: NSObject`, `.shared`.
  `install(crashReporter:)`, `consumePending() -> [CrashDiagnostic]`,
  `setUserID`, `log`, static `writeSync`/`capture`.
- Conforms `MXMetricManagerSubscriber`.

Key behaviors: chains to previous NSException handler (Crashlytics-friendly);
caps stored reports at 50 with GC; rescans disk in `consumePending` to catch
mid-session diagnostics; thread-safe reporter slot via `OSAllocatedUnfairLock`.

Android-port note: Android has no MetricKit. Use `Thread.setDefaultUncaughtExceptionHandler`
for crashes, ANR detection via a watchdog thread (or `ApplicationExitInfo` on
API 30+ for OS-recorded ANR/crash reasons — the closest MetricKit analogue).
Persist JSON to internal storage. Remote reporter → Firebase Crashlytics
(same as iOS). `ApplicationExitInfo` is the recommended primary source.

## apps/ios/Meeshy/Features/Main/Services/CrashlyticsReporter.swift

Purpose: `CrashReporting` implementation forwarding MetricKit diagnostics to
Firebase Crashlytics as non-fatal errors with stable per-kind error codes.

Public API: `struct CrashlyticsReporter: CrashReporting`. Extension
`CrashDiagnostic.Kind.errorCode` (stable codes 1001–1005, append-only).

Android-port note: Firebase Crashlytics SDK exists on Android — use
`FirebaseCrashlytics.recordException()` with a custom exception carrying the
diagnostic metadata, `setCustomKey`, `setUserId`, `log`. Direct port.

## apps/ios/Meeshy/Features/Main/Services/DarkFrameDetector.swift

Purpose: Detects when the camera is covered during a video call by sampling
luminance of capture frames.

Public API: `nonisolated final class DarkFrameDetector`. Callbacks
`onDarkFrameDetected`, `onLightFrameRestored`. `lastAverageBrightness: Float?`.
`analyzeFrame(_ pixelBuffer:)`, `reset()`.

Key behaviors: samples Y-plane (or BGRA luminance) on an 8-px stride; fires
dark callback after 30 consecutive frames below threshold 15.0.

External deps: CoreVideo, Accelerate. Called from `VideoFilterCapturerDelegate`
on the WebRTC video thread.

Android-port note: Port the luminance-sampling algorithm against
`ImageProxy`/`YUV_420_888` frames from CameraX or WebRTC's `VideoFrame`. Pure
arithmetic — straightforward Kotlin port.

## apps/ios/Meeshy/Features/Main/Services/DraftStore.swift

Purpose: Per-conversation compose-bar draft persistence (text, reply context,
selected language, effect flags, blur, ephemeral duration) surviving app kills.

Public API:
- `struct MessageDraft: Codable, Equatable, Sendable` (text, replyToId,
  replyAuthorName, replyPreviewText, replyIsMe, selectedLanguage, effectFlags,
  isBlurEnabled, ephemeralDurationRawValue, updatedAt; `isEffectivelyEmpty`).
- `struct DraftSummary` (previewText, updatedAt).
- `final class DraftStore`, `.shared`. `changed: PassthroughSubject<Void, Never>`.
  `save/load/remove`, `hasDraft`, `allNonEmptyDrafts()`, `clearReplyReference`,
  text-only convenience, `clearAll`, `purgeExpired(olderThan:)` (default 30 days).

Key behaviors: JSON in UserDefaults keyed `meeshy_draft_<cid>`; legacy raw-string
fallback migration; empty drafts removed instead of persisted.

Android-port note: Use a Room table or DataStore (Proto/Preferences) keyed by
conversationId; emit changes via Flow. Map `MessageDraft` to a data class.
Direct port.

## apps/ios/Meeshy/Features/Main/Services/E2EAPI.swift

Purpose: REST client for the Signal-protocol E2EE key server.

Public API: `final class E2EAPI`, `.shared`. `struct BackendPreKeyBundle:
Codable` (identityKey, registrationId, deviceId, preKeyId?, preKeyPublic?,
signedPreKeyId, signedPreKeyPublic, signedPreKeySignature, kyber* fields).
`uploadBundle`, `fetchBundle(for:)`, `establishSession(with:in:)`.

Endpoints: `POST /signal/keys`, `GET /signal/keys/:userId`,
`POST /signal/session/establish`. Loosely decodes object responses via
`[String: AnyCodable]`.

Android-port note: Standard Retrofit/Ktor service. Map `BackendPreKeyBundle` to
a data class. Direct port.

## apps/ios/Meeshy/Features/Main/Services/E2EEService.swift

Purpose: Cryptographic primitives for E2EE — Curve25519 identity/signed-prekey/
signing keys, AES-GCM seal/open, X25519 ECDH + HKDF key derivation. Keys stored
in Keychain.

Public API: `final class E2EEService`, `.shared`. `enum E2EError`.
`generateIdentityKey`, `getOrGenerateIdentityKey`, `generateSignedPreKey`,
`getOrGenerateSignedPreKey`, `getOrGenerateSigningKey`, `signData(data:)`,
`generatePublicBundle() -> BackendPreKeyBundle`, `clearAllKeys`,
`encrypt/decrypt` (AES-GCM combined), `deriveSymmetricKey(privateKey:publicKeyData:)`.

Key behaviors: stable registration/preKey/signedPreKey IDs persisted in Keychain;
HKDF-SHA256 with sharedInfo `"MeeshyE2EE"`, 32-byte output. Old keychain-prefix
migration. NOTE: this is an MVP "simplified Double Ratchet" — a single ECDH, not
a real ratchet (no Kyber, no forward secrecy per message).

Android-port note: Use `java.security`/Tink or BouncyCastle for X25519/Ed25519/
AES-GCM/HKDF. Keys in Android Keystore. Tink provides AES-GCM + HKDF cleanly.
Port the bundle-generation + derivation logic. Tech-debt flag: the simplified
non-ratcheting crypto should ideally be upgraded (use libsignal's official
Kotlin/Java bindings) rather than reproduced.

## apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift

Purpose: Manages per-peer E2EE sessions — establishes, caches, persists symmetric
keys; negative cache for failed establishment.

Public API: `public actor SessionManager`, `.shared`. `enum SessionError`.
`getOrCreateSession(with:conversationId:)`, `deriveSessionFromIncoming(senderId:
senderIdentityPublic:)`, `encryptMessage`, `decryptMessage(_:from:senderIdentity:)`,
`removeSession`, `migrateKeychainIfNeeded`, `clearSessions`. Static
`isWithinFailureCooldown` (pure, testable). `struct LiveSessionProvider:
DecryptionSessionProviding` adapter.

Key behaviors: session keys persisted per-user-namespaced in Keychain; in-memory
`activeSessions` cache; negative cache with 600s cooldown so failed peers fall
back to plaintext without re-hitting the network; peer-list tracked in
UserDefaults; one-time keychain namespace migration.

External deps: actor; hops to `@MainActor AuthManager` for current user id.

Android-port note: Replace actor with a class guarded by a `Mutex`/single-thread
dispatcher, or use coroutine confinement. Per-user keychain namespace → Keystore
aliases / EncryptedSharedPreferences keyed by userId. Negative-cache logic is
pure — port directly. Bridge to a `DecryptionSessionProviding` interface.

## apps/ios/Meeshy/Features/Main/Services/EditHistoryStore.swift

Purpose: Client-side snapshot of prior message contents (the backend doesn't
expose edit history) so `MessageDetailSheet` can show "View edits".

Public API: `struct EditRevision: Codable, Identifiable, Equatable, Sendable`
(id, content, editedAt). `final class EditHistoryStore`, `.shared`.
`recordRevision`, `revisions(for:)`, `hasHistory`, `removeHistory`, `clearAll`.

Key behaviors: thread-safe via `NSLock`; max 30 revisions/message; JSON blob in
UserDefaults; keyed by canonical server id; snapshot taken just before optimistic
edit replacement.

Android-port note: Room table `edit_revisions` (messageId, content, editedAt) or
DataStore. Simple port.

## apps/ios/Meeshy/Features/Main/Services/HapticSurfacing.swift

Purpose: Protocol seam over haptics for testability.

Public API: `@MainActor protocol HapticSurfacing` (`success()`, `error()`).
`@MainActor final class HapticBridge: HapticSurfacing`, `.shared`.

Android-port note: Interface over `Vibrator`/`VibratorManager` /
`HapticFeedbackConstants`. Trivial port.

## apps/ios/Meeshy/Features/Main/Services/LanguageProviding.swift

Purpose: Injectable seam for the user's resolved content languages, decoupling
consumers from `AuthManager.shared` (Prisme Linguistique).

Public API: `@MainActor protocol LanguageProviding { var preferredLanguages:
[String] }`. `struct AuthManagerLanguageProvider` reads
`AuthManager.shared.currentUser?.preferredContentLanguages`.

Android-port note: Kotlin interface; default impl reads from the auth/session
store. Critical for Prisme Linguistique — keep as a DI seam. Trivial port.

## apps/ios/Meeshy/Features/Main/Services/LinkPreviewStore.swift

Purpose: In-memory + disk cache of URL link-preview metadata with TTL and a
negative cache for failed fetches.

Public API: `@MainActor final class LinkPreviewStore: ObservableObject`,
`.shared`. `@Published cache: [String: LinkMetadata]`. `metadata(for:)`,
`requestMetadata(for:)`, `clearAll`.

Key behaviors: 7-day positive TTL (evicted at load); 30-min negative cache;
`pendingKeys` dedup; JSON persisted to `Documents/meeshy_cache/`; delegates
fetching to SDK `LinkPreviewFetcher`.

Android-port note: Room/DataStore-backed cache, `StateFlow<Map<String,
LinkMetadata>>`. Fetcher via OkHttp + OpenGraph parsing. Direct port of the
TTL + negative-cache strategy.

## apps/ios/Meeshy/Features/Main/Services/LiveActivityBridge.swift

Purpose: STUB bridge for iOS Live Activities (Dynamic Island call UI) — blocked
on cross-target type sharing; currently only logs.

Public API: `@MainActor final class LiveActivityBridge`, `.shared`.
`startCall`, `updateCallDuration`, `endCall` (all no-op stubs).

Android-port note: No 1:1 equivalent. The Android analogue is an ongoing
call **notification** (foreground service `Notification.CallStyle` on API 31+).
Implement that properly rather than porting the stub. Not a blocker.

## apps/ios/Meeshy/Features/Main/Services/LocallyHiddenMessagesStore.swift

Purpose: Persistent set of message IDs hidden via "Delete for me" (local-only
deletion, not server-side).

Public API: `final class LocallyHiddenMessagesStore`, `.shared`. `isHidden`,
`hide`, `unhide`, `visibleIds(from:)`, `allHiddenIds`, `clearAll`.

Key behaviors: `NSLock`-guarded `Set<String>` mirrored to UserDefaults.

Android-port note: Room table or DataStore set. Simple port.

## apps/ios/Meeshy/Features/Main/Services/Logger+Categories.swift

Purpose: `os.Logger` category definitions (messages, socket, e2ee, crash,
network, stories).

Android-port note: Define a logging facade (Timber tags or a sealed
`LogCategory`). Trivial.

## apps/ios/Meeshy/Features/Main/Services/MediaCompressor.swift

Purpose: Image and video compression actor for outbound media, context-aware
(message/story/feedPost/avatar/fullscreen).

Public API:
- `struct CompressedImageResult` (data, mimeType, fileExtension).
- `enum MediaContext` with per-context `maxImageDimension`, `videoBitRate`,
  `maxVideoResolution`, `audioBitRate`.
- `actor MediaCompressor`, `.shared`. `compressImage(_ image:...)`,
  `compressImageData(_ data:...)`, `compressVideo(_:context:)`,
  `compressVideoLegacy(_:preset:)`.
- `enum CompressionError`.

Key behaviors: single-pass ImageIO downsample (avoids double JPEG encode);
preserves GIF/WebP/PNG/HEIC formats; video uses `AVAssetWriter` with HEVC when
hardware-supported (else H.264), adaptive bitrate, 30fps cap, even-dimension
sizing, mono AAC audio; MIME sniffing from magic bytes.

External deps: AVFoundation, ImageIO, VideoToolbox, UIKit.

Android-port note: Image — use `BitmapFactory` with `inSampleSize` for
hardware-friendly downsampling, or the AndroidX `ImageDecoder`. Video — use
`MediaCodec` + `MediaMuxer` (HEVC/`video/hevc` when `MediaCodecList` reports
support, else AVC), or a library like `Transformer` (Media3) which is the
modern equivalent of `AVAssetWriter`. Port the per-context bitrate/resolution
table verbatim. Media3 `Transformer` is strongly recommended.

## apps/ios/Meeshy/Features/Main/Services/MeeshyFocusFilter.swift

Purpose: iOS Focus-mode integration — lets users pick which Meeshy notification
categories surface while a Focus is active; persisted in an App Group.

Public API:
- `struct MeeshyFocusFilter: SetFocusFilterIntent` (AppIntents) with
  `@Parameter` toggles (direct messages, group, mentions, reactions, social,
  calls).
- `struct MeeshyFocusSnapshot: Codable, Sendable` (+`.permissive`,
  `toSDKSnapshot()`).
- `@MainActor public final class MeeshyFocusStore`, `.shared`, App-Group
  UserDefaults (`group.me.meeshy.apps`). `current`, `save`, `clear`.

Android-port note: Android has no Focus-filter API. Closest is integrating with
Do Not Disturb / notification channels and letting users configure per-category
channel importance. The `MeeshyFocusSnapshot` gating model can still drive an
in-app "notification preferences" screen consulted before posting notifications.
Drop the AppIntents intent; keep the snapshot/gating concept.

## apps/ios/Meeshy/Features/Main/Services/NSEPendingMessageConsumer.swift

Purpose: Drains messages that the Notification Service Extension prefetched into
an App Group directory, merging them into the message cache on app launch.

Public API: `@MainActor final class NSEPendingMessageConsumer`, `.shared`.
`consumeAll() async`.

Key behaviors: reads `<appGroup>/nse_pending_messages/*.json` (file named
`<cid>_<msgId>`), decodes `APIMessage` with fractional-seconds ISO8601, upserts
de-duped + sorted into `CacheCoordinator.shared.messages`, deletes files.

Android-port note: Android FCM data messages are handled directly in
`FirebaseMessagingService` — there's no separate extension process. So prefetched
messages can be written straight to the shared Room DB by the FCM service; this
"consumer" pattern may be unnecessary, or simplified to a startup reconciliation
sweep. Keep the dedup+sort merge logic.

## apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift

Purpose: The network executor for the offline outbox/mutation queue — decodes
each persisted `OutboxRecord` by `kind` and dispatches to the matching REST
endpoint with `X-Client-Mutation-Id` for gateway-side dedup.

Public API: `struct OutboxDispatcher: OutboxDispatching`. `dispatch(_:) async
throws`. `@MainActor enum OutboxFlushTrigger { flushNow() async }`.

Supported kinds: sendMessage, editMessage, deleteMessage, sendReaction,
blockUser, unblockUser, sendFriendRequest, respondFriendRequest, updateProfile,
markAsRead, createConversation, updateConversation, updateSettings, createPost,
toggleLikePost, createComment, deleteComment, toggleLikeComment. (publishStory/
repostStory intentionally route through `StoryOfflineQueue` and throw here.)

Key behaviors:
- 4xx → permanent failure (rethrow → flusher escalates to `.exhausted`); 5xx/
  network → transient (flusher exponential backoff); 404 swallowed as success
  for naturally-idempotent ops (mark-read, like toggle, delete).
- Corrupt payloads treated as permanent (dropped).
- `sendMessage` handles `ofq_*` rows (incl. write-ahead audio replay: TUS upload
  then `message:send-with-attachments` over socket) and legacy `mrq_*` rows.
- Emits unified `OfflineQueue.shared.retrySucceeded` / `retryExhausted` signals;
  reconciles optimistic clientMessageId in the message cache.
- `OutboxFlushTrigger.flushNow()` for immediate drain after enqueue.

External deps: `APIClient`, `MessageService`/`ReactionService`,
`MessageSocketManager`, `TusUploadManager`, `CacheCoordinator`,
`DependencyContainer.dbPool`, `OfflineQueue`/`OutboxFlusher`.

Android-port note: Map directly onto WorkManager (one `CoroutineWorker` per
flush, or a single periodic+expedited worker) backed by a Room `outbox` table.
The `kind` switch → a `when` over a sealed mutation type. Keep the transient-vs-
permanent error classification, 404-as-success, mutation-id dedup header, and
unified success/exhausted event signals. This is core to offline-first — port
carefully and exhaustively.

## apps/ios/Meeshy/Features/Main/Services/ParticipantService.swift

Purpose: Cursor-paginated conversation-participant loading with SWR caching and
optimistic role/removal mutations.

Public API: `actor ParticipantService`, `.shared`. `hasMore(for:)`,
`totalCount(for:)`, `loadFirstPage(for:forceRefresh:)`, `loadNextPage(for:)`,
`updateRole`, `removeParticipant`, `invalidate`.

Key behaviors: per-conversation pagination state (cursor, hasMore, totalCount);
SWR — any cached page (fresh or stale) satisfies first-page request; pages
merged + appended into `CacheCoordinator.participants`; feeds
`UserDisplayNameCache`.

External deps: `APIClientProviding`, `CacheCoordinator`, `UserDisplayNameCache`.

Android-port note: Use Paging 3 with a `RemoteMediator` over Room as the cache,
or a hand-rolled cursor pager. Keep the SWR semantics. Replace actor with a
repository class. Direct port.

## apps/ios/Meeshy/Features/Main/Services/PendingStatusQueue.swift

Purpose: Offline queue for read/received conversation-status actions, flushed
when connectivity returns.

Public API: `actor PendingStatusQueue`, `.shared`. `struct PendingAction:
Codable` (conversationId, type, timestamp). `enqueue`, `flush() async`.

Key behaviors: max 100 actions; drops actions with empty conversationId and
those older than 24h; POSTs to `/conversations/:id/mark-as-read|received`;
re-queues failures.

Android-port note: Overlaps with the outbox `markAsRead` kind — consider
unifying into the single WorkManager-backed outbox rather than porting a
separate queue. If kept separate, Room table + worker. Note this is partly
redundant with `OutboxDispatcher` — tech-debt; do not duplicate on Android.

## apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift

Purpose: Tracks online/away/offline state of users; hydrates from disk on cold
start; consumes socket events + REST refresh.

Public API: `struct UserPresence: Codable` (isOnline, lastActiveAt; computed
`state: PresenceState` — away after 300s). `@MainActor final class
PresenceManager: ObservableObject`, `.shared`. `@Published presenceMap`.
`seed(from:currentUserId:)`, `presenceState(for:)`, `ingestSnapshot`,
`ingestRefresh`, `knownUserIds`.

Key behaviors: disk hydration (24h max age) before subscribing so cold start
shows last-known dots; subscribes to `user:status`, `presence:snapshot`,
`didReconnect`; 60s recalc timer fires `objectWillChange` only on an
online→away transition; debounced (1.5s) disk persistence.

External deps: `MessageSocketManager`, `PresenceService`.

Android-port note: `StateFlow<Map<String, UserPresence>>`; hydrate from Room/
DataStore; subscribe to socket flows; recalc via a coroutine ticker. Keep the
cold-start hydration + 24h-staleness + debounced-persist patterns. Direct port.

## apps/ios/Meeshy/Features/Main/Services/PresenceService.swift

Purpose: REST refresh path for the presence map (foreground/reconnect catch-up).

Public API: `struct PresenceRefreshEntry: Decodable` (userId, isOnline,
lastActiveAt). `@MainActor final class PresenceService`, `.shared`.
`refreshKnownUsers()`.

Key behaviors: coalesces overlapping refreshes via in-flight `Task`; `GET
/users/presence?ids=` capped at 200 ids; writes back via
`PresenceManager.ingestRefresh`.

Android-port note: Repository method + Retrofit/Ktor call; coalesce via a
shared `Deferred`/`Mutex`. Direct port.

## apps/ios/Meeshy/Features/Main/Services/RingbackTonePlayer.swift

Purpose: Plays the looping ringback tone the caller hears while a call rings
(CallKit does not provide it).

Public API: `@MainActor final class RingbackTonePlayer`. `start()`, `stop()`.

Key behaviors: loops bundled `RingbackTone.caf` at 0.6 volume on the active
audio session; logs whether `play()` succeeded (silently fails if session not
yet active).

Android-port note: Use `MediaPlayer`/`SoundPool`/`ToneGenerator`
(`TONE_SUP_RINGTONE`) on the voice-call audio stream. Simple port. Note Android
`ConnectionService` can also surface ringback; evaluate both.

## apps/ios/Meeshy/Features/Main/Services/Sleeping.swift

Purpose: Test seam over `Task.sleep`.

Public API: `protocol Sleeping { sleep(milliseconds:) async }`. `final class
SystemSleeper: Sleeping`, `.shared`.

Android-port note: Interface over `delay()`; inject a `TestDispatcher` in tests
instead. Trivial — may be unnecessary on Android given `kotlinx-coroutines-test`.

## apps/ios/Meeshy/Features/Main/Services/StarredMessagesStore.swift

Purpose: Local-only bookmarked-messages store (WhatsApp "Starred Messages").

Public API: `struct StarredMessageSnapshot: Codable, Identifiable` (id,
conversationId/Name/AccentColor, sender, contentPreview, attachmentKind,
starredAt, sentAt). `@MainActor final class StarredMessagesStore:
ObservableObject`, `.shared`. `@Published snapshots`. `isStarred`, `toggle`,
`remove`, `snapshot(for:)`, `removeAll(conversationId:)`, `clearAll`.

Key behaviors: JSON in UserDefaults; snapshots kept sorted by `starredAt` desc;
self-contained snapshot renders without the source conversation cached.

Android-port note: Room table; `StateFlow<List<StarredMessageSnapshot>>`. Direct
port.

## apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift

Purpose: Global overlay controller for the status-bubble popover (status entry
preview anchored at a point).

Public API: `@MainActor final class StatusBubbleController: ObservableObject`,
`.shared`. `@Published currentEntry: StatusEntry?`, `anchor: CGPoint`,
`onRepublish` callback. `show(entry:anchor:)`, `dismiss()`, `isPresented`
binding. `View.withStatusBubble()` modifier.

Android-port note: Compose — host an overlay via a top-level `Box` + a
`StateFlow<StatusEntry?>` in a shared ViewModel; position with the captured
anchor offset. Republish gated to non-self entries. Direct conceptual port.

## apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift

Purpose: App-side orchestrator for the `StoryPublishQueue` (SDK actor) — registers
the publish handler, surfaces success/failure toasts, exposes a pending count.

Public API: `@MainActor protocol StoryPublishExecutor` (`executeQueuedPublish(item:)
async throws -> String`). `@MainActor final class StoryPublishService:
ObservableObject`, `.shared`. `@Published pendingCount`. `weak var executor`.
`configure()`, `setExecutor(_:)`, `pendingItems() async`, `clearAll() async`.

Key behaviors: separates listener setup (`configure`) from handler registration
(`setExecutor`) to avoid a boot-race auto-drain with a nil executor; subscribes
to queue success/failure publishers → `ToastManager`; refreshes `pendingCount`
on foreground.

External deps: `StoryPublishQueue` (SDK), `ToastManager`.

Android-port note: WorkManager-backed story publish queue; `StoryPublishService`
becomes a repository/coordinator exposing `StateFlow<Int>` pendingCount and
wiring success/failure to a snackbar/toast manager. Keep the executor-injection
pattern (the actual upload pipeline lives in the Story ViewModel).

## apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift

Purpose: Author-only Story → MP4 export orchestrator (for external sharing only;
never touches the backend — stories publish RAW for per-viewer retranslation).

Public API: `enum StoryExportPhase` (`.exporting`). `enum
StoryVideoExportServiceError`. `@MainActor protocol
StoryVideoExportServiceProviding` (`prepareExport(slide:languages:onProgress:
onPhaseChange:) async -> URL?`, `cleanupExport(at:)`). `@MainActor final class
StoryVideoExportService`, `.shared`. `protocol StoryExporting` (test seam) +
`struct SystemStoryExporter`.

Key behaviors: returns `nil` (no export) for static slides; swallows export
errors → `nil` (fallback to legacy path); per-invocation unique temp MP4 URL;
progress trampoline hops `@Sendable` callback back to `@MainActor`; export
language baked into overlays (Prisme Linguistique).

External deps: `StoryExporter`/`StorySlide` (SDK), AVFoundation.

Android-port note: Use Media3 `Transformer` + a Compose/Canvas-based renderer
(or `MediaCodec`) to bake the story MP4. Share via `Intent.ACTION_SEND` +
`FileProvider`. Keep the routing (skip static slides), fallback-to-nil, temp-file
lifecycle, and language-baking. Honor the absolute rule: export must NOT touch
the publish path / backend.

## apps/ios/Meeshy/Features/Main/Services/ToastManager.swift

Purpose: Global transient toast/banner presenter.

Public API: `@MainActor final class ToastManager: ObservableObject`, `.shared`.
`@Published currentToast: Toast?`, `onTapAction`. `show(_:type:)`,
`show(_:type:tapAction:)`, `showError`, `showSuccess`, `dismiss()`. Notification
name `meeshy.showToast`.

Key behaviors: auto-dismiss task (3s default, 6s for tappable); haptics on
show; observes a `NotificationCenter` channel so the SDK can post toasts.

Android-port note: Compose `SnackbarHostState` / a custom overlay host driven by
a shared `StateFlow<Toast?>`. SDK-toast channel → a shared event flow. Direct
port.

## apps/ios/Meeshy/Features/Main/Services/ToastSurfacing.swift

Purpose: Protocol seam over `ToastManager` for testability.

Public API: `@MainActor protocol ToastSurfacing` (`showSuccess`, `showError`);
`ToastManager` conforms.

Android-port note: Kotlin interface; inject into ViewModels. Trivial.

## apps/ios/Meeshy/Features/Main/Services/VideoFilterPipeline.swift

Purpose: Real-time Core Image video-filter pipeline for in-call camera frames —
colorimetry, low-light boost, background blur (person segmentation), skin
smoothing — with performance auto-degradation.

Public API:
- `struct VideoFilterConfig: Equatable, Sendable` (temperature, tint,
  brightness, contrast, saturation, exposure, isEnabled, backgroundBlur*,
  skinSmoothing*; `hasAdvancedFilters`).
- `enum VideoFilterPreset` (natural/warm/cool/vivid/muted → config).
- `protocol VideoFilterPipelineProviding`.
- `nonisolated final class VideoFilterPipeline`. `process(_:)`,
  `process(_:averageBrightness:)`, `reset()`.
- `nonisolated final class VideoFilterCapturerDelegate: RTCVideoCapturerDelegate`
  — wraps the WebRTC capturer, runs dark-frame detection + filtering.

Key behaviors: Metal-backed `CIContext`; auto-degrades advanced filters when a
frame exceeds a 25ms budget for 10 consecutive frames (restores under 15ms for
30); `VNSequenceRequestHandler` + face-detection stride 5 (PERF-013); dedicated
`CVPixelBufferPool` for output (PERF-014); processes on the WebRTC video thread.

External deps: CoreImage, Vision, Metal, WebRTC, `DarkFrameDetector`.

Android-port note: Use RenderEffect/`GPUImage`/a custom GLSL or Vulkan pipeline,
or ML Kit Selfie Segmentation for background blur and Face Detection for skin
smoothing. WebRTC's `VideoProcessor`/`VideoSink` is the `RTCVideoCapturerDelegate`
analogue. Port the auto-degradation budget logic and preset table verbatim. This
is GPU-heavy; budget significant effort and consider a phased rollout.

## apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift

Purpose: Registers PushKit VoIP token, handles incoming VoIP pushes, reports
calls to CallKit with dedup and phantom-call defense.

Public API: `@MainActor final class VoIPPushManager: NSObject, ObservableObject`,
`.shared`. `@Published voipToken`. `register()`, `unregister()`,
`forceReregister()`. Static helpers `parseIceServers`, `resolveCallerName`.
Conforms `PKPushRegistryDelegate`.

Key behaviors: phantom-call reporting for malformed payloads (PushKit demands a
call report per push or the OS revokes the token); 12-entry dedup ring for
duplicate deliveries; queues token if it arrives before login (retries on
`isAuthenticated` true); 300s registration cooldown; parses per-user ICE/TURN
servers + isVideo (string-or-bool) from the payload; resolves caller name from
payload then conversations cache.

External deps: PushKit, CallKit, `CallManager`, `AuthManager`, `APIClient`,
`CacheCoordinator`, `PushNotificationManager`.

Android-port note: No PushKit. Use FCM high-priority data messages received in
`FirebaseMessagingService`; the "report a call per push" requirement does not
apply, but a similar early-validate + dedup-ring + phantom-suppression is still
useful to avoid spurious incoming-call UI. Incoming-call UI = full-screen
intent + `ConnectionService` + a foreground service notification. Token
registration with cooldown/queue-before-login → port directly. Parse-ICE-servers
and resolve-caller-name helpers are pure — port directly.

## apps/ios/Meeshy/Features/Main/Services/WebRTC/AudioEffectTypes.swift

Purpose: Type definitions for in-call audio effects (voice changer, baby/demon
voice, background sound).

Public API:
- `enum AudioEffectType` (voiceCoder, babyVoice, demonVoice, backSound;
  `isVoiceEffect`).
- `enum MusicalScale`, `enum MusicalKey`, `enum BackSoundLoopMode`.
- `struct VoiceCoderParams / BabyVoiceParams / DemonVoiceParams /
  BackSoundParams` (each Equatable, Sendable, with `.default`).
- `enum AudioEffectConfig` (associated-value cases per effect; `effectType`,
  `isVoiceEffect`).
- `protocol BackSoundFileProviding` + `struct BundleBackSoundFileProvider`.
- `protocol CallAudioEffectsServiceProviding`.
- `enum AudioEffectsError`, `enum AudioEffectsConstants` (timing/buffer/
  ducking constants).

Android-port note: Plain data classes + sealed classes — pure model layer,
direct port. The actual DSP service (conforming to
`CallAudioEffectsServiceProviding`) is elsewhere; on Android implement via
`AudioEffect`/`Oboe`/a custom JNI DSP chain or `MediaCodec` filters. Port the
parameter ranges + constants verbatim.

---

## `apps/ios/Meeshy/Features/Main/Services/ThermalStateMonitor.swift`

Purpose: Observes device thermal state and recommends adaptive call-quality
ceilings (fps / resolution / video-disable) to protect against overheating
during 1:1 audio/video calls.

Public API surface:
- `protocol ThermalStateMonitorDelegate: AnyObject` — `thermalStateDidChange(to:)`.
- `final class ThermalStateMonitor` — `weak var delegate`, `private(set) var
  currentState: ProcessInfo.ThermalState`, `startMonitoring()`,
  `stopMonitoring()`.
- Computed advice: `recommendedMaxFps` (30/24/15/0 per nominal/fair/serious/
  critical), `recommendedMaxResolution` (720p/540p/360p/0), `shouldDisableVideo`
  (true on `.critical`).

Key behaviors: Subscribes to `ProcessInfo.thermalStateDidChangeNotification`,
de-dupes identical states, logs transitions via `os.Logger` (`calls` category),
and notifies its delegate. Pure mapping tables from thermal tier → quality cap.

External dependencies & couplings: `Foundation`/`ProcessInfo`, `os.Logger`;
consumed by `CallManager` to throttle the WebRTC encoder.

Android-port note: Map to `PowerManager.getCurrentThermalStatus()` +
`PowerManager.OnThermalStatusChangedListener` (`THERMAL_STATUS_NONE` …
`SHUTDOWN`). Keep the tier→fps/resolution tables verbatim as a Kotlin `enum`
mapping; expose advice as a `StateFlow<ThermalAdvice>` consumed by the call
encoder config. Small pure utility — trivial, high-value port.

- [ ] Thermal-aware call-quality degradation (fps/resolution caps, video disable)

---

## Architecture observations

### State management
- Pervasive `@MainActor` `ObservableObject` singletons (`.shared`) with
  `@Published` state — `CallManager`, `PresenceManager`, `ToastManager`,
  `StarredMessagesStore`, `StatusBubbleController`, `LinkPreviewStore`,
  `StoryPublishService`, `VoIPPushManager`. Android: map each to a Hilt
  `@Singleton` exposing `StateFlow`. Resist literal singleton translation where
  a scoped repository + ViewModel is cleaner.
- `actor` used for off-main data services (`MediaCompressor`, `SessionManager`,
  `ParticipantService`, `PendingStatusQueue`). Android: classes confined to a
  dispatcher / guarded by `Mutex`, or repository pattern with coroutine scope.
- Protocol seams everywhere for testability (`*Providing`, `HapticSurfacing`,
  `ToastSurfacing`, `LanguageProviding`, `Sleeping`, `StoryExporting`,
  `CrashReporting`). Carry this DI discipline to Android via Kotlin interfaces +
  Hilt.

### Caching / SWR & offline-first
- `CacheCoordinator` is the central multi-store SWR cache (messages,
  conversations, participants) with `.fresh/.stale/.expired/.empty` results;
  `ParticipantService` and `VoIPPushManager` consume it. Android: a Room-backed
  repository layer with explicit freshness state.
- Offline-first is first-class: `OutboxDispatcher` + `OfflineQueue`/`OutboxFlusher`
  drive ~18 mutation kinds through REST with `X-Client-Mutation-Id` dedup,
  transient-vs-permanent error classification, and 404-as-success. Android:
  WorkManager + a Room `outbox` table is the natural mapping — port the error
  taxonomy and idempotency carefully.
- Many local-only persisted stores (drafts, starred, hidden messages, edit
  history, link previews, presence) use UserDefaults JSON + `NSLock`/debounced
  writes. Android: consolidate onto Room/DataStore with Flow.

### Concurrency
- Strict Swift 6 concurrency: `nonisolated` classes for real-time threads
  (`VideoFilterPipeline`, `DarkFrameDetector`, WebRTC capturer delegate) that
  must NOT hop to MainActor; Sendable scalar extraction off the recognizer/video
  queues. Android equivalent: keep frame/audio callbacks off the main thread,
  pass immutable data classes.
- Tasks-over-Timers (`CallManager` PERF-011): cancellable cooperative tasks for
  duration/heartbeat/timeouts. Android: cancellable coroutine jobs.

### Real-time call stack (the heaviest area)
- WebRTC signaling rides Socket.IO; CallKit owns the audio session; extensive
  defensive code for CallKit lifecycle quirks (autonomous teardown, didActivate
  not firing, phantom pushes). Android: `ConnectionService`/Telecom +
  full-screen-intent incoming UI + foreground service; FCM data messages
  replace PushKit. Expect substantial re-engineering — the iOS code's bug
  workarounds are CallKit-specific and should NOT be ported literally; port the
  FSM, timeouts, reconnection, and reason-mapping logic.

### Performance techniques worth preserving
- ImageIO single-pass downsampling; HEVC-when-supported video encode;
  Metal-pinned `CIContext`; per-frame budget auto-degradation of video filters;
  face-detection frame striding; dedicated `CVPixelBufferPool`; partial-result
  gating on overlay visibility for transcription. Android equivalents:
  `MediaCodec`/Media3 `Transformer`, RenderEffect/GPU pipelines, ML Kit with
  frame throttling.

### Anti-patterns / tech debt — do NOT carry over
- E2EE is an MVP "simplified Double Ratchet" — a single ECDH, no real ratchet,
  no forward secrecy, Kyber fields unused. Android should adopt official
  libsignal bindings rather than reproduce this.
- `ConversationLockManager` hashes short PINs with bare SHA-256 (brute-forceable)
  — use a salted slow KDF on Android.
- `PendingStatusQueue` overlaps the outbox `markAsRead` kind — redundant; unify
  into a single offline queue on Android.
- `LiveActivityBridge` is a non-functional stub blocked on cross-target type
  sharing — implement a proper ongoing-call notification on Android instead.
- Several "loose `[String: AnyCodable]`" decodes paper over gateway response
  shapes that don't match typed models — Android should define accurate DTOs.
- `lastCallWasOutgoing` / settle-token / multiple ad-hoc `Task` slots in
  `CallManager` indicate accreted CallKit firefighting; the Android rewrite is a
  chance to model the call FSM cleanly (one explicit state actor).

### Portable user-facing features / capabilities
- [ ] 1:1 audio & video calls (CallKit-style system call UI, ringback tone)
- [ ] Incoming-call delivery via push when app is backgrounded/killed
- [ ] Call reconnection on network change (ICE restart)
- [ ] Live in-call transcription (on-device speech-to-text, leader/follower)
- [ ] In-call video filters (color presets, low-light boost, background blur,
      skin smoothing)
- [ ] In-call audio effects (voice changer, baby/demon voice, background sound)
- [ ] Camera-covered ("dark frame") detection during video calls
- [ ] Thermal-aware quality degradation during calls
- [ ] Call-waiting banner (second incoming call while busy)
- [ ] End-to-end encrypted direct messages (Signal-style key exchange)
- [ ] Per-conversation app lock with master PIN + per-conversation PINs
- [ ] Compose-bar draft persistence (text, reply, language, effects) across kills
- [ ] Starred / bookmarked messages list
- [ ] "Delete for me" local message hiding
- [ ] Message edit history ("View edits")
- [ ] Link-preview cards with caching
- [ ] Online / away / offline presence indicators
- [ ] Image & video compression before upload (context-aware quality)
- [ ] Offline outbox: messages, edits, deletes, reactions, profile, friend
      requests, conversation/post/comment mutations sent when back online
- [ ] Offline audio-message send (write-ahead, replayed on reconnect)
- [ ] Crash / hang / ANR diagnostics with on-device persistence + remote report
- [ ] Notification gating by category (Focus-filter / DND-style preferences)
- [ ] Author-only Story → MP4 export for external sharing (Prisme Linguistique
      language baked in)
- [ ] Story publish offline queue with pending-count badge
- [ ] Transient toast/banner notifications
- [ ] Status-bubble popover preview
