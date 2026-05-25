# Audit Part 15 — MeeshySDK Models, Networking & Notifications

Scope: 28 files from `packages/MeeshySDK/Sources/MeeshySDK/` — the SDK's data-model layer (messages, posts, stories, preferences, presence, voice, share/tracking links, relationships), the HTTP/networking layer (APIClient, TUS resumable uploads), and the notifications layer (coordinator, manager, push receipts, MetricKit).

These are pure-logic types in the **core** SDK target (no SwiftUI). They are the single source of truth for the wire contract with the Fastify gateway and define the API→domain conversion algorithms. The Android rebuild should mirror these as Kotlin data classes + serializers, preserving the resilient-decoding and Prisme-Linguistique behaviors exactly.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift

**Purpose:** Wire models for messages (`APIMessage` + nested sender/attachment/reply/forward/translation types) and the `APIMessage → MeeshyMessage` domain conversion. Also defines `SendMessageRequest`.

**Public API surface:**
- Structs: `APIMessageSenderUser`, `APIMessageSender` (computed `name`, `resolvedAvatar`, `resolvedUserId`), `APIAttachmentTranscription` (computed `resolvedText`), `APIAttachmentTranslation`, `APIMessageAttachment`, `APIMessageReplyTo`, `APIForwardedFrom`, `APIForwardedFromConversation`, `APITextTranslation`, `APIMessage` (custom `Decodable`), `MessagesAPIMeta`, `MessagesAPIResponse`, `SendMessageRequest` (Encodable), `SendMessageResponseData`, `ConsumeViewOnceResponse`.
- Extension: `APIMessage.toMessage(currentUserId:currentUsername:) -> MeeshyMessage`.

**Key behaviors / algorithms:**
- **Resilient id decode:** tries `id`, falls back to MongoDB `_id`.
- `clientMessageId` is a stable end-to-end ID `cid_<uuid v4 lowercase>` generated client-side BEFORE send (used by gateway for dedup unique-index on retry). `SendMessageRequest.clientMessageId` is non-optional, auto-generated via `ClientMessageId.generate()` when nil.
- `isDeleted` is a computed property: `deletedAt != nil` (no separate boolean — matches CLAUDE.md rule).
- `toMessage()` maps messageType/messageSource strings to enums; builds attachments, reactions (expands `reactionSummary` count into N `MeeshyReaction` instances, marking the first one as the current user's if they reacted), reply references (incl. story-reply pseudo-reference with camera emoji preview), forward references.
- **Effect flags:** prefers `effectFlags` bitmask (`MessageEffectFlags`); falls back to legacy `isBlurred`/`isViewOnce`/`expiresAt` booleans.
- **Delivery status:** computed — `.read` if `readCount>0 || readByAllAt!=nil`, else `.delivered`, else `.sent`.
- **isMe resolution:** matches by `senderUserId == currentUserId` OR case-insensitive username match.
- Side effect: feeds `UserDisplayNameCache.shared.track()` when displayName differs from username.
- `pinnedAt` decoded as String, parsed lazily via static ISO8601 formatter (fractional seconds).

**Dependencies & couplings:** `MeeshyMessage`, `MeeshyMessageAttachment`, `MeeshyReaction`, `ReplyReference`, `ForwardReference`, `MessageEffects`/`MessageEffectFlags`, `DynamicColorGenerator`, `UserDisplayNameCache`, `ClientMessageId`, `MentionedUser`, `TranscriptionSegment`, `OffsetPagination`/`CursorPagination`.

**Android-port note:** Kotlin data classes with `kotlinx.serialization`. Custom `id`/`_id` fallback → custom `KSerializer` or `@JsonNames`. `clientMessageId` generator = `"cid_" + UUID.randomUUID().toString().lowercase()`. Effect flags → Kotlin bitmask enum (`EnumSet` or Int flags). Domain conversion belongs in a mapper class. Reaction expansion into N rows is a UI-driven model decision — consider whether Android UI needs per-row reactions or aggregate counts only (aggregate is cheaper).

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift

**Purpose:** Device-token registration, notification preferences, the exhaustive `MeeshyNotificationType` enum, and `APINotification` (matches gateway `NotificationFormatter` output) with formatted-title/body logic.

**Public API surface:**
- `RegisterDeviceTokenRequest`/`Response`, `UnregisterDeviceTokenRequest`, `NotificationPreferences`.
- `enum MeeshyNotificationType` — ~80 cases (message, conversation, contact/friend, interaction, social/post, call, translation, security, community, member, system, engagement, plus legacy uppercase aliases). Computed `systemIcon` (SF Symbol) and `accentHex`.
- `NotificationActor`, `NotificationContext`, `NotificationState`, `NotificationDelivery`, `NotificationMetadata` (custom decoder), `APINotification` (`CacheIdentifiable`), `NotificationData`, `NotificationListResponse`, `NotificationPagination`, `UnreadCountResponse`, `MarkReadResponse`.
- `APINotification.withReadState(_:)` immutable mutation helper.

**Key behaviors:**
- `APINotification.notificationType` resolves raw string → enum, falls back to `.system`.
- `formattedTitle` / `formattedBody` — large French-language switch producing display strings (e.g. "Message de X", "X a reagi 👍 a votre publication"). Includes device/IP/location body for `loginNewDevice`.
- `newConversationDirect` vs `newConversationGroup` distinguished for DM-specific UI; navigation target identical (`conversationId`).
- Notification raw values match backend lowercase strings exactly; legacy UPPERCASE values kept for back-compat.

**Dependencies & couplings:** `CacheIdentifiable`. Consumed by `UserNotificationPreferences+Filter.swift`, `NotificationManager`, `NotificationCoordinator`.

**Android-port note:** `MeeshyNotificationType` → Kotlin enum with `serialName` per case; map SF Symbols to Material icons. Legacy uppercase aliases → handle via permissive serializer (lowercase the raw value or `@JsonNames`). **The French formatted-title strings should move to Android string resources (`strings.xml`)** for proper i18n rather than being hard-coded in the model — but the gateway also sends `content`, so prefer server-provided text where available. accentHex colors map straight to Compose `Color(0xFF......)`.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift

**Purpose:** Conversation participant models — type, permissions, anonymous profiles, paginated + embedded REST representations.

**Public API surface:**
- `enum ParticipantType` (user/anonymous/bot).
- `ParticipantPermissions` (7 can-send booleans; custom permissive decoder defaulting all to true; static `defaultUser`/`defaultAnonymous`).
- `AnonymousProfile`, `AnonymousSessionResponse`.
- `PaginatedParticipant` (`CacheIdentifiable`; computed `name`), `PaginatedParticipantsResponse`, `PaginatedParticipantsPagination` (cursor-based).
- `APIParticipant` (`Identifiable`; computed `name`/`resolvedAvatar`/`effectiveRole`).

**Key behaviors:** `ParticipantPermissions` decoder is fully fault-tolerant — every missing field defaults to `true`. Anonymous default permissions restrict files/videos/audio/locations/links. `effectiveRole` = `conversationRole ?? role ?? "member"`.

**Android-port note:** Kotlin data classes. Permissive decoding → `kotlinx.serialization` with default values + `encodeDefaults`/`coerceInputValues = true`. `defaultUser`/`defaultAnonymous` → companion-object constants.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift

**Purpose:** Wire models for the social feed (posts, comments, media, reposts) and `APIPost → FeedPost` conversion with Prisme-Linguistique translation resolution.

**Public API surface:**
- `APIAuthor` (computed `name`), `APIPostMedia` (computed `mediaType: FeedMediaType`), `APIRepostOf`, `APIPostComment`, `APIPostTranslationEntry`, `APIPost`, `APIPostViewer`, `PostViewersResponse`, `PostViewersPagination`.
- Extension: `APIPost.toFeedPost(userLanguage:preferredLanguages:) -> FeedPost`.
- Private helpers: `thumbnailColorForMime`, `formatFileSize`, `resolveTranslation`.

**Key behaviors:**
- **`resolveTranslation` (Prisme Linguistique):** walks `preferredLanguages` in order; if original language already matches a preferred language, returns `nil` (no translation needed); otherwise returns first matching translation text. **Never falls back to `translations.first`.**
- `toFeedPost` builds feed media (incl. transcription with segments), comments, repost content; durations converted ms→s.
- Side effects: `UserDisplayNameCache.shared.track()` / `trackFromMentionedUsers()`.

**Dependencies & couplings:** `FeedPost`, `FeedMedia`, `FeedComment`, `FeedMediaType`, `RepostContent`, `PostTranslation`, `MessageTranscription`/`Segment`, `StoryEffects`, `MentionedUser`, `UserDisplayNameCache`.

**Android-port note:** The Prisme resolution algorithm is **load-bearing and must be ported verbatim** — see CLAUDE.md "Regles critiques du Prisme". Centralize it in a shared `LanguageResolver` Kotlin object so messages, posts and stories all use one implementation.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/PreferenceModels.swift

**Purpose:** Full user-preferences model tree (7 categories) with extensible `extras` and fully fault-tolerant decoding.

**Public API surface:**
- `enum CodableValue` — type-erased JSON value (bool/int/double/string/array/dict/null) with typed accessors.
- `enum PreferenceCategory`; many config enums: `EncryptionPreference`, `AudioQuality`, `TranscriptionSource`, `TranslatedAudioFormat`, `VoiceCloneQuality`, `VideoQuality`, `VideoFrameRate`, `VideoResolution`, `VideoCodec`, `VideoLayout`, `SelfViewPosition`, `EmojiSkinTone`, `FontSize`, `TextAlign`, `AppThemeMode`, `LineHeight`, `SidebarPosition`, `DndDay` (with `fromCalendarWeekday`).
- Structs: `PrivacyPreferences`, `AudioPreferences`, `MessagePreferences`, `UserNotificationPreferences`, `VideoPreferences`, `DocumentPreferences`, `ApplicationPreferences`, and the aggregate `UserPreferences`. Each has a static `.defaults` and a custom decoder where every field falls back to its default.

**Key behaviors:** Every preference struct decodes defensively — missing keys → `.defaults`. `extras: [String: CodableValue]` allows forward-compatible server-added keys. `DndDay.fromCalendarWeekday` maps `Calendar.weekday` (1=Sun..7=Sat).

**Android-port note:** Kotlin data classes with default values everywhere; `coerceInputValues = true` for resilient decode. `CodableValue` → `kotlinx.serialization.json.JsonElement` or a sealed class. `DndDay.fromCalendarWeekday` → `java.time.DayOfWeek` mapping. These preferences likely back a Settings screen and should sync via the gateway PATCH endpoint.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/PresenceModels.swift

**Purpose:** User online/away/offline presence resolution.

**Public API surface:** `enum PresenceState` (online/away/offline), `struct UserPresence` (isOnline, lastActiveAt; computed `state`).

**Key behaviors:** `state` = `.offline` if not online; `.away` if `lastActiveAt` older than 300s; else `.online`.

**Android-port note:** Trivial Kotlin port. The 5-minute away threshold is a magic constant — keep as a named const.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/SampleData.swift

**Purpose:** Static sample data for SwiftUI previews / dev (conversations, communities, messages, feed posts).

**Public API surface:** `struct SampleData` with static `conversations`, `communities`, `messages(conversationId:)`, `feedPosts`.

**Android-port note:** Equivalent to Compose `@Preview` fixture providers / `PreviewParameterProvider`. Not production code — port only if Compose previews need fixtures.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkModels.swift

**Purpose:** Anonymous share-link join flow + authenticated link management.

**Public API surface:**
- `ShareLinkInfo`, `ShareLinkConversation`, `ShareLinkCreator` (computed `name`), `ShareLinkStats`.
- `AnonymousJoinRequest` (Encodable), `AnonymousJoinResponse`, `JoinAuthenticatedResponse` (idempotent), `AnonymousParticipant`, `JoinedConversation`.
- `CreateShareLinkRequest` (Encodable, many `allowAnonymous*`/`require*` flags), internal `CreateShareLinkResponse`, `CreatedShareLink`.
- `MyShareLink` (`CacheIdentifiable`; computed `displayName`, `joinUrl`), `MyShareLinkStats` (`CacheIdentifiable`, fixed `id == "stats"`).

**Key behaviors:** Share-link requirements (`requireAccount/Nickname/Email/Birthday`) gate the anonymous join form. `JoinAuthenticatedResponse` is idempotent — existing members get the same shape, so callers always navigate to `conversationId`. `joinUrl` built from `MeeshyConfig.shared.serverOrigin`.

**Android-port note:** Kotlin data classes. The anonymous-join flow uses an `X-Session-Token` header (no JWT) — port the dual-auth model into the Android networking layer. `deviceFingerprint` is a join-request field; Android equivalent is an installation/device ID.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/StatsModels.swift

**Purpose:** User profile statistics and achievements.

**Public API surface:** `UserStats` (`CacheIdentifiable`, fixed `id == "current"`; fault-tolerant decoder), `Achievement` (`Identifiable`), `TimelinePoint` (`CacheIdentifiable`, `id == date`).

**Android-port note:** Kotlin data classes; fault-tolerant decode via defaults. Single-row cache identity via constant id string.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift

**Purpose:** The largest model file (~2815 lines) — the entire Story canvas / timeline-editor data model: text/media/audio/sticker canvas objects, slide effects, transitions, keyframes, AND a full undo/redo Command pattern (`TimelineProject` + 12 `EditCommand` types + type-erased `AnyEditCommand`).

**Public API surface:**
- Enums: `StoryTextStyle` (fontName/fontWeight), `StoryFilter` (Core Image filter names), `StoryMediaKind`, `StoryTransitionEffect` (fade/zoom/slide/reveal), `PostType` (POST/STORY/STATUS), `StoryEasing` (with `apply(t)` curve math), `StoryTransitionKind` (crossfade/dissolve), `TimelineClipKind`.
- Canvas objects: `StoryTextObject` (typography, background style, border, translations, timeline timing, keyframes; custom Codable with legacy `content`→`text`, `textSize`→`fontSize`, `displayDuration`→`duration` migration), `StoryTextBackgroundStyle` (tagged-union: none/solid/glass), `StoryMediaObject` (aspectRatio, anchor, isBackground, loop, zIndex, keyframes), `StoryAudioPlayerObject` (waveform samples, background-audio variants), `StoryAudioVariant`, `StorySticker`, `StoryKeyframe` (x/y/scale/opacity/easing).
- `StoryEffects` — composite slide effects (background, filter, audio, voice transcriptions, transitions, canvas object arrays, thumbHash, backgroundTransform, clipTransitions; deprecated `music*` aliases). Has resolution helpers `resolvedBackgroundMedia`, `resolvedForegroundMediaObjects`, `resolvedBackgroundAudio` (synthesizes a virtual background audio from legacy fields), `resolvedForegroundAudioPlayers`, `migrateLegacyText`, `toJSON()`.
- `StorySlide` (`effectiveSlideDuration()` rounds up to full loop cycles), `StoryItem` (computed `timeAgo`/`isPublic`/`resolvedContent`), `StoryGroup` (`CacheIdentifiable`, `hasUnviewed`/`latestStory`), `StatusEntry` (`CacheIdentifiable`, `timeRemaining`/`timeAgo`).
- Conversions: `[APIPost].toStoryGroups(currentUserId:)` (groups STORY posts by author, sorts by unviewed-first then recency, current user first), `APIPost.toStatusEntry()`, `StorySlide.toPreviewStoryItem()`, `StoryItem.toRenderableSlide()`.
- Request models: `ReactionRequest`, `RepostRequest`, `StatusCreateRequest`, `StoryViewRequest`.
- **Command pattern:** `protocol EditCommand`, `enum EditCommandError`, `TimelineProject` (snapshot, round-trip safe with nil-vs-empty-array idempotence), 12 commands: `AddClipCommand`, `DeleteClipCommand`, `MoveClipCommand`, `TrimClipCommand`, `SplitClipCommand`, `AddTransitionCommand`, `RemoveTransitionCommand`, `ChangeTransitionCommand`, `AddKeyframeCommand`, `MoveKeyframeCommand`, `DeleteKeyframeCommand`, `SetClipPropertyCommand` (nested `ClipProperty` tagged-union), and `AnyEditCommand` type-erased Codable wrapper.

**Key behaviors / algorithms:**
- Extensive **backward-compat decoding** — legacy field renames, optional→non-optional promotion with fallbacks, anchor stored as nested `{x,y}`.
- Prisme resolution on `StoryTextObject.resolvedText`, `StoryAudioPlayerObject.resolvedPostMediaId`, `StoryItem.resolvedContent`.
- `effectiveSlideDuration()` — rounds slide duration up to the next integer multiple of a looping background video's duration so loops never freeze mid-cycle.
- Undo/redo: each command captures the minimum delta + reverse-snapshot; `apply`/`revert` mutate `TimelineProject`; commands throw `EditCommandError` on stale state. `mutateKeyframes` normalizes empty arrays to `nil` for byte-equal round-trip.
- `StoryEasing.apply` implements linear / quadratic ease-in / ease-out / ease-in-out curves.
- `needsVideoExport` (see next file) decides poster-image vs baked video export.

**Dependencies & couplings:** `FeedMedia`, `APIPost`, `APIAuthor`, `ReplyReference`, `DynamicColorGenerator`, `Calendar`, `CoreGraphics` (`CGPoint`/`CGFloat`).

**Android-port note:** This is the **single most complex porting target** in this chunk. Map canvas objects to Kotlin data classes; `CGPoint`→Compose `Offset` (use normalized 0..1 Doubles, not pixels). The undo/redo Command pattern ports cleanly to a Kotlin sealed `interface EditCommand` + sealed-class commands; `AnyEditCommand` tagged-union → `kotlinx.serialization` polymorphic serializer (`@SerialName` discriminator). Core Image `CIFilter` names have no Android equivalent — the story renderer (RenderScript is deprecated; use GPU shaders / `RuntimeShader` on API 33+, or a library like GPUImage / media3 effects) must reimplement vintage/bw/warm/etc. Background audio synthesis from legacy fields and the loop-aware `effectiveSlideDuration` math must be preserved. Story video export = ExoPlayer/Media3 `Transformer` pipeline. Keep backward-compat decoders so drafts persisted by older clients still parse.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/StorySlide+ExportTrigger.swift

**Purpose:** Computed property deciding whether a slide needs a baked video export vs a static poster image.

**Public API surface:** `StorySlide.needsVideoExport: Bool`.

**Key behaviors:** Returns true if the slide has any time-evolving element: background video media, background/voice audio, animated keyframes on text or media, clip transitions, or an opening reveal/fade. Static slides (text + stickers + image only) skip the export pipeline.

**Android-port note:** Direct Kotlin extension function. This gating optimization (skip Media3 Transformer for static slides) is worth preserving for battery/CPU.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/ThreadModels.swift

**Purpose:** Message-thread (replies) container.

**Public API surface:** `struct ThreadData` (parent `APIMessage`, replies `[APIMessage]`, totalCount).

**Android-port note:** Trivial Kotlin data class.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/TrackingLinkModels.swift

**Purpose:** Marketing/affiliate tracking-link models (UTM-style).

**Public API surface:** `TrackingLink` (`CacheIdentifiable`; computed `displayName`), `TrackingLinkClick`, `TrackingLinkDetail`, `TrackingLinkStats` (`CacheIdentifiable`, fixed `id`), `CreateTrackingLinkRequest` (Encodable).

**Android-port note:** Kotlin data classes. Backs a tracking-link management feature (campaign/source/medium analytics, click breakdown by geo/device/browser).

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/TranscriptionModels.swift

**Purpose:** Audio transcription + translated-audio domain models.

**Public API surface:** `MessageTranscriptionSegment` (`Identifiable`, UUID id), `MessageTranscription` (text, language, confidence, segments, speakerCount), `MessageTranslatedAudio` (url, transcription, format, cloned flag, voiceModelId, ttsModel, segments).

**Android-port note:** Kotlin data classes. `MessageTranslatedAudio.cloned` indicates voice-clone TTS output. Segments support per-speaker / time-aligned transcript display.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/UserModels.swift

**Purpose:** Profile update + contact-change (email/phone) request/response models.

**Public API surface:** `UpdateProfileRequest`/`Response`, `ChangeEmailRequest`/`Response`, `VerifyEmailChangeRequest`/`Response`, `ChangePhoneRequest`/`Response`, `VerifyPhoneChangeRequest`/`Response`.

**Key behaviors:** `UpdateProfileRequest` carries the three content-language fields (`systemLanguage`, `regionalLanguage`, `customDestinationLanguage`) — the Prisme-Linguistique resolution inputs. Email/phone changes are two-step (request → verify with token/code, pending value tracked).

**Android-port note:** Kotlin data classes. The two-step email/phone verification flow needs matching Android UI. Profile language fields drive content translation — never use device locale for these.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/UserNotificationPreferences+Filter.swift

**Purpose:** Client-side notification filtering — `FocusFilterSnapshot` + extension on `UserNotificationPreferences` that decides whether a notification should surface.

**Public API surface:**
- `struct FocusFilterSnapshot` (allow flags for DM/group/mentions/reactions/social/calls + `isActive`; static `permissive`; method `allows(type:isDirectConversation:)`).
- `UserNotificationPreferences.allowsNotification(type:isDirectConversation:focus:now:)`, `.isTypeEnabled(_:)`, `.isInDoNotDisturbWindow(now:)`.

**Key behaviors:**
- `allowsNotification` gate chain: `pushEnabled` → not in DND window → per-type toggle enabled → passes Focus filter.
- `isInDoNotDisturbWindow` — parses `HH:mm` start/end, **correctly handles midnight-wrapping windows** (22:00→08:00 split into two intervals); honors `dndDays` (empty = every day); uses device clock / local timezone.
- `isTypeEnabled` — maps each of ~80 notification types to its preference toggle.

**Android-port note:** Port the DND midnight-wrapping logic verbatim with `java.time.LocalTime`. iOS Focus filters have **no direct Android equivalent** — Android has Do Not Disturb / Notification Channels / Bedtime mode. Map `FocusFilterSnapshot` to reading Android's `NotificationManager.currentInterruptionFilter` or simply drop the Focus concept and rely on Android notification channels + the app's own DND prefs. The per-type → channel mapping is natural on Android (one `NotificationChannel` per category).

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/UserRelationshipState.swift

**Purpose:** Single source of truth for "how does the current user relate to another user?" — combines friendship + block state.

**Public API surface:**
- `enum UserRelationshipState` (current / blocked / connected / pendingSent(requestId) / pendingReceived(requestId) / none; computed `isPending`).
- `@MainActor final class UserRelationshipResolver` — `init` with injectable `FriendshipCache`, `BlockServiceProviding`, `currentUserIdProvider`; static `.shared`; `resolve(userId:) -> UserRelationshipState`.

**Key behaviors:** `resolve` precedence: current user → blocked → friendship-cache status. Synchronous (both stores are in-memory) — safe to call on every render.

**Dependencies & couplings:** `FriendshipCache`, `BlockService`/`BlockServiceProviding`, `AuthManager`.

**Android-port note:** Kotlin sealed class for the state. `UserRelationshipResolver` → a Kotlin class with constructor DI, or a Hilt-injected singleton. `@MainActor` → just ensure it reads main-thread state; on Android make it a plain class consuming `StateFlow`s from the friendship/block repositories.

---

## packages/MeeshySDK/Sources/MeeshySDK/Models/VoiceProfileModels.swift

**Purpose:** Voice-cloning consent + voice-profile (sample recording) models.

**Public API surface:** `VoiceConsentStatus`, `VoiceConsentRequest`/`Response`, `VoiceProfile` (`Identifiable`; computed `isReady`/`totalDurationSeconds`), `enum VoiceProfileStatus` (pending/processing/ready/failed/expired), `VoiceSample`, `VoiceSampleUploadResponse`, `enum VoiceProfileWizardStep` (consent/ageVerification/recording/processing/complete), `VoiceCloningToggleRequest`, `VoiceProfileDeleteResponse` (GDPR delete).

**Key behaviors:** Voice cloning is consent-gated + age-verified. The wizard is a 5-step flow. GDPR delete returns count of samples deleted.

**Android-port note:** Kotlin data classes + enums. The recording wizard needs Android audio-capture (`MediaRecorder` / `AudioRecord`) and runtime mic permission. Consent + age verification gating is legally significant — preserve exactly.

---

## packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift

**Purpose:** The SDK's generic async/await HTTP client with certificate pinning, retry, token refresh, and the unified response envelope types.

**Public API surface:**
- Response envelopes: `APIResponse<T>`, `SimpleAPIResponse`, `PaginatedAPIResponse<T>`, `OffsetPaginatedAPIResponse<T>`, `CursorPagination`, `OffsetPagination`.
- `enum APIError` (`LocalizedError`).
- `protocol APIClientProviding` — `baseURL`, `authToken`, `anonymousSessionToken`, `request`, `requestWithHeaders`, `paginatedRequest`, `offsetPaginatedRequest`, `post`/`put`/`patch`/`delete`. Protocol extension supplies many convenience overloads + a default `requestWithHeaders`.
- `final class APIClient` (`.shared` singleton) and `CertificatePinningDelegate`.

**Key behaviors / algorithms:**
- **Certificate pinning:** `CertificatePinningDelegate` validates server trust against the pinned host (`gate.meeshy.me`).
- **Retry:** retryable status codes `{429, 503}`, max 3 attempts; honors `Retry-After` header (capped 30s) else exponential backoff `2^attempt`. `/signal/*` endpoints are opted OUT of retry (503 there is permanent).
- **Auth:** sends `Authorization: Bearer` if `authToken`, else `X-Session-Token` if anonymous. On 401 → calls `AuthManager.handleUnauthorized()` and throws `MeeshyError.auth(.sessionExpired)`. On 403 → `MeeshyError.forbidden` (NOT a logout signal). 
- **Date decoding:** custom strategy tries ISO8601 with fractional seconds, then without.
- HTTP/3 optimistic upgrade via `assumesHTTP3Capable = true` per-request.
- Injects `ClientInfoProvider` headers (version/device/locale/geo) on every request.
- `requestWithHeaders` lets the offline outbox inject `X-Client-Mutation-Id` for gateway-side dedup.
- Slow-request logging (>1000ms) including query string.
- Detailed `DecodingError` diagnostics logged with endpoint + method.

**Dependencies & couplings:** `MeeshyConfig`, `MeeshyError`, `AuthManager`, `ClientInfoProvider`, `Security` framework.

**Android-port note:** Use **OkHttp + Retrofit** (or Ktor). Certificate pinning → OkHttp `CertificatePinner`. Retry with `Retry-After` → an OkHttp `Interceptor` (or `Authenticator` for 401). Custom date parsing → a Moshi/kotlinx adapter trying both ISO8601 forms. 401→logout / 403→forbidden distinction must be preserved (an `Authenticator` + error mapper). `X-Client-Mutation-Id` header injection for the offline outbox is important — keep it. Dual-auth (Bearer vs `X-Session-Token`) → an interceptor reading from an auth-state holder. HTTP/3 is automatic with OkHttp 5 / Cronet.

---

## packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift

**Purpose:** Builds per-request client-identification HTTP headers (version, build, platform, device, OS, locale, timezone, country, optional city/region geo).

**Public API surface:** `actor ClientInfoProvider` (`.shared`), `buildHeaders() async -> [String: String]`.

**Key behaviors:** Static headers (version/build/platform/device/OS) cached for session lifetime. Locale/timezone/country built fresh per call. Geo enrichment is **passive** — checks `CLLocationManager.authorizationStatus` without ever requesting permission; reverse-geocodes the last known location; caches city/region for 1h. Geocoding failures silently ignored (geo headers optional).

**Dependencies & couplings:** `CoreLocation`, `MeeshyConfig` (indirectly), `Bundle`, `utsname`.

**Android-port note:** A Kotlin object/class building headers. Device model = `Build.MODEL`/`Build.MANUFACTURER`; OS = `Build.VERSION.RELEASE`; version/build from `PackageInfo` / `BuildConfig`. Locale = `Locale.getDefault()`; timezone = `TimeZone.getDefault()`. Passive geo: check `ContextCompat.checkSelfPermission(ACCESS_*_LOCATION)` without requesting; use `FusedLocationProviderClient.lastLocation` + `Geocoder`. Keep the 1h geo cache + session-static-header cache.

---

## packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift

**Purpose:** Reactive network reachability + connection-type observation.

**Public API surface:** `protocol NetworkMonitorProviding` (`isOnline`), `final class NetworkMonitor` (`ObservableObject`, `.shared`; `@Published isOffline`, `connectionType`; `enum ConnectionType` wifi/cellular/wired/unknown; `isOnline` convenience).

**Key behaviors:** Uses `NWPathMonitor` on a utility queue; publishes `isOffline`/`connectionType` on the main queue. `isOnline` readable from any actor context (protocol is `Sendable`, not `@MainActor`).

**Android-port note:** Use `ConnectivityManager.NetworkCallback` (API 24+) exposed as a `StateFlow<Boolean>` + `StateFlow<ConnectionType>`. The protocol seam → a Kotlin interface for testability. `ConnectionType` maps from `NetworkCapabilities.TRANSPORT_WIFI`/`TRANSPORT_CELLULAR`/`TRANSPORT_ETHERNET`.

---

## packages/MeeshySDK/Sources/MeeshySDK/Networking/SocketConfig.swift

**Purpose:** Trivial Socket.IO base-URL provider.

**Public API surface:** `enum SocketConfig` with static `baseURL: URL?` (from `MeeshyConfig.shared.socketBaseURL`).

**Android-port note:** A single const/property derived from config. Android Socket.IO client = `io.socket:socket.io-client`.

---

## packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadCheckpointStore.swift

**Purpose:** Thread-safe GRDB-backed persistence of resumable-upload (TUS) checkpoints.

**Public API surface:** `actor TusUploadCheckpointStore` (`.shared` wraps `AppDatabase.shared.databaseWriter`; `init(pool:)` for tests). Methods: `find`, `save` (insert-or-replace), `updateOffset`, `delete`, `purgeStale(maxAgeDays: 2)`, `allCheckpoints` (test-only).

**Key behaviors:** All writes serialized through the actor so concurrent PATCH callbacks can't race on `byteOffset`. Read failures return `nil` (fall through to fresh upload, no retry budget burned). `purgeStale` GCs checkpoints older than 48h.

**Dependencies & couplings:** GRDB, `AppDatabase`, `TusUploadCheckpoint` (GRDB record).

**Android-port note:** Use **Room** — a `TusUploadCheckpoint` entity + DAO. Actor serialization → Room runs on a background dispatcher; use suspend DAO functions. `purgeStale` → a periodic `WorkManager` job or a startup cleanup call.

---

## packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift

**Purpose:** Resumable chunked file upload via the TUS protocol with checkpoint-based resume, background-task continuation, and progress streaming.

**Public API surface:**
- `enum UploadFileStatus` (queued/uploading/complete/error/paused), `FileUploadProgress`, `UploadQueueProgress`, `TusResumeRetriableError`, `TusUploadResult` (Decodable; `toMessageAttachment(uploadedBy:)`).
- `actor TusUploadManager` — `init(baseURL:)`, `uploadFile(...)`, `uploadFiles(...)`, `progressPublisher`.

**Key behaviors / algorithms:**
- 10 MB chunks, max 3 concurrent uploads, internal queue + `CheckedContinuation`.
- **Checkpoint key = SHA-256 of file bytes** (streamed in 64 KiB chunks inside `autoreleasepool` to keep RSS bounded — required for 200-500 MB videos in suspended-app contexts). Same bytes → same key → resume after app kill.
- Resume: looks up checkpoint by key; if `fileSize` matches, resumes from stored `byteOffset`; else POSTs a fresh `api/v1/uploads` session (TUS `Upload-Length`/`Upload-Metadata` base64 headers incl. filename, filetype, uploadcontext, thumbhash).
- PATCH loop: `application/offset+octet-stream`, persists offset to the checkpoint store after each chunk. Handles 204/200 (advance), **409** (HEAD-recover server offset and realign), **404/410** (session GC'd → delete checkpoint, throw `TusResumeRetriableError`).
- Last chunk's response body carries the attachment metadata (`onUploadFinish` hook) → decoded into `TusUploadResult`.
- `withBackgroundTask` wraps uploads in `beginBackgroundTask`/`endBackgroundTask` so they survive backgrounding.
- Progress streamed via Combine `PassthroughSubject`.

**Dependencies & couplings:** `TusUploadCheckpointStore`, `TusUploadCheckpoint`, `MeeshyMessageAttachment`, `UIKit` (background task), `CryptoKit` (SHA-256).

**Android-port note:** Implement TUS directly with OkHttp (or use the `tus-android-client` library, though the bytewise SHA-256 checkpoint-key + 64KiB streaming should be kept). Background continuation → **WorkManager** with a `CoroutineWorker` (and a foreground-service notification for large uploads). Concurrency limiter → a `Semaphore(3)` + coroutine `Channel` queue. Progress → a `Flow<UploadQueueProgress>`. The 409 HEAD-recover and 404/410 fresh-session restart logic is essential — port verbatim. SHA-256 streaming with bounded memory maps to a `DigestInputStream` over 64KiB buffers.

---

## packages/MeeshySDK/Sources/MeeshySDK/Notifications/MeeshyMetricsSubscriber.swift

**Purpose:** MetricKit subscriber that aggregates `MXSignpostMetric` performance signposts (24h rolling window) from hot-path subsystems like `TimelineSignposter`.

**Public API surface:** `final class MeeshyMetricsSubscriber` (`.shared`), nested `SignpostMetricInput` / `Aggregate`, `trackedCategories` allowlist (default `["TimelineEngine"]`), `register(with:)` / `unregister(from:)` (`@MainActor`, idempotent), `consume(signpostMetrics:)` (testable seam), `resetAggregates`, `aggregates`.

**Key behaviors:** MetricKit only aggregates signposts when an `MXMetricManagerSubscriber` is registered. `didReceive` extracts signpost metrics, filters by `trackedCategories`, stores `Aggregate`s in a lock-protected (`OSAllocatedUnfairLock`) store. Payloads land ~once/24h on a background queue.

**Android-port note:** No direct equivalent. Android performance telemetry = **Jetpack Macrobenchmark** (dev-time) or **Firebase Performance Monitoring** / custom traces (`androidx.tracing`) in production. This is observability infrastructure, low priority — port only if the team wants production perf aggregation. The signpost convention itself doesn't carry over.

---

## packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationCoordinator.swift

**Purpose:** Single source of truth keeping the iOS app-icon badge, home/lock widgets, and in-app notification bell in sync. Subscribes to socket events globally.

**Public API surface:**
- `@MainActor protocol NotificationWidgetSink` (publishConversations / publishUnreadCount / publishFavoriteContacts / reloadTimelines).
- `@MainActor final class NotificationCoordinator` (`.shared`) — `@Published conversationUnreadTotal`, `conversationUnreadCounts`, `inAppNotificationUnread`, `isRunning`; `badgeTotal`. Methods: `start`, `reset`, `registerConversations` (non-authoritative seed), `reconcileConversationUnreads` / `replaceConversations` (authoritative replace), `removeConversation`, `applyConversationUnread` (socket-authoritative), `markConversationRead` (optimistic), `applyInAppNotificationCounts`, `setInAppNotificationUnread`, `increment`/`decrementInAppNotificationUnread`, `syncNow`.
- `protocol NotificationBadgeWriting` + `SystemNotificationBadgeWriter`.

**Key behaviors:** Carefully documented **authority model** — socket `conversation:unread-updated` and `markConversationRead` are authoritative; `registerConversations` only seeds counts for never-seen conversations (must not regress a socket-owned count). Badge + widget writes are **debounced 150ms** so socket bursts don't hammer the system. Subscribes to `MessageSocketManager.unreadUpdated` and `notificationCounts`.

**Dependencies & couplings:** `MessageSocketManager`, `MeeshyConversation`, App Group `UserDefaults` (`group.me.meeshy.apps`), `UNUserNotificationCenter`.

**Android-port note:** Port as a Kotlin singleton (Hilt) exposing `StateFlow`s. App-icon badge → there is **no universal Android badge API**; use notification-dot badges via `NotificationChannel` or launcher-specific `ShortcutBadger`-style libs (unreliable) — most Android apps just rely on the notification itself. **Widgets** → Glance / `AppWidgetProvider`; the App Group shared-defaults pattern → a shared `DataStore`/`ContentProvider` the widget reads. Debounced sync → a `debounce` operator on a `Flow` or a coroutine `Job` with delay. The authority model (socket-wins vs seed) is important business logic — preserve it.

---

## packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationManager.swift

**Purpose:** High-level orchestrator for in-app notifications — toast/transient UI, active-conversation tracking (suppresses self-toasts), and unread-count mirroring (delegated to `NotificationCoordinator`).

**Public API surface:** `@MainActor final class NotificationManager` (`.shared`) — `@Published unreadCount` (mirrored), `currentToast: SocketNotificationEvent?`, `activeConversationId`; `newNotificationReceived` / `notificationMarkedRead` / `notificationWasDeleted` PassthroughSubjects; `focusFilterProvider` hook. Methods: `refreshUnreadCount`, `onConversationOpened`/`onConversationClosed`, `dismissToast`, `markAllAsRead`, `reset`.

**Key behaviors:**
- Toast auto-dismiss after 7s. Toast suppressed if the notification's `conversationId == activeConversationId`.
- On `notification:new`: keeps `FriendshipCache` in sync for friendRequest/friendAccepted events (also invalidates persisted GRDB friend caches), always increments the coordinator's unread count (server-authoritative), then shows a toast **only if** `UserNotificationPreferences.allowsNotification(...)` passes — using the injected Focus filter.
- Unread count is mirrored from `NotificationCoordinator.inAppNotificationUnread` via Combine `assign`.

**Dependencies & couplings:** `NotificationCoordinator`, `NotificationService`, `MessageSocketManager`, `UserPreferencesManager`, `FriendshipCache`, `SocketNotificationEvent`, `FocusFilterSnapshot`.

**Android-port note:** Kotlin singleton exposing `StateFlow<SocketNotificationEvent?>` for the toast and `SharedFlow`s for the marked-read/deleted events. In-app toast = a Compose `Snackbar` / custom overlay (NOT a system notification — system notifications are for backgrounded state). Active-conversation suppression and the prefs/Focus gating must be preserved. Friendship-cache sync on socket events → repository invalidation.

---

## packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushDeliveryReceiptService.swift

**Purpose:** Emits delivery acknowledgements ("double-check" cursor in the sender's UI) when a silent push surfaces a message not yet synced; queues failed receipts for retry.

**Public API surface:** `protocol PushReceipting` (`ack(conversationId:messageId:)`, `flushPending()`), `final class PushDeliveryReceiptService` (`.shared`), nested `Dependencies` (injectable `markAsReceived` / `isAuthenticated`; `.live` wires `ConversationService`), test hooks `_setDependencies` / `_pendingCount`.

**Key behaviors:** `ack` calls the idempotent REST `mark-as-received` endpoint; on failure (offline/5xx/timeout) or not-authenticated, persists a `PendingReceipt` to `UserDefaults` (queue capped at 200, dedup per conversation, FIFO drop-oldest). `flushPending` (called on foreground resume / reconnect) retries all queued receipts; failures re-prepended to the head preserving order. `NSLock` used synchronously (never held across `await`).

**Dependencies & couplings:** `ConversationService`, `APIClient` (auth check), `UserDefaults`.

**Android-port note:** Kotlin class implementing a `PushReceipting` interface, DI via constructor/Hilt. Silent-push handling → an FCM `FirebaseMessagingService` data message (`onMessageReceived`). The persistent retry queue → `DataStore` or a small Room table; flush on app-foreground (`ProcessLifecycleOwner`) and on socket reconnect. Coroutine `Mutex` replaces `NSLock`. The 200-item cap + per-conversation dedup + order-preserving re-prepend are worth keeping.

---

## Architecture observations

### Portable user-facing features / capabilities
- [ ] Real-time messaging with replies, forwards, reactions, pin, edit, delete (soft-delete via `deletedAt`)
- [ ] Ephemeral / view-once / blurred messages and message effect flags (bitmask)
- [ ] End-to-end delivery & read receipts (per-message delivery/read counts + status)
- [ ] Multi-language message & post translation (Prisme Linguistique auto-resolution)
- [ ] Audio transcription + translated-audio (voice-clone TTS) with time-aligned speaker segments
- [ ] Social feed: posts, comments, reposts/quotes, media (image/video/audio/document)
- [ ] Stories: full canvas editor (text/media/audio/sticker objects, filters, transitions, keyframe animation)
- [ ] Story timeline editor with undo/redo (12 command types)
- [ ] Story / status (mood) posts with 21h expiry and viewer tracking
- [ ] Voice profile / voice cloning with consent + age-verification wizard (GDPR delete)
- [ ] Anonymous share-link join flow (no account; configurable requirements)
- [ ] Authenticated share-link management + tracking links (UTM campaign analytics)
- [ ] Comprehensive notification system (~80 types) with toast UI, badge, widgets
- [ ] Notification preferences: per-type toggles, Do-Not-Disturb windows (midnight-wrapping), Focus-filter integration
- [ ] User relationship state (friend / pending / blocked) unified resolution
- [ ] Resumable chunked file upload (TUS) surviving app kill / backgrounding
- [ ] Offline-resilient push delivery receipts
- [ ] Profile editing incl. content-language settings; two-step email/phone change
- [ ] Network reachability awareness; client telemetry headers

### State management & SWR
- Singletons everywhere (`.shared`): `APIClient`, `NotificationCoordinator`, `NotificationManager`, `UserRelationshipResolver`, `TusUploadManager`-style. On Android prefer Hilt-injected singletons over global statics for testability.
- `@Published`/`ObservableObject` + Combine `PassthroughSubject` → Android `StateFlow`/`SharedFlow`.
- **Authority model in `NotificationCoordinator`** is the standout pattern: socket events are authoritative; cache/REST snapshots only *seed* never-seen entries and must never regress a socket-owned value. This prevents stale-cache badge regressions — port the exact precedence rules.
- Cache-identity via `CacheIdentifiable` (`id: String`); some single-row caches use a constant id (`"current"`, `"stats"`).

### Concurrency
- Swift `actor`s for thread-safe state: `ClientInfoProvider`, `TusUploadCheckpointStore`, `TusUploadManager`. → Kotlin: coroutine dispatchers + `Mutex`, or Room's built-in serialization.
- `@MainActor` isolation on UI-facing managers → Android: confine to main dispatcher / expose immutable `StateFlow`.
- `OSAllocatedUnfairLock` / `NSLock` used carefully (never across `await`) → Kotlin `Mutex`.
- `EventEmitter`/socket listeners — CLAUDE.md warns `emit()` doesn't await; Android socket-event handlers must catch exceptions.

### Resilient decoding (critical to preserve)
- Pervasive defensive decoding: `id`/`_id` fallback, `decodeIfPresent ?? .defaults`, legacy field renames (`content`→`text`, `textSize`→`fontSize`, `displayDuration`→`duration`), optional→non-optional promotion with fallbacks, `extras: [CodableValue]` for forward-compat. → Android: `kotlinx.serialization` with `coerceInputValues = true`, default values, `@JsonNames` for aliases, and custom serializers for `id`/`_id`. **Do not port a brittle strict parser** — old clients persist drafts and the gateway evolves.

### Performance techniques worth carrying over
- TUS SHA-256 checkpoint key streamed in 64 KiB chunks with bounded RSS — essential for large-video uploads under OS memory pressure.
- HTTP/3 optimistic upgrade; retry with `Retry-After`; `/signal/*` retry opt-out.
- Badge/widget write debouncing (150ms).
- `effectiveSlideDuration` loop-completion math (no partial-cycle freeze).
- Static `StorySlide.needsVideoExport` gate to skip the export pipeline for static slides.
- Session-static + 1h-TTL geo header caching.

### Anti-patterns / tech debt — do NOT carry over
- **Tokens in `UserDefaults`** (per `MeeshySDK/CLAUDE.md` — known debt; must migrate to Keychain). Android: store auth tokens in **EncryptedSharedPreferences / Jetpack Security** or Android Keystore — never plain SharedPreferences.
- French display strings hard-coded inside model types (`APINotification.formattedTitle/Body`) — move to Android string resources for proper i18n; prefer server-supplied `content`.
- Heavy reliance on global mutable singletons with `@unchecked Sendable` — replace with proper DI (Hilt) on Android.
- `iso8601` JSON coder helpers duplicated per-file (in `PushDeliveryReceiptService`) — centralize one serializer config on Android.
- iOS-specific concepts with no Android analog (MetricKit signposts, App Group defaults, iOS Focus filters, app-icon badge) — re-architect rather than force-port: Firebase Performance, DataStore/ContentProvider sharing, Notification Channels + system DND.
