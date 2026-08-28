# Meeshy SDK Layer Inventory — Native Android Port

**Date**: May 2026  
**Reference**: iOS SDK at `/home/user/meeshy/packages/MeeshySDK` and shared types at `/home/user/meeshy/packages/shared`

---

## 1. Services Layer (32 Services)

All services are singletons with async/await APIs.

### Conversation Services
- [ ] **ConversationService** — Conversation CRUD, pagination (cursor + offset)
  - `list(offset, limit)` → `GET /conversations`
  - `listPage(cursor?, limit, currentUserId)` — cursor pagination
  - `getById(conversationId)` → `GET /conversations/:id`
  - `create(type, title?, participantIds)` → `POST /conversations`
  - `delete(conversationId)` → `DELETE /conversations/:id`
  - `update(id, title?, description?, avatar?, banner?, defaultWriteRole?, isAnnouncementChannel?, slowModeSeconds?, autoTranslateEnabled?)` → `PUT /conversations/:id`
  - `markRead(conversationId)` → `PATCH /conversations/:id/read`
  - `markAsReceived(conversationId)` → `PATCH /conversations/:id/received`
  - `markUnread(conversationId)` → `PATCH /conversations/:id/unread`
  - `deleteForMe(conversationId)` → `DELETE /conversations/:id/for-me`
  - `leave(conversationId)` → `POST /conversations/:id/leave`
  - `getParticipants(conversationId, limit?, cursor?)` → `GET /conversations/:id/participants`
  - `removeParticipant(conversationId, participantId)` → `DELETE /conversations/:id/participants/:pid`
  - `updateParticipantRole(conversationId, participantId, role)` → `PATCH /conversations/:id/participants/:pid/role`
  - `banParticipant(conversationId, userId)` → `POST /conversations/:id/ban/:uid`
  - `unbanParticipant(conversationId, userId)` → `POST /conversations/:id/unban/:uid`
  - `listSharedWith(userId, limit?)` → `GET /users/:id/conversations`
  - `findDirectWith(userId)` → `GET /conversations/direct/:id`

- [ ] **ConversationAnalysisService**
  - `fetchAnalysis(conversationId)` → `GET /conversations/:id/analysis`
  - `fetchStats(conversationId)` → `GET /conversations/:id/stats`
  - `save(text, conversationId)` — local cache
  - `draft(conversationId)` — local read
  - `clear(conversationId)` — local cache clear

### Message Services
- [ ] **MessageService** — Message CRUD, search, pagination
  - `list(conversationId, offset?, limit?, includeReplies?)` → `GET /conversations/:cid/messages`
  - `listBefore(conversationId, before, limit?, includeReplies?)` — cursor pagination (before)
  - `listAround(conversationId, around, limit?, includeReplies?)` — cursor pagination (around)
  - `send(conversationId, SendMessageRequest)` → `POST /conversations/:cid/messages`
  - `edit(messageId, content)` → `PUT /messages/:id`
  - `delete(conversationId, messageId)` → `DELETE /conversations/:cid/messages/:mid`
  - `pin(conversationId, messageId)` → `PUT /conversations/:cid/messages/:mid/pin`
  - `unpin(conversationId, messageId)` → `DELETE /conversations/:cid/messages/:mid/pin`
  - `consumeViewOnce(conversationId, messageId)` → `POST /conversations/:cid/messages/:mid/consume`
  - `search(conversationId, query, limit?)` → `GET /conversations/:cid/messages/search`
  - `searchWithCursor(conversationId, query, cursor)` — full-text search with pagination

### Attachment & Media Services
- [ ] **AttachmentService**
  - `requestTranscription(attachmentId)` → `POST /attachments/:id/transcribe`
  - `getStatusDetails(attachmentId)` → `GET /attachments/:id/status`
  - `delete(attachmentId)` → `DELETE /attachments/:id`

- [ ] **LinkPreviewFetcher**
  - `metadata(for urlString: String)` → fetches Open Graph from URL

### Post & Feed Services
- [ ] **PostService** — Posts, stories, bookmarks, comments, reactions
  - `getFeed(cursor?, limit?)` → `GET /posts/feed`
  - `getPost(postId)` → `GET /posts/:id`
  - `create(content?, type, visibility, moodEmoji?, mediaIds?, audioUrl?, audioDuration?, originalLanguage?, mobileTranscription?, repostOfId?)` → `POST /posts`
  - `update(postId, content?, visibility?, moodEmoji?)` → `PATCH /posts/:id`
  - `delete(postId)` → `DELETE /posts/:id`
  - `like(postId)` → `POST /posts/:id/like`
  - `unlike(postId)` → `DELETE /posts/:id/like`
  - `bookmark(postId)` → `POST /posts/:id/bookmark`
  - `removeBookmark(postId)` → `DELETE /posts/:id/bookmark`
  - `getBookmarks(cursor?, limit?)` → `GET /posts/bookmarks`
  - `getComments(postId, cursor?, limit?)` → `GET /posts/:id/comments`
  - `addComment(postId, content, parentId?, effectFlags?)` → `POST /posts/:id/comments`
  - `likeComment(postId, commentId)` → `POST /posts/:id/comments/:cid/like`
  - `repost(postId, targetType?, content?, isQuote)` → `POST /posts/:id/repost`
  - `share(postId)` → `POST /posts/:id/share`
  - `createStory(content?, storyEffects?, visibility, originalLanguage?, mediaIds?, repostOfId?)` → `POST /posts` (type=STORY)
  - `createWithType(type, content, visibility, moodEmoji?, storyEffects?)` → `POST /posts`
  - `requestTranslation(postId, targetLanguage)` → `POST /posts/:id/translate`
  - `pinPost(postId)` → `POST /posts/:id/pin`
  - `unpinPost(postId)` → `DELETE /posts/:id/pin`
  - `viewPost(postId, duration?)` → `POST /posts/:id/view`
  - `getPostViews(postId, limit, offset)` → `GET /posts/:id/views`
  - `getUserPosts(userId, cursor?, limit?)` → `GET /users/:id/posts`
  - `getCommentReplies(postId, commentId, cursor?, limit?)` → `GET /posts/:id/comments/:cid/replies`
  - `getCommunityPosts(communityId, cursor?, limit?)` → `GET /communities/:id/posts`
  - `recordImpressions(postIds, source)` → `POST /posts/impressions`

- [ ] **StoryService** — Stories lifecycle
  - `list()` → `GET /stories`
  - `get(storyId)` → `GET /stories/:id`
  - `create(...)` → `POST /stories`
  - `update(storyId, ...)` → `PATCH /stories/:id`
  - `delete(storyId)` → `DELETE /stories/:id`
  - `markViewed(storyId)` → `POST /stories/:id/viewed`
  - `react(storyId, emoji)` → `POST /stories/:id/reactions`
  - `unreact(storyId, emoji)` → `DELETE /stories/:id/reactions/:emoji`

- [ ] **StatusService** — User statuses/moods
  - `list(mode, cursor?, limit?)` → `GET /statuses`
  - `create(moodEmoji, content?, visibility, visibilityUserIds?, viaUsername?)` → `POST /statuses`
  - `delete(statusId)` → `DELETE /statuses/:id`
  - `react(statusId, emoji)` → `POST /statuses/:id/reactions`

- [ ] **ReactionService**
  - `add(messageId, emoji)` → `POST /messages/:id/reactions`
  - `remove(messageId, emoji)` → `DELETE /messages/:id/reactions/:emoji`
  - `requestSync(messageId)` → `GET /messages/:id/reactions` (full sync)

### User & Auth Services
- [ ] **UserService** — User profile, search, updates
  - `search(query, limit?, offset?)` → `GET /users/search`
  - `searchUsers(query, limit?, offset?)` → `GET /users/search` (with query items)
  - `getProfile(idOrUsername)` → `GET /users/profile/:identifier`
  - `getPublicProfile(username)` → `GET /users/public/:username`
  - `getProfileById(id)` → `GET /users/:id`
  - `getProfileByEmail(email)` → `GET /users/by-email/:email`
  - `getProfileByPhone(phone)` → `GET /users/by-phone/:phone`
  - `updateProfile(UpdateProfileRequest)` → `PATCH /users/me`
  - `updateAvatar(url)` → `PATCH /users/me/avatar`
  - `updateBanner(url)` → `PATCH /users/me/banner`
  - `uploadImage(imageData, filename)` → `POST /attachments/upload` (multipart)
  - `changeEmail(ChangeEmailRequest)` → `POST /users/me/email`
  - `verifyEmailChange(VerifyEmailChangeRequest)` → `POST /users/me/email/verify`
  - `resendEmailChangeVerification()` → `POST /users/me/email/resend`
  - `changePhone(ChangePhoneRequest)` → `POST /users/me/phone`
  - `verifyPhoneChange(VerifyPhoneChangeRequest)` → `POST /users/me/phone/verify`
  - `getUserStats(userId)` → `GET /users/:id/stats`

- [ ] **SessionService**
  - `listSessions()` → `GET /sessions`
  - `revokeSession(sessionId)` → `DELETE /sessions/:id`
  - `revokeAllSessions()` → `DELETE /sessions`

- [ ] **AccountService**
  - `deleteAccount(confirmationPhrase)` → `DELETE /me/delete-account`

- [ ] **TwoFactorService**
  - `getStatus()` → `GET /2fa/status`
  - `setup()` → `POST /2fa/setup`
  - `enable(code)` → `POST /2fa/enable`
  - `disable(code, password)` → `DELETE /2fa/disable`
  - `verify(code)` → `POST /2fa/verify`
  - `getBackupCodes(code)` → `GET /2fa/backup-codes`

### Friend & Social Services
- [ ] **FriendService**
  - `sendFriendRequest(receiverId, message?)` → `POST /friend-requests`
  - `receivedRequests(offset?, limit?)` → `GET /friend-requests/received`
  - `sentRequests(offset?, limit?)` → `GET /friend-requests/sent`
  - `respond(requestId, accepted)` → `PATCH /friend-requests/:id`
  - `deleteRequest(requestId)` → `DELETE /friend-requests/:id`
  - `sendEmailInvitation(email)` → `POST /invitations/email`

- [ ] **BlockService**
  - `blockUser(userId)` → `POST /block/:id`
  - `unblockUser(userId)` → `DELETE /block/:id`
  - `listBlockedUsers()` → `GET /block` (with socket/cache subscription)
  - `isBlocked(userId)` → checks in-memory cache

### Community Services
- [ ] **CommunityService**
  - `list(search?, offset?, limit?)` → `GET /communities`
  - `search(query, offset?, limit?)` → `GET /communities/search`
  - `get(communityId)` → `GET /communities/:id`
  - `create(name, identifier?, description?, isPrivate?)` → `POST /communities`
  - `update(communityId, name?, identifier?, description?, ...)` → `PATCH /communities/:id`
  - `delete(communityId)` → `DELETE /communities/:id`
  - `getMembers(communityId, offset?, limit?)` → `GET /communities/:id/members`
  - `addMember(communityId, userId, role?)` → `POST /communities/:id/members`
  - `updateMemberRole(communityId, memberId, role)` → `PATCH /communities/:id/members/:mid`
  - `removeMember(communityId, userId)` → `DELETE /communities/:id/members/:uid`
  - `join(communityId)` → `POST /communities/:id/join`
  - `leave(communityId)` → `POST /communities/:id/leave`
  - `invite(communityId, userId|userIds)` → `POST /communities/:id/invite`
  - `checkIdentifier(identifier)` → `GET /communities/check-identifier`
  - `getConversations(communityId)` → `GET /communities/:id/conversations`
  - `addConversation(communityId, conversationId)` → `POST /communities/:id/conversations`

- [ ] **CommunityLinkService**
  - `listCommunityLinks()` → `GET /community-links`
  - `stats(links)` — local calculation

### Preferences & Settings
- [ ] **PreferenceService** — User preferences, categories, tags, notification settings
  - `getCategories()` → `GET /preferences/categories`
  - `getConversationPreferences(conversationId)` → `GET /conversations/:id/preferences`
  - `updateConversationPreferences(conversationId, UpdateConversationPreferencesRequest)` → `PATCH /conversations/:id/preferences`
  - `patchCategory(id, isExpanded)` → `PATCH /preferences/categories/:id`
  - `getAllPreferences()` → `GET /preferences`
  - `patchPreferences(category, body)` → `PATCH /preferences/:category`
  - `resetPreferences(category)` → `DELETE /preferences/:category`
  - `createCategory(name, color?, icon?)` → `POST /preferences/categories`
  - `getMyConversationTags()` — cached or fetched
  - `loadCached*()` — async local reads
  - `revalidate*()` — async remote fetches
  - `persist*()` — async local saves

- [ ] **UserPreferencesManager** — Observable wrapper (SwiftUI)

### Notification Services
- [ ] **NotificationService**
  - `list(offset?, limit?, unreadOnly?)` → `GET /notifications`
  - `unreadCount()` → `GET /notifications/unread-count`
  - `markAsRead(notificationId)` → `PATCH /notifications/:id/read`
  - `markAllAsRead()` → `POST /notifications/read-all`
  - `delete(notificationId)` → `DELETE /notifications/:id`

- [ ] **PushNotificationManager** (Firebase + APNs)
  - `requestAuthorization()` — APNs/Android permission
  - `registerToken(token)` — `POST /notifications/device-token`
  - `isAuthorized` publisher
  - `deviceToken` publisher
  - `pendingNotificationPayload` publisher
  - `messageNotificationReceived` PassthroughSubject (conversationId)

### Translation & Transcription
- [ ] **TranslationService**
  - `translate(text, targetLanguage, sourceLanguage?)` → `POST /translate`
  - Cache layer for request/response

- [ ] **EdgeTranscriptionService** — On-device transcription (SFSpeechRecognizer)
  - `requestAuthorization()` — speech permissions
  - `transcribe(audioURL|audioData, locale)` → on-device ASR
  - `isLocaleSupported(locale)` → check SFSpeechRecognizer availability

- [ ] **ConversationDraftManager** — Message draft persistence
  - `save(text, conversationId)` — local GRDB
  - `draft(conversationId)` — local GRDB read
  - `clear(conversationId)` — local GRDB delete

### Voice & Voice Profiles
- [ ] **VoiceProfileService** — Voice cloning consent & samples
  - `getConsentStatus()` → `GET /voice/consent`
  - `grantConsent(ageVerification, birthDate?)` → `POST /voice/consent`
  - `revokeConsent()` → `DELETE /voice/consent`
  - `getProfile()` → `GET /voice/profile`
  - `getSamples()` → `GET /voice/samples`
  - `uploadSample(audioData, durationMs)` → `POST /voice/samples` (multipart)
  - `toggleVoiceCloning(enabled)` → `PATCH /voice/cloning`
  - `deleteProfile()` → `DELETE /voice/profile`
  - `deleteSample(sampleId)` → `DELETE /voice/samples/:id`

### Location & Sharing
- [ ] **LocationService**
  - `shareLocation(conversationId, lat, lon, altitude?, accuracy?, placeName?, address?)` → Socket.IO emit `location:share`
  - `startLiveLocation(conversationId, lat, lon, durationMinutes)` → Socket.IO emit `location:live-start`
  - `updateLiveLocation(conversationId, lat, lon, altitude?, accuracy?, speed?, heading?)` → Socket.IO emit `location:live-update`
  - `stopLiveLocation(conversationId)` → Socket.IO emit `location:live-stop`

### Reporting & Moderation
- [ ] **ReportService**
  - `report(content, reason, reportType)` → `POST /reports`
  - `getReports()` → `GET /reports` (admin)

- [ ] **MentionService**
  - `suggestions(contextId, contextType, query)` → `GET /mentions/suggestions`
  - `suggestions(conversationId, query)` — convenience variant

### Analytics & Tracking
- [ ] **StatsService**
  - `getConversationStats(conversationId)` → `GET /conversations/:id/stats`
  - `getStats()` → `GET /stats`

- [ ] **TrackingLinkService**
  - `createTrackingLink(...)` → `POST /tracking-links`
  - `click(linkId)` → `POST /tracking-links/:id/click`

- [ ] **AffiliateService**
  - `listTokens(offset?, limit?)` → `GET /affiliate/tokens`
  - `createToken(name, maxUses?, expiresAt?)` → `POST /affiliate/tokens`
  - `deleteToken(id)` → `DELETE /affiliate/tokens/:id`
  - `fetchStats()` → `GET /affiliate/stats`

- [ ] **ShareLinkService**
  - `create(...)` → `POST /share-links`
  - `get(linkId)` → `GET /share-links/:id`
  - `list(...)` → `GET /share-links`
  - `delete(linkId)` → `DELETE /share-links/:id`

### Data Export
- [ ] **DataExportService**
  - `requestExport(format, types)` → `POST /export`

---

## 2. Models Layer (33+ Model Files)

All models are Decodable/Encodable with readonly properties and optional CodingKeys.

### Core Models
- [ ] **CoreModels.swift**
  - `ConversationType` enum: direct, group, public, community, global, broadcast
  - `MessageType` enum: text, image, file, audio, video, location, system
  - `UserRole` enum: user, moderator, admin, owner
  - `MeeshyUser` — user profile (id, username, firstName, lastName, displayName, avatar, banner, bio, email, phoneNumber, timezone, systemLanguage, regionalLanguage, customDestinationLanguage, autoTranslateEnabled, isOnline, lastActiveAt, blockedUserIds, etc.)
  - `MeeshyUser.Metadata` — additional fields
  - `UserStats` — user statistics
  - `MeeshyConversationTag` — color-coded tags
  - `MeeshyConversationSection` — pinned/work/family/friends/groups/other sections
  - `RecentMessagePreview` — last message display
  - `MeeshyConversation` — Identifiable conversation model (id, identifier, type, title, description, avatar, banner, participants, lastMessage, preferences, accentColor, etc.)
  - `ConversationColorPalette` — primary, secondary, accent, saturationBoost
  - `ConversationContext` — color generation metadata (name, type, language, theme, memberCount)

### Participant & Membership Models
- [ ] **ParticipantModels.swift**
  - `APIParticipant` — conversation member (id, userId, displayName, username, avatar, role, joinedAt, user nesting)
  - `APIParticipantUser` — nested user fields
  - `ParticipantRole` enum — admin, moderator, member
  - `APICommunityMember` — community membership

### Conversation Models
- [ ] **ConversationModels.swift**
  - `APIConversation` — API gateway model (id, identifier, type, title, description, avatar, avatarThumbHash, banner, participants, lastMessage, unreadCount, createdAt, updatedAt, defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled, etc.)
  - `APIConversationUser` — conversation member details
  - `APIConversationUserNested` — optional nested user
  - `APIConversationLastMessage` — summary of last message in thread
  - `APIConversationPreferences` — user-scoped prefs (isPinned, isMuted, isArchived, deletedForUserAt, tags, categoryId, reaction, customName, mentionsOnly)
  - `APIMessageCount` — attachments count
  - `CreateConversationRequest` / `CreateConversationResponse`
  - `ConversationPage` — cursor-paginated result (items, rawItems, nextCursor, hasMore)

### Message Models
- [ ] **MessageModels.swift**
  - `APIMessage` — message object (id, conversationId, senderId, content, messageType, originalLanguage, isEdited, editedAt, deletedAt, replyToId, createdAt, sender, attachments, translations, reactions, etc.)
  - `APIMessageSender` — sender profile (id, displayName, avatar, userId, user nesting)
  - `APIMessageSenderUser` — nested user fields
  - `APIMessageAttachment` — attachment (id, fileName, mimeType, fileSize, fileUrl, thumbnailUrl, thumbHash, width, height, duration, transcription, translations, etc.)
  - `APIAttachmentTranscription` — transcription data (text, language, confidence, durationMs, segments, speakerCount)
  - `APIAttachmentTranslation` — translated audio (url, durationMs, format, cloned, quality, voiceModelId, ttsModel, segments)
  - `SendMessageRequest` — send payload (conversationId, content, originalLanguage, messageType?, replyToId?, clientMessageId, attachmentIds?)
  - `SendMessageResponseData` — send response (messageId)
  - `MessagesAPIResponse` — paginated messages response
  - `ConsumeViewOnceResponse` — view-once consumption ack
  - `MessageTranslation` — translation metadata (id, messageId, sourceLanguage, targetLanguage, translatedContent, translationModel, confidenceScore, cached)
  - `TranscriptionSegment` — word-level timing (text, start, end, speakerId, voiceSimilarityScore)
  - `ViewOnceMessage` — view-once envelope

### Post & Story Models
- [ ] **PostModels.swift**
  - `APIPost` — post/story/status object (id, type, content, visibility, authorId, author, moodEmoji, likeCount, commentCount, repostCount, viewCount, isLiked, isBookmarked, isReposted, mediaIds, media, originalLanguage, translations, etc.)
  - `PostType` enum — POST, STORY, STATUS, REPOST, QUOTE_REPOST
  - `APIPostComment` — comment object (id, content, authorId, author, createdAt, likesCount, isLiked, parentId, replies, etc.)
  - `APIPostMedia` — post attachment (id, type, url, width, height, duration, thumbHash)
  - `PostViewersResponse` — viewers list with pagination
  - `CreatePostRequest` / `UpdatePostRequest`
  - `CreateCommentRequest` / `RepostRequest`
  - `StoryEffects` — story slide effects (slides, transitions, animations, textObjects)
  - `StorySlide` — individual slide (index, effects, duration)

- [ ] **StoryModels.swift**
  - `APIStory` — alias for APIPost with type=STORY
  - `StorySlide` — slide details (index, mediaId, effects, duration, etc.)
  - `StoryEffects` — effect metadata

### Feed Models
- [ ] **FeedModels.swift**
  - `APIFeed` — feed object (id, userId, curatedAt, posts, etc.)
  - `APIFeedItem` — individual feed entry

### Friend Models
- [ ] **FriendModels.swift**
  - `FriendRequest` — friend request object (id, senderId, receiverId, message, status, createdAt)
  - `SendFriendRequest` / `RespondFriendRequest`
  - `EmailInvitationRequest` / `EmailInvitationResponse`

### Preference Models
- [ ] **PreferenceModels.swift**
  - `ConversationCategory` — category object (id, name, color, icon, userId, createdAt, conversations)
  - `UserPreferences` — user prefs wrapper (id, userId, categories, notifications, language, etc.)
  - `UpdateConversationPreferencesRequest` — patch payload

### Notification Models
- [ ] **NotificationModels.swift**
  - `APINotification` — notification object (id, userId, type, priority, content, actor, context, metadata, state, delivery)
  - `NotificationState` — isRead, readAt, createdAt, expiresAt
  - `NotificationDelivery` — emailSent, pushSent
  - `NotificationPayload` — navigation payload from FCM/APNs
  - `NotificationListResponse` — paginated list

### Community Models
- [ ] **CommunityModels.swift**
  - `APICommunity` — community object (id, identifier, name, description, avatar, isPrivate, creatorId, memberCount, conversationIds, etc.)
  - `APICommunityMember` — member (id, userId, role, joinedAt)
  - `APICommunitySearchResult` — search result
  - `CommunityRole` enum — admin, moderator, member
  - `IdentifierAvailability` — availability check result
  - `CreateCommunityRequest` / `UpdateCommunityRequest`

### Tracking & Links
- [ ] **TrackingLinkModels.swift**
  - `TrackingLink` — tracking object (id, url, code, clicks, expiresAt)

- [ ] **ShareLinkModels.swift**
  - `ShareLink` — share link object (id, conversationId, expiresAt, maxUses, uses)

- [ ] **CommunityLinkModels.swift**
  - `CommunityLink` — community invite link
  - `CommunityLinkStats` — stats calculation

### Location Models
- [ ] **LocationModels.swift**
  - `LocationShare` — location snapshot (conversationId, latitude, longitude, altitude, accuracy, placeName, address)
  - `LiveLocation` — live location (userId, latitude, longitude, expiresAt, startedAt)

### Transcription & Translation
- [ ] **TranscriptionModels.swift**
  - `TranscriptionSegment` — segment (id, text, startMs, endMs, speakerId, voiceSimilarityScore, confidence)
  - `Transcription` — transcription metadata (id, language, text, durationMs, confidence, segments)

- [ ] **VoiceProfileModels.swift**
  - `VoiceConsentStatus` — consent state (grantedAt, revokedAt)
  - `VoiceProfile` — profile metadata (id, userId, createdAt, updatedAt, consent flags)
  - `VoiceSample` — sample metadata (id, durationMs, uploadedAt)
  - `VoiceSampleUploadResponse` — upload response

### Statistics Models
- [ ] **StatsModels.swift**
  - `ConversationStats` — aggregated stats (messagesPerLanguage, participantCount, onlineUsers)
  - `UserStats` — user metrics

### Additional Models
- [ ] **UserModels.swift** — user-specific types
- [ ] **UserRelationshipState.swift** — block status, friend status
- [ ] **MemberRole.swift** — role enum variants
- [ ] **MessageEffects.swift** — message animations/effects
- [ ] **PresenceModels.swift** — online status
- [ ] **LastMessageSummaryKind.swift** — enum for last message type
- [ ] **LanguageData.swift** — language support metadata
- [ ] **AgentAnalysisModels.swift** — AI agent analysis
- [ ] **AffiliateModels.swift** — affiliate program types
- [ ] **MentionCandidate.swift** — mention suggestion
- [ ] **ConversationDraft.swift** — draft persistence

---

## 3. Networking Layer

### Base Configuration
- [ ] **APIClient.swift** — HTTP client with async/await
  - Base URL: `MeeshyConfig.shared.apiBaseURL` (configured via config)
  - Timeout: 60s request, 120s resource
  - Protocol: HTTPS with certificate pinning (host: `gate.meeshy.me`)
  - HTTP/3 enabled (HTTP3Capable flag)
  - Date parsing: ISO8601 with/without fractional seconds

### Authentication Headers
- [ ] **Bearer Token** (JWT): `Authorization: Bearer <token>`
  - Set via `APIClient.authToken` setter
- [ ] **Session Token** (anonymous): `X-Session-Token: <token>`
  - Set via `APIClient.anonymousSessionToken` setter
- [ ] **Client Info Headers** (via `ClientInfoProvider`)
  - `User-Agent`: iOS app version, device model
  - `X-Client-Version`: SDK version
  - `Accept-Language`: user's system language
  - `X-Geo`: geolocation (if permitted)

### Request/Response Envelopes
- [ ] **APIResponse<T>** — standard wrapper
  ```swift
  {
    "success": bool,
    "data": T,
    "error": string?
  }
  ```

- [ ] **PaginatedAPIResponse<T>** — cursor pagination
  ```swift
  {
    "success": bool,
    "data": [T],
    "pagination": {
      "nextCursor": string?,
      "hasMore": bool?,
      "limit": int?
    }
  }
  ```

- [ ] **OffsetPaginatedAPIResponse<T>** — offset pagination
  ```swift
  {
    "success": bool,
    "data": [T],
    "pagination": {
      "total": int?,
      "hasMore": bool?,
      "limit": int?,
      "offset": int?
    }
  }
  ```

### Error Handling
- [ ] **APIError** enum
  - `.invalidURL` — malformed endpoint
  - `.noData` — empty response body
  - `.decodingError(Error)` — JSON parsing failure
  - `.serverError(statusCode, message)` — 4xx/5xx with details
  - `.networkError(Error)` — URLError (timeout, no connection, DNS lookup, etc.)
  - `.unauthorized` — 401, triggers `AuthManager.handleUnauthorized()`

### Retry Logic
- [ ] Automatic retry on 429 (rate limit) and 503 (service unavailable)
- [ ] Max 3 attempts, exponential backoff: 1s, 2s, 4s
- [ ] Respects `Retry-After` header if present (clamped to 30s)
- [ ] Signal Protocol endpoints (`/signal/*`) opt-out of retries (permanent 503)

### Socket Configuration
- [ ] **SocketConfig.swift**
  - URL: `MeeshyConfig.shared.socketURL`
  - Path: `/socket.io`
  - Transport: `[.websocket, .polling]` (fallback)
  - Reconnection: enabled, exponential backoff
  - Heartbeat interval: 25s
  - Auth: sends JWT on connect

---

## 4. Sockets Layer (Socket.IO)

### Connection Management
- [ ] **MessageSocketManager** — messages, reactions, typing, read status
  - Singleton: `MessageSocketManager.shared`
  - Namespace: `/`
  - Reconnect independently on 401 or network loss

- [ ] **SocialSocketManager** — posts, stories, statuses, comments
  - Singleton: `SocialSocketManager.shared`
  - Namespace: `/social`
  - Reconnect independently

### Room Membership
- [ ] Format: `entity:${id}` (colons + hyphens, no underscores)
  - `conversation:${id}` — join/leave per conversation
  - `user:${id}` — user-scoped events (presence, notifications)
  - `feed:${id}` — feed subscription
  - `call:${id}` — call-specific events
  - `post:${id}` — post/story reaction room

### Client Events (Client → Server)
- [ ] **Messages**
  - `message:send` → SendData { conversationId, content, originalLanguage?, messageType?, replyToId?, clientMessageId }
  - `message:send-with-attachments` → SendWithAttachmentsData { conversationId, content, originalLanguage?, attachmentIds, replyToId?, clientMessageId }
  - `message:edit` → EditData { messageId, content }
  - `message:delete` → DeleteData { messageId }

- [ ] **Conversations**
  - `conversation:join` → { conversationId }
  - `conversation:leave` → { conversationId }

- [ ] **Typing & Presence**
  - `typing:start` → { conversationId }
  - `typing:stop` → { conversationId }
  - `user:status` → { isOnline }
  - `heartbeat` — periodic keep-alive

- [ ] **Reactions**
  - `reaction:add` → { messageId, emoji }
  - `reaction:remove` → { messageId, emoji }
  - `reaction:request-sync` → { messageId } (request full state)
  - `post:reaction-add` → { postId, emoji }
  - `post:reaction-remove` → { postId, emoji }
  - `post:reaction-request-sync` → { postId }
  - `comment:reaction-add` → { commentId, postId, emoji }
  - `comment:reaction-remove` → { commentId, postId, emoji }

- [ ] **Translation**
  - `translation:request` → { messageId, targetLanguage }

- [ ] **Location**
  - `location:share` → LocationShareData { conversationId, latitude, longitude, altitude?, accuracy?, placeName?, address? }
  - `location:live-start` → LocationLiveStartData { conversationId, latitude, longitude, durationMinutes }
  - `location:live-update` → LocationLiveUpdateData { conversationId, latitude, longitude, altitude?, accuracy?, speed?, heading? }
  - `location:live-stop` → { conversationId }

- [ ] **Feed & Posts**
  - `feed:subscribe` — request feed events
  - `feed:unsubscribe` — stop feed subscription
  - `post:join` → { postId }
  - `post:leave` → { postId }

- [ ] **Calls** (complex, see video-call types)
  - `call:initiate`, `call:join`, `call:signal`, `call:toggle-audio`, etc.

- [ ] **Authentication**
  - `authenticate` → { userId?, sessionToken?, language? }

### Server Events (Server → Client)
- [ ] **Messages**
  - `message:new` ← SocketIOMessage (full object with sender)
  - `message:edited` ← SocketIOMessage
  - `message:deleted` ← { messageId, conversationId }
  - `message:translation` ← { messageId, translations[] }
  - `message:translated` ← { messageId, translations[] }
  - `message:pinned` ← { messageId, conversationId, pinnedBy, pinnedAt }
  - `message:unpinned` ← { messageId, conversationId }
  - `message:consumed` ← { messageId, conversationId, userId, viewOnceCount, maxViewOnceCount, isFullyConsumed }
  - `message:pending-delivered` ← { count }

- [ ] **Conversations**
  - `conversation:joined` ← { conversationId, userId }
  - `conversation:left` ← { conversationId, userId }
  - `conversation:join-error` ← { conversationId, error } (ban, not member, deleted)
  - `conversation:new` ← ConversationNewEventData { conversationId, conversationType, title, creatorId, participantIds, createdAt }
  - `conversation:updated` ← APIConversation
  - `conversation:closed` ← { conversationId }
  - `conversation:participant-left` ← { conversationId, userId }
  - `conversation:participant-banned` ← { conversationId, userId }
  - `conversation:participant-unbanned` ← { conversationId, userId }
  - `conversation:stats` ← { conversationId, stats: ConversationStats }
  - `conversation:online-stats` ← { conversationId, onlineUsers[] }
  - `conversation:unread-updated` ← { conversationId, unreadCount }

- [ ] **Typing & Presence**
  - `typing:start` ← { userId, username, conversationId }
  - `typing:stop` ← { userId, username, conversationId }
  - `user:status` ← { userId, username, isOnline, lastActiveAt? }
  - `presence:snapshot` ← { users[]: { userId, username, isOnline, lastActiveAt? } } (auth handshake)

- [ ] **Reactions**
  - `reaction:added` ← ReactionUpdateEventData { messageId, conversationId?, participantId?, emoji, action, aggregation, timestamp }
  - `reaction:removed` ← ReactionUpdateEventData
  - `reaction:sync` ← ReactionSyncEventData { messageId, reactions[], totalCount, userReactions[] }
  - `post:reaction-added` ← PostReactionUpdateEventData
  - `post:reaction-removed` ← PostReactionUpdateEventData
  - `post:reaction-sync` ← PostReactionSyncEventData
  - `comment:reaction-added` ← CommentReactionUpdateEventData
  - `comment:reaction-removed` ← CommentReactionUpdateEventData
  - `comment:reaction-sync` ← CommentReactionSyncEventData

- [ ] **Translation**
  - `message:translation` ← TranslationEvent { messageId, translations[] }

- [ ] **Audio Processing**
  - `audio:transcription-ready` ← TranscriptionReadyEventData { messageId, attachmentId, conversationId, transcription, processingTimeMs? }
  - `audio:translation-ready` ← AudioTranslationReadyEventData (single translation)
  - `audio:translations-progressive` ← AudioTranslationsProgressiveEventData (one of many)
  - `audio:translations-completed` ← AudioTranslationsCompletedEventData (final batch)

- [ ] **Location**
  - `location:shared` — retired end-to-end (commit `c07d4648d`); gateway no longer routes it, live location is the only surviving path.
  - `location:live-started` ← LocationLiveStartedEventData { conversationId, userId, username, latitude, longitude, durationMinutes, expiresAt, startedAt }
  - `location:live-updated` ← LocationLiveUpdatedEventData { conversationId, userId, latitude, longitude, altitude?, accuracy?, speed?, heading?, timestamp }
  - `location:live-stopped` ← LocationLiveStoppedEventData { conversationId, userId, stoppedAt }

- [ ] **Posts & Stories**
  - `post:created` ← PostCreatedEventData { post: APIPost }
  - `post:updated` ← PostUpdatedEventData { post: APIPost }
  - `post:deleted` ← PostDeletedEventData { postId, authorId }
  - `post:liked` ← PostLikedEventData { postId, userId, emoji, likeCount, reactionSummary }
  - `post:unliked` ← PostUnlikedEventData { postId, userId, likeCount, reactionSummary }
  - `post:reposted` ← PostRepostedEventData { originalPostId, repost: APIPost }
  - `post:bookmarked` ← (no data, just ack)
  - `post:translation-updated` ← PostTranslationUpdatedEventData

  - `story:created` ← StoryCreatedEventData
  - `story:updated` ← StoryUpdatedEventData
  - `story:deleted` ← StoryDeletedEventData
  - `story:viewed` ← StoryViewedEventData
  - `story:reacted` ← StoryReactedEventData
  - `story:unreacted` ← StoryUnreactedEventData
  - `story:translation-updated` ← StoryTranslationUpdatedEventData

  - `status:created` ← StatusCreatedEventData
  - `status:updated` ← StatusUpdatedEventData
  - `status:deleted` ← StatusDeletedEventData
  - `status:reacted` ← StatusReactedEventData
  - `status:unreacted` ← StatusUnreactedEventData

  - `comment:added` ← CommentAddedEventData
  - `comment:deleted` ← CommentDeletedEventData
  - `comment:liked` ← CommentLikedEventData

- [ ] **Mentions**
  - `mention:created` ← MentionCreatedEventData { messageId, conversationId, senderId, mentionedUserId, mentionedParticipantId?, content, timestamp }

- [ ] **Notifications**
  - `notification:new` ← NotificationEventData (legacy + new)
  - `notification:read` ← { notificationId }
  - `notification:deleted` ← { notificationId }
  - `notification:counts` ← { total, unread, byType? }

- [ ] **Attachment Status**
  - `attachment-status:updated` ← AttachmentStatusUpdatedEventData { attachmentId, messageId, conversationId, userId, action, updatedAt }

- [ ] **Participants**
  - `participant:role-updated` ← ParticipantRoleUpdatedEventData { conversationId, userId, newRole, updatedBy, participant }

- [x] **User Preferences** — scope CONVERSATION livré au cycle 130 (#4127)
  - `user:preferences-updated` ← union de TROIS scopes sous un seul nom :
    - [x] conversation — `{ userId, conversationId, version, reset, preferences }`
      → `PreferencesSocketManager` → `ConversationRepository.applyRemoteConversationPreferences`
      (arbitrage `version <= local ⇒ drop` dans le port pur `applyRemote`)
    - [ ] catégorie — `{ userId, category }` : **vrai manque, pas une feature absente.**
      `NotificationPreferencesStore` et `PrivacyPreferencesStore` (DataStore, « source
      de vérité de l'UI ») sont écrits localement puis PATCHés vers
      `me/preferences/{notification,privacy}` par l'outbox — un bloc changé sur le web
      laisse donc le magasin de cet appareil périmé. Hors du lot 130 : autre magasin,
      autre voie. Suivi : #4133.
    - [ ] communauté — `{ userId, communityId, reset, preferences }` : aucun lecteur
      Android (mesuré : zéro occurrence de `UserCommunityPreferences` sous
      `apps/android/**`) — rien en cache, donc rien à périmer
  - `user:preferences-reordered` / `user:preferences-community-reordered` — NON
    écoutés, décision du cycle 130 : ils ne portent que `orderInCategory`, qu'aucune
    surface Android ne lit et qu'aucun geste de glisser-déposer ne produit. Un témoin
    (`PreferencesSocketManagerTest.no reorder listener is registered`) gèle l'absence.

- [ ] **Calls** (complex, see video-call types)
  - `call:initiated`, `call:participant-joined`, `call:signal`, etc.

- [ ] **Authentication**
  - `authenticated` ← { success, user?: SocketIOUser, error? }

- [ ] **System**
  - `error` ← { message, code? }

---

## 5. Crypto & Security Layer

### E2EE & Signal Protocol
- [ ] **DecryptionActor** — concurrent message decryption
  - Protocol: `DecryptionSessionProviding`
  - Method: `decryptMessage(ciphertext, from senderId) → Data`
  - Concurrent processing with task group
  - Performance signposts (start/end times)

- [ ] **Encryption Metadata** (from shared types)
  - Mode: `'e2ee' | 'server' | 'hybrid' | null`
  - Protocol: `'signal_v3' | 'aes-256-gcm'`
  - Fields: keyId, iv, authTag, messageNumber, preKeyId, messageType, registrationId

- [ ] **Signal Protocol Structures**
  - IdentityKey (public/private pair)
  - SignedPreKey (ephemeral, rotated frequently)
  - PreKey bundle (for key agreement)
  - RegistrationId (device identifier)
  - Message types: 1=PreKey, 2=Whisper, 3=SenderKey

- [ ] **Hybrid Encryption** (E2EE + Server-Decryptable)
  - E2EE layer: Signal Protocol ciphertext (client-to-client only)
  - Server layer: AES-256-GCM ciphertext (server can decrypt for translation)
  - Both layers transmitted with message
  - Server sees only server layer (cannot decrypt E2EE layer)

### Keychain & Key Storage
- [ ] **KeychainManager** — iOS Keychain wrapper
  - Service: `me.meeshy.app`
  - Namespacing: `${account}.${key}` for per-user isolation
  - Accessibility: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
  - Operations: save, load, delete (with error handling)
  - Used for: auth tokens, Signal Protocol keys, session tokens

### Database Encryption
- [ ] **DatabaseEncryption.swift**
  - GRDB SQLite encryption (if enabled)
  - SQLCipher integration
  - Key derivation from Keychain

---

## 6. Cache & Persistence Layer

### Cache System (Unified)
- [ ] **CacheCoordinator** — actor singleton, typed stores
  - Stores: `.conversations`, `.messages`, `.participants`, `.profiles`, `.images`, `.audio`, `.video`
  - L1 + L2 architecture per store
  - Socket.IO subscriptions (17+ events)
  - Background flush on app backgrounding
  - Memory warning eviction

- [ ] **CachePolicy** — per-datatype configuration
  - TTL: time-to-live (fresh window)
  - staleTTL: stale-while-revalidate window
  - maxItemCount: LRU eviction threshold
  - storageLocation: GRDB or disk (with subdirectory + byte limit)

- [ ] **CacheResult<T>** enum — freshness states
  - `.fresh(T, age)` — within staleTTL, serve immediately
  - `.stale(T, age)` — within ttl but past staleTTL, serve + background revalidate
  - `.expired` — past ttl, must fetch from server
  - `.empty` — never cached

- [ ] **GRDBCacheStore** — L1 Dictionary + L2 SQLite
  - Dirty tracking with 2s debounce + 10s max cap
  - LRU eviction when maxItemCount exceeded
  - Generic `<T: CacheIdentifiable>` storage
  - Socket.IO integration for real-time updates

- [ ] **DiskCacheStore** — L1 NSCache + L2 FileManager
  - SHA256 file naming (collision-safe)
  - Budget eviction (max bytes per subdir)
  - Used for: images, audio, video, thumbnails
  - Subdirectories: Images, Audio, Video, Thumbnails

- [ ] **Predefined Policies**
  - `conversations`: 24h TTL, 5min staleTTL, GRDB
  - `messages`: 6mo TTL, 2min staleTTL, 600 item limit, GRDB
  - `participants`: 24h TTL, 5min staleTTL, GRDB
  - `userProfiles`: 1h TTL, 5min staleTTL, 100 item limit, GRDB
  - `mediaImages`: 1y TTL, disk (300MB)
  - `mediaAudio`: 6mo TTL, disk (200MB)
  - `mediaVideo`: 6mo TTL, disk (500MB)
  - `thumbnails`: 7d TTL, disk (50MB)
  - `feedPosts`: 6h TTL, 2min staleTTL, 100 item, GRDB
  - `comments`: 1h TTL, 2min staleTTL, 500 item, GRDB
  - `stories`: 24h TTL, 5min staleTTL, GRDB
  - `notifications`: 24h TTL, 2min staleTTL, 200 item, GRDB
  - `preferences`: 24h TTL, 10min staleTTL, 500 item, GRDB
  - `drafts`: 30d TTL, 30d staleTTL, 500 item, GRDB

### Database & Persistence
- [ ] **AppDatabase** — GRDB connection pool
  - Reader/writer actors for safe concurrent access
  - Schema migrations per domain (messages, feed, search, etc.)
  - Background maintenance tasks

- [ ] **Message Persistence** (MessageRecord + conversions)
  - State machine: pending → sent → delivered → read
  - Optimistic UI updates before confirmation
  - Offline queueing with retry engine

- [ ] **Offline Queue** — message send queue
  - Item: `OfflineQueueItem` with clientMessageId (UUID v4)
  - Storage: GRDB OutboxRecord table
  - Retry logic: exponential backoff, max retries configurable
  - Recovery: boot-time check for stale/dangling records

- [ ] **Conversation Drafts** — user-scoped message drafts
  - Persistence: local GRDB
  - No server sync (local-only)
  - TTL: 30d, no stale window

### Sync Engine
- [ ] **ReconnectionGapDetector** — detects missed events during disconnect
  - Tracks last received Socket.IO event ID
  - On reconnect, requests full state if gap detected
  - Prevents stale cache from out-of-order updates

- [ ] **OutboxFlusher** — processes offline queue on reconnect
  - Batches retries by conversation
  - Applies server responses to cache
  - Publishes UI notifications on success/failure

---

## 7. Audio & Voice Services

### Recording
- [ ] **DefaultSDKAudioRecorder** — on-device audio recording
  - Format: M4A (AAC)
  - Sample rate: 16kHz (configurable)
  - Channels: mono
  - Bit rate: 64kbps (configurable)
  - Metering: real-time audio level visualization
  - Output: file URL in temp directory

- [ ] **AudioRecordingProviding** — protocol for injection
  - `startRecording()`
  - `stopRecording()`
  - `cancelRecording()`
  - `isRecording` + `duration` publishers

### Playback
- [ ] **AudioPlayerManager**
  - AVFoundation AVAudioPlayer wrapper
  - Playback control (play, pause, stop, seek)
  - Progress tracking
  - Audio session management

### Waveform Generation
- [ ] **WaveformGenerator** — audio waveform visualization
  - Computes peak audio levels from file
  - Generates simplified waveform array (15-20 bars)
  - **WaveformCache** — caches generated waveforms per messageId

---

## 8. Notifications Layer

### Push Notification Management
- [ ] **PushNotificationManager** — FCM + APNs unified
  - APNs environment: sandbox (debug) vs production (release)
  - APNs token registration: `POST /notifications/device-token`
  - Firebase token fallback
  - Token persistence in UserDefaults
  - Registration cooldown: 300s (prevents duplicate registrations)

- [ ] **Publishers**
  - `isAuthorized` — APNs/Android permission state
  - `deviceToken` — current APNs/Firebase token
  - `pendingNotificationPayload` — user tapped notification (navigation)
  - `messageNotificationReceived` — PassthroughSubject<conversationId> for silent updates

- [ ] **Permissions**
  - iOS: `UNUserNotificationCenter.requestAuthorization()`
  - Android: Firebase Cloud Messaging permission + Notification runtime permission

### Notification Payloads
- [ ] **NotificationPayload** — data structure
  - type: conversation, message, friend_request, etc.
  - conversationId: target conversation
  - messageId: target message (optional)
  - userId: actor user ID
  - action: open_conversation, open_message, accept_friend, etc.

- [ ] **FCM/APNs Message Format**
  - Data: JSON payload (custom fields)
  - Notification: title + body (banner text)
  - Badge: unread count
  - Sound: default or custom

### Push Delivery Receipts
- [ ] **PushDeliveryReceiptService**
  - Logs delivery confirmation to gateway
  - `POST /notifications/:id/delivered`

---

## 9. Shared Types & Utilities

### Shared Types (packages/shared/types)
- [ ] **socketio-events.ts** (canonical)
  - `SERVER_EVENTS` — all server→client event names
  - `CLIENT_EVENTS` — all client→server event names
  - `ROOMS` — room naming functions
  - Event data interfaces for all event types
  - `ServerToClientEvents` / `ClientToServerEvents` type maps

- [ ] **encryption.ts**
  - `EncryptionMode`, `EncryptionProtocol`, `EncryptionPreference`
  - `EncryptionMetadata` structure
  - `SignalKeyBundle` for key agreement
  - `HybridEncryptedPayload` structure

- [ ] Other shared types (in `/packages/shared/types/`)
  - message-types.ts, conversation.ts, user.ts, notification.ts, post.ts, etc.

### Shared Utilities
- [ ] **conversation-helpers.ts**
  - `resolveUserLanguage(user)` — systemLanguage → regionalLanguage → customDestinationLanguage → 'fr'
  - `resolveUserTranslationLanguages(user)` — array of auto-translate targets
  - `generateConversationIdentifier(title?)` — `mshy_${slug}-${timestamp}` format

- [ ] **language-support.ts**
  - 60+ language definitions with metadata
  - TTS/STT/voice cloning capabilities per language
  - NLLB language mapping (e.g., en → eng_Latn)

---

## 10. Configuration

### MeeshyConfig
- [ ] **API Base URL**: `https://gate.meeshy.me` (or env override)
- [ ] **Socket Base URL**: `https://gate.meeshy.me` (or env override)
- [ ] **Timeouts**: 60s request, 120s resource
- [ ] **Retry Policy**: 3 attempts, exponential backoff
- [ ] **Cache Policies**: per-datatype TTL, staleTTL, storage location
- [ ] **Feature Flags**: E2EE enabled, translation enabled, etc.

---

## Summary

| Category | Count | Notes |
|----------|-------|-------|
| **Services** | 32 | Conversation, Message, User, Post, Community, Preference, Notification, Voice, etc. |
| **Models** | 33+ | Organized by domain (Core, Conversation, Message, Post, Story, Community, etc.) |
| **Socket Events** | 70+ | Both client→server and server→client directions |
| **Cache Stores** | 2 types | GRDBCacheStore (SQLite), DiskCacheStore (FileManager) |
| **Crypto Approach** | Hybrid | Signal Protocol (E2EE) + AES-256-GCM (Server-decryptable for translation) |
| **Offline Support** | Queueing | OfflineQueue + OutboxFlusher, state machine (pending→sent→delivered→read) |
| **Auth Headers** | 2 types | JWT Bearer token + X-Session-Token (anonymous) |
| **Base URL** | Single | `gate.meeshy.me` for both HTTP API and Socket.IO |
| **Pagination** | 2 types | Cursor-based (next-aware) + offset-based (total-aware) |

