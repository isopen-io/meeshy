# Audit Part 17 — MeeshySDK Services, Sockets, Sync, Theme, Utils & Auth UI Components

Scope: 36 files covering the remaining SDK REST service layer, the two Socket.IO managers, the
conversation sync engine, story draft persistence, theme/color generation, hot-path utilities
(ThumbHash, ID generators), and the SwiftUI auth form components.

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift

**Purpose:** REST service for friend requests and email invitations.

**Public API:**
- `protocol FriendServiceProviding: Sendable` — `sendFriendRequest`, `receivedRequests`, `sentRequests`, `respond`, `deleteRequest`, `sendEmailInvitation`.
- `final class FriendService` — singleton `.shared`, init-injected `APIClientProviding`.

**Key behaviors:**
- `respond(requestId:accepted:)` PATCHes `/friend-requests/:id` with an `accepted` bool.
- Offset-paginated received/sent lists (default limit 20).
- `sendEmailInvitation` POSTs `/invitations/email`.

**Dependencies:** `APIClient`, request/response models from elsewhere (`SendFriendRequest`, `RespondFriendRequest`, `EmailInvitationRequest`, `FriendRequest`).

**Android port:** Kotlin `interface FriendService` + Retrofit/Ktor impl; suspend functions. Use Hilt for DI instead of `.shared`. Models as `@Serializable` data classes.

- [ ] Send friend request (with optional message)
- [ ] List received / sent friend requests (paginated)
- [ ] Accept / decline friend request
- [ ] Delete friend request
- [ ] Invite a friend by email

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/LinkPreviewFetcher.swift

**Purpose:** Fetches OpenGraph/Twitter-card link preview metadata for the first HTTP(S) URL in a message; in-memory dedup of concurrent fetches.

**Public API:**
- `struct LinkMetadata: Codable, Sendable, Identifiable, Equatable` — `id`(URL=key), `title`, `description`, `imageURL`, `siteName`, `fetchedAt`; computed `host`, `hasAnyVisibleField`.
- `actor LinkPreviewFetcher` — singleton `.shared`; `metadata(for:) async -> LinkMetadata?`; `nonisolated static firstURL(in:) -> String?`.

**Key behaviors / algorithms:**
- 4s request+resource timeout via `URLSessionConfiguration.ephemeral`; 512 KB body cap; custom User-Agent.
- In-flight `Task` dictionary keyed by canonical URL — dedup across concurrent callers.
- URL canonicalization strips trackers (`utm_*`, `fbclid`, `gclid`) and empty fragments so cache stays hot.
- HTML parsing via NSRegularExpression: `og:*`/`twitter:*`/`name=` meta tags (4 attribute-order variants), `<title>` fallback; relative image URL resolution against base.
- HTML entity decoding (named + numeric stripped); charset detection from `Content-Type`, falls back to UTF-8/ISO-Latin1.
- `firstURL` uses `NSDataDetector` link detection, only http/https schemes.

**Android port:** Kotlin `actor`-equivalent via a `Mutex`-guarded map or a single-thread coroutine dispatcher; OkHttp with 4s timeout + body limit interceptor. Use `Jsoup` for HTML parsing instead of regex (more robust). `LinkifyCompat`/`PatternsCompat.WEB_URL` or `TextUtils` for URL detection. Cache `LinkMetadata` in Room. Reuse canonicalization logic verbatim.

- [ ] In-message link preview cards (title/description/image/site)
- [ ] Tracker-param stripping for cache stability

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/LocationService.swift

**Purpose:** Socket-based static + live location sharing in conversations.

**Public API:**
- `protocol LocationServiceProviding: Sendable` — 4 Combine `PassthroughSubject` publishers (`locationShared`, `liveLocationStarted/Updated/Stopped`) + `shareLocation`, `startLiveLocation`, `updateLiveLocation`, `stopLiveLocation`.
- `final class LocationService` singleton; delegates emits to `MessageSocketManager.shared`.

**Key behaviors:** Builds typed payloads (`LocationSharePayload`, `LiveLocationStart/Update Payload`) and emits over the message socket. NOTE: the publishers are declared but the service does not itself wire socket listeners — `MessageSocketManager` owns the inbound publishers; this is a thin façade.

**Android port:** Kotlin object/class with `SharedFlow` publishers; emit through the message socket wrapper. Payloads as `@Serializable`. Fuse with `FusedLocationProviderClient` for actual GPS capture.

- [ ] Share a static location pin in a conversation
- [ ] Start / update / stop live location sharing (duration-bounded)

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/MentionService.swift

**Purpose:** @-mention autocomplete suggestions for conversation and post contexts.

**Public API:**
- `struct MentionSuggestion: Codable, Identifiable, Sendable` — id, username, displayName, avatar, badge, inConversation, isFriend.
- `enum MentionContextType: String` — `conversation`, `post`.
- `protocol MentionServiceProviding` — unified `suggestions(contextId:contextType:query:)` + deprecated `suggestions(conversationId:query:)`.

**Key behaviors:** GET `/mentions/suggestions?contextId&contextType[&query]`. Legacy overload delegates to unified one.

**Android port:** Kotlin interface; suspend `suggestions()`. Drop the deprecated overload entirely (greenfield). Drive an autocomplete dropdown in the composer.

- [ ] @-mention autocomplete in message composer and post composer

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/MessageService.swift

**Purpose:** REST service for message CRUD, pagination, pin, view-once, search.

**Public API:** `protocol MessageServiceProviding` + `final class MessageService` (singleton): `list` (offset), `listBefore`/`listAround` (cursor), `send`, `edit`, `delete`, `pin`/`unpin`, `consumeViewOnce`, `search`/`searchWithCursor`.

**Key behaviors:**
- Three pagination strategies: offset (`offset`/`limit`), cursor-before (`before`), and around-anchor (`around`) — `listAround` is for deep-linking to a specific message.
- `include_replies` query flag throughout.
- `edit` → PUT `/messages/:id`; `pin` → PUT `.../pin`, `unpin` → DELETE.
- `consumeViewOnce` POSTs `.../consume` returning `ConsumeViewOnceResponse`.
- Search supports both first-page and cursor continuation.

**Android port:** Kotlin interface + Retrofit. Keep all three pagination modes — `listAround` is essential for notification deep-links. suspend functions returning `MessagesAPIResponse`.

- [ ] Message history pagination (offset, before-cursor, around-anchor)
- [ ] Send / edit / delete message
- [ ] Pin / unpin message
- [ ] View-once message consumption
- [ ] In-conversation message search (with cursor pagination)

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/NotificationService.swift

**Purpose:** REST service for the notification inbox.

**Public API:** `final class NotificationService` (singleton, no protocol): `list(offset:limit:unreadOnly:)`, `unreadCount()`, `markAsRead`, `markAllAsRead`, `delete`.

**Key behaviors:** `markAllAsRead` returns count; `unreadCount` reads `/notifications/unread-count`.

**Android port:** Kotlin interface (add the missing protocol for testability) + Retrofit. Pair with socket `notification:*` events for real-time updates.

- [ ] Notification list (paginated, unread-only filter)
- [ ] Unread badge count
- [ ] Mark single / all notifications read
- [ ] Delete notification

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift

**Purpose:** Large REST service for the social feed — posts, stories, statuses, comments, reposts, bookmarks, view/impression tracking.

**Public API:** `protocol PostServiceProviding` + `final class PostService` — 30+ methods: `getFeed` (cursor), `create`, `update`, `delete`, `like`/`unlike`, `bookmark`/`removeBookmark`/`getBookmarks`, `getPost`, comments (`getComments`, `addComment`, `likeComment`/`unlikeComment`, `deleteComment`, `getCommentReplies`), `repost`, `share`, `createStory`, `createWithType`, `requestTranslation`, `pinPost`/`unpinPost`, `viewPost`/`getPostViews`, `getUserPosts`, `getCommunityPosts`, `recordImpressions`.

**Key behaviors:**
- Cursor pagination (`paginatedRequest`) for all feed variants.
- `create` carries `mobileTranscription` (on-device Whisper result) + `audioUrl`/`audioDuration` for audio posts.
- `createWithType` dispatches story/status/post to the right endpoint.
- `viewPost` optionally records dwell `duration`; `recordImpressions` batches post IDs (no-op on empty).
- `requestTranslation` triggers server-side post translation (Prisme Linguistique).
- Reposts carry optional `targetType` + quote flag.

**Android port:** Kotlin interface + Retrofit. Split into focused sub-interfaces (FeedApi, CommentApi, StoryApi) if the surface feels unwieldy. Keep impression batching. `@Serializable` request bodies. suspend everything.

- [ ] Social feed (cursor-paginated)
- [ ] Create post / story / status (text, mood emoji, media, audio + transcription)
- [ ] Update / delete post
- [ ] Like / unlike, bookmark / un-bookmark
- [ ] Comments: add, like, delete, threaded replies
- [ ] Repost / quote-repost, share
- [ ] Pin / unpin post
- [ ] Post view + dwell-time tracking, batched impression tracking
- [ ] User-profile posts, community posts feeds
- [ ] On-demand post translation

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/PreferenceService.swift

**Purpose:** REST service for user preferences + conversation categories/preferences, with a cache-first SWR layer.

**Public API:** `protocol PreferenceServiceProviding` (with default no-op extensions) + `final class PreferenceService`:
- Network: `getCategories`, `getConversationPreferences`, `updateConversationPreferences`, `patchCategory`, `getAllPreferences`, `patchPreferences<T>`, `resetPreferences`, `createCategory`, `getMyConversationTags`.
- Cache-first: `loadCached…` / `revalidate…` / `persist…` triples for categories, conversation tags, all-preferences, conversation-preferences.

**Key behaviors / architecture:**
- Stale-while-revalidate pattern: `loadCached…` returns `.fresh`/`.stale` payloads synchronously from `CacheCoordinator` GRDB stores; `revalidate…` fetches network + persists; `persist…` lets callers keep optimistic state through a revalidate.
- `getMyConversationTags` aggregates tags client-side (no server endpoint) from first 200 conversation-preference rows, distinct + locale-sorted.
- `userPreferences`/`conversationPreferences` go through an **encrypted** cache store — persistence failures logged explicitly.
- Protocol default no-op impls so mocks need not implement the cache triples.

**Android port:** Kotlin interface; back the cache-first layer with Room + a `CacheResult` sealed class. Replicate the SWR triple pattern. Aggregate tags client-side. Use EncryptedSharedPreferences/SQLCipher for the encrypted-store equivalent.

- [ ] User preference categories (privacy/audio/message/notification/video/document/application)
- [ ] Per-conversation preferences (pin/mute/archive/category/tags/custom name/mentions-only)
- [ ] Conversation category create + expand/collapse
- [ ] Client-side conversation tag aggregation for autocomplete
- [ ] Cache-first preferences with stale-while-revalidate

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/ReactionService.swift

**Purpose:** REST service for message reactions.

**Public API:** `protocol ReactionServiceProviding` + `final class ReactionService`: `add`, `remove`, `fetchDetails`.

**Key behaviors:**
- `DiscardedReactionResponse` — a `Decodable` placeholder whose decoder succeeds against ANY JSON; used because the server returns the reaction object (not `[String:Bool]`) and a strict decoder previously threw on valid 2xx responses. Truth comes from the `reaction:added` socket broadcast.
- `remove` percent-encodes the emoji into the path.

**Android port:** Kotlin interface + Retrofit. For the discard-body issue, declare response type as `Unit`/`ResponseBody` and ignore it. Treat the socket broadcast as source of truth.

- [ ] Add / remove emoji reaction on a message
- [ ] Fetch reaction detail breakdown

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/ReportService.swift

**Purpose:** REST service for content moderation reports.

**Public API:** `protocol ReportServiceProviding` + `final class ReportService`: `reportMessage`/`reportUser`/`reportPost`/`reportStory`/`reportConversation`. Internal `CreateReportBody`, public `ReportResponseData`.

**Key behaviors:** All five POST `/admin/reports` with a `reportedType` discriminator string.

**Android port:** Kotlin interface; single `report(type, entityId, reportType, reason)` with an enum for `reportedType` to collapse the 5 near-identical methods.

- [ ] Report message / user / post / story / conversation for moderation

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift

**Purpose:** Shared request/response DTOs used across multiple services.

**Public API (types):** `CreateConversationRequest`/`Response`, `AddReactionRequest`, `MobileTranscriptionSegment`/`Payload` (snake_case CodingKeys for ML payloads), `CreatePostRequest`, `CreateCommentRequest`, `LikeRequest`, `UpdatePostRequest`, `CreateStoryRequest`, `UpdateConversationPreferencesRequest`, `ConversationCategory` (`CacheIdentifiable`), `TranslateRequest`/`Response` (snake_case), `UserSearchResult` (`CacheIdentifiable`, `Equatable`), `AttachmentStatusUser`, `EmptySuccess`.

**Key behaviors:**
- `MobileTranscriptionSegment/Payload` use snake_case (`speaker_id`, `duration_ms`) — the translator service contract.
- `AttachmentStatusUser` documents a real bug: gateway returns `participantId`, not `userId`; mismatched keys silently failed decoding and emptied the "Listened/Viewed" tabs.

**Android port:** Kotlin `@Serializable` data classes; `@SerialName` for snake_case fields. Keep `participantId` correct. `ConversationCategory`/`UserSearchResult` implement the Room cache key contract.

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/SessionService.swift

**Purpose:** REST service for managing the user's logged-in device sessions.

**Public API:** `struct UserSession: Codable, Sendable, Identifiable` (id, deviceName, ipAddress, lastActive, createdAt, isCurrent); `protocol SessionServiceProviding` + `final class SessionService`: `listSessions`, `revokeSession`, `revokeAllOtherSessions`.

**Android port:** Kotlin interface + Retrofit; drives a "Devices/Sessions" security screen.

- [ ] List active device sessions
- [ ] Revoke a single session / all other sessions

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift

**Purpose:** REST service for shareable conversation-join links (authenticated + anonymous).

**Public API:** `final class ShareLinkService` (singleton, no protocol): `listMyLinks`, `fetchMyStats`, `getLinkInfo` (public/no-auth), `joinAnonymously`, `joinAuthenticated`, `leaveAnonymousSession`, `createShareLink`, `toggleLink`, `deleteLink`.

**Key behaviors:**
- `joinAuthenticated` is idempotent — existing members get the same canonical `conversationId` as a fresh join.
- `getLinkInfo` and anonymous join hit `/anonymous/*` endpoints (no JWT, session-token flow).
- `createShareLink` maps raw `CreateShareLinkResponse` → flattened `CreatedShareLink`.

**Android port:** Kotlin interface + Retrofit. Anonymous flow needs the `X-Session-Token` header path. Handle deep-link intent (`meeshy.me/join/...`) → `joinAuthenticated`/`getLinkInfo`.

- [ ] Create / list / toggle / delete share links
- [ ] Share-link stats
- [ ] Join conversation via link (authenticated, idempotent)
- [ ] Join conversation anonymously via link
- [ ] Leave anonymous session

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/StatsService.swift

**Purpose:** REST service for the current user's activity stats.

**Public API:** `final class StatsService` (singleton, no protocol): `fetchStats() -> UserStats`, `fetchTimeline(days:) -> [TimelinePoint]`, `fetchAchievements() -> [Achievement]`.

**Android port:** Kotlin interface + Retrofit; drives a profile stats/achievements screen with a timeline chart.

- [ ] User activity stats
- [ ] Activity timeline (configurable day range)
- [ ] Achievements list

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/StatusService.swift

**Purpose:** REST service for ephemeral mood "status" posts.

**Public API:** `protocol StatusServiceProviding` + `final class StatusService`: `enum Mode { friends, discover }` (each maps to a feed endpoint); `list`, `create` (moodEmoji + content + visibility), `delete`, `react`.

**Key behaviors:** Statuses are `type:"STATUS"` posts; `react` posts an explicit emoji to `/posts/:id/like`.

**Android port:** Kotlin interface + Retrofit; `Mode` as enum with endpoint mapping.

- [ ] Friends / Discover status feeds
- [ ] Create mood status, react, delete

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/StoryService.swift

**Purpose:** REST service for stories with an in-memory single-post cache.

**Public API:** `protocol StoryServiceProviding` + `final class StoryService`: `list` (cursor), `markViewed`, `delete`, `react`, `comment`, `repost`, `cachedPost(id:)`, `fetchPost(id:)`.

**Key behaviors:**
- `NSLock`-guarded `postCache: [String:APIPost]` — single-session cache used by notification deep-links/reposts (stories expire 24h, no cross-session persistence needed).
- `react` sends explicit emoji via `LikeRequest` — fixes a prior bug where the gateway defaulted every story reaction to ❤️.
- `list`/`fetchPost` populate the cache.

**Android port:** Kotlin interface + Retrofit; replace `NSLock` map with a `ConcurrentHashMap` or `Mutex`-guarded map (session-scoped). Keep explicit-emoji reaction.

- [ ] Story feed (cursor-paginated)
- [ ] Mark story viewed, delete
- [ ] React to story (explicit emoji), comment, repost
- [ ] Fetch single story by ID (deep-link)

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/TrackingLinkService.swift

**Purpose:** REST service for marketing/analytics tracking links with click stats.

**Public API:** `final class TrackingLinkService` (singleton, no protocol): `listLinks`, `fetchStats`, `createLink`, `fetchClicks` (per-link detail), `setActive`, `deleteLink`. Internal `TrackingLinksData` wrapper.

**Android port:** Kotlin interface + Retrofit; drives a "Tracking Links" analytics screen.

- [ ] Create / list / toggle / delete tracking links
- [ ] Tracking link stats + per-link click history

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/TranslationService.swift

**Purpose:** Synchronous blocking text translation.

**Public API:** `final class TranslationService` (singleton): `translate(text:sourceLanguage:targetLanguage:) -> TranslateResponse` → POST `/translate-blocking`.

**Key behaviors:** snake_case wire format (`source_language`/`target_language`). For inline/ad-hoc translation (vs. message-pipeline translations).

**Android port:** Kotlin interface + Retrofit; `@SerialName` for snake_case.

- [ ] Ad-hoc blocking text translation

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/TwoFactorService.swift

**Purpose:** REST service for TOTP two-factor authentication.

**Public API:** `struct TwoFactorStatus`/`TwoFactorSetup`(secret, qrCodeDataUrl, otpauthUrl)/`TwoFactorBackupCodes`; `protocol TwoFactorServiceProviding` + `final class TwoFactorService`: `getStatus`, `setup`, `enable(code:)`, `disable(code:password:)`, `verify(code:)`, `getBackupCodes(code:)`.

**Key behaviors:** `setup` returns QR data URL + otpauth URL + secret; `enable` returns backup codes; `disable` requires both TOTP code and password.

**Android port:** Kotlin interface + Retrofit. Render the QR via ZXing; otpauth URL deep-links to authenticator apps. Backup codes screen.

- [ ] 2FA status, setup (QR + secret), enable, disable, verify
- [ ] Generate/view 2FA backup codes

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/UserPreferencesManager.swift

**Purpose:** `@MainActor ObservableObject` singleton — local-first user preference store with debounced backend sync and an offline outbox.

**Public API:**
- 7 `@Published private(set)` preference structs (`privacy`, `audio`, `message`, `notification`, `video`, `document`, `application`) + `isSyncing`, `lastSyncDate`.
- `updateX { transform }` mutators (one per category), `fetchFromBackend()`, `resetToDefaults()`, `resetCategory()`, convenience `shouldAutoDownloadMedia`/`shouldAutoDownload(fileSizeMB:)`.

**Key behaviors / architecture:**
- **Local-first:** mutate in memory → persist to `UserDefaults` (per-category JSON) → debounced backend sync (1s).
- **Offline outbox:** `syncCategoryToBackend` enqueues an `UpdateSettingsPayload` into `OfflineQueue` with a `clientMutationId` (cmid) for gateway-side `MutationLog` dedup; falls back to direct PATCH if enqueue fails (pool not yet wired at boot).
- **Server-wins merge** with local-only `extras` preserved (`mergeExtras` per category).
- Observes `AuthManager.$isAuthenticated` (fetch on login) and `willEnterForeground` (re-fetch if >5min since last sync).

**Android port:** Kotlin — DataStore (Preferences or Proto) replaces `UserDefaults`; expose `StateFlow` per category. WorkManager-backed outbox replaces `OfflineQueue` with the cmid dedup envelope. Observe auth state via Flow; use `ProcessLifecycleOwner` for foreground re-sync. Keep server-wins + local-extras merge.

- [ ] Local-first user preferences (7 categories) with instant UI updates
- [ ] Debounced backend preference sync
- [ ] Offline-queued preference changes with mutation-ID dedup
- [ ] Foreground / login auto-refresh of preferences
- [ ] Data-saving media auto-download gating

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/UserService.swift

**Purpose:** REST service for user search, profile fetch/update, avatar/banner upload, email/phone change.

**Public API:** `protocol UserServiceProviding` + `final class UserService`: `search`/`searchUsers`, `updateProfile`, `updateAvatar`/`updateBanner`, `uploadImage`, `getProfile`/`getPublicProfile`/`getProfileByEmail`/`getProfileById`/`getProfileByPhone`, `changeEmail`/`verifyEmailChange`/`resendEmailChangeVerification`, `changePhone`/`verifyPhoneChange`, `getUserStats`.

**Key behaviors:**
- `uploadImage` builds a manual `multipart/form-data` body (boundary, `files` field), bypasses `APIClient`, adds Bearer token directly, POSTs `/attachments/upload`, decodes nested `attachments[0].fileUrl`.
- Multiple lookup paths (id, username, `/u/:username` public, email, phone — phone strips `+`).
- Email/phone change is a two-step verify flow.

**Android port:** Kotlin interface + Retrofit `@Multipart` for image upload (cleaner than manual body). suspend functions. Keep the multi-key profile lookups for contact-matching / deep-links.

- [ ] User search (paginated)
- [ ] View profile (by id / username / public handle / email / phone)
- [ ] Update profile, avatar, banner (image upload)
- [ ] Change email / phone (two-step verification)
- [ ] User stats by ID

---

## packages/MeeshySDK/Sources/MeeshySDK/Services/VoiceProfileService.swift

**Purpose:** REST service for the voice-cloning feature — GDPR consent, voice samples, profile.

**Public API:** `protocol VoiceProfileServiceProviding` + `final class VoiceProfileService`: `getConsentStatus`, `grantConsent(ageVerification:birthDate:)`, `revokeConsent`, `getProfile`, `getSamples`, `uploadSample(audioData:durationMs:)`, `toggleVoiceCloning`, `deleteProfile`, `deleteSample`.

**Key behaviors:**
- Explicit GDPR consent gate (age verification + birth date) before any voice processing.
- `uploadSample` manual `multipart/form-data` (audio m4a + durationMs field), iso8601 decoder.
- `deleteProfile`/`deleteSample` are the GDPR delete path.

**Android port:** Kotlin interface + Retrofit `@Multipart`. Record samples with `MediaRecorder`/`AudioRecord` (m4a/AAC). Surface the consent flow prominently — legal requirement. suspend functions.

- [ ] Voice-cloning consent (grant with age verification / revoke)
- [ ] Upload / list / delete voice samples
- [ ] Toggle voice cloning on/off
- [ ] GDPR voice profile deletion

---

## packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift

**Purpose:** The central real-time engine — Socket.IO manager for messaging, presence, calls, notifications, translations/transcriptions, location, conversation lifecycle. ~2100 lines.

**Public API:**
- ~40 event payload structs (`MessageDeletedEvent`, `ReactionUpdateEvent`, `TypingEvent`, `UnreadUpdateEvent`, `UserPreferencesUpdatedEvent`, `ConversationStatsEvent`, `UserStatusEvent`, `PresenceSnapshotEvent`, `TranslationData/Event`, `TranscriptionSegment/Data`, `TranscriptionReadyEvent`, `TranslatedAudioInfo`, `AudioTranslationEvent`, `ReadStatusUpdateEvent`, `AttachmentStatusUpdatedEvent`, `ConversationUpdatedEvent`, `ParticipantLeft/Banned/Unbanned/RoleUpdated`, `ConversationClosedEvent`, `MessageConsumedEvent`, full **call signaling** suite — `SocketIceServer`, `CallOfferData`, `CallAnswerData`, `CallSignalPayload`, `CallICECandidateData`, `CallEndData`, `CallMissedData`, `CallAlreadyAnsweredData`, `CallParticipantData`, `CallMediaToggleData`, `CallErrorData` — `ReactionSyncEvent`, `SystemMessageEvent`, `MentionCreatedEvent`, `SocketNotificationEvent` + nested actor/context/metadata, `ConversationNewEvent`, `NotificationRead/Deleted/CountsEvent`, `ConversationOnlineStatsEvent`).
- `enum ConnectionState { connected, connecting, reconnecting(attempt:), disconnected }`.
- `protocol MessageSocketProviding` — ~50 `PassthroughSubject` publishers + connect/disconnect, room join/leave, typing, translation request, location emits, `sendWithAttachments`, full call-control emit API.
- `final class MessageSocketManager: ObservableObject` singleton; nested `SendMessageAck`, `CallInitiateAck`, `CallInitiateError`.

**Key behaviors / architecture:**
- **Transport: forced HTTP long-polling** (`.forcePolling(true)`) — WebSocket transport was unreliable on iOS (stalled handshake / ~35s ping timeout); long-polling rides URLSession.
- JWT expiry pre-check before connect → triggers `AuthManager.handleUnauthorized()` instead of connecting with a dead token.
- Auth via `Authorization: Bearer` header (registered) or `X-Session-Token` (anonymous).
- Infinite reconnect (`reconnectAttempts(-1)`, 1s→16s backoff).
- **Room re-join on reconnect**: tracks `joinedConversations: Set`, re-emits `conversation:join` for all rooms (active conversation first for fastest UX); fires `didReconnect`.
- **Background lifecycle**: `prepareForBackground()` fully tears down the socket (iOS suspension kills the WS silently — trusting stale `isConnected` would never reconnect); `resumeFromBackground()`/`forceReconnect()` rebuild.
- 30s heartbeat `Timer` emitting `heartbeat`.
- **ACK-based sends**: `sendWithAttachmentsAsync` / `sendAsync` use `emitWithAck` with timeout, echo back `clientMessageId` + server `createdAt` so the optimistic row reconciles without scraping the broadcast. `sendAsync` (plain text WS-first) currently UNUSED — text sends route through REST (gateway `message:send` handler unreachable as of 2026-05-17).
- **Call signaling**: `emitCallInitiate` awaits ACK returning real callId + ICE servers (TURN creds must be set before building SDP); ACK variants for signal/end (`emitCallSignalWithAck`, `emitCallEndWithAck`) so CallKit fulfill races are avoided; `emitCallForceLeave` purges zombie calls.
- `decode<T>` helper: serializes `[Any]` socket payload → JSON → custom-date `JSONDecoder`; logs key list on failure; dispatches handler to main thread.
- Cross-conversation realtime reactions for non-cached messages are intentionally dropped (server `reactionSummary` is truth on next open).
- Perf instrumentation logs (`perf:ios.notif.socket.*`).

**Event names (hyphenated `entity:action`):** `message:new/edited/deleted`, `reaction:added/removed/sync`, `typing:start/stop`, `conversation:unread-updated/joined/join-error/left/updated/participant-left/participant-banned/participant-unbanned/closed/stats/new/online-stats`, `user:status/preferences-updated`, `presence:snapshot`, `message:translation/translated`, `audio:transcription-ready/translation-ready/translations-progressive/translations-completed`, `read-status:updated`, `attachment-status:updated`, `message:consumed`, `participant:role-updated`, `location:shared/live-started/live-updated/live-stopped`, `notification:new/read/deleted/counts`, `mention:created`, `call:initiated/signal/ended/missed/already-answered/participant-joined/participant-left/media-toggled/error`, `system:message`.

**Android port:**
- Use the **socket.io-client-java** library; force polling transport to match server-tested behavior.
- Replace ~50 Combine subjects with Kotlin `SharedFlow` (or a single sealed `SocketEvent` flow). One hot `MutableSharedFlow` per event family keeps the surface manageable.
- All event payloads → `@Serializable` data classes; replicate the custom ISO8601 (fractional + basic) date handling.
- Connection lifecycle: use `LifecycleObserver`/`ProcessLifecycleOwner` for the background teardown + foreground rebuild — Android process death is even more aggressive; consider a foreground service for active calls.
- Room re-join, infinite reconnect, 30s heartbeat — port verbatim.
- ACK sends: socket.io-client-java supports ack callbacks; wrap in `suspendCancellableCoroutine` with timeout.
- Calls: pair with WebRTC (`org.webrtc`) + a ConnectionService (CallKit equivalent) for system call UI.
- This is the single most important file to port faithfully — it is the real-time backbone.

- [ ] Real-time message receive / edit / delete
- [ ] Real-time reactions (add/remove/sync)
- [ ] Typing indicators
- [ ] Presence (user status + bulk presence snapshot on connect)
- [ ] Unread-count + read-status real-time updates
- [ ] Real-time translations, transcriptions, progressive audio translations
- [ ] Conversation lifecycle events (created, updated, closed, participant join/leave/ban/role)
- [ ] Conversation list bump-to-top via `conversation:updated`
- [ ] In-app notifications (new/read/deleted/counts) over socket
- [ ] Voice/video call signaling (initiate, answer, ICE, end, missed, media toggle, multi-party)
- [ ] WS-first message send with ACK reconciliation (clientMessageId)
- [ ] Location sharing events
- [ ] Mentions, system messages, view-once consumption events
- [ ] Robust reconnect with room re-join + background/foreground handling

---

## packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift

**Purpose:** Second, independent Socket.IO manager for the social feed (posts, stories, statuses, comments, reactions) — separate connection so feed and chat reconnect independently. ~900 lines.

**Public API:**
- ~30 event structs (`SocketPostCreated/Updated/Deleted/Liked/Unliked/Reposted/Bookmarked Data`, `SocketStory*`, `SocketStatus*`, `SocketComment*`, `SocketPost/CommentReactionAggregation`, `SocketPost/CommentReactionUpdate/SyncEvent`, `SocketStory/Post/CommentTranslationUpdatedData`, `SocketTranslationPayload`).
- `protocol SocialSocketProviding` — ~28 publishers + connect/disconnect, `subscribeFeed`/`unsubscribeFeed`, `joinPostRoom`/`leavePostRoom`, ACK-based `addCommentReaction`/`removeCommentReaction`/`requestCommentReactionSync` and post-reaction equivalents.
- `final class SocialSocketManager: ObservableObject` singleton; `CommentReactionError`/`PostReactionError` enums.

**Key behaviors / architecture:**
- Same connection pattern as MessageSocketManager: forced polling, JWT pre-check, infinite reconnect, 30s heartbeat, background teardown/rebuild.
- Auto `subscribeFeed()` on connect.
- Post rooms (`post:join`/`post:leave`) for granular post-detail subscriptions.
- ACK-based reaction emits via `emitWithAck` (10s timeout) returning typed update events.
- `decode<T>` helper with shared `JSONDecoder` (custom date strategy).
- Socket payloads are **camelCase** (REST uses snake_case) — explicitly noted.

**Event names:** `post:created/updated/deleted/liked/unliked/reposted/bookmarked`, `story:created/viewed/reacted/updated/deleted`, `status:created/deleted/updated/reacted`, `comment:added/deleted/liked/reaction-added/reaction-removed/reaction-sync`, `post:reaction-added/removed/sync`, `post:story-translation-updated`, `post:translation-updated`, `comment:translation-updated`. Client emits: `feed:subscribe/unsubscribe`, `post:join/leave`, `comment:reaction-add/remove/request-sync`, `post:reaction-add/remove/request-sync`.

**Android port:** Same approach as MessageSocketManager — separate socket.io-client-java connection, `SharedFlow` publishers, `@Serializable` payloads. Keep the two-socket split (independent reconnect). Feed subscribe on connect; post-room join for detail screens.

- [ ] Real-time feed updates (posts created/updated/deleted)
- [ ] Real-time post/story/status likes, reactions, reposts, bookmarks
- [ ] Real-time comments (add/delete/like/threaded reactions)
- [ ] Real-time post/story/comment translation updates
- [ ] Post-detail room subscriptions
- [ ] ACK-based post & comment reaction emits

---

## packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift

**Purpose:** GRDB/SQLite-backed local persistence for in-progress Story drafts (slides + media files).

**Public API:** `final class StoryDraftStore` singleton: `save(slides:visibility:)`, `saveMedia(images:videoURLs:audioURLs:)`, `loadMedia() -> LoadMediaResult`, `loadMediaReferences() -> [StoryMediaReference]`, `purgeLostMedia(_:)`, `load() -> (slides, visibility)?`, `clear()`, `isEmpty()`. Nested `LoadMediaResult` (images/videoURLs/audioURLs + `lostElementIds`).

**Key behaviors:**
- 3 tables: `story_draft_slide`, `story_draft_meta` (key/value), `story_draft_media`.
- Media stored as files in a `meeshy_draft_media` directory; DB stores filenames; images JPEG-compressed at 0.85.
- Never-throwing DB queue builder — falls back to in-memory queue if disk fails (drafts ephemeral, app not crashed).
- `loadMedia` detects orphaned media (DB row exists but file purged by OS) → `lostElementIds` so the UI can prompt re-capture instead of silent drop.
- `loadMediaReferences` exposes on-disk media as transport refs for the offline publish queue without re-encoding.
- `StorySlide`/`StoryEffects` serialized as JSON.

**Android port:** Room database (`StoryDraftSlide`, `StoryDraftMeta`, `StoryDraftMedia` entities). Media files in app `filesDir/draft_media`. Replicate the orphan-detection (`lostElementIds`) and the never-crash fallback (in-memory Room DB on failure). JSON-encode effects with kotlinx.serialization.

- [ ] Persistent Story draft (slides, effects, visibility) across app restarts
- [ ] Story draft media (images/video/audio) on-disk persistence
- [ ] Orphaned-media detection with re-capture prompt

---

## packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift

**Purpose:** Orchestrates cold-start full sync, foreground/reconnect delta sync, message hydration, retention cleanup, and the socket→cache relay. ~900 lines. The brain of cache-first instant-app behavior for chat.

**Public API:** `protocol ConversationSyncEngineProviding` + `final class ConversationSyncEngine` singleton: `conversationsDidChange`/`messagesDidChange` publishers, `fullSync()`, `syncSinceLastCheckpoint()`, `ensureMessages(for:)`, `fetchOlderMessages(for:before:)`, `cleanupRetentionIfNeeded()`, `startSocketRelay()`/`stopSocketRelay()`, `markConversationReadLocally()`, `updateConversationAfterSend()`.

**Key behaviors / algorithms:**
- **`fullSync()`**: first-page-first then bounded-parallel (4) fan-out for remaining pages + sequential tail loop; retries each page 3× with exponential backoff (1s/2s); progress guards stop on empty page or zero-new-IDs (offset stagnation), hard ceiling 50 tail iterations. Returns `Bool` success so UI can show retry instead of an empty list forever. Persists pre-sorted by `lastMessageAt` DESC and indexes into `SearchIndex`.
- **`syncSinceLastCheckpoint()`**: delta via `updatedSince` query param; 3s cooldown to dedup burst signals (reconnect + foreground + stale-revalidate); merges deltas (remove inactive, update existing, append new).
- **`ensureMessages`**: SWR — returns immediately if `.fresh`; otherwise fetches 30 messages, **atomically merges** with socket-arrived messages (`mergeUpdate`) so nothing is overwritten.
- **`fetchOlderMessages`**: prepends older page with atomic merge.
- **`cleanupRetentionIfNeeded`**: daily; trims conversations >600 messages to max(last-year, last-600).
- **Socket relay** (`startSocketRelay`): subscribes ~18 message-socket publishers and routes them into `CacheCoordinator` mutations — new message (upsert + bump conversation to top, fetch missing conversation row, auto mark-as-received), edit (`upsertPatch`), delete (soft-delete with `deletedAt`), reactions add/remove/sync, unread/read-status (delivery-status escalation `sent→delivered→read`, never downgrade), translation/transcription/audio caching, participant cache invalidation, conversation-closed, reconnect→delta sync.
- State protected by a serial `DispatchQueue`; sync timestamp + cleanup date persisted in `UserDefaults`.

**Dependencies:** `CacheCoordinator`, `ConversationService`, `MessageService`, `MessageSocketProviding`, `SocialSocketProviding`, `APIClient`, `SearchIndex`, `UserDisplayNameCache`, `AuthManager`.

**Android port:** This is the most architecturally critical file after the socket manager. Kotlin coroutines: `withContext` + `coroutineScope`/`async` for the parallel page fan-out (bound with a `Semaphore(4)`); `SharedFlow` for change publishers; Room as the cache backend. Replicate the retry/progress-guard/cooldown logic exactly — these defend against the "blank list forever" and "infinite pagination" bugs. The atomic-merge pattern (`mergeUpdate`) must be honored to avoid losing socket messages during REST hydration. Run the socket relay in a long-lived service-scoped coroutine. Persist sync checkpoints in DataStore.

- [ ] Cold-start full conversation sync (parallel paging, retries, completeness guards)
- [ ] Foreground / reconnect delta sync (updatedSince checkpoint, burst cooldown)
- [ ] Message hydration with stale-while-revalidate + atomic socket merge
- [ ] Load older messages (infinite scroll up)
- [ ] Real-time socket→cache relay (messages, reactions, read status, translations, lifecycle)
- [ ] Conversation list bump-to-top on send/receive
- [ ] Delivery-status escalation (sent→delivered→read)
- [ ] Daily message-retention cleanup

---

## packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift

**Purpose:** Deterministic accent-color generation for conversations and posts.

**Public API:** `enum ThemeMode { dark, light }`; `struct ConversationContext` (name, type, language, theme, memberCount) + nested `ConversationType`/`ConversationLanguage`/`ConversationTheme` enums; `struct DynamicColorGenerator` — `colorForPost(authorId:type:originalLanguage:)`, `colorFor(context:) -> ConversationColorPalette`, `colorForName(_:)`, `adaptedColor(_:for:)`, `blendTwo`, `hueShiftedHex`; `struct ConversationColorPalette` (primary/secondary/accent/saturationBoost).

**Key behaviors / algorithms:**
- Conversation primary = `blend(languageColor×0.30, typeColor×0.30, themeColor×0.40)`; secondary/accent = ±30° hue shift; `saturationBoost = min(1, memberCount/100)×0.2`.
- Post accent = `blend(authorColor×0.40, postTypeColor×0.25, languageColor×0.35)`.
- `colorForName` — **DJB2 hash** (deterministic across launches, unlike Swift's seeded `hashValue`) → 40-color vibrant palette.
- `adaptedColor` — HSB adjustment for text readability (dark: brightness ≥0.70; light: brightness ≤0.60).
- Hex/RGB/HSB conversions via UIColor.

**Android port:** Pure Kotlin object — no UIKit dependency needed; do HSB math with `android.graphics.Color.colorToHSV`/`HSVToColor` or manual. Keep the DJB2 hash byte-for-byte (cross-platform color consistency with web/iOS). All color maps and weights port verbatim. Expose Compose `Color` extensions.

- [ ] Deterministic per-conversation accent color
- [ ] Deterministic per-post accent color
- [ ] Name-hash → palette color (sender names, avatars)
- [ ] Theme-adaptive text color readability

---

## packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift

**Purpose:** Actor cache for blended conversation-accent and per-user name colors.

**Public API:** `actor UserColorCache` singleton: `blendedColor(for conversationAccent:)` (accent 30% + brand indigo `6366F1` 70%), `colorForUser(name:)`, `invalidateAll()` (on logout), `stats() -> (hits, misses)`.

**Android port:** Kotlin class with a `Mutex`-guarded `HashMap` or `LruCache` (thread-safe). Singleton via Hilt. Same blend weights.

- [ ] Cached blended accent colors + per-user colors

---

## packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift

**Purpose:** Generate/validate `clientMessageId` (`cid_<uuid v4 lowercase>`) for optimistic-send reconciliation.

**Public API:** `enum ClientMessageId`: `generate()`, `regexPattern`, `isValid(_:)`.

**Key behaviors:** Format mirrors `packages/shared/utils/client-message-id.ts`; lowercase mandatory (gateway regex rejects uppercase); compiled regex cached (hot path).

**Android port:** Kotlin object: `UUID.randomUUID().toString().lowercase()` prefixed `cid_`; compiled `Regex`. Keep the exact pattern — cross-service contract.

---

## packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMutationId.swift

**Purpose:** Generate/validate `clientMutationId` (`cmid_<uuid v4 lowercase>`) for the offline-outbox mutation dedup envelope.

**Public API:** `enum ClientMutationId`: `generate()`, `regexPattern`, `isValid(_:)`.

**Key behaviors:** `cmid_` prefix distinguishes from `cid_`; used for non-message writes (markAsRead, friend requests, profile/preference updates); gateway looks up `(userId, cmid)` in `MutationLog` and replays the recorded result.

**Android port:** Kotlin object, identical to ClientMessageId pattern. Persist the cmid with each outbox row (Room/WorkManager).

---

## packages/MeeshySDK/Sources/MeeshySDK/Utils/CountryFlag.swift

**Purpose:** ISO-3166-1 alpha-2 country code → emoji flag + localized name.

**Public API:** `struct CountryFlag`: `emoji(for:)`, `name(for:)`.

**Key behaviors:** Builds flag from Unicode regional indicator scalars (base offset 127397); `name` uses `Locale.localizedString(forRegionCode:)`.

**Android port:** Kotlin object — same regional-indicator math (`Character.toChars`); use `Locale("", code).displayCountry` for names.

---

## packages/MeeshySDK/Sources/MeeshySDK/Utils/ThumbHash.swift

**Purpose:** Vendored ThumbHash (Wolt spec, MIT, Evan Wallace) — compact image placeholder hashes byte-compatible with the gateway's `thumbhash` npm package.

**Public API:** `rgbaToThumbHash(w:h:rgba:) -> [UInt8]`, `thumbHashToRGBA(hash:) -> (Int,Int,[UInt8])`, `thumbHashToAverageRGBA(hash:)`, `thumbHashToApproximateAspectRatio(hash:)`; `UIImage.toThumbHash()`/`UIImage.fromThumbHash(_:)`/`UIImage.thumbHashAverageColor(_:)`.

**Key behaviors / algorithms:**
- Full DCT pipeline: alpha-weighted average color → LPQA color space → per-channel DCT encode (dc/ac/scale) → 24-bit + 16-bit packed headers + 4-bit AC nibbles. Decode = inverse DCT to ~32px.
- Encodes images ≤100×100; un-premultiplies alpha to match Wolt input expectation.
- ~5-15ms encode, ~1-3ms decode.

**Android port:** Port the DCT math 1:1 to Kotlin (pure arithmetic — no Swift-specific APIs). Replace `UIImage` extensions with `Bitmap` helpers (`Bitmap.getPixels` for RGBA, `Bitmap.createBitmap` from the decoded buffer). Must stay byte-compatible with the server's npm thumbhash. Use the decoded placeholder as a Coil/Glide `placeholder` while the full image loads (instant-app blur preview).

- [ ] Instant blurred image placeholders (ThumbHash decode) for media

---

## packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthTextField.swift

**Purpose:** Reusable SwiftUI form field for auth screens (icon, secure toggle, inline validation).

**Public API:** `struct AuthTextField: View` — title, icon, `@Binding text`, `isSecure`, `keyboardType`, `autocapitalization`, optional `validation` closure.

**Key behaviors:** Eye toggle for secure fields; focus-driven border color; inline validation error on `onChange`; uses `ThemeManager.shared`, `MeeshyRadius`, `Color(hex:)`.

**Android port:** Jetpack Compose `OutlinedTextField` wrapper composable — leading icon, `PasswordVisualTransformation` + trailing eye `IconButton`, `KeyboardOptions`, `isError`/`supportingText` for validation. Theme via `MaterialTheme`/custom theme.

- [ ] Reusable auth input field with validation + password visibility toggle

---

## packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift

**Purpose:** SwiftUI country-code picker + phone number field for registration.

**Public API:** `struct CountryCode: Identifiable` (id/name/dialCode/flag); `struct CountryPicker: View` — bound `selectedCountry` + `phoneNumber`; static `countries` list (25 hard-coded, localized names via `String(localized:bundle:.module)`).

**Key behaviors:** Searchable sheet (`.searchable`, medium/large detents) filtering by name/dial code/ISO id; phone field with `.phonePad`.

**Android port:** Compose — `ModalBottomSheet` with a searchable `LazyColumn`; country list as a resource (string resources for localized names). Phone field with `KeyboardType.Phone`. Consider `libphonenumber` for proper formatting/validation.

- [ ] Country code + phone number entry with searchable picker

---

## packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/LanguageSelector.swift

**Purpose:** SwiftUI expandable language dropdown for selecting content/UI language.

**Public API:** `struct LanguageOption: Identifiable` (id/name/flag); `struct LanguageSelector: View` — title, bound `selectedId`, optional languages; static `defaultLanguages` (20 ISO 639-1 codes, native names + flags).

**Key behaviors:** Spring-animated expand/collapse; scrollable `LazyVStack` (max 250pt); checkmark on selected.

**Android port:** Compose `ExposedDropdownMenuBox` or a custom expandable card with `AnimatedVisibility`. Languages from a shared resource list (reuse the 20 codes — drives the Prisme Linguistique language resolution).

- [ ] Language selector dropdown (20 languages, native names)

---

## packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/PasswordStrengthIndicator.swift

**Purpose:** SwiftUI 5-segment password strength meter.

**Public API:** `struct PasswordStrengthIndicator: View` — `password` string.

**Key behaviors:** Score 0-5 from length (≥8, ≥12), upper/lower/digit/special-char presence; color + French label (Trop faible→Excellent).

**Android port:** Compose `Row` of 5 weighted boxes; same scoring algorithm; label via string resources (localize — currently hard-coded French).

- [ ] Password strength meter on registration

---

## Architecture observations

### State management & reactive streams
- The SDK uses **Combine `PassthroughSubject`** pervasively for socket events (~80 publishers across the two socket managers). Android equivalent: `SharedFlow` (hot, multicast). Consider collapsing per-event publishers into a few sealed-class flows to reduce surface area.
- `@MainActor ObservableObject` singletons (`UserPreferencesManager`) → Kotlin `StateFlow`-exposing singletons with `@Published` → `StateFlow`.
- `actor` types (`UserColorCache`, `LinkPreviewFetcher`) → `Mutex`-guarded classes or single-thread coroutine confinement.

### Cache-first / SWR (Instant App principles)
- `ConversationSyncEngine` + `PreferenceService` cache-first triples are the canonical SWR implementation: `loadCached…` (instant paint) → `revalidate…` (network) → `persist…`. `CacheResult` is `.fresh/.stale/.expired/.empty` — every consumer must handle all four cases (never `.value!`). Port `CacheResult` as a Kotlin sealed class and Room as the L2 store.
- `ConversationSyncEngine.ensureMessages`/`fetchOlderMessages` use **atomic merge** (`mergeUpdate`) so socket-arrived messages are never clobbered by a slower REST hydration — this race is real and must be preserved.

### Concurrency
- `fullSync` bounded-parallel page fan-out (`withTaskGroup`, maxParallel 4) → Kotlin `Semaphore(4)` + `async`/`awaitAll`.
- Heavy use of `withCheckedContinuation` to bridge socket ACK callbacks to async — Android: `suspendCancellableCoroutine` over socket.io-client-java ack callbacks.
- Serial `DispatchQueue` for sync-engine state → a single confined dispatcher or `Mutex`.

### Networking transport
- **Both Socket.IO managers force HTTP long-polling** — WebSocket transport proved unreliable on iOS. The Android socket.io-client-java setup should match (force polling) to align with what the gateway is tested against, then revisit WS once verified.
- Two independent socket connections (message + social) is a deliberate choice — independent reconnect; keep the split on Android.

### Offline-first & idempotency
- `clientMessageId` (`cid_`) for optimistic message reconciliation; `clientMutationId` (`cmid_`) for the offline outbox `MutationLog` dedup. `UserPreferencesManager` already routes through `OfflineQueue`. Android: WorkManager-backed outbox carrying the cmid envelope; keep the ID formats byte-identical (cross-service contract).

### Resilience patterns worth preserving
- `fullSync` returns a success `Bool` + retry/backoff + progress guards (empty-page / zero-new-ID stagnation / 50-iteration ceiling) — directly fixes "blank list forever" and "infinite pagination" bugs.
- Socket managers never force logout on a socket error (only APIClient 401 can) — avoids false-positive logouts on transient failures.
- `StoryDraftStore` never-crash DB fallback + orphaned-media detection.
- `DiscardedReactionResponse` — a decoder that accepts any JSON shape, used where the response body is irrelevant and a strict decoder would throw on valid 2xx. Android: just type the response as `Unit`/`ResponseBody`.

### Tech debt / anti-patterns NOT to carry over
- Tokens in `UserDefaults` (flagged in CLAUDE.md) — Android must use EncryptedSharedPreferences / Keystore from day one.
- Several services lack a `…Providing` protocol (`NotificationService`, `StatsService`, `ShareLinkService`, `TrackingLinkService`, `TranslationService`) — Android should give every service an interface for testability/DI uniformity.
- `UserService.search` is dead-ish — ignores its `query` param (comment admits the query "needs to be added manually"); `searchUsers` is the real one. Implement only one search method on Android.
- `MessageSocketManager.sendAsync` (WS-first text send) is UNUSED — gateway `message:send` handler unreachable; text routes through REST. Android: route text sends via REST until the gateway path is confirmed.
- Manual `multipart/form-data` body construction in `UserService.uploadImage` / `VoiceProfileService.uploadSample` — Android should use Retrofit `@Multipart` (cleaner, less error-prone).
- Hard-coded French strings in `PasswordStrengthIndicator` and partial localization elsewhere — Android: use string resources throughout.
- Manual NSRegularExpression HTML parsing in `LinkPreviewFetcher` — Android: prefer Jsoup.
- `ServiceModels.AttachmentStatusUser` documents a silent-decode-failure bug from a key mismatch (`userId` vs `participantId`) — Kotlin's `@SerialName` discipline + non-lenient parsing in tests should catch these.

### Summary
36 files: REST service layer (18 services), 2 Socket.IO managers, the conversation sync engine, story-draft persistence, color generation, hot-path utilities, and 4 auth UI components. The two most architecturally load-bearing files are **MessageSocketManager** (~2100 LOC real-time backbone — messaging, calls, presence, notifications) and **ConversationSyncEngine** (~900 LOC cache-first sync orchestrator); both must be ported with their resilience logic intact. The cache-first SWR pattern (`CacheResult`, `loadCached/revalidate/persist` triples, atomic merge) is the foundation of the instant-app experience and should map directly onto Room + Kotlin Flow.
