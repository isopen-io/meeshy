# Audit Part 16 — MeeshySDK: Notifications, Persistence (GRDB), Search, Security, Services

Scope: 51 files covering APNs push, the GRDB local-first persistence layer (message/feed/story records + actors + migrations + outbox), FTS5 search, AES-GCM database encryption + Keychain, and the first batch of REST services.

---

## packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift
- Purpose: `@MainActor` singleton owning APNs permission, device-token lifecycle, and notification payload routing.
- Public API: `PushNotificationManager.shared`; `@Published isAuthorized`, `deviceToken`, `pendingNotificationPayload: NotificationPayload?`; `messageNotificationReceived: PassthroughSubject<String,Never>`; `apnsEnvironment` (compile-time `development`/`production`); `requestPermission() async -> Bool`, `checkAuthorizationStatus()`, `registerDeviceToken(Data)`, `reRegisterTokenIfNeeded()`, `handleRegistrationError`, `unregisterDeviceToken() async`, `handleNotification(userInfo:)`, `clearPendingNotification()`, `noteMessageActivity(userInfo:)`, deprecated `resetBadge`/`updateBadge`. `struct NotificationPayload` (type, conversationId, messageId, sender fields, postId/Type, title/body parsed from `aps.alert`).
- Key behaviors: token hex-encoding; backend registration with 300s idempotency cooldown (dedup of cold-start double-POST); two distinct signals — `pendingNotificationPayload` (navigation intent on tap) vs `messageNotificationReceived` (list re-sort signal for foreground banner / silent push). APNs env baked at compile time so a build cannot misreport sandbox/prod.
- Dependencies: `APIClient.shared`, `UNUserNotificationCenter`, `UIApplication`.
- Android port: Use Firebase Cloud Messaging (`FirebaseMessagingService`). Map `apnsEnvironment` to FCM (single env). `requestPermission` -> `POST_NOTIFICATIONS` runtime permission (API 33+). Two-channel signal -> `StateFlow` (nav intent) + `SharedFlow<String>` (list bump). Token registration cooldown via DataStore timestamp. Badge -> `ShortcutBadger`/notification dot; route through a NotificationCoordinator equivalent.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift
- Purpose: Singleton owning the GRDB SQLite store (`meeshy.sqlite`) — the L2 cache backbone — with crash-safe in-memory fallback.
- Public API: `AppDatabase.shared`; `databaseWriter: any DatabaseWriter`, `isEphemeral: Bool`; `static runMigrations(on:)`.
- Key behaviors: opens a `DatabasePool` under `applicationSupportDirectory/Database/`; applies iOS Data Protection `.completeUntilFirstUserAuthentication` to dir + file (readable after first unlock, encrypted at rest, excluded from backups); on any failure falls back to in-memory `DatabaseQueue` and continues (degraded L2). Migrations v1-v6: conversations/messages -> unified `cache_entries` (key+itemId+blob) -> `translation_cache` -> `tus_upload_checkpoint`; also registers `SearchIndexMigrations`.
- Dependencies: GRDB.
- Android port: Use Room (or SQLDelight). `databaseWriter` -> Room `Database`. Data Protection -> Android's filesystem encryption is automatic; for at-rest hardening use SQLCipher (see DatabaseEncryption note). In-memory fallback -> `Room.inMemoryDatabaseBuilder`. Migrations -> Room `Migration` objects. The "never crash the host" wrapper is worth preserving.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/BubbleLayoutEngine.swift
- Purpose: Thread-safe pre-computation of chat-bubble sizes via CoreText `CTFramesetter` — a performance technique that moves text measurement off the SwiftUI render path.
- Public API: `enum BubbleLayoutEngine`; `struct LayoutResult { size, lastLineWidth, lineCount, timestampInline }`; `timestampWidth=52`, `timestampInlineGap=8`, `@MainActor globalLayoutEpoch`; `invalidateAllLayouts()`; `computeLayout(content:contentType:attachmentDimensions:replyPreview:reactionCount:maxWidth:) -> LayoutResult`.
- Key behaviors: per content type (text/image/video/audio/default) computes bubble width/height; for text uses CTFramesetter to get line count + last-line width, decides whether the timestamp fits inline on the last line; media constrained to 0.65×maxWidth / 300pt. `globalLayoutEpoch` invalidates cached layouts on font/locale change.
- Dependencies: CoreText, UIKit.
- Android port: Compose `TextMeasurer` / `Paragraph` (or `StaticLayout` in a `LayoutEngine`) computed off the main thread, cached per message (`cachedBubble*` columns). Preserve the inline-timestamp heuristic — it is a real layout-quality feature. `globalLayoutEpoch` -> a recomposition key.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift
- Purpose: GRDB row for the unified `cache_entries` table (generic JSON-blob cache).
- Public API: `struct CacheEntry { key, itemId, encodedData: Data, updatedAt }`, composite PK `(key,itemId)`.
- Android port: Room `@Entity` with composite primary key; `encodedData` as `ByteArray` (JSON blob).

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/CommentRecord.swift
- Purpose: GRDB row for feed comments (`feed_comments`).
- Public API: `struct CommentRecord` (id, postId, parentId, author fields, content, originalLanguage, translatedContent, likeCount, replyCount, effectFlags, createdAt, changeVersion). `Equatable` by `(id, changeVersion)`.
- Key behaviors: `changeVersion`-based equality — O(1) diffing for list rendering (no field-by-field compare).
- Android port: Room `@Entity`; keep `changeVersion` for cheap `DiffUtil`/`equals`.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCacheMetadata.swift
- Purpose: GRDB row for pagination/freshness metadata of a cache key (`cache_metadata`).
- Public API: `struct DBCacheMetadata { key, nextCursor, hasMore, totalCount, lastFetchedAt }`; `isExpired(ttl:)` (>= boundary).
- Android port: Room `@Entity`; pair with the cache policy TTL logic.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/DatabaseMaintenance.swift
- Purpose: SQLite PRAGMA tuning + periodic compaction hooks.
- Public API: `enum DatabaseMaintenance`; `applyTuning(on:)` (cache_size 8000≈32MB, mmap 64MB, temp_store MEMORY, auto_vacuum INCREMENTAL), `enableIncrementalAutoVacuumOneShot(on:)` (one-shot VACUUM), `runIncrementalVacuum(on:pages:)`, `runOptimize(on:)`.
- Key behaviors: incremental vacuum scheduled on app background; one-shot VACUUM gated via UserDefaults to flip auto_vacuum on legacy DBs.
- Android port: Room exposes raw PRAGMA via `RoomDatabase.Callback.onOpen` / `query`. Schedule incremental vacuum + `PRAGMA optimize` via `WorkManager` background work.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedDatabaseMigrations.swift
- Purpose: GRDB migrations for the feed domain (`feed_posts`, `feed_comments`, `feed_translations`).
- Public API: `enum FeedDatabaseMigrations`; `runAll(on:)`, `registerAll(in:)`.
- Key behaviors: `feed_posts` carries denormalized counters + JSON blob columns (media, reactionSummary, repostOf, mentionedUsers, translations); indexes on createdAt, postId, parentId.
- Android port: Room migrations / `schemas/`. The blob-column-for-nested-objects pattern is fine for Room with TypeConverters.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift
- Purpose: `actor` serializing all feed writes; reads are `nonisolated`.
- Public API: `actor FeedPersistenceActor(dbWriter:)`; writes `insertPost(s)`, `updateLikeCount`, `updateCommentCount`, `deletePost`, `insertComment`, `deleteComment`, `updateCommentLikeCount`, `upsertPostTranslation`; reads `posts(cursor:limit:)`, `comments(forPostId:parentId:cursor:limit:)`; `Notification.Name.feedStoreShouldRefresh`.
- Key behaviors: every write bumps `changeVersion` and posts a global `feedStoreShouldRefresh` NotificationCenter event — deliberately NOT using GRDB `ValueObservation` because GRDB+Swift 6 strict concurrency crashes (`_swift_task_checkIsolatedSwift`). `upsertPostTranslation` merges into a JSON dict in the blob column.
- Dependencies: GRDB, `PostRecord`, `CommentRecord`.
- Android port: A repository with a Mutex/single-thread dispatcher; Room `Flow` queries give observation natively (no Swift-6 hazard) — Android can actually use reactive DB observation instead of the NotificationCenter workaround. Keep cursor-by-`createdAt` pagination.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/GRDBModels.swift
- Purpose: Legacy GRDB rows `DBConversation` / `DBMessage` (encodedData blob + minimal columns). Superseded by `cache_entries`/`MessageRecord` (tables dropped in migration v4).
- Android port: Skip — dead/legacy. Do not port.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MediaSnapshotStore.swift
- Purpose: `actor` saving pre-upload media bytes to disk for instant optimistic display.
- Public API: `MediaSnapshotStore.shared`; `save(data:forMessageId:type:) -> URL`, `snapshotURL(forMessageId:type:)`, `remove(forMessageId:type:)`, `cleanOlderThan(_:)`.
- Key behaviors: files under `cachesDirectory/meeshy_media_snapshots`, extension by type (jpg/mp4/m4a/bin); TTL sweep by creation date.
- Android port: A file store under `cacheDir/meeshy_media_snapshots`; clean via `WorkManager`. Used to render optimistic message media before upload completes.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift
- Purpose: GRDB migrations for the message domain — the richest schema in the app.
- Public API: `enum MessageDatabaseMigrations`; `runAll(on:)`, `registerAll(in:)`.
- Key behaviors: `messages` table (~70 columns: identity, content, state machine, encryption, reply/forward, ephemeral/effects, edit/delete, pin, denormalized sender, delivery counters, timestamps, JSON blobs for attachments/reactions/mentions, cached CoreText layout, `cachedTimeString`, `changeVersion`); `pending_ids` (local↔server id map); `message_translations` (unique idx on localId+lang), `message_transcriptions`, `message_audio_translations`, `local_attachments`; `outbox` table + v2 adds `clientMessageId` with backfill + coalescing index; `messages_fts` external-content FTS5 with AI/AD/AU triggers (`unicode61 remove_diacritics 2` for French accent folding).
- Android port: Room entities + `@Fts4`/FTS-via-raw-SQL (Room supports `@Fts4`; FTS5 needs raw SQL trigger setup). Replicate the trigger-maintained external-content index. The `clientMessageId` backfill migration is load-bearing for dedup.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift
- Purpose: `actor` — the single writer for the `messages` table; the heart of the local-first messaging engine.
- Public API: `actor MessagePersistenceActor(dbWriter:)`; `start()` (background write processor); `struct IncomingMessageData`; sync writes `insertOptimistic`, `applyEvent(localId:event:)->MessageState?`; buffered writes `bufferIncoming`, `bufferBatchDelivery`; `saveTranslation/Transcription/AudioTranslation`; edit/delete/restore (`markEdited`, `markDeleted`, `markUndeleted`), `updatePinned`, `updateBlurred`, `markConsumed`, `updateReactions`, `appendReaction`, `removeReaction`, `updateViewOnceCount`, `updateServerAckedFields`, `updateAttachmentsJson`, `touchUpdatedAt`, `updateLayout`, `updateDeliveryCounters`; `upsertFromAPIMessages([APIMessage]) async`; `deleteAll(conversationId:)`, `deleteExpiredEphemeral(before:)`, `purgeOldMessages(retentionMonths:=6)`; `nonisolated` reads `messages(for:before:after:limit:)`, `translations(for:)`, `resolveServerId/LocalId`; `Notification.Name.messageStoreShouldRefresh`.
- Key behaviors: writes feed an `AsyncStream<WriteOperation>` processed serially; **every** mutation posts a `messageStoreShouldRefresh` notification scoped by `conversationId` (asserts on empty set — unscoped notifications get dropped by observers, freezing UI). `upsertFromAPIMessages` is a major reconciliation routine: resolves an existing row via PendingIdRecord -> PK -> serverId-column scan (3-tier) to avoid duplicate bubbles; resolves `sender.userId` (gateway returns participantId), embeds transcriptions + audio translations into the attachment blob, persists REST text translations into GRDB. `effectFlags` bit-toggling for blurred/viewOnce/ephemeral. 6-month retention purge cascades to translation tables.
- Dependencies: GRDB, `MessageRecord`, `MessageStateMachine`, `PendingIdRecord`, `TranslationRecord`, `APIMessage`, `MeeshyMessageAttachment`, `MeeshyReaction`, `DynamicColorGenerator`.
- Android port: A `MessageRepository` backed by Room with a single-thread/Mutex writer. Room `Flow` replaces the NotificationCenter refresh. Preserve the 3-tier reconciliation lookup and the optimistic-row dedup — these prevent duplicate-message bugs. Background write processor -> a `Channel` consumed by one coroutine.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+ToMessage.swift
- Purpose: Maps the persistence `MessageRecord` to the domain `MeeshyMessage`.
- Public API: `MessageRecord.toMessage(currentUserId:) -> MeeshyMessage`.
- Key behaviors: decodes JSON blobs (attachments/reactions/replyTo/forwardedFrom/mentions); derives `MessageType`/`MessageSource`; resolves `DeliveryStatus` with server counters taking priority over the state machine (recognizes `state==.delivered/.read` to avoid the ✓✓ regressing to ✓); `id = serverId ?? localId`; `isMe = senderId == currentUserId`; sender color via `DynamicColorGenerator.colorForName`.
- Android port: A `MessageEntity.toDomain(currentUserId)` mapper. Keep the server-counter-priority delivery-status logic verbatim.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift
- Purpose: The GRDB row struct for `messages` (~70 fields).
- Public API: `struct MessageRecord` (full memberwise public init); `static computeTimeString(for:)`; `final class TimeStringCache` (`@unchecked Sendable`, NSLock-guarded shared `DateFormatter` "HH:mm"); `Equatable` by `(localId, changeVersion)`.
- Key behaviors: `cachedTimeString` pre-computed display string; `changeVersion` O(1) equality; thread-safe formatter avoids per-row `DateFormatter` allocs.
- Android port: Room `@Entity`. Use a cached/thread-safe `DateTimeFormatter` (already thread-safe in Java) for the time string. Keep `changeVersion` equality.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageState.swift
- Purpose: Delivery state enum + event enum for the message state machine.
- Public API: `enum MessageState: String, Comparable` (draft/queued/sending/sent/delivered/read/failed; `failed` ordinal -1); `enum MessageEvent` (enqueue, startSending, serverAck, delivered, readBy, sendFailed, retry, retryExhausted).
- Android port: Kotlin `enum class` + sealed class for events. `Comparable` ordinal monotone-progression maps directly.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStateMachine.swift
- Purpose: Pure, side-effect-free message-delivery state machine.
- Public API: `struct MessageStateMachine` (state, retryCount, serverId, lastError, deliveredAt, readAt); `maxRetries=3`; `apply(_ event) -> MessageState?` (nil = invalid transition).
- Key behaviors: transitions draft->queued->sending->sent->delivered->read; sendFailed retries up to 3 then ->failed; failed+retry resets count.
- Android port: A pure Kotlin class — directly portable, fully unit-testable. Keep it dependency-free.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/MigrateLegacyQueues.swift
- Purpose: One-shot legacy-queue migration entry point (now mostly a no-op; kept for tests).
- Public API: `enum MigrateLegacyQueues.migrateOnce(into:)`.
- Android port: Skip — no legacy queues on a fresh Android build.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/MutationPayloads.swift
- Purpose: `Codable & Sendable & Equatable` payload structs for the 15 non-message offline mutations (one file, many small structs).
- Public API: `MarkAsReadPayload`, `CreateConversationPayload`, `UpdateConversationPayload`, `SendFriendRequestPayload`, `RespondFriendRequestPayload`(+`Action` accept/reject), `BlockUserPayload`, `UnblockUserPayload`, `UpdateProfilePayload`, `UpdateSettingsPayload` (category + opaque `body: Data`), `PublishStoryPayload`, `RepostStoryPayload`, `CreatePostPayload`, `ToggleLikePostPayload`, `CreateCommentPayload`, `DeleteCommentPayload`, `ToggleLikeCommentPayload`. Each carries `clientMutationId` (dedup key to gateway `MutationLog`).
- Key behaviors: `UpdateSettingsPayload` keeps the SDK category-agnostic (encodes the concrete preference struct once into `body`).
- Android port: Kotlin `data class`es, `@Serializable`. The `clientMutationId` dedup contract must match the gateway. `body` as `ByteArray`.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift
- Purpose: `actor` — the unified outbox engine for offline-first writes (messages, edits, deletes, reactions, and the 15 non-message mutations). The largest file in this batch (~1640 lines).
- Public API: `OfflineQueue.shared`; signals `retrySucceeded`, `retryExhausted`, `retryDropped` (`SendablePassthrough`), `pendingCountPublisher`; `struct OfflineQueueItem` (clientMessageId `cid_<uuid>`, conversationId, content, attachmentIds, localAudioPath...); `OfflineEditPayload`, `OfflineDeletePayload`, `OfflineRetrySuccess`(+`ReactionContext`), `OfflineRetryExhausted`, `OfflineRetryDropped`; `enum OfflineQueueError`, `enum OutboxOutcome` (.applied/.exhausted); `protocol OfflineQueueing`; `configure(pool:)`, `outcomeStream(for:)`, `retryItem`, `retryByClientMessageId`, `enqueue(item)`, generic `enqueue(kind:payload:conversationId:)`, `enqueueAudio(...)`, `enqueueEdit`, `enqueueDelete`, `enqueueReaction`, `dequeue`, `pendingReactions`, `bootRecovery() -> BootRecoveryReport`, `retryAll()`, `clearAll`, `migrateToOutbox`, `deleteLegacyFile`.
- Key behaviors: SQLite `outbox` table is the durable store; per-`clientMessageId` **coalescing state machine** runs inside the GRDB transaction (send-after-delete dropped; send+delete cancels; edit merges into pending send; reaction add+remove cancels — emitting `retryDropped`). Audio uses a 2-phase write-ahead (INSERT row -> copy bytes; crash recovery marks orphans `.failed`). `bootRecovery` resets `.inflight`->`.pending` and fails audio orphans. `retryAll` drains the in-memory mirror on socket reconnect with 50-150ms jitter, then purges optimistic rows from `CacheCoordinator.messages`. `outcomeStream` gives one-shot cmid->outcome AsyncStreams for VMs.
- Dependencies: GRDB, `OutboxRecord`, `MessageSocketManager` (connection observer), `CacheCoordinator`, `ClientMessageId`/`ClientMutationId`.
- Android port: A `OfflineQueueRepository` backed by Room `outbox` entity. Coalescing must happen inside a Room `@Transaction`. Signals -> `SharedFlow`. `outcomeStream` -> `callbackFlow`/`Channel` per cmid. Connection observer -> `ConnectivityManager` callback. This is the **core offline engine** — port faithfully; it is the spine of the Instant-App principles (optimistic updates, offline queue, FIFO flush).

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxFlusher.swift
- Purpose: `actor` draining the `outbox` table FIFO with exponential backoff.
- Public API: `protocol OutboxDispatching { dispatch(OutboxRecord) }`; `OutboxFlusher(pool:dispatcher:maxAttempts=5:baseBackoff=2:maxBackoff=30:onOutcome:)`; `flush() async`; `reactionContext(for:)` helper.
- Key behaviors: fetches up to 50 `.pending` rows with `nextAttemptAt <= now` ordered by createdAt; per record marks `.inflight`, dispatches, deletes on success; on failure increments attempts, sets backoff = `min(30, 2·2^(n-1)) + jitter`, flips `.exhausted` at 5 attempts; emits both the `onOutcome` callback and `OfflineQueue.retryExhausted`.
- Android port: A `WorkManager` worker (or coroutine loop) calling a `dispatcher`. Backoff formula maps directly; `WorkManager` has built-in exponential backoff but the in-row attempt bookkeeping is still needed for the `.exhausted` UX.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift
- Purpose: GRDB row + enums for the unified outbox.
- Public API: `enum OutboxKind` (`CaseIterable`: sendMessage/sendReaction/editMessage/deleteMessage + 14 non-message kinds); `enum OutboxStatus` (pending/inflight/failed/exhausted); `struct OutboxRecord` (id, kind, conversationId, messageLocalId?, clientMessageId, payload blob, status, attempts, lastError, createdAt/updatedAt/nextAttemptAt).
- Key behaviors: raw values are stable on-disk identifiers — renaming a case is a migration.
- Android port: Room `@Entity` + Kotlin enums. Keep raw-value stability rule.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/PendingIdRecord.swift
- Purpose: GRDB row mapping optimistic `localId` -> server `serverId` (`pending_ids`).
- Public API: `struct PendingIdRecord { localId, serverId, conversationId, reconciledAt? }`.
- Android port: Room `@Entity` — central to optimistic-row reconciliation.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord.swift
- Purpose: GRDB row for `feed_posts` (denormalized counters + JSON blob columns).
- Public API: `struct PostRecord` (~30 fields, full public init); `Equatable` by `(id, changeVersion)`.
- Android port: Room `@Entity` with TypeConverters for blob columns.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReactionOutboxTypes.swift
- Purpose: Types for reaction outbox rows.
- Public API: `enum ReactionAction` (add/remove); `struct ReactionOutboxPayload` (messageId, emoji, action, conversationId, clientMessageId).
- Android port: Kotlin enum + `@Serializable data class`.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReconnectionGapDetector.swift
- Purpose: `actor` that, after a socket reconnect, fetches messages missed while offline ("gap fill") for active conversations.
- Public API: `actor ReconnectionGapDetector(persistence:messageService:)`; `activate/deactivate(conversationId:)`, `recordReceived(conversationId:at:)`, `onReconnected() async`; `actor AsyncSemaphore(limit:)`.
- Key behaviors: tracks per-conversation last-received timestamps in the App Group `UserDefaults` (`group.me.meeshy.apps`); on reconnect, `TaskGroup` paginates (page 100, cap 1000) each active conversation through `messageService.list` and buffers into `MessagePersistenceActor`; `AsyncSemaphore(limit:3)` caps concurrent syncs.
- Dependencies: `MessagePersistenceActor`, `MessageServiceProviding`.
- Android port: A class observing connectivity; `AsyncSemaphore` -> `kotlinx Semaphore`. App Group UserDefaults -> shared `DataStore`/`SharedPreferences` (multi-process if a notification service exists). `TaskGroup` -> `coroutineScope { launch {} }`. Important offline-correctness feature — port it.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/RetryEngine.swift
- Purpose: `actor` retrying messages stuck in `.queued` state, driven by GRDB `ValueObservation`.
- Public API: `protocol MessageSending`; `struct SendMessageResponse`; `actor RetryEngine(persistence:dbWriter:sender:)`; `start()`/`stop()`, `manualRetry(localId:)`.
- Key behaviors: observes `state == queued` rows; per message waits `backoffBase·3^retryCount`, applies `.startSending`, sends, applies `.serverAck`/`.sendFailed`; `inFlightLocalIds` guards double-send.
- Note: this duplicates retry responsibility with `OutboxFlusher`/`OfflineQueue` — partial tech debt; the two retry pipelines coexist.
- Android port: Room `Flow` query for `queued` messages -> a coroutine retry loop. Consider consolidating with the outbox flusher rather than carrying two retry engines.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/SearchIndexMigrations.swift
- Purpose: GRDB migrations for the standalone FTS5 search index (conversations + users).
- Public API: `enum SearchIndexMigrations`; `runAll(on:)`, `registerAll(in:)`.
- Key behaviors: creates `conversations_fts` and `users_fts` standalone (contentless) FTS5 tables, `id UNINDEXED`, tokenizer `unicode61 remove_diacritics 2`; UPSERT emulated in Swift via DELETE-then-INSERT.
- Android port: Raw-SQL FTS5 virtual tables in a Room migration, or Room `@Fts4` entities.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/SendablePassthrough.swift
- Purpose: `Sendable` wrappers around Combine subjects for use as `nonisolated` actor properties.
- Public API: `final class SendablePassthrough<Output>` (`send`, `receive(on:)`, `sink`, `publisher`); `final class SendableCurrentValueSubject<Output>` (`send`, `value`, `publisher`). Both have an explicit empty `deinit` to dodge a Swift 6.3.2 optimizer crash.
- Android port: Not needed — Kotlin `MutableSharedFlow`/`MutableStateFlow` are inherently thread-safe and used directly. The Swift-optimizer `deinit` workaround is iOS-only tech debt.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/SettingsActionQueue.swift
- Purpose: `actor` — a separate JSON-file FIFO queue for offline user-settings mutations (predates the unified outbox).
- Public API: `SettingsActionQueue.shared`; `struct SettingsAction` (id, endpoint, httpMethod, payload, createdAt); `pendingCountChanged`; `enqueue`, `flushIfPossible`, `clearAll`, `setFlushHandler`; last-write-wins per `(endpoint, httpMethod)`.
- Key behaviors: persists to `Documents/meeshy_cache/settings_action_queue.json`; flushes on `NetworkMonitor.isOffline` flip with 2s delay; FIFO stop-on-first-failure.
- Note: parallel persistence path next to `OfflineQueue` (which has `updateSettings`/`updateProfile` kinds) — tech debt; consolidate on Android.
- Android port: Do NOT replicate as a separate queue — fold settings mutations into the single outbox (`OutboxKind.updateSettings/updateProfile`).

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryOfflineQueue.swift
- Purpose: `actor` — a thin adapter forwarding all story-publish operations to the unified `StoryPublishQueue` (legacy public surface kept).
- Public API: `struct StoryOfflineQueueItem` (slideIds, slidePayloadJSON, mediaURLPaths, audioURLPaths, visibility...); `protocol OfflineQueueProviding`; `actor StoryOfflineQueue.shared`; `enqueue/dequeue/pendingItems/setOnPublish/flush/purge/reloadFromDisk`; `StoryQueueItemConverter.reverse(_:)`.
- Key behaviors: every call delegates to `StoryPublishQueue`; `setOnPublish` adapts the legacy `Bool` handler to the typed throwing handler.
- Android port: Skip the adapter layer — implement only `StoryPublishQueue`'s model on Android (one story queue).

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift
- Purpose: `actor` — the unified offline queue for pending story publications (disk-persisted, retrying).
- Public API: `struct StoryPublishQueueItem` (tempStoryId `pending_<uuid>`, visibility, slidesPayload blob, repostOfId?, mediaReferences, retryCount, lastError); `struct StoryMediaReference`; `StoryPublishSuccess`/`StoryPublishFailure`/`enum StoryPublishFailureReason`; `actor StoryPublishQueue.shared`; `publishSucceeded`/`publishFailed` signals; `enqueue`, `dequeue`, `clearAll`, `processNext`, `setPublishHandler`; `struct StoryPublishUnrecoverableError`.
- Key behaviors: persists to `Documents/meeshy_cache/story_publish_queue.json`; max queue 50, max retries 5, backoff schedule `[30,120,600,3600,7200]s`; before each retry hash-checks that referenced local media files still exist (missing -> permanent failure with `missingLocalMedia`); `StoryPublishUnrecoverableError` -> no retry; drains on socket reconnect.
- Android port: Room `@Entity` (better than JSON file) + `WorkManager` retry. Keep the media-existence pre-check and the explicit retry schedule. Signals -> `SharedFlow`.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryQueueMigrator.swift
- Purpose: One-shot migration draining the legacy `StoryOfflineQueue` JSON file into `StoryPublishQueue`; plus the pure converter.
- Public API: `protocol PublishQueueForwarding`; `enum StoryQueueMigrator.migrateLegacyOfflineQueue(publishQueue:)`; `enum StoryQueueItemConverter.convert(_:)` / `reverse(_:)`.
- Key behaviors: idempotent; corrupted JSON quarantined with `.corrupted-<timestamp>` suffix.
- Android port: Skip migration; port only `StoryQueueItemConverter` if both item shapes survive (likely just one shape on Android).

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationCacheRecord.swift
- Purpose: GRDB row for `translation_cache` (legacy per-message translation blob).
- Public API: `struct TranslationCacheRecord { messageId, targetLanguage, encodedData, cachedAt }`, composite PK.
- Android port: Room `@Entity`; likely superseded by `message_translations` — consider a single translation table.

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationRecords.swift
- Purpose: GRDB rows for message translation, transcription, and audio translation.
- Public API: `struct TranslationRecord` (id, messageLocalId, messageServerId?, targetLanguage, translatedContent, translationModel, confidenceScore?, sourceLanguage?, receivedAt); `struct TranscriptionRecord` (messageLocalId PK, language, text, segmentsJson, speakerCount, receivedAt); `struct AudioTranslationRecord` (id, messageLocalId, targetLanguage, audioUrl?, status, receivedAt).
- Android port: Three Room `@Entity`s. These back the Prisme Linguistique offline (translations survive restart).

## packages/MeeshySDK/Sources/MeeshySDK/Persistence/TusUploadCheckpoint.swift
- Purpose: GRDB row persisting in-flight TUS resumable-upload checkpoints.
- Public API: `struct TusUploadCheckpoint` (checkpointKey = SHA256 of file bytes PK, uploadURL, byteOffset, fileSize, fileName, mimeType, uploadContext?, thumbHash?, createdAt/updatedAt).
- Key behaviors: keyed on content hash so retries resume PATCH from `byteOffset` instead of re-uploading; survives app kills.
- Android port: Room `@Entity`. Use a TUS Android client (`tus-android-client`) or implement the protocol; persist the same checkpoint shape for resumable uploads.

## packages/MeeshySDK/Sources/MeeshySDK/Search/MessageSearchService.swift
- Purpose: BM25-ranked full-text search over locally cached messages.
- Public API: `struct MessageSearchService(reader:)`; `search(query:limit:conversationId:) async -> [MessageRecord]`.
- Key behaviors: joins `messages` with `messages_fts`; sanitizes FTS5 query (escapes `"`, wraps, appends `*` for prefix match); excludes soft-deleted; `ORDER BY bm25`.
- Android port: Raw-SQL FTS5 query through Room `@RawQuery` (or `@Fts4` + `MATCH`). Keep the query sanitization — prevents FTS operator injection.

## packages/MeeshySDK/Sources/MeeshySDK/Search/SearchIndex.swift
- Purpose: `actor` maintaining + querying the FTS5 index for conversations and users.
- Public API: `SearchIndex.shared`; `indexConversations([MeeshyConversation])`, `indexUsers([MeeshyUser])`, `removeConversation/removeUser(id:)`, `clearAll()`, `searchConversations(query:limit:) -> [String]`, `searchUsers(query:limit:) -> [String]`.
- Key behaviors: DELETE-then-INSERT upsert per id; search returns id lists, caller resolves to objects from the in-memory cache; same FTS5 sanitization as above.
- Dependencies: `AppDatabase`, `MeeshyConversation`, `MeeshyUser`.
- Android port: A repository over raw-SQL FTS5; index returns ids that the in-memory cache resolves. Pairs with a `GlobalSearchViewModel`.

## packages/MeeshySDK/Sources/MeeshySDK/Security/DatabaseEncryption.swift
- Purpose: AES-GCM-256 encrypt/decrypt for cache payloads, key in Keychain.
- Public API: `protocol DatabaseEncryptionProviding`; `DatabaseEncryption.shared`; `encrypt/decrypt(Data) -> Data?`, `encryptString/decryptString`, `encryptCodable/decryptCodable`, `destroyKey()`.
- Key behaviors: 256-bit `SymmetricKey` loaded from Keychain (`meeshy_db_encryption_key`) or freshly generated + stored; `AES.GCM.seal/.open` via `combined` representation; `destroyKey()` on account deletion makes remnant cache unrecoverable.
- Android port: `javax.crypto` AES/GCM with a key in the **Android Keystore** (`KeyGenParameterSpec`), or Jetpack Security `EncryptedFile`/`Tink`. For DB-at-rest consider SQLCipher. `destroyKey` -> delete the Keystore alias.

## packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift
- Purpose: Keychain wrapper with per-user namespacing and migration helpers.
- Public API: `enum KeychainError`; `KeychainManager.shared`; `save/load/delete(forKey:account:)`, `deleteAll()`, async `loadAsync/saveAsync`, `migrateToAfterFirstUnlock()`, `migrateFromUserDefaults(keys:)`, `migrateToNamespaced(userId:keys:)`.
- Key behaviors: service `me.meeshy.app`; namespaced account key `"<userId>.<key>"` so multiple users on one device cannot read each other's secrets; accessibility `AfterFirstUnlockThisDeviceOnly` (readable by the notification-service-extension after first unlock); migration helpers for accessibility upgrade, UserDefaults->Keychain, and un-namespaced->namespaced.
- Android port: `EncryptedSharedPreferences` (Jetpack Security) or Android Keystore-backed `DataStore`. Per-user namespacing -> prefix keys with userId. No "AfterFirstUnlock" concept; Keystore keys can require device-unlock auth if needed. Note CLAUDE.md flags a legacy tech debt: tokens historically in UserDefaults — on Android put tokens in `EncryptedSharedPreferences` from day one.

## packages/MeeshySDK/Sources/MeeshySDK/Services/AccountService.swift
- Purpose: Account deletion REST service.
- Public API: `AccountService.shared`; `deleteAccount(confirmationPhrase:) async`; `DeleteAccountResponse`. `DELETE /me/delete-account`.
- Android port: Retrofit service method.

## packages/MeeshySDK/Sources/MeeshySDK/Services/AffiliateService.swift
- Purpose: Affiliate-token CRUD + stats REST service.
- Public API: `AffiliateService.shared`; `listTokens(offset:limit:)`, `createToken(name:maxUses:expiresAt:)`, `deleteToken(id:)`, `fetchStats()`. Endpoints under `/affiliate/tokens`, `/affiliate/stats`.
- Android port: Retrofit service; user-facing referral/affiliate feature.

## packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift
- Purpose: Attachment REST operations.
- Public API: `AttachmentService.shared`; `requestTranscription(attachmentId:)`, `getStatusDetails(attachmentId:) -> [AttachmentStatusUser]`, `delete(attachmentId:)`. Endpoints `/attachments/{id}/transcribe|status-details`.
- Android port: Retrofit service.

## packages/MeeshySDK/Sources/MeeshySDK/Services/BlockService.swift
- Purpose: User block/unblock REST service + observable local block-set.
- Public API: `struct BlockedUser` (`CacheIdentifiable`); `protocol BlockServiceProviding`; `BlockService.shared` (`ObservableObject`, `@Published blockedUserIds: Set<String>`); `blockUser/unblockUser(userId:)`, `listBlockedUsers()`, `isBlocked(userId:)`, `refreshCache()`.
- Key behaviors: optimistically mutates `blockedUserIds` on the main actor after the network call; `listBlockedUsers` re-seeds the set.
- Android port: A repository exposing `StateFlow<Set<String>>`; ViewModels observe it to hide blocked users.

## packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityLinkService.swift
- Purpose: Builds shareable community links for communities the user admins/moderates.
- Public API: `CommunityLinkService.shared`; `listCommunityLinks() -> [CommunityLink]`, `stats(links:) -> CommunityLinkStats`. `GET /communities/mine?role=admin,moderator`.
- Key behaviors: composes `CommunityLink` with `MeeshyConfig.serverOrigin` base URL.
- Android port: Retrofit service + a link builder using the configured server origin.

## packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift
- Purpose: Full community CRUD + membership REST service.
- Public API: `protocol CommunityServiceProviding`; `CommunityService.shared`; `list`, `search`, `get`, `create`, `update`, `delete`, `getMembers`, `addMember`, `updateMemberRole`, `removeMember`, `join`, `leave`, `invite` (single + batch), `checkIdentifier`, `getConversations`, `addConversation`. Offset pagination.
- Key behaviors: batch `invite` loops single invites and throws an aggregate `MeeshyError.server` if any fail.
- Android port: Retrofit service implementing the same protocol. Communities are a full user-facing feature area (CRUD, membership, roles, identifier availability).

## packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift
- Purpose: Conversation analytics REST service.
- Public API: `ConversationAnalysisService.shared`; `fetchAnalysis(conversationId:) -> ConversationAnalysis`, `fetchStats(conversationId:) -> ConversationMessageStatsResponse`. Endpoints `/conversations/{id}/analysis|stats`.
- Android port: Retrofit service; feeds a conversation-insights screen.

## packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationDraftManager.swift
- Purpose: `actor` managing per-conversation composer drafts with debounced persistence.
- Public API: `ConversationDraftManager.shared`; `save(_ text:for:)`, `draft(for:) -> String?`, `clear(for:)`.
- Key behaviors: 500ms debounce per conversation (cancels prior task); empty text bypasses debounce and clears immediately; reads from `CacheCoordinator.drafts` GRDB store (handles `.fresh`/`.stale`/`.expired`/`.empty` `CacheResult`).
- Dependencies: `CacheCoordinator`, `ConversationDraft`.
- Android port: A class with a per-conversation debounce (coroutine `Job` cancel-and-replace, or `Flow.debounce`); persist to the drafts cache/Room. Empty-clear-immediately behavior matters for UX.

## packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift
- Purpose: Conversation REST service — list/CRUD/membership/moderation.
- Public API: `struct ConversationPage` (items, rawItems, nextCursor, hasMore); `protocol ConversationServiceProviding`; `ConversationService.shared`; `list` (offset), `listPage` (cursor, before `lastMessageAt`), `getById`, `create`, `delete`, `markRead/markAsReceived/markUnread`, `getParticipants`, `deleteForMe`, `removeParticipant`, `updateParticipantRole`, `update` (title/desc/avatar/banner/defaultWriteRole/isAnnouncementChannel/slowModeSeconds/autoTranslateEnabled), `leave`, `banParticipant/unbanParticipant`, `listSharedWith`, `findDirectWith`.
- Key behaviors: `listPage` parses a custom body with BOTH `pagination` (offset) and `cursorPagination` blocks, prefers cursor metadata; `mark*` endpoints decoded as `SimpleAPIResponse` (tolerant — the three endpoints return differently-shaped bodies); `update` uses a custom `Encodable` that omits nil fields (PATCH-style partial update).
- Dependencies: `APIClient`, `APIConversation`, `MeeshyConversation`.
- Android port: Retrofit service; cursor pagination (`before` = last conversation's lastMessageAt) maps to Paging 3. The tolerant `SimpleAPIResponse` decoding for `mark*` -> use `Unit`/ignore body. Custom omit-nil encoder -> `@JsonInclude(NON_NULL)` or a partial-update DTO.

## packages/MeeshySDK/Sources/MeeshySDK/Services/DataExportService.swift
- Purpose: GDPR-style data export REST service.
- Public API: `struct DataExportData` + `ExportedProfile`/`ExportedMessage`/`ExportedContact`(+`Participant`); `protocol DataExportServiceProviding`; `DataExportService.shared`; `requestExport(format:types:) -> DataExportData`. `GET /me/export?format=&types=`.
- Android port: Retrofit service; backs a "Download my data" settings screen.

## packages/MeeshySDK/Sources/MeeshySDK/Services/EdgeTranscriptionService.swift
- Purpose: `@MainActor` on-device speech-to-text via `SFSpeechRecognizer`.
- Public API: `EdgeTranscriptionService.shared` (`ObservableObject`, `@Published authorizationStatus`, `isTranscribing`); `requestAuthorization()`, `isAuthorized`, `transcribe(audioURL:locale:)`, `transcribe(audioData:locale:)`, `cancel()`, `normalizedLocale(for:)`, `supportedLocales`, `availableLocales`, `isLocaleSupported`; `struct OnDeviceTranscription`(+`Segment`); `enum EdgeTranscriptionError`.
- Key behaviors: pins everything to `@MainActor` (SFSpeechRecognizer init requirement); prefers `requiresOnDeviceRecognition`; retains the in-flight task to avoid an ARC-release crash; `normalizedLocale` promotes `"fr"` -> `"fr-FR"` using the device region; returns formatted text + per-segment timestamps/confidence + speaking rate.
- Android port: Android `SpeechRecognizer` with `EXTRA_PREFER_OFFLINE` (API 31+) or the on-device recognition intent; for richer offline use ML Kit / Vosk. Expose `StateFlow` for auth/transcribing state. Locale normalization maps directly. This is an edge-ML feature complementing the server Whisper pipeline.

---

## Architecture observations

State management & observation
- The SDK is split into `MeeshySDK` (no SwiftUI) and `MeeshyUI`. Services are singletons (`.shared`) but accept injected `APIClientProviding`/protocols for testability — every service defines a `*Providing` protocol.
- A deliberate, load-bearing anti-pattern workaround: persistence actors (`MessagePersistenceActor`, `FeedPersistenceActor`) do NOT use GRDB `ValueObservation` because GRDB + Swift 6 strict concurrency crashes (`_swift_task_checkIsolatedSwift`). Instead they post scoped `NotificationCenter` events (`messageStoreShouldRefresh` keyed by conversationId, `feedStoreShouldRefresh` global). **Android does not have this hazard** — use Room `Flow` observation directly; do not port the NotificationCenter relay.

Local-first / offline architecture (the centerpiece)
- A two-tier cache: L1 in-memory + L2 GRDB SQLite (`AppDatabase`), with a crash-safe in-memory fallback so the app never dies on disk failure.
- The unified `outbox` SQLite table + `OfflineQueue` (enqueue + per-clientMessageId coalescing state machine) + `OutboxFlusher` (FIFO drain, exponential backoff, `.exhausted` after 5 attempts) implement the Instant-App "offline queue, FIFO flush on reconnect" principle. `clientMessageId`/`clientMutationId` are the end-to-end idempotency keys shared with the gateway `MutationLog`.
- Optimistic-update reconciliation is sophisticated: `PendingIdRecord` maps localId<->serverId; `MessagePersistenceActor.upsertFromAPIMessages` uses a 3-tier lookup (PendingId -> PK -> serverId scan) specifically to prevent duplicate bubbles. The `MessageStateMachine` is a pure, fully-testable component. Port all of this faithfully — it is the spine of the messaging UX.
- `ReconnectionGapDetector` fills missed-message gaps after reconnect; `TusUploadCheckpoint` enables resumable uploads across app kills; `StoryPublishQueue` mirrors the outbox pattern for stories. `MediaSnapshotStore` enables instant optimistic media display.

Tech debt NOT to carry over
- Multiple parallel persistence paths: `SettingsActionQueue` (JSON file) duplicates the outbox's `updateSettings`/`updateProfile` kinds; `RetryEngine` duplicates `OutboxFlusher`'s retry role; `StoryOfflineQueue` is a pure adapter shim over `StoryPublishQueue`; `GRDBModels.swift`/`TranslationCacheRecord` are legacy. On Android, consolidate: ONE outbox, ONE retry engine, ONE story queue, ONE translation table.
- JSON-file queues (`SettingsActionQueue`, `StoryPublishQueue`) should be Room entities on Android, not files.
- CLAUDE.md flags tokens-in-UserDefaults as known debt — Android must use `EncryptedSharedPreferences`/Keystore from day one.
- Swift-6.3.2-optimizer `deinit` workarounds (`SendablePassthrough`) and the GRDB observation crash are iOS-specific; Kotlin Flows replace both cleanly.

Performance techniques worth preserving
- Off-thread CoreText layout pre-computation (`BubbleLayoutEngine`) cached in `messages` columns -> Compose `TextMeasurer` cached per message; the inline-timestamp heuristic is a genuine quality feature.
- `changeVersion`-based O(1) record equality on `MessageRecord`/`PostRecord`/`CommentRecord` -> keep for cheap `DiffUtil`/`equals`.
- Pre-computed `cachedTimeString` avoids per-row `DateFormatter`.
- SQLite tuning PRAGMAs + incremental vacuum scheduled on background -> apply via Room callbacks + `WorkManager`.
- FTS5 with `unicode61 remove_diacritics 2` for French-aware accent-folded search across messages/conversations/users; query sanitization prevents FTS-operator injection.

Security
- AES-GCM-256 cache encryption with the key in Keychain; per-user-namespaced Keychain entries; iOS Data Protection `.completeUntilFirstUserAuthentication` on the SQLite file. Android equivalents: Android Keystore + `EncryptedSharedPreferences`/Tink, and optionally SQLCipher for the DB.

### Portable user-facing features / capabilities
- [ ] Push notifications (APNs->FCM): permission request, tap-to-navigate, foreground/silent message activity signal, badge sync
- [ ] Offline-first messaging: optimistic send, durable outbox queue, FIFO flush + exponential backoff on reconnect
- [ ] Offline edit / delete / reaction with in-queue coalescing (send+delete cancels, edit merges, reaction toggle cancels)
- [ ] Offline non-message mutations: friend requests, block/unblock, profile/settings updates, posts, comments, likes
- [ ] Crash-safe boot recovery for in-flight queue items and orphaned audio files
- [ ] Resumable (TUS) media uploads that survive app kills
- [ ] Reconnection gap-fill: fetch messages missed while offline
- [ ] Message delivery state machine: sending -> sent -> delivered (✓✓) -> read, with retry/failed
- [ ] Local full-text search over messages, conversations, and users (accent-folded, BM25-ranked)
- [ ] Per-conversation composer drafts with debounced persistence
- [ ] On-device speech-to-text transcription of audio recordings
- [ ] Persisted message translations / transcriptions / audio translations (Prisme Linguistique offline)
- [ ] Offline story publishing queue with retry, media-existence check, and failure surfacing
- [ ] Communities: create/update/delete, membership, roles, join/leave, invites, shareable links
- [ ] Account deletion ("delete my account")
- [ ] GDPR data export ("download my data")
- [ ] Block/unblock users with reactive blocked-set
- [ ] Affiliate / referral tokens with usage stats
- [ ] Conversation analytics & message stats
- [ ] Encrypted local cache (AES-GCM) with per-user-isolated key storage
