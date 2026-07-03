import Foundation
import Combine
import GRDB
import os

// MARK: - Offline Queue Item

public struct OfflineQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Stable end-to-end identifier (`cid_<uuid v4 lowercase>`) used to dedup
    /// the message on the server (see `MessagingService.handleMessage`
    /// catch-P2002 pattern in the gateway) and to coalesce in-queue actions
    /// targeting the same logical message (edit-after-send, delete-after-edit,
    /// etc.). Replaces the legacy `temp_/offline_/retry_*` prefixed local ids.
    public let clientMessageId: String
    /// Backwards-compatible alias surfaced as `tempId` to existing consumers
    /// (Combine subscribers, optimistic UI, persisted message cache rows).
    /// Now identical to `clientMessageId` — the legacy local-id prefix scheme
    /// has been removed end-to-end as of Phase 4.
    public var tempId: String { clientMessageId }
    public let conversationId: String
    public let content: String
    public let originalLanguage: String?
    public let replyToId: String?
    public let forwardedFromId: String?
    public let forwardedFromConversationId: String?
    public let attachmentIds: [String]?
    /// Raw values of `AttachmentKind` aligned with `attachmentIds` by index.
    /// `nil` when the queue item was created before this field existed (old
    /// on-disk rows decoded after a SDK upgrade) — the mapper falls back to
    /// `.image` per spec §4.2 in that case. Optional so the synthesized
    /// `Decodable` keeps reading legacy payloads without migration.
    public let attachmentKinds: [String]?
    /// Local filesystem path to a pending audio file kept under
    /// `Documents/pending-audio/<clientMessageId>.m4a` while the message
    /// waits for upload. `nil` for non-audio messages. The pattern is
    /// write-ahead: `OutboxRecord` is inserted FIRST (status `.pending`
    /// referencing this path), then the audio bytes are copied to disk.
    /// Boot recovery (`OfflineQueue.bootRecovery`) detects records whose
    /// referenced file is missing and marks them `.failed`.
    public let localAudioPath: String?
    /// Relative paths to N pending audio files for a MULTI-TRACK audio message,
    /// stored under `Documents/pending-audio/<clientMessageId>/<index>.m4a`.
    /// `nil` for non-audio and for legacy single-audio messages (which use
    /// `localAudioPath`). Decoded with `decodeIfPresent` so on-disk rows
    /// written before this field existed keep decoding without migration.
    public let localAudioPaths: [String]?
    /// Relative paths to N pending VISUAL media files (image/video) for an
    /// offline photo/video message, under
    /// `Documents/pending-media/<clientMessageId>/<index>.<ext>`. The original
    /// file extension is PRESERVED so the dispatcher can derive the upload MIME
    /// per file. `nil` for non-visual messages. Decoded with `decodeIfPresent`
    /// so on-disk rows written before this field existed keep decoding without
    /// migration (S7b — durable offline media, parity with `localAudioPaths`).
    public let localMediaPaths: [String]?
    public let createdAt: Date

    public init(
        conversationId: String,
        content: String,
        clientMessageId: String? = nil,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        attachmentIds: [String]? = nil,
        attachmentKinds: [String]? = nil,
        localAudioPath: String? = nil,
        localAudioPaths: [String]? = nil,
        localMediaPaths: [String]? = nil
    ) {
        self.id = UUID().uuidString
        self.clientMessageId = clientMessageId ?? ClientMessageId.generate()
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.attachmentKinds = attachmentKinds
        self.localAudioPath = localAudioPath
        self.localAudioPaths = localAudioPaths
        self.localMediaPaths = localMediaPaths
        self.createdAt = Date()
    }

    /// Decoder-friendly init that accepts a pre-existing `id` and `createdAt`,
    /// used when re-hydrating from `OutboxRecord.payload` at boot or retry time.
    public init(
        id: String,
        clientMessageId: String,
        conversationId: String,
        content: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        attachmentIds: [String]?,
        attachmentKinds: [String]? = nil,
        localAudioPath: String?,
        localAudioPaths: [String]? = nil,
        localMediaPaths: [String]? = nil,
        createdAt: Date
    ) {
        self.id = id
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
        self.content = content
        self.originalLanguage = originalLanguage
        self.replyToId = replyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.attachmentIds = attachmentIds
        self.attachmentKinds = attachmentKinds
        self.localAudioPath = localAudioPath
        self.localAudioPaths = localAudioPaths
        self.localMediaPaths = localMediaPaths
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case clientMessageId
        case conversationId
        case content
        case originalLanguage
        case replyToId
        case forwardedFromId
        case forwardedFromConversationId
        case attachmentIds
        case attachmentKinds
        case localAudioPath
        case localAudioPaths
        case localMediaPaths
        case createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.clientMessageId = try c.decode(String.self, forKey: .clientMessageId)
        self.conversationId = try c.decode(String.self, forKey: .conversationId)
        self.content = try c.decode(String.self, forKey: .content)
        self.originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage) ?? nil
        self.replyToId = try c.decodeIfPresent(String.self, forKey: .replyToId) ?? nil
        self.forwardedFromId = try c.decodeIfPresent(String.self, forKey: .forwardedFromId) ?? nil
        self.forwardedFromConversationId = try c.decodeIfPresent(String.self, forKey: .forwardedFromConversationId) ?? nil
        self.attachmentIds = try c.decodeIfPresent([String].self, forKey: .attachmentIds) ?? nil
        self.attachmentKinds = try c.decodeIfPresent([String].self, forKey: .attachmentKinds) ?? nil
        self.localAudioPath = try c.decodeIfPresent(String.self, forKey: .localAudioPath) ?? nil
        self.localAudioPaths = try c.decodeIfPresent([String].self, forKey: .localAudioPaths) ?? nil
        self.localMediaPaths = try c.decodeIfPresent([String].self, forKey: .localMediaPaths) ?? nil
        self.createdAt = try c.decode(Date.self, forKey: .createdAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(clientMessageId, forKey: .clientMessageId)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(content, forKey: .content)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(replyToId, forKey: .replyToId)
        try c.encodeIfPresent(forwardedFromId, forKey: .forwardedFromId)
        try c.encodeIfPresent(forwardedFromConversationId, forKey: .forwardedFromConversationId)
        try c.encodeIfPresent(attachmentIds, forKey: .attachmentIds)
        try c.encodeIfPresent(attachmentKinds, forKey: .attachmentKinds)
        try c.encodeIfPresent(localAudioPath, forKey: .localAudioPath)
        try c.encodeIfPresent(localAudioPaths, forKey: .localAudioPaths)
        try c.encodeIfPresent(localMediaPaths, forKey: .localMediaPaths)
        try c.encode(createdAt, forKey: .createdAt)
    }
}

// MARK: - Edit / Delete Payloads

/// Payload encoded into `OutboxRecord.payload` for an `editMessage` queue entry.
public struct OfflineEditPayload: Codable, Sendable {
    public let messageId: String
    public let clientMessageId: String
    public let content: String
    public let conversationId: String

    public init(messageId: String, clientMessageId: String, content: String, conversationId: String) {
        self.messageId = messageId
        self.clientMessageId = clientMessageId
        self.content = content
        self.conversationId = conversationId
    }
}

/// Payload encoded into `OutboxRecord.payload` for a `deleteMessage` queue entry.
public struct OfflineDeletePayload: Codable, Sendable {
    public let messageId: String
    public let clientMessageId: String
    public let conversationId: String

    public init(messageId: String, clientMessageId: String, conversationId: String) {
        self.messageId = messageId
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
    }
}

// MARK: - Retry Success Payload

/// Emitted when an offline-queued message successfully reaches the server after
/// reconnection. Downstream ViewModels map the optimistic `clientMessageId`
/// to the authoritative `serverId` so the incoming `message:new` socket event
/// reconciles instead of duplicating.
///
/// Wave 1 Task 3.6 — unified success payload covering both message-centric
/// (sendMessage, editMessage, deleteMessage) and reaction (sendReaction) outbox
/// kinds. ViewModels read `kind` to filter the subset they care about. The
/// `serverId` is non-nil only for `.sendMessage` (the only kind that produces
/// a new server-side id worth reconciling) — `.editMessage` / `.deleteMessage`
/// / `.sendReaction` deliveries return `nil` since the gateway emits its own
/// authoritative socket broadcast (`message:edited` / `message:deleted` /
/// `reaction:added`-`reaction:removed`) that the rest of the app already
/// consumes.
public struct OfflineRetrySuccess: Sendable {
    public let kind: OutboxKind
    public let clientMessageId: String
    public let serverId: String
    public let conversationId: String
    /// Populated when the success refers to a reaction mutation
    /// (`kind == .sendReaction`). Nil for message-centric kinds. Lets reaction
    /// subscribers filter on `(messageId, emoji)` without re-decoding the
    /// outbox payload.
    public let reaction: ReactionContext?

    /// Backwards-compatible alias kept for existing call sites that reference
    /// `tempId`. Always equal to `clientMessageId` post-Phase-4.
    public var tempId: String { clientMessageId }

    public init(
        clientMessageId: String,
        serverId: String,
        conversationId: String,
        kind: OutboxKind = .sendMessage,
        reaction: ReactionContext? = nil
    ) {
        self.kind = kind
        self.clientMessageId = clientMessageId
        self.serverId = serverId
        self.conversationId = conversationId
        self.reaction = reaction
    }

    /// Reaction-specific metadata surfaced alongside the unified signal so
    /// reaction subscribers (UI cells, indicators) can reconcile without
    /// rehydrating `ReactionOutboxPayload` from the outbox table.
    public struct ReactionContext: Sendable, Equatable {
        public let messageId: String
        public let emoji: String
        public let action: ReactionAction

        public init(messageId: String, emoji: String, action: ReactionAction) {
            self.messageId = messageId
            self.emoji = emoji
            self.action = action
        }
    }
}

// MARK: - Retry Exhausted / Dropped Payloads (Wave 1 Task 3.6)

/// Emitted when an outbox record exceeds its retry budget (5 attempts by
/// default — see `OutboxFlusher.maxAttempts`) or is permanently rejected by
/// the dispatcher (server replied with a terminal 4xx that won't change on
/// replay). Lets ViewModels flip the optimistic row to `.failed` and surface
/// a "tap to retry" affordance instead of leaving it stuck in `.sending`.
///
/// Replaces the per-queue `MessageRetryQueue.retryExhausted` +
/// `ReactionQueue.retryExhausted` signals — subscribers filter by `kind` to
/// pick the subset they care about.
public struct OfflineRetryExhausted: Sendable {
    public let kind: OutboxKind
    public let clientMessageId: String
    public let conversationId: String
    /// Populated when the failure refers to a reaction mutation
    /// (`kind == .sendReaction`). Nil otherwise.
    public let reaction: OfflineRetrySuccess.ReactionContext?
    /// Last error string captured on the outbox row at exhaustion time —
    /// useful for surfacing diagnostics in admin builds. Nil if the row
    /// never recorded an error (e.g. dispatcher returned a permanent reject
    /// directly).
    public let lastError: String?

    /// Backwards-compatible alias kept for existing call sites that reference
    /// `tempId`. Always equal to `clientMessageId` post-Phase-4.
    public var tempId: String { clientMessageId }

    /// Reaction-shape accessors so legacy reaction subscribers can still read
    /// `payload.messageId / .emoji / .action` without unwrapping
    /// `reaction` explicitly. Force-unwrap is safe at the call site because
    /// the subscriber already filtered `kind == .sendReaction`.
    public var messageId: String { reaction?.messageId ?? "" }
    public var emoji: String { reaction?.emoji ?? "" }
    public var action: ReactionAction { reaction?.action ?? .add }

    public init(
        kind: OutboxKind,
        clientMessageId: String,
        conversationId: String,
        reaction: OfflineRetrySuccess.ReactionContext? = nil,
        lastError: String? = nil
    ) {
        self.kind = kind
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
        self.reaction = reaction
        self.lastError = lastError
    }
}

/// Emitted when an outbox enqueue is dropped at write time by the coalescing
/// state machine — e.g. an `add` followed by a `remove` on the same
/// `(messageId, emoji)` cancels both records, so neither will reach the
/// server. ViewModels can use this to clear any "pending" hint they had
/// surfaced for the original optimistic action.
///
/// Replaces `ReactionQueue.retryDropped`.
public struct OfflineRetryDropped: Sendable {
    public let kind: OutboxKind
    public let clientMessageId: String
    public let conversationId: String
    public let reaction: OfflineRetrySuccess.ReactionContext?

    public var messageId: String { reaction?.messageId ?? "" }
    public var emoji: String { reaction?.emoji ?? "" }
    public var action: ReactionAction { reaction?.action ?? .add }

    public init(
        kind: OutboxKind,
        clientMessageId: String,
        conversationId: String,
        reaction: OfflineRetrySuccess.ReactionContext? = nil
    ) {
        self.kind = kind
        self.clientMessageId = clientMessageId
        self.conversationId = conversationId
        self.reaction = reaction
    }
}

// MARK: - Errors

public enum OfflineQueueError: Error, Sendable {
    /// `configure(pool:)` was never called — the queue has no SQLite outbox to
    /// persist into. Callers must wire a pool at boot before any `enqueue`.
    case poolNotConfigured
    /// A required encode/decode step failed. The wrapped error is the
    /// underlying `EncodingError` / `DecodingError`.
    case payloadCodingFailed(underlying: Error)
    /// The GRDB write transaction itself failed.
    case writeFailed(underlying: Error)
    /// `retryItem(_:)` was called with an `outboxId` that no longer exists in
    /// the outbox table — either it succeeded, was manually cleared, or the
    /// caller passed a stale id.
    case itemNotFound
}

// MARK: - Outcome

/// Terminal outcome of a queued mutation, observed via `outcomeStream(for:)`.
///
/// - `.applied(cmid)` is emitted when the outbox row for `cmid` is removed
///   after a successful flush (either via `retryAll`'s sendMessage path or via
///   `OutboxFlusher`'s generic dispatch path).
/// - `.exhausted(cmid)` is emitted when the retry budget is exhausted
///   (`attempts >= maxAttempts`) and the row's status is flipped to
///   `.exhausted`. The row stays in the table for manual `retryItem(_:)`.
public enum OutboxOutcome: Sendable, Equatable {
    case applied(cmid: String)
    case exhausted(cmid: String)

    /// The `clientMessageId` / `clientMutationId` this outcome describes,
    /// regardless of variant — convenient for routing observers.
    public var cmid: String {
        switch self {
        case .applied(let cmid), .exhausted(let cmid):
            return cmid
        }
    }
}

// MARK: - Test Seam

/// Subset of `OfflineQueue`'s public surface that consumers
/// (EditProfileViewModel + other Phase 4 VMs) depend on. Lets tests
/// inject a mock without faking the full actor.
public protocol OfflineQueueing: Sendable {
    @discardableResult
    func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String?
    ) async throws -> String

    func outcomeStream(for cmid: String) async -> AsyncStream<OutboxOutcome>

    /// U1b — durable write-ahead enqueue for an OFFLINE media post. Relocates the
    /// source files + inserts the `.createPost` row referencing them; the
    /// dispatcher replays the TUS upload on reconnect. On the protocol so
    /// ViewModels can route offline media posts through an injected (mockable)
    /// queue, like the generic `enqueue`.
    @discardableResult
    func enqueuePostMedia(
        sourceMediaURLs: [URL],
        clientMutationId: String,
        content: String?,
        visibility: String,
        originalLanguage: String?,
        type: String?
    ) async throws -> OfflineQueue.EnqueueMediaResult

    /// Draft recovery — returns the most recent unsent `.createPost` row whose
    /// type is in `matchingTypes` and that has been stuck for more than
    /// `olderThan` seconds (the "not sent within the minute → offline" rule), so
    /// the matching composer can pre-fill it as a draft. `nil` when nothing
    /// qualifies. Resolves the row's `localMediaPaths` back to existing file
    /// URLs so the composer can restore media too.
    func recoverLastUnsentPost(
        matchingTypes: Set<String>,
        olderThan: TimeInterval
    ) async -> RecoveredOfflinePost?

    /// Supersedes a recovered offline post/status/reel: deletes its `.createPost`
    /// outbox row (id `ofqm_<cmid>`) and reclaims its pending-media files. Called
    /// when the user re-sends the recovered draft so the resend replaces the
    /// stuck row instead of racing it to the server (no duplicate on reconnect).
    func cancelCreatePost(clientMutationId: String) async
}

/// A recovered offline post / status / reel, decoded from a stuck `.createPost`
/// outbox row so a composer can pre-fill it as a draft. Carries the originating
/// `clientMutationId` so the resend can supersede the original row via
/// `cancelCreatePost`.
public struct RecoveredOfflinePost: Sendable, Equatable {
    public let clientMutationId: String
    public let content: String
    public let visibility: String
    public let originalLanguage: String?
    /// `"POST" | "REEL" | "STATUS"` — defaulted to `"POST"` when the row carried
    /// no explicit type (legacy rows).
    public let type: String
    public let moodEmoji: String?
    public let audioUrl: String?
    public let audioDuration: Int?
    public let visibilityUserIds: [String]?
    /// Absolute file URLs of pending media that still exist on disk.
    public let localMediaURLs: [URL]
    public let createdAt: Date

    public init(
        clientMutationId: String,
        content: String,
        visibility: String,
        originalLanguage: String?,
        type: String,
        moodEmoji: String?,
        audioUrl: String?,
        audioDuration: Int?,
        visibilityUserIds: [String]?,
        localMediaURLs: [URL],
        createdAt: Date
    ) {
        self.clientMutationId = clientMutationId
        self.content = content
        self.visibility = visibility
        self.originalLanguage = originalLanguage
        self.type = type
        self.moodEmoji = moodEmoji
        self.audioUrl = audioUrl
        self.audioDuration = audioDuration
        self.visibilityUserIds = visibilityUserIds
        self.localMediaURLs = localMediaURLs
        self.createdAt = createdAt
    }
}

extension OfflineQueue: OfflineQueueing {}

/// Test seam for the message-centric `enqueue(_:)` path used by
/// `ConversationViewModel.sendMessage`. Naming avoids collision with
/// `OfflineQueueProviding` (story-specific) and `OfflineQueueing` (generic
/// non-message payload). Conforming types own the `OfflineQueueItem`
/// coalescing semantics so callers can `await` the persistence write before
/// reporting success to the user.
public protocol OfflineMessageQueueing: Sendable {
    func enqueue(_ item: OfflineQueueItem) async throws
    /// Durable offline message EDIT (T11). Coalesces with a pending send/edit
    /// for the same `clientMessageId` (see `enqueueEdit` impl).
    func enqueueEdit(_ payload: OfflineEditPayload) async throws
    /// Durable offline message DELETE (T11). Cancels a pending send / supersedes
    /// a pending edit for the same `clientMessageId` (see `enqueueDelete` impl).
    func enqueueDelete(_ payload: OfflineDeletePayload) async throws
}

extension OfflineQueue: OfflineMessageQueueing {}

// MARK: - Offline Queue

public actor OfflineQueue {
    public static let shared = OfflineQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<OfflineRetrySuccess>()
    /// Wave 1 Task 3.6 — unified terminal-failure signal. `OutboxFlusher`
    /// emits here when a record hits `maxAttempts`, and `OutboxDispatcher`
    /// emits here when it raises a permanent rejection (404/410/409 conflict
    /// for reactions) that the flusher would otherwise replay forever.
    public nonisolated let retryExhausted = SendablePassthrough<OfflineRetryExhausted>()
    /// Wave 1 Task 3.6 — emitted at enqueue time when the coalescing state
    /// machine collapses a reaction toggle (add+remove cancels). Lets the UI
    /// revert any "pending" hint without waiting for a server roundtrip.
    public nonisolated let retryDropped = SendablePassthrough<OfflineRetryDropped>()

    /// Backing subject for `pendingCountPublisher`. `nonisolated` so callers can
    /// read the publisher synchronously from any context (e.g. SwiftUI views)
    /// without awaiting the actor.
    private nonisolated let pendingCountSubject = SendableCurrentValueSubject<Int>(0)

    /// Publishes the current pending outbox count and every subsequent update.
    /// Emits the latest value immediately on subscription (Combine
    /// `CurrentValueSubject` semantics) so SwiftUI bindings render correctly
    /// on first connect.
    public nonisolated var pendingCountPublisher: AnyPublisher<Int, Never> {
        pendingCountSubject.publisher
    }

    /// Backing subject for `nearCapacityPublisher`.
    private nonisolated let nearCapacitySubject = SendableCurrentValueSubject<Bool>(false)

    /// Fires `true` when the queue is at or above 80% of `maxQueueSize` (400
    /// of 500 slots occupied), `false` once it drops back below the threshold.
    /// UI components should surface a warning so the user knows older messages
    /// may be evicted before connectivity is restored.
    public nonisolated var nearCapacityPublisher: AnyPublisher<Bool, Never> {
        nearCapacitySubject.publisher.removeDuplicates().eraseToAnyPublisher()
    }

    /// Synchronous snapshot — readable from any context without awaiting the actor.
    public nonisolated var isNearCapacity: Bool { nearCapacitySubject.value }

    /// Backing subject for `pendingUIItemsPublisher`. Mirrors the
    /// `.pending`/`.inflight`/`.failed` outbox rows as `OutboxUIItem` snapshots
    /// for the `SyncPill` UI. Kept `nonisolated` so SwiftUI bodies can read it
    /// without hopping into the actor.
    private nonisolated let pendingUIItemsSubject = SendableCurrentValueSubject<[OutboxUIItem]>([])

    /// Cap on the number of `OutboxUIItem` snapshots surfaced through the
    /// publisher. The pill UI only renders the head of the queue; an unbounded
    /// fetch on a large backlog would burn memory and decode time for rows the
    /// user can never see.
    private static let pendingUIItemsLimit = 50

    /// Publishes the current pending outbox UI snapshot and every subsequent
    /// change. Rows are ordered by `createdAt` ascending and filtered to
    /// `.pending` / `.inflight` / `.failed` statuses (drained rows are deleted
    /// from the table — there is no `.applied` status to exclude). Emits the
    /// latest value immediately on subscription.
    public nonisolated var pendingUIItemsPublisher: AnyPublisher<[OutboxUIItem], Never> {
        pendingUIItemsSubject.publisher
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    private static let maxQueueSize = 500

    /// Items-at-risk threshold: when the queue reaches this count the
    /// `nearCapacityPublisher` fires `true` so the UI can warn the user.
    /// Set at 80% of the max to give a meaningful heads-up before messages
    /// are silently evicted.
    private static let nearCapacityThreshold = maxQueueSize * 4 / 5

    /// Subdirectory under `Documents/` that holds pending audio files referenced
    /// by `OfflineQueueItem.localAudioPath`. Created lazily.
    public static let pendingAudioDirectoryName = "pending-audio"

    // Legacy file names — kept only for deletion on first boot.
    private static let legacyFileName = "offline_queue.json"

    private var items: [OfflineQueueItem] = []
    private var isRetrying = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
    /// Outbox pool — injected at boot via `configure(pool:)`. Nil until wired.
    private var outboxPool: (any DatabaseWriter)?
    /// Per-`cmid` outcome subscribers (AsyncStream continuations). A single
    /// cmid may have multiple observers (e.g. one ViewModel + one banner) ;
    /// each receives the same terminal event before the stream finishes.
    /// Keyed par token de souscription : un consommateur annulé ne retire
    /// QUE sa propre continuation — l'ancien `[String: [Continuation]]`
    /// droppait tout le slot, orphelinant les autres observateurs (await
    /// éternel + rétention de leur Task/ViewModel).
    private var outcomeContinuations: [String: [UUID: AsyncStream<OutboxOutcome>.Continuation]] = [:]
    /// Tombstones des outcomes déjà publiés (cap FIFO) : un abonné tardif
    /// reçoit l'outcome immédiatement au lieu d'attendre pour toujours un
    /// `publishOutcome` qui ne reviendra pas.
    private var outcomeTombstones = BoundedFIFOMap<String, OutboxOutcome>(capacity: 200)

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    /// Called when retrying a queued message via the in-memory path. Returns
    /// the server-assigned message id on success so the queue can emit a
    /// `retrySucceeded` event that lets active ViewModels reconcile the
    /// optimistic `clientMessageId` with the authoritative `serverId` before
    /// the socket `message:new` broadcast arrives.
    public var onRetrySend: ((OfflineQueueItem) async -> String?)?

    public func setRetrySend(_ handler: @escaping @Sendable (OfflineQueueItem) async -> String?) {
        onRetrySend = handler
    }

    /// Wires the outbox pool used for SQLite persistence.
    /// Must be called once at boot before any `enqueue` calls.
    public func configure(pool: any DatabaseWriter) {
        outboxPool = pool
        Task { await self.refreshPendingCount() }
    }

    private init() {
        Task { await self.observeConnection() }
        Task { await self.observeNetwork() }
    }

    // MARK: - Outcome Observation (Phase 4 prereq)

    /// Returns an `AsyncStream` that emits the terminal `OutboxOutcome` for
    /// the given `cmid` (clientMessageId or clientMutationId) — exactly one
    /// `.applied` or `.exhausted` event, then the stream completes.
    ///
    /// Callers that subscribe AFTER the outcome has already fired receive
    /// that outcome immediately from the tombstone map (bounded FIFO), then
    /// the stream completes. The expected lifecycle is : subscribe BEFORE
    /// issuing the mutation, then `await` the next iterator element to
    /// observe completion.
    public func outcomeStream(for cmid: String) -> AsyncStream<OutboxOutcome> {
        if let fired = outcomeTombstones[cmid] {
            return AsyncStream { continuation in
                continuation.yield(fired)
                continuation.finish()
            }
        }
        let token = UUID()
        return AsyncStream { continuation in
            self.outcomeContinuations[cmid, default: [:]][token] = continuation
            continuation.onTermination = { [weak self] _ in
                guard let self else { return }
                Task { await self.dropContinuation(for: cmid, token: token) }
            }
        }
    }

    /// Emits an outcome to every observer registered for `outcome.cmid`,
    /// finishes their streams, and clears the registry slot.
    ///
    /// Called from `retryAll()` (sendMessage success), from the
    /// `OutboxFlusher.onOutcome` callback (generic dispatch success /
    /// exhaustion), and from `retryItem(_:)` if the row is missing.
    public func publishOutcome(_ outcome: OutboxOutcome) {
        // Le flusher vient de supprimer (.applied) ou d'épuiser (.exhausted)
        // la ligne outbox de ce cmid — le nombre de writes en attente a changé.
        // `refreshPendingCount` ne tourne sinon que sur enqueue / retry, jamais
        // sur le chemin de drainage : sans ce rafraîchissement le compteur
        // reste figé sur sa valeur du boot et le bandeau « Synchronisation… »
        // ne se referme jamais une fois la file vidée.
        Task { await self.refreshPendingCount() }

        outcomeTombstones[outcome.cmid] = outcome
        guard let observers = outcomeContinuations.removeValue(forKey: outcome.cmid) else {
            return
        }
        for continuation in observers.values {
            continuation.yield(outcome)
            continuation.finish()
        }
    }

    /// Internal: removes the single continuation identified by `token` after
    /// its consumer cancelled (Task cancellation, scope exit). Idempotent —
    /// if the slot was already cleared by `publishOutcome`, this is a no-op.
    /// Surtout : ne touche PAS aux autres continuations du même cmid.
    private func dropContinuation(for cmid: String, token: UUID) {
        guard var slot = outcomeContinuations[cmid] else { return }
        slot.removeValue(forKey: token)
        if slot.isEmpty {
            outcomeContinuations.removeValue(forKey: cmid)
        } else {
            outcomeContinuations[cmid] = slot
        }
    }

    // MARK: - Manual Retry (Phase 4 prereq)

    /// Manually retries an outbox row that has previously failed or exhausted
    /// its retry budget. Resets `attempts` to 0, clears `lastError`, flips
    /// `status` back to `.pending`, and schedules `nextAttemptAt` for
    /// immediate retry on the flusher's next pass.
    ///
    /// Throws `OfflineQueueError.itemNotFound` if no row exists for
    /// `outboxId`. Throws `OfflineQueueError.poolNotConfigured` if
    /// `configure(pool:)` was never called.
    public func retryItem(_ outboxId: String) async throws {
        guard let pool = outboxPool else {
            throw OfflineQueueError.poolNotConfigured
        }

        let record = (try? await pool.read { db in
            try OutboxRecord.fetchOne(db, key: outboxId)
        }) ?? nil

        guard let record else {
            throw OfflineQueueError.itemNotFound
        }
        // Le retry ré-arme la ligne avec le MÊME cmid : sans cette purge, un
        // abonné post-retry (`outcomeStream(for:)`) recevait instantanément
        // le tombstone `.exhausted` périmé pour une mutation encore en vol.
        outcomeTombstones.removeValue(forKey: record.clientMessageId)

        let now = Date()
        do {
            try await pool.write { db in
                try db.execute(sql: """
                    UPDATE outbox
                    SET status = ?, attempts = 0, lastError = NULL,
                        updatedAt = ?, nextAttemptAt = ?
                    WHERE id = ?
                    """, arguments: [
                        OutboxStatus.pending.rawValue,
                        now,
                        now,
                        outboxId
                    ])
            }
        } catch {
            logger.error("retryItem write failed: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        await refreshPendingCount()
    }

    /// Convenience wrapper for UI surfaces (e.g. failed-message bubbles) that
    /// only know the `clientMessageId` of the optimistic message and not the
    /// underlying outbox row id. Resolves the latest matching row by
    /// `clientMessageId`, then delegates to `retryItem(_:)`.
    ///
    /// Throws `OfflineQueueError.itemNotFound` if no row exists for `cmid`.
    public func retryByClientMessageId(_ cmid: String) async throws {
        guard let pool = outboxPool else {
            throw OfflineQueueError.poolNotConfigured
        }
        let row: OutboxRecord? = (try? await pool.read { db in
            try OutboxRecord
                .filter(Column("clientMessageId") == cmid)
                .order(Column("createdAt").desc)
                .fetchOne(db)
        }) ?? nil
        guard let row else {
            throw OfflineQueueError.itemNotFound
        }
        try await retryItem(row.id)
    }

    // MARK: - Pending Count

    /// Raw `OutboxKind` values that MUST NOT keep the « Synchronisation… »
    /// indicator visible (`countsTowardSyncIndicator == false`). Shared by the
    /// count query AND the SyncPill UI-items query so the badge count and the
    /// rotating pill can never disagree about which rows are user-relevant — a
    /// `markAsRead` that lingers must be invisible in BOTH, not counted out of
    /// one while still rotating in the other.
    private static let syncIndicatorExcludedKinds: [String] = OutboxKind.allCases
        .filter { !$0.countsTowardSyncIndicator }
        .map(\.rawValue)

    /// Counts rows currently in `.pending` or `.inflight` state and updates
    /// `pendingCountSubject`. Called after every enqueue/dequeue/retryItem
    /// touchpoint. Falls back to the in-memory mirror if no pool is wired.
    /// Also refreshes the `pendingUIItemsSubject` snapshot so the SyncPill UI
    /// re-renders on the same touchpoints.
    private func refreshPendingCount() async {
        guard let pool = outboxPool else {
            let inMemoryCount = items.count
            pendingCountSubject.send(inMemoryCount)
            nearCapacitySubject.send(inMemoryCount >= Self.nearCapacityThreshold)
            pendingUIItemsSubject.send([])
            return
        }
        // Seules les opérations qui justifient l'indicateur « Synchronisation… »
        // sont comptées — un accusé de lecture (`markAsRead`) coincé ne doit
        // pas maintenir le bandeau alors que la conversation est synchronisée.
        let excludedKinds = Self.syncIndicatorExcludedKinds
        let count: Int = (try? await pool.read { db in
            try OutboxRecord
                .filter([OutboxStatus.pending.rawValue, OutboxStatus.inflight.rawValue]
                    .contains(Column("status")))
                .filter(!excludedKinds.contains(Column("kind")))
                .fetchCount(db)
        }) ?? items.count
        pendingCountSubject.send(count)
        nearCapacitySubject.send(count >= Self.nearCapacityThreshold)
        await refreshPendingUIItems()
    }

    /// Reads the head of the outbox table (rows in `.pending`, `.inflight`,
    /// `.failed` or `.exhausted` ordered by `createdAt` ascending, capped at
    /// `pendingUIItemsLimit`) and pushes the corresponding `OutboxUIItem`
    /// snapshots onto `pendingUIItemsSubject`. Decoding cost is paid once on
    /// each outbox mutation, never on the SwiftUI render path.
    ///
    /// Applies the SAME `syncIndicatorExcludedKinds` filter as the count query
    /// (`refreshPendingCount`): a `markAsRead` row is a background read receipt,
    /// not a user-initiated operation. Without this filter the SyncPill rotated
    /// through "Synchronisation des lus" for every conversation merely opened —
    /// phantom operations the user never started — while the badge count (which
    /// already excludes them) read zero. The pill must surface only rows that
    /// represent real work the user is waiting on.
    private func refreshPendingUIItems() async {
        guard let pool = outboxPool else {
            pendingUIItemsSubject.send([])
            return
        }
        let limit = Self.pendingUIItemsLimit
        let excludedKinds = Self.syncIndicatorExcludedKinds
        let records: [OutboxRecord] = (try? await pool.read { db in
            try OutboxRecord
                .filter([
                    OutboxStatus.pending.rawValue,
                    OutboxStatus.inflight.rawValue,
                    OutboxStatus.failed.rawValue,
                    // T14b — surface permanently-failed (`.exhausted`) rows so the
                    // SyncPill can show a non-message mutation that gave up; the
                    // T14 GC bounds how long they linger.
                    OutboxStatus.exhausted.rawValue
                ].contains(Column("status")))
                .filter(!excludedKinds.contains(Column("kind")))
                .order(Column("createdAt").asc)
                .limit(limit)
                .fetchAll(db)
        }) ?? []
        let items = records.map(OutboxUIItem.from(record:))
        pendingUIItemsSubject.send(items)
    }

    // MARK: - Queue Operations

    /// Enqueues `item` into the in-memory mirror and writes a corresponding
    /// `OutboxRecord` to the SQLite outbox table, applying the coalescing
    /// state machine described in `docs/superpowers/specs/2026-05-08-…§6.3`.
    ///
    /// Both the SELECT-existing read and the INSERT/UPDATE/DELETE write happen
    /// in the same GRDB transaction — there is no race window between
    /// detection of an existing pending record for `clientMessageId` and the
    /// merge/replace decision.
    ///
    /// Throws `OfflineQueueError.poolNotConfigured` if `configure(pool:)` was
    /// never called, `payloadCodingFailed` if encoding the item fails, and
    /// `writeFailed` if the underlying transaction throws.
    public func enqueue(_ item: OfflineQueueItem) async throws {
        guard let pool = outboxPool else {
            logger.error("enqueue called before configure(pool:) — refusing to drop the message silently")
            throw OfflineQueueError.poolNotConfigured
        }

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            logger.error("Failed to encode OfflineQueueItem: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }

        let outboxId = "ofq_\(item.id)"
        let conversationId = item.conversationId
        let clientMessageId = item.clientMessageId
        let createdAt = item.createdAt

        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch (existing?.kind, OutboxKind.sendMessage) {
                case (.none, _):
                    // No existing pending record — straight insert.
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)

                case (.deleteMessage?, _):
                    // sendMessage after a pending delete on the same id — the
                    // user re-typed something for an already-deleted local
                    // message. Drop the new send (cannot resurrect a deleted
                    // optimistic) but log so this surfaces in instrumentation.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .warning("sendMessage after deleteMessage on \(clientMessageId, privacy: .public), dropping")

                case (.sendMessage?, _):
                    // Same sendMessage already pending (idempotent re-enqueue,
                    // e.g. retry path). Refresh the payload + timestamps so
                    // attachmentIds and audio path stay current without
                    // creating a duplicate record.
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [payload, Date(), existing!.id])

                case (.editMessage?, _), (.sendReaction?, _):
                    // A pending edit/reaction precedes a fresh send for the
                    // same id — INSERT the send but log the unusual sequence.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .warning("sendMessage for \(clientMessageId, privacy: .public) follows a pending \(String(describing: existing?.kind), privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)

                default:
                    // Wave 1 Task 3.2 extended `OutboxKind` with 14 non-message
                    // kinds. They should never share a `clientMessageId` with a
                    // message row (different id-space: `cid_*` vs `cmid_*`), but
                    // if a collision happens, fall through to a clean INSERT and
                    // surface the anomaly in logs for diagnostics.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .error("sendMessage collides with non-message outbox kind \(String(describing: existing?.kind), privacy: .public) on \(clientMessageId, privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)
                }
            }
        } catch let error as OfflineQueueError {
            throw error
        } catch {
            logger.error("Outbox write failed: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued offline message for conversation \(item.conversationId, privacy: .public), queue size: \(self.items.count)")
        await refreshPendingCount()
    }

    // MARK: - Non-message mutation enqueue (Wave 1 Task 3.x)

    /// Sentinel `conversationId` used for outbox rows that don't belong to a
    /// specific conversation (profile updates, block/unblock, friend requests,
    /// settings, etc.). The schema requires a non-null value ; a stable
    /// sentinel keeps queries that filter by conversation from accidentally
    /// matching these rows.
    public static let globalConversationSentinel = "_global"

    /// Generic enqueue path for non-message outbox kinds (block, friend
    /// request, profile update, settings, etc.). Encodes the typed payload
    /// once, writes a single `OutboxRecord` to the outbox table, and returns
    /// immediately — the `OutboxFlusher` picks the record up on its next
    /// drain pass and routes it to the corresponding `OutboxDispatcher` arm.
    ///
    /// Unlike `enqueue(_:)` (sendMessage path) this method does NOT apply
    /// the message-coalescing state machine. Each call inserts a fresh row ;
    /// dedup is the gateway's job via `clientMutationId` + `MutationLog`.
    ///
    /// `clientMutationId` is extracted from the payload by encoding-then-
    /// decoding through a minimal envelope. This keeps the call site simple
    /// (`enqueue(.blockUser, payload: BlockUserPayload(...))`) without
    /// requiring a new protocol on every payload struct.
    ///
    /// - Parameters:
    ///   - kind: the outbox kind ; MUST be one of the non-message kinds.
    ///     Calling with `.sendMessage`/`.editMessage`/etc. is a programming
    ///     error and asserts in debug builds.
    ///   - payload: any `Codable & Sendable` mutation payload that carries
    ///     a `clientMutationId` field.
    ///   - conversationId: optional anchor conversation. Pass `nil` (the
    ///     default) to use the `_global` sentinel.
    /// - Returns: the outbox record id, so callers can correlate with
    ///   downstream events.
    @discardableResult
    public func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String? = nil
    ) async throws -> String {
        switch kind {
        case .sendMessage, .editMessage, .deleteMessage, .sendReaction:
            assertionFailure("enqueue(kind:payload:) is for non-message outbox kinds. Use the dedicated enqueue/enqueueEdit/enqueueDelete paths for \(kind).")
        default:
            break
        }

        guard let pool = outboxPool else {
            logger.error("enqueue(kind:payload:) called before configure(pool:) — refusing to drop the mutation silently")
            throw OfflineQueueError.poolNotConfigured
        }

        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            logger.error("Failed to encode payload for \(kind.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }

        // Extract clientMutationId from the encoded payload — every non-message
        // mutation payload carries one (see `MutationPayloads.swift`). We avoid
        // a new protocol by reading the JSON object directly. If extraction
        // fails or the value is malformed, we still write the row but with a
        // freshly minted cmid so the row remains observable in the outbox.
        let cmid = Self.extractClientMutationId(from: encoded) ?? ClientMutationId.generate()
        let outboxId = "ofqm_\(cmid)"
        let anchor = conversationId ?? Self.globalConversationSentinel
        let now = Date()
        let shouldCoalesce = Self.coalescesByAnchor(kind: kind)

        do {
            try await pool.write { db in
                if shouldCoalesce {
                    // Latest-state-wins kinds (e.g. `markAsRead`): drop every
                    // earlier `.pending` / `.failed` row for the same anchor
                    // before writing the new one. The newer payload always
                    // supersedes (reading up to msg N also covers 1..N-1) —
                    // so letting them pile up burns bandwidth and inflates
                    // the SyncPill rotation with 17 duplicates for 4 convs.
                    let stale: [OutboxRecord] = try OutboxRecord
                        .filter(Column("kind") == kind.rawValue)
                        .filter(Column("conversationId") == anchor)
                        .filter([OutboxStatus.pending.rawValue, OutboxStatus.failed.rawValue]
                            .contains(Column("status")))
                        .fetchAll(db)
                    if !stale.isEmpty {
                        let staleIds = stale.map(\.id)
                        try OutboxRecord
                            .filter(staleIds.contains(Column("id")))
                            .deleteAll(db)
                    }
                }
                try OutboxRecord(
                    id: outboxId,
                    kind: kind,
                    conversationId: anchor,
                    messageLocalId: nil,
                    clientMessageId: cmid,
                    payload: encoded,
                    status: .pending,
                    createdAt: now
                ).insert(db)
            }
        } catch {
            logger.error("Outbox write failed for \(kind.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        logger.info("Enqueued \(kind.rawValue, privacy: .public) outbox row \(outboxId, privacy: .public)")
        await refreshPendingCount()
        return outboxId
    }

    /// Whether the given `OutboxKind` should coalesce-on-enqueue: every new
    /// row for the same conversationId anchor supersedes earlier
    /// `.pending` / `.failed` rows of the same kind. Reserved for kinds
    /// whose payload is **monotonically idempotent** — applying only the
    /// latest one alone is equivalent to applying every intermediate one
    /// in sequence.
    ///
    /// Currently includes only `.markAsRead`: reading up to message N
    /// implicitly marks 1..N-1 as well, so a busy group conversation that
    /// fires `markAsRead` on every inbound message can collapse 17 stacked
    /// rows into a single one carrying the highest `upToMessageId` with
    /// no observable difference server-side. Other latest-state kinds
    /// (profile / settings / conversation updates) might be added later,
    /// but each needs a case-by-case audit to confirm intermediate states
    /// can be safely dropped.
    private static func coalescesByAnchor(kind: OutboxKind) -> Bool {
        switch kind {
        case .markAsRead:
            return true
        default:
            return false
        }
    }

    /// Reads the top-level `clientMutationId` field from a JSON-encoded
    /// payload without requiring the payload type to expose a protocol.
    private static func extractClientMutationId(from payload: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let cmid = object["clientMutationId"] as? String else {
            return nil
        }
        return ClientMutationId.isValid(cmid) ? cmid : nil
    }

    // MARK: - Audio offline (write-ahead 2-step)

    public enum EnqueueAudioError: Error, Sendable {
        /// `pool.write` of the outbox record itself threw. The audio file was
        /// not yet copied — the caller can safely surface the error and let
        /// the user retry without leaving a phantom on disk.
        case outboxWriteFailed(underlying: Error)
        /// `FileManager.copyItem` failed after the outbox record was inserted.
        /// We marked the record `.failed` to prevent the flusher from retrying
        /// against a missing file. The caller should also roll back any
        /// optimistic UI it inserted.
        case audioCopyFailed(underlying: Error)
        /// `configure(pool:)` was never called.
        case poolNotConfigured
    }

    /// Result of an `enqueueAudio` call. The relative `localAudioPath` is
    /// returned so the caller can update its optimistic UI to reference the
    /// stable persisted path (under `Documents/pending-audio/`) instead of
    /// the volatile `tmp/recording_*.m4a` URL that `sourceAudioURL` pointed at.
    public struct EnqueueAudioResult: Sendable {
        public let outboxId: String
        public let localAudioPath: String
    }

    /// Result of an `enqueueAudios` call (multi-track). `localAudioPaths`
    /// holds the N stable relative paths (under
    /// `Documents/pending-audio/<clientMessageId>/<index>.m4a`) the caller
    /// can use to reference the persisted tracks in its optimistic UI.
    public struct EnqueueAudiosResult: Sendable {
        public let outboxId: String
        public let localAudioPaths: [String]
    }

    /// Phase 4 §6.3 audio offline write-ahead. Atomicity between the SQLite
    /// outbox row and the on-disk audio file is impossible (two persistence
    /// systems), so we do it in two ordered phases :
    ///
    /// 1. Phase A — INSERT `OutboxRecord` referencing
    ///    `Documents/pending-audio/<clientMessageId>/0.m4a` (single-track is a
    ///    degenerate multi-track message routed through `enqueueAudios`, which
    ///    stores under the per-message subdir and records the path in
    ///    `localAudioPaths`). The record is `.pending` and the file does NOT
    ///    exist yet.
    /// 2. Phase B — `FileManager.copyItem` the source audio into that
    ///    pending path. On failure we UPDATE the outbox row to `.failed`
    ///    so the flusher does not retry against a missing file.
    /// 3. Phase C — best-effort delete the original `tmp/` source.
    ///
    /// Crash recovery between Phase A and Phase B is handled by
    /// `bootRecovery()` which sweeps `.pending` records whose referenced audio
    /// paths (`localAudioPath` and/or `localAudioPaths`) do not exist on disk
    /// and marks them `.failed`.
    /// The `clientMessageId` end-to-end dedup contract guarantees that an
    /// audio that actually reached the server before the crash will not
    /// produce a duplicate when the flusher replays whatever survived.
    @discardableResult
    public func enqueueAudio(
        sourceAudioURL: URL,
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil
    ) async throws -> EnqueueAudioResult {
        // Single-track audio is a degenerate multi-track message. Routing it
        // through `enqueueAudios([url], …)` keeps the write-ahead invariants
        // (outbox row first, files second, `.failed` on copy error) in one
        // place. The stored path lives under the per-message subdir
        // (`pending-audio/<cid>/0.m4a`) — `absoluteAudioPath(forStored:)`
        // resolves it identically, so existing readers keep working.
        let result = try await enqueueAudios(
            sourceAudioURLs: [sourceAudioURL],
            conversationId: conversationId,
            content: content,
            clientMessageId: clientMessageId,
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId
        )
        return EnqueueAudioResult(
            outboxId: result.outboxId,
            localAudioPath: result.localAudioPaths.first ?? ""
        )
    }

    /// Multi-track variant of `enqueueAudio`: persists N audio files as a
    /// SINGLE `OutboxRecord` (one logical message carrying N audio tracks).
    /// Same write-ahead ordering as the single-file path — the outbox row is
    /// inserted first (Phase A), then each source URL is copied into
    /// `Documents/pending-audio/<clientMessageId>/<index>.m4a` (Phase B). A
    /// copy failure on any track flips the row to `.failed` so the flusher
    /// never replays against a missing file. Boot recovery handles a crash
    /// between phases.
    @discardableResult
    public func enqueueAudios(
        sourceAudioURLs: [URL],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil
    ) async throws -> EnqueueAudiosResult {
        guard let pool = outboxPool else { throw EnqueueAudioError.poolNotConfigured }

        let relativePaths: [String] = try sourceAudioURLs.indices.map { index in
            try Self.pendingAudioRelativePath(for: clientMessageId, index: index)
        }
        let outboxId = "ofq_\(UUID().uuidString)"
        let now = Date()

        let item = OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: clientMessageId,
            conversationId: conversationId,
            content: content ?? "",
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            attachmentIds: nil,
            attachmentKinds: Array(repeating: AttachmentKind.audio.rawValue, count: sourceAudioURLs.count),
            localAudioPath: nil,
            localAudioPaths: relativePaths,
            createdAt: now
        )

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            throw EnqueueAudioError.outboxWriteFailed(underlying: error)
        }

        // Phase A — INSERT outbox row first. If this throws, the files are
        // still untouched on disk and the caller can retry.
        do {
            try await pool.write { db in
                try OutboxRecord(
                    id: outboxId,
                    kind: .sendMessage,
                    conversationId: conversationId,
                    messageLocalId: clientMessageId,
                    clientMessageId: clientMessageId,
                    payload: payload,
                    status: .pending,
                    createdAt: now
                ).insert(db)
            }
        } catch {
            throw EnqueueAudioError.outboxWriteFailed(underlying: error)
        }

        // Phase B — copy each audio into the per-message pending subdir. On
        // any failure, mark the row `.failed` so the flusher does not retry
        // against a missing file. We must NOT throw before that update lands.
        do {
            for (source, relativePath) in zip(sourceAudioURLs, relativePaths) {
                let absolutePath = Self.absoluteAudioPath(forStored: relativePath)
                let dst = URL(fileURLWithPath: absolutePath)
                if FileManager.default.fileExists(atPath: absolutePath) {
                    try FileManager.default.removeItem(at: dst)
                }
                try FileManager.default.copyItem(at: source, to: dst)
            }
        } catch {
            // S6 — a copy failure is permanent (the source bytes are
            // unreadable), so the row is TERMINAL: mark `.exhausted`
            // (GC-eligible via purgeExhaustedOlderThan) rather than `.failed`,
            // which the flusher never picks up and the GC never reclaims, so it
            // would leak in the outbox + SyncPill across every session.
            let copyError = error
            do {
                try await pool.write { db in
                    try db.execute(sql: """
                        UPDATE outbox
                        SET status = ?, lastError = ?, updatedAt = ?
                        WHERE id = ?
                        """, arguments: [
                            OutboxStatus.exhausted.rawValue,
                            "Audio copy failed: \(copyError.localizedDescription)",
                            Date(),
                            outboxId
                        ])
                }
            } catch {
                logger.error("Failed to mark audio outbox row .exhausted after copy error: \(error.localizedDescription, privacy: .public)")
            }
            // Best-effort clean any partially-copied tracks so they don't leak.
            for relativePath in relativePaths {
                try? FileManager.default.removeItem(atPath: Self.absoluteAudioPath(forStored: relativePath))
            }
            // Terminal signal so a live ViewModel resolves the optimistic bubble.
            emitRetryExhausted(OfflineRetryExhausted(
                kind: .sendMessage,
                clientMessageId: clientMessageId,
                conversationId: conversationId,
                lastError: "Audio copy failed: \(copyError.localizedDescription)"
            ))
            throw EnqueueAudioError.audioCopyFailed(underlying: copyError)
        }

        // Phase C — best-effort cleanup of the original tmp files. A failure
        // here is benign: the files live in `tmp/` and the OS reclaims them
        // on its own schedule.
        for source in sourceAudioURLs {
            try? FileManager.default.removeItem(at: source)
        }

        // Mirror the new item into the in-memory queue so the hot retry
        // path picks it up on the next reconnect without re-reading the
        // outbox.
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued \(sourceAudioURLs.count) audio track(s) for conversation \(conversationId, privacy: .public), message \(clientMessageId, privacy: .public)")
        await refreshPendingCount()

        return EnqueueAudiosResult(outboxId: outboxId, localAudioPaths: relativePaths)
    }

    public struct EnqueueMediaResult: Sendable {
        public let outboxId: String
        public let localMediaPaths: [String]

        public init(outboxId: String, localMediaPaths: [String]) {
            self.outboxId = outboxId
            self.localMediaPaths = localMediaPaths
        }
    }

    public enum EnqueueMediaError: Error, Sendable {
        case poolNotConfigured
        case outboxWriteFailed(underlying: Error)
        case mediaCopyFailed(underlying: Error)
    }

    /// S7b — durable write-ahead for an OFFLINE visual-media (photo/video)
    /// message, the parity twin of `enqueueAudios`. Phase A inserts the
    /// `.pending` outbox row referencing relative `localMediaPaths`; Phase B
    /// copies each source file under `Documents/pending-media/` (preserving the
    /// extension so the dispatcher can derive the MIME). A copy failure is
    /// permanent (the source bytes are unreadable) so the row is flipped
    /// `.exhausted` + cleaned + a terminal signal emitted (cf. S6), rather than
    /// retried against a missing file. The dispatcher (ST3) replays
    /// `localMediaPaths` via TUS on flush; until that lands this method has no
    /// caller, so no row can mis-dispatch.
    @discardableResult
    public func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil
    ) async throws -> EnqueueMediaResult {
        guard let pool = outboxPool else { throw EnqueueMediaError.poolNotConfigured }

        let relativePaths: [String] = try sourceMediaURLs.indices.map { index in
            try Self.pendingMediaRelativePath(
                for: clientMessageId, index: index, ext: sourceMediaURLs[index].pathExtension)
        }
        let outboxId = "ofq_\(UUID().uuidString)"
        let now = Date()

        let item = OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: clientMessageId,
            conversationId: conversationId,
            content: content ?? "",
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            attachmentIds: nil,
            attachmentKinds: kinds,
            localAudioPath: nil,
            localAudioPaths: nil,
            localMediaPaths: relativePaths,
            createdAt: now
        )

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            throw EnqueueMediaError.outboxWriteFailed(underlying: error)
        }

        // Phase A — INSERT outbox row first (write-ahead). If this throws, the
        // source files are still untouched and the caller can retry.
        do {
            try await pool.write { db in
                try OutboxRecord(
                    id: outboxId,
                    kind: .sendMessage,
                    conversationId: conversationId,
                    messageLocalId: clientMessageId,
                    clientMessageId: clientMessageId,
                    payload: payload,
                    status: .pending,
                    createdAt: now
                ).insert(db)
            }
        } catch {
            throw EnqueueMediaError.outboxWriteFailed(underlying: error)
        }

        // Phase B — copy each media file into the per-message pending subdir.
        do {
            try Self.copyPendingMediaFiles(sources: sourceMediaURLs, to: relativePaths)
        } catch {
            // S6 — a copy failure is permanent; mark the row terminal so it
            // doesn't leak, clean partial copies, and emit the terminal signal.
            let copyError = error
            do {
                try await pool.write { db in
                    try db.execute(sql: """
                        UPDATE outbox SET status = ?, lastError = ?, updatedAt = ? WHERE id = ?
                        """, arguments: [
                            OutboxStatus.exhausted.rawValue,
                            "Media copy failed: \(copyError.localizedDescription)",
                            Date(),
                            outboxId
                        ])
                }
            } catch {
                logger.error("Failed to mark media outbox row .exhausted after copy error: \(error.localizedDescription, privacy: .public)")
            }
            for relativePath in relativePaths {
                try? FileManager.default.removeItem(atPath: Self.absoluteMediaPath(forStored: relativePath))
            }
            emitRetryExhausted(OfflineRetryExhausted(
                kind: .sendMessage,
                clientMessageId: clientMessageId,
                conversationId: conversationId,
                lastError: "Media copy failed: \(copyError.localizedDescription)"
            ))
            throw EnqueueMediaError.mediaCopyFailed(underlying: copyError)
        }

        // Phase C — best-effort cleanup of the original tmp sources.
        for source in sourceMediaURLs {
            try? FileManager.default.removeItem(at: source)
        }

        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued \(sourceMediaURLs.count) media file(s) for conversation \(conversationId, privacy: .public), message \(clientMessageId, privacy: .public)")
        await refreshPendingCount()

        return EnqueueMediaResult(outboxId: outboxId, localMediaPaths: relativePaths)
    }

    /// Phase B of a write-ahead media enqueue: copies each source file to its
    /// pending-media destination (overwriting a stale file at the same key).
    /// Shared by `enqueueMedia` (messages) and `enqueuePostMedia` (posts). Throws
    /// on the first copy failure — the caller flips the row terminal (S6).
    static func copyPendingMediaFiles(sources: [URL], to relativePaths: [String]) throws {
        for (source, relativePath) in zip(sources, relativePaths) {
            let absolutePath = absoluteMediaPath(forStored: relativePath)
            let dst = URL(fileURLWithPath: absolutePath)
            if FileManager.default.fileExists(atPath: absolutePath) {
                try FileManager.default.removeItem(at: dst)
            }
            try FileManager.default.copyItem(at: source, to: dst)
        }
    }

    /// U1b — durable write-ahead for an OFFLINE media POST, the parity twin of
    /// `enqueueMedia` (messages). Computes the pending paths, inserts the
    /// `.createPost` row referencing them via the generic enqueue (write-ahead),
    /// then copies each source under `Documents/pending-media/<cmid>/` (extension
    /// preserved so the dispatcher derives the MIME per file). A copy failure is
    /// permanent → the row is flipped `.exhausted` + cleaned + a terminal signal
    /// emitted (S6), rather than retried against a missing file. The dispatcher
    /// (U1b ST1) replays `localMediaPaths` via TUS on flush. Until the caller
    /// (ST2b) wires it, this has no caller, so no row can mis-dispatch.
    @discardableResult
    public func enqueuePostMedia(
        sourceMediaURLs: [URL],
        clientMutationId cmid: String,
        content: String?,
        visibility: String,
        originalLanguage: String? = nil,
        type: String? = nil
    ) async throws -> EnqueueMediaResult {
        guard let pool = outboxPool else { throw EnqueueMediaError.poolNotConfigured }

        let relativePaths: [String] = try sourceMediaURLs.indices.map { index in
            try Self.pendingMediaRelativePath(
                for: cmid, index: index, ext: sourceMediaURLs[index].pathExtension)
        }
        let payload = CreatePostPayload(
            clientMutationId: cmid,
            content: content ?? "",
            attachmentIds: [],
            visibility: visibility,
            originalLanguage: originalLanguage,
            localMediaPaths: relativePaths,
            type: type
        )

        // Phase A — write-ahead INSERT of the `.createPost` row (referencing the
        // not-yet-copied paths) via the generic enqueue, so a crash mid-copy
        // leaves a recoverable row (the dispatcher skips missing files).
        let outboxId: String
        do {
            _ = try await enqueue(.createPost, payload: payload, conversationId: nil)
            outboxId = "ofqm_\(cmid)"
        } catch {
            throw EnqueueMediaError.outboxWriteFailed(underlying: error)
        }

        // Phase B — copy each source into the per-cmid pending subdir.
        do {
            try Self.copyPendingMediaFiles(sources: sourceMediaURLs, to: relativePaths)
        } catch {
            // S6 — a copy failure is permanent; flip the row terminal so it
            // doesn't leak, clean partial copies, and emit the terminal signal.
            let copyError = error
            do {
                try await pool.write { db in
                    try db.execute(sql: """
                        UPDATE outbox SET status = ?, lastError = ?, updatedAt = ? WHERE id = ?
                        """, arguments: [
                            OutboxStatus.exhausted.rawValue,
                            "Post media copy failed: \(copyError.localizedDescription)",
                            Date(),
                            outboxId
                        ])
                }
            } catch {
                logger.error("Failed to mark post-media outbox row .exhausted after copy error: \(error.localizedDescription, privacy: .public)")
            }
            for relativePath in relativePaths {
                try? FileManager.default.removeItem(atPath: Self.absoluteMediaPath(forStored: relativePath))
            }
            emitRetryExhausted(OfflineRetryExhausted(
                kind: .createPost,
                clientMessageId: cmid,
                conversationId: "",
                lastError: "Post media copy failed: \(copyError.localizedDescription)"
            ))
            throw EnqueueMediaError.mediaCopyFailed(underlying: copyError)
        }

        // Phase C — best-effort cleanup of the original tmp sources.
        for source in sourceMediaURLs {
            try? FileManager.default.removeItem(at: source)
        }

        logger.info("Enqueued \(sourceMediaURLs.count) media file(s) for offline post, cmid \(cmid, privacy: .public)")
        return EnqueueMediaResult(outboxId: outboxId, localMediaPaths: relativePaths)
    }

    /// Persists an `editMessage` request, applying the coalescing rules from
    /// spec §6.3 (merge into a pending sendMessage, merge into a pending edit,
    /// drop after a pending delete).
    public func enqueueEdit(_ payload: OfflineEditPayload) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }
        let recordId = "ofqe_\(UUID().uuidString)"
        let now = Date()
        let conversationId = payload.conversationId
        let clientMessageId = payload.clientMessageId
        let log = logger
        let dec = decoder
        let enc = encoder
        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch existing?.kind {
                case .none:
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)

                case .sendMessage:
                    // Merge edit into pending send: rewrite the send's content.
                    guard let send = existing,
                          let item = try? dec.decode(OfflineQueueItem.self, from: send.payload) else {
                        log.error("Cannot merge edit — corrupt sendMessage payload, dropping edit")
                        return
                    }
                    let merged = OfflineQueueItem(
                        id: item.id,
                        clientMessageId: item.clientMessageId,
                        conversationId: item.conversationId,
                        content: payload.content,
                        originalLanguage: item.originalLanguage,
                        replyToId: item.replyToId,
                        forwardedFromId: item.forwardedFromId,
                        forwardedFromConversationId: item.forwardedFromConversationId,
                        attachmentIds: item.attachmentIds,
                        attachmentKinds: item.attachmentKinds,
                        localAudioPath: item.localAudioPath,
                        localAudioPaths: item.localAudioPaths,
                        localMediaPaths: item.localMediaPaths,
                        createdAt: item.createdAt
                    )
                    let mergedPayload = (try? enc.encode(merged)) ?? send.payload
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [mergedPayload, now, send.id])

                case .editMessage:
                    // Latest edit wins — replace payload.
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [encoded, now, existing!.id])

                case .deleteMessage:
                    // Edit-after-delete is impossible; drop with a warning.
                    log.warning("editMessage after deleteMessage on \(clientMessageId, privacy: .public), dropping")

                case .sendReaction:
                    // Edit alongside a pending reaction is fine — INSERT.
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)

                case .some(let other):
                    // Wave 1 Task 3.2 — non-message outbox kinds. Should not
                    // share a message `clientMessageId` ; if it ever does,
                    // insert alongside and log so the inconsistency surfaces.
                    log.error("editMessage collides with non-message outbox kind \(String(describing: other), privacy: .public) on \(clientMessageId, privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                }
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }
        await refreshPendingCount()
    }

    /// Persists a `deleteMessage` request. If a pending `sendMessage` or
    /// `editMessage` exists for the same `clientMessageId`, the local record
    /// is removed (no server roundtrip needed) per spec §6.3.
    public func enqueueDelete(_ payload: OfflineDeletePayload) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }
        let recordId = "ofqd_\(UUID().uuidString)"
        let now = Date()
        let conversationId = payload.conversationId
        let clientMessageId = payload.clientMessageId
        let dec = decoder
        do {
            let filesToSweep: [String] = try await pool.write { db -> [String] in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch existing?.kind {
                case .none:
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []

                case .sendMessage:
                    // Send + delete on the same pending id = no-op locally.
                    // Collect the cancelled send's pending media/audio files so
                    // they can be swept AFTER commit — otherwise the row vanishes
                    // but its files orphan under Documents/pending-*/ forever
                    // (parity with cancelCreatePost).
                    let sweep = existing
                        .flatMap { try? dec.decode(OfflineQueueItem.self, from: $0.payload) }
                        .map { Self.pendingLocalFileAbsolutePaths(for: $0) } ?? []
                    _ = try OutboxRecord.deleteOne(db, key: existing!.id)
                    return sweep

                case .editMessage:
                    // Pending edit becomes irrelevant; replace with a delete.
                    _ = try OutboxRecord.deleteOne(db, key: existing!.id)
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []

                case .deleteMessage:
                    // Already pending — idempotent, refresh timestamp only.
                    try db.execute(sql: """
                        UPDATE outbox SET updatedAt = ? WHERE id = ?
                        """, arguments: [now, existing!.id])
                    return []

                case .sendReaction:
                    // Delete alongside a pending reaction — INSERT.
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []

                case .some(let other):
                    // Wave 1 Task 3.2 — non-message outbox kinds. Should not
                    // share a message `clientMessageId` ; if collision happens,
                    // INSERT the delete alongside and log for diagnostics.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .error("deleteMessage collides with non-message outbox kind \(String(describing: other), privacy: .public) on \(clientMessageId, privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []
                }
            }
            // Sweep AFTER the row is durably gone, so a rolled-back write never
            // orphans a still-live send's files.
            let fm = FileManager.default
            for path in filesToSweep {
                try? fm.removeItem(atPath: path)
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        // Mirror the GRDB transaction in the in-memory queue used by the hot
        // retry path: a delete that collapsed a pending sendMessage must not
        // leave a phantom item in `items`, otherwise `retryAll()` will replay
        // a logically-deleted message until the next app restart. The gateway
        // dedup catches the duplicate but the optimistic row would flicker.
        items.removeAll { $0.clientMessageId == clientMessageId }
        await refreshPendingCount()
    }

    public func dequeue(_ itemId: String) async {
        let outboxId = "ofq_\(itemId)"
        items.removeAll { $0.id == itemId }
        guard let pool = outboxPool else {
            await refreshPendingCount()
            return
        }
        do {
            try await pool.write { db in
                _ = try OutboxRecord.deleteOne(db, key: outboxId)
            }
        } catch {
            logger.error("dequeue failed: \(error.localizedDescription, privacy: .public)")
        }
        await refreshPendingCount()
    }

    // MARK: - Offline Draft Recovery (createPost / status / reel)

    public func recoverLastUnsentPost(
        matchingTypes types: Set<String>,
        olderThan threshold: TimeInterval
    ) async -> RecoveredOfflinePost? {
        guard let pool = outboxPool else { return nil }
        let normalizedTypes = Set(types.map { $0.uppercased() })
        let cutoff = Date().addingTimeInterval(-threshold)
        let records: [OutboxRecord] = (try? await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.createPost.rawValue)
                .filter([
                    OutboxStatus.pending.rawValue,
                    OutboxStatus.inflight.rawValue,
                    OutboxStatus.failed.rawValue,
                    OutboxStatus.exhausted.rawValue
                ].contains(Column("status")))
                .order(Column("createdAt").desc)
                .fetchAll(db)
        }) ?? []

        let decoder = JSONDecoder()
        for record in records {
            // "Not sent within the minute → offline": only rows stuck longer than
            // the threshold qualify; a just-enqueued row is still actively sending.
            guard record.createdAt <= cutoff else { continue }
            guard let payload = try? decoder.decode(CreatePostPayload.self, from: record.payload) else { continue }
            let resolvedType = (payload.type ?? "POST").uppercased()
            guard normalizedTypes.contains(resolvedType) else { continue }

            let urls: [URL] = (payload.localMediaPaths ?? []).compactMap { stored in
                let path = Self.absoluteMediaPath(forStored: stored)
                return FileManager.default.fileExists(atPath: path) ? URL(fileURLWithPath: path) : nil
            }
            return RecoveredOfflinePost(
                clientMutationId: payload.clientMutationId,
                content: payload.content,
                visibility: payload.visibility,
                originalLanguage: payload.originalLanguage,
                type: resolvedType,
                moodEmoji: payload.moodEmoji,
                audioUrl: payload.audioUrl,
                audioDuration: payload.audioDuration,
                visibilityUserIds: payload.visibilityUserIds,
                localMediaURLs: urls,
                createdAt: record.createdAt
            )
        }
        return nil
    }

    public func cancelCreatePost(clientMutationId cmid: String) async {
        let outboxId = "ofqm_\(cmid)"
        guard let pool = outboxPool else { return }
        // Reclaim pending-media files before deleting the row so they don't leak.
        if let record = try? await pool.read({ db in try OutboxRecord.fetchOne(db, key: outboxId) }),
           let payload = try? JSONDecoder().decode(CreatePostPayload.self, from: record.payload) {
            for stored in payload.localMediaPaths ?? [] {
                try? FileManager.default.removeItem(atPath: Self.absoluteMediaPath(forStored: stored))
            }
        }
        do {
            try await pool.write { db in
                _ = try OutboxRecord.deleteOne(db, key: outboxId)
            }
        } catch {
            logger.error("cancelCreatePost failed: \(error.localizedDescription, privacy: .public)")
        }
        await refreshPendingCount()
    }

    // MARK: - Reaction Enqueue (Wave 1 Task 3.6 — ports ReactionQueue.enqueue)

    /// Persists a reaction mutation as an `OutboxRecord` of kind
    /// `.sendReaction`, applying the same coalescing state machine that
    /// previously lived in `ReactionQueue.enqueue`:
    ///
    /// - `(none)` + `add`/`remove` → INSERT
    /// - `add` already pending + `remove` → DELETE existing (round-trip avoided)
    /// - `remove` already pending + `add` → DELETE existing (round-trip avoided)
    /// - same action already pending → DROP the new record (idempotent dedup)
    ///
    /// The SELECT-existing read and the INSERT/DELETE write happen in the
    /// same GRDB transaction — there is no race between detection and merge.
    /// Drop / cancel outcomes fire `retryDropped` so optimistic UI hints can
    /// be reverted without a server roundtrip.
    ///
    /// Wave 1 Task 3.6 — this method replaces the actor-private
    /// `ReactionQueue.enqueue` ; behavior is preserved byte-for-byte, only the
    /// signaling target changes (unified `retryDropped` instead of the legacy
    /// per-queue `ReactionQueue.retryDropped`).
    public func enqueueReaction(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String? = nil
    ) async throws {
        guard let pool = outboxPool else {
            logger.error("enqueueReaction called before configure(pool:) — refusing to drop the reaction silently")
            throw OfflineQueueError.poolNotConfigured
        }

        let cid = clientMessageId ?? ClientMessageId.generate()
        // Match the legacy `rxq_<uuid>` namespace so any in-flight rows
        // written by the deleted `ReactionQueue` continue to be drained
        // correctly by the existing dispatcher (which routes by `kind`, not
        // by id prefix). The UUID is generated fresh per call ; collisions
        // on the same `(messageId, emoji)` are caught by the coalescing
        // state machine below.
        let outboxId = "rxq_\(UUID().uuidString)"
        let createdAt = Date()
        let payloadStruct = ReactionOutboxPayload(
            messageId: messageId,
            emoji: emoji,
            action: action,
            conversationId: conversationId,
            clientMessageId: cid
        )

        let payloadData: Data
        do {
            payloadData = try encoder.encode(payloadStruct)
        } catch {
            logger.error("Failed to encode ReactionOutboxPayload: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }

        let dec = decoder
        let log = logger

        // Drop reasons emitted after the transaction commits. Inside the
        // closure we cannot emit Combine values without re-entering the actor;
        // we collect the snapshot and fire it post-commit.
        enum CoalesceOutcome: Sendable {
            case inserted
            case droppedNew(matched: ReactionOutboxPayload)
            case cancelledBoth(matched: ReactionOutboxPayload)
        }

        let outcome: CoalesceOutcome
        do {
            outcome = try await pool.write { db in
                // Find any pending sendReaction record on the same conversation
                // that matches `(messageId, emoji)`. Pending reaction queues are
                // typically tiny so decoding the payloads inline stays fast.
                let candidates = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)

                let match: (record: OutboxRecord, payload: ReactionOutboxPayload)? = candidates.lazy
                    .compactMap { record -> (OutboxRecord, ReactionOutboxPayload)? in
                        guard let decoded = try? dec.decode(ReactionOutboxPayload.self, from: record.payload),
                              decoded.messageId == messageId,
                              decoded.emoji == emoji
                        else { return nil }
                        return (record, decoded)
                    }
                    .first

                if let match {
                    if match.payload.action == action {
                        // Idempotent re-enqueue (same direction). Drop the new
                        // record, keep the existing one untouched.
                        log.info("Reaction \(action.rawValue, privacy: .public) \(emoji, privacy: .public) on \(messageId, privacy: .public) already pending — deduped")
                        return .droppedNew(matched: match.payload)
                    } else {
                        // Opposite directions cancel. Delete the existing
                        // pending record so neither hits the server.
                        _ = try OutboxRecord.deleteOne(db, key: match.record.id)
                        log.info("Reaction toggle cancelled in queue: \(match.payload.action.rawValue, privacy: .public) + \(action.rawValue, privacy: .public) on \(emoji, privacy: .public)/\(messageId, privacy: .public)")
                        return .cancelledBoth(matched: match.payload)
                    }
                }

                try OutboxRecord(
                    id: outboxId,
                    kind: .sendReaction,
                    conversationId: conversationId,
                    messageLocalId: cid,
                    clientMessageId: cid,
                    payload: payloadData,
                    status: .pending,
                    createdAt: createdAt
                ).insert(db)
                return .inserted
            }
        } catch {
            logger.error("Outbox write failed for reaction: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        switch outcome {
        case .inserted:
            logger.info("Enqueued reaction \(action.rawValue, privacy: .public) \(emoji, privacy: .public) for message \(messageId, privacy: .public)")
        case .droppedNew(let matched):
            // Surface the duplicate as a drop so optimistic UI can reconcile
            // (e.g. if the caller had already painted a "pending" badge for
            // this very tap, the existing pending record will resolve it).
            retryDropped.send(OfflineRetryDropped(
                kind: .sendReaction,
                clientMessageId: cid,
                conversationId: conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: messageId, emoji: emoji, action: action
                )
            ))
            _ = matched
        case .cancelledBoth(let matched):
            // Both the existing pending record and the new mutation are gone:
            // emit a drop for each side so callers can revert optimistic
            // visuals. The existing record is keyed off `matched`, the new one
            // off the freshly built payload.
            retryDropped.send(OfflineRetryDropped(
                kind: .sendReaction,
                clientMessageId: matched.clientMessageId,
                conversationId: matched.conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: matched.messageId,
                    emoji: matched.emoji,
                    action: matched.action
                )
            ))
            retryDropped.send(OfflineRetryDropped(
                kind: .sendReaction,
                clientMessageId: cid,
                conversationId: conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: messageId, emoji: emoji, action: action
                )
            ))
        }
    }

    /// Convenience accessor for tests / ViewModels that want to read the
    /// current pending reaction backlog without going through the generic
    /// outbox query. Decodes each `.sendReaction` payload and surfaces the
    /// `(messageId, emoji, action)` triple plus the outbox row id.
    public var pendingReactions: [ReactionOutboxPayload] {
        get async {
            guard let pool = outboxPool else { return [] }
            do {
                let dec = decoder
                return try await pool.read { db in
                    let records = try OutboxRecord
                        .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                        .filter(Column("status") == OutboxStatus.pending.rawValue)
                        .order(Column("createdAt").asc)
                        .fetchAll(db)
                    return records.compactMap { record -> ReactionOutboxPayload? in
                        try? dec.decode(ReactionOutboxPayload.self, from: record.payload)
                    }
                }
            } catch {
                logger.error("pendingReactions read failed: \(error.localizedDescription, privacy: .public)")
                return []
            }
        }
    }

    /// Internal helper used by the dispatcher (and the unified retry path) to
    /// emit a `retryExhausted` event without re-entering the actor. Lives on
    /// `OfflineQueue` itself so the signal stays a `nonisolated let` accessed
    /// from anywhere (including `OutboxFlusher` and `OutboxDispatcher`) with
    /// no actor-hop overhead.
    public nonisolated func emitRetryExhausted(_ payload: OfflineRetryExhausted) {
        retryExhausted.send(payload)
    }

    public var pendingItems: [OfflineQueueItem] {
        items
    }

    public var count: Int {
        items.count
    }

    public var isEmpty: Bool {
        items.isEmpty
    }

    // MARK: - Boot Recovery

    /// Boot-time crash recovery: any record left in `.inflight` from a previous
    /// process — the app crashed mid-dispatch — is reset to `.pending` so the
    /// flusher will pick it back up. Idempotent dedup on the gateway
    /// (`MessagingService.handleMessage` catch-P2002, see Phase 4 §6.2)
    /// guarantees that a message which actually reached the server before the
    /// crash will not produce a duplicate at replay time.
    ///
    /// Audio sweep: any `.pending` record whose `OfflineQueueItem.localAudioPath`
    /// no longer exists on disk (e.g. crash between Phase A INSERT and Phase B
    /// file copy) is marked `.failed` since the underlying audio bytes are
    /// gone and the record can never succeed.
    @discardableResult
    public func bootRecovery() async throws -> BootRecoveryReport {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let dec = decoder
        let log = logger
        var report = BootRecoveryReport()
        do {
            report = try await pool.write { db in
                var local = BootRecoveryReport()
                let inflight = try OutboxRecord
                    .filter(Column("status") == OutboxStatus.inflight.rawValue)
                    .fetchAll(db)
                for record in inflight {
                    try db.execute(sql: """
                        UPDATE outbox
                        SET status = ?, lastError = ?, updatedAt = ?
                        WHERE id = ?
                        """, arguments: [
                            OutboxStatus.pending.rawValue,
                            "Reset on boot after presumed crash",
                            Date(),
                            record.id
                        ])
                    local.inflightReset += 1
                }

                // Missing-file sweep — audio AND visual media (R-OB4). Any
                // referenced pending file gone on disk means the pre-crash copy
                // never landed → the bytes are gone, the row can never succeed.
                let pendingSends = try OutboxRecord
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .fetchAll(db)
                let fm = FileManager.default
                for record in pendingSends {
                    guard let item = try? dec.decode(OfflineQueueItem.self, from: record.payload) else { continue }
                    // Legacy single-track + multi-track audio AND visual media
                    // paths are all checked. S6 — a row with any missing file is
                    // marked `.exhausted` (terminal + GC-eligible via
                    // purgeExhaustedOlderThan), NOT `.failed`, which the flusher
                    // never picks up and the GC never reclaims, so it would leak
                    // in the outbox + SyncPill across every session. Without the
                    // media branch a pending photo/video send with vanished files
                    // stayed `.pending` and burned 5 dispatcher upload attempts
                    // (or sent a PARTIAL message if only some files survived).
                    let audioPaths = ([item.localAudioPath].compactMap { $0 } + (item.localAudioPaths ?? []))
                        .filter { !$0.isEmpty }
                    let mediaPaths = (item.localMediaPaths ?? []).filter { !$0.isEmpty }
                    guard !audioPaths.isEmpty || !mediaPaths.isEmpty else { continue }
                    let audioMissing = audioPaths.contains { !fm.fileExists(atPath: Self.absoluteAudioPath(forStored: $0)) }
                    let mediaMissing = mediaPaths.contains { !fm.fileExists(atPath: Self.absoluteMediaPath(forStored: $0)) }
                    if audioMissing || mediaMissing {
                        try db.execute(sql: """
                            UPDATE outbox
                            SET status = ?, lastError = ?, updatedAt = ?
                            WHERE id = ?
                            """, arguments: [
                                OutboxStatus.exhausted.rawValue,
                                audioMissing ? "Audio file missing after crash" : "Media file missing after crash",
                                Date(),
                                record.id
                            ])
                        log.warning("Pending file missing for OutboxRecord \(record.id, privacy: .public), marked .exhausted")
                        if audioMissing { local.audioOrphanFailed += 1 }
                        if mediaMissing { local.mediaOrphanFailed += 1 }
                    }
                }
                return local
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }
        if report.inflightReset > 0 || report.audioOrphanFailed > 0 {
            logger.info("Boot recovery: reset \(report.inflightReset) inflight, marked \(report.audioOrphanFailed) audio orphans failed")
        }
        return report
    }

    public struct BootRecoveryReport: Sendable, Equatable {
        public var inflightReset: Int = 0
        public var audioOrphanFailed: Int = 0
        public var mediaOrphanFailed: Int = 0
        public init() {}
    }

    // MARK: - Audio File Helpers

    /// Returns the absolute on-disk path for a pending audio file given the
    /// stored relative path persisted in `OfflineQueueItem.localAudioPath`.
    /// Stored paths are relative to `Documents/` so they survive container
    /// directory churn between OS upgrades.
    public static func absoluteAudioPath(forStored relativePath: String) -> String {
        if relativePath.hasPrefix("/") { return relativePath }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent(relativePath).path
    }

    /// Builds the canonical relative path under `Documents/pending-audio/`
    /// for a given `clientMessageId`. Creates the parent directory if needed.
    public static func pendingAudioRelativePath(for clientMessageId: String) throws -> String {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents.appendingPathComponent(pendingAudioDirectoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return "\(pendingAudioDirectoryName)/\(clientMessageId).m4a"
    }

    /// Builds the canonical relative path under
    /// `Documents/pending-audio/<clientMessageId>/<index>.m4a` for a single
    /// track of a multi-track audio message. Creates the per-message
    /// subdirectory if needed so the subsequent `copyItem` finds a destination
    /// directory. Resolves to the right absolute file via
    /// `absoluteAudioPath(forStored:)` (which simply prepends `Documents/`).
    public static func pendingAudioRelativePath(for clientMessageId: String, index: Int) throws -> String {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents
            .appendingPathComponent(pendingAudioDirectoryName, isDirectory: true)
            .appendingPathComponent(clientMessageId, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return "\(pendingAudioDirectoryName)/\(clientMessageId)/\(index).m4a"
    }

    // MARK: - S7b — pending visual-media paths

    public static let pendingMediaDirectoryName = "pending-media"

    /// Resolve a stored media relative path (under `Documents/`) to absolute —
    /// same Documents-relative resolution as audio.
    public static func absoluteMediaPath(forStored relativePath: String) -> String {
        absoluteAudioPath(forStored: relativePath)
    }

    /// Absolute on-disk paths of every pending media/audio file a send item
    /// references. Used to reclaim them when the send is cancelled/superseded
    /// (delete-before-flush) so they don't orphan under `Documents/pending-*/`.
    static func pendingLocalFileAbsolutePaths(for item: OfflineQueueItem) -> [String] {
        var paths = (item.localMediaPaths ?? []).map { absoluteMediaPath(forStored: $0) }
        paths += (item.localAudioPaths ?? []).map { absoluteAudioPath(forStored: $0) }
        if let single = item.localAudioPath, !single.isEmpty {
            paths.append(absoluteAudioPath(forStored: single))
        }
        return paths
    }

    /// Canonical relative path under
    /// `Documents/pending-media/<clientMessageId>/<index>.<ext>` for one track of
    /// an offline visual-media message. The original extension is PRESERVED so
    /// the dispatcher can derive the upload MIME per file. Creates the
    /// per-message subdir so the subsequent `copyItem` finds a destination.
    public static func pendingMediaRelativePath(for clientMessageId: String, index: Int, ext: String) throws -> String {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents
            .appendingPathComponent(pendingMediaDirectoryName, isDirectory: true)
            .appendingPathComponent(clientMessageId, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        let safeExt = ext.isEmpty ? "bin" : ext.lowercased()
        return "\(pendingMediaDirectoryName)/\(clientMessageId)/\(index).\(safeExt)"
    }

    // MARK: - Retry Logic

    public func retryAll() async {
        guard !isRetrying, !items.isEmpty else { return }
        guard let retrySend = onRetrySend else {
            logger.warning("No retry handler set, skipping retry")
            return
        }

        isRetrying = true
        logger.info("Retrying \(self.items.count) queued messages")

        var successIds: [String] = []
        var successPayloads: [OfflineRetrySuccess] = []

        for (index, item) in items.enumerated() {
            if index > 0 {
                // Brief jitter to avoid a thundering-herd on the gateway when
                // draining a large backlog — kept short so the user sees their
                // messages confirmed quickly (was 100–500 ms, now 50–150 ms).
                let jitter = UInt64(Double.random(in: 50...150) * 1_000_000)
                try? await Task.sleep(nanoseconds: jitter)
            }
            if let serverId = await retrySend(item) {
                successIds.append(item.id)
                successPayloads.append(OfflineRetrySuccess(
                    clientMessageId: item.clientMessageId,
                    serverId: serverId,
                    conversationId: item.conversationId
                ))
            } else {
                // Pas de `break` : un échec ne doit PAS bloquer la file.
                // Avec `break`, un item définitivement cassé en tête (ex :
                // conversation supprimée → 4xx permanent) bloquait tous les
                // items suivants — ils n'étaient jamais tentés. On passe au
                // suivant ; l'item échoué reste en file (non retiré) et sera
                // retenté au prochain cycle (front socket/réseau, backoff).
                continue
            }
        }

        let pool = outboxPool
        for id in successIds {
            items.removeAll { $0.id == id }
            if let pool {
                let outboxId = "ofq_\(id)"
                do {
                    try await pool.write { db in
                        _ = try OutboxRecord.deleteOne(db, key: outboxId)
                    }
                } catch {
                    logger.error("Failed to delete outbox record \(outboxId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        isRetrying = false

        // Clean the optimistic rows out of the persisted message cache so an
        // inactive ConversationViewModel (loaded later) doesn't show a ghost
        // optimistic row alongside the authoritative server message that
        // arrives via the socket `message:new` broadcast.
        for payload in successPayloads {
            await CacheCoordinator.shared.messages.mergeUpdate(for: payload.conversationId) { cached in
                cached.filter { $0.id != payload.clientMessageId }
            }
            retrySucceeded.send(payload)
            publishOutcome(.applied(cmid: payload.clientMessageId))
        }

        if !successIds.isEmpty {
            logger.info("Successfully retried \(successIds.count) messages, \(self.items.count) remaining")
        }
        await refreshPendingCount()
    }

    // MARK: - Connection Observer

    private func observeConnection() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    // Brief delay to let the socket handshake complete before
                    // draining the outbox — avoids sending on an unhealthy pipe
                    // while keeping the UX snappy (was 2 000 ms, now 200 ms).
                    try? await Task.sleep(nanoseconds: 200_000_000)
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Network Observer

    /// Symétrique de `observeConnection()`, mais piloté par la connectivité
    /// réseau et non par le socket. Au front montant (`isOffline` repasse à
    /// `false` — le réseau est revenu), on draine l'outbox. C'est un filet de
    /// sécurité indépendant du socket : si la reconnexion Socket.IO tarde ou
    /// n'a pas lieu, le simple retour du réseau suffit à repartir, `retryAll`
    /// envoyant en REST.
    private func observeNetwork() {
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    // Même délai que la voie socket : laisser la pile réseau
                    // se stabiliser avant de réémettre.
                    try? await Task.sleep(nanoseconds: 200_000_000)
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Clear

    public func clearAll() async {
        let ids = items.map { $0.id }
        items.removeAll()
        // Wipe complet (logout, tests) : les tombstones d'une session ne
        // doivent pas pouvoir rejouer un outcome dans la suivante.
        outcomeTombstones.removeAll()
        guard let pool = outboxPool else {
            await refreshPendingCount()
            return
        }
        do {
            try await pool.write { db in
                for id in ids {
                    _ = try OutboxRecord.deleteOne(db, key: "ofq_\(id)")
                }
            }
        } catch {
            logger.error("clearAll failed: \(error.localizedDescription, privacy: .public)")
        }
        await refreshPendingCount()
    }

    // MARK: - Outbox Migration (utility / testing)

    /// Copies pending in-memory items into an arbitrary `pool`. Idempotent —
    /// items already present (matched by prefixed id) are silently skipped.
    ///
    /// In production the outbox is already populated by `enqueue`. This method
    /// exists as a utility for migration testing and for legacy one-time boot
    /// migrations from old JSON files via `MigrateLegacyQueues`.
    public func migrateToOutbox(pool: any DatabaseWriter) async {
        let snapshot = items
        guard !snapshot.isEmpty else { return }

        let enc = encoder
        do {
            try await pool.write { db in
                for item in snapshot {
                    let outboxId = "ofq_\(item.id)"
                    guard try OutboxRecord.fetchOne(db, key: outboxId) == nil else { continue }
                    let payload = (try? enc.encode(item)) ?? Data()
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: item.conversationId,
                        messageLocalId: item.clientMessageId,
                        clientMessageId: item.clientMessageId,
                        payload: payload,
                        status: .pending,
                        attempts: 0,
                        lastError: nil,
                        createdAt: item.createdAt,
                        updatedAt: Date(),
                        nextAttemptAt: Date()
                    ).insert(db)
                }
            }
        } catch {
            logger.error("migrateToOutbox failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Legacy JSON File Deletion

    /// Deletes the legacy JSON persistence files from disk.
    /// Called once on first boot after migration to the outbox pipeline.
    ///
    /// Wave 1 Task 3.6 — also sweeps `message_retry_queue.json` and
    /// `reaction_queue.json`, the abandoned files owned by the deleted
    /// `MessageRetryQueue` and `ReactionQueue` actors. Failures are silent
    /// because the worst case is a few stale KB on disk that the next
    /// container migration will reclaim.
    public static func deleteLegacyFile() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        for name in [
            legacyFileName,
            "message_retry_queue.json",
            "reaction_queue.json"
        ] {
            let url = documents.appendingPathComponent("meeshy_cache/\(name)")
            try? FileManager.default.removeItem(at: url)
        }
    }

#if DEBUG
    // MARK: - Test Seams
    //
    // Narrow helpers used by the publisher refresh tests. They short-circuit
    // the production drain paths (`OutboxFlusher`, `retryAll()`) which would
    // require a far heavier test rig for what we only need: prove the
    // publisher reacts when outbox rows are deleted or flipped to `.failed`.

    /// Forces a refresh of both `pendingCountSubject` and
    /// `pendingUIItemsSubject` from the current outbox table state. Used by
    /// tests that mutate the table directly (bypassing `enqueue`) and need to
    /// observe the resulting snapshot.
    public func refreshForTesting() async {
        await refreshPendingCount()
    }

    /// Exposes the configured outbox pool so tests can read back the persisted
    /// `OutboxRecord` rows (and decode their payloads) without reaching into
    /// the actor's private state.
    public var outboxPoolForTesting: (any DatabaseWriter)? {
        outboxPool
    }

    /// Deletes every outbox row whose `clientMessageId` matches `cmid`,
    /// simulating a successful drain (the production drain path in
    /// `OutboxFlusher` and `retryAll()` also deletes the row outright since
    /// `OutboxStatus` has no `.applied` case).
    public func deleteForTesting(clientMessageId cmid: String) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        try await pool.write { db in
            _ = try OutboxRecord
                .filter(Column("clientMessageId") == cmid)
                .deleteAll(db)
        }
        await refreshPendingCount()
    }

    /// Flips every outbox row whose `clientMessageId` matches `cmid` to
    /// `.failed`, stamping `lastError` with `reason`. Mirrors what
    /// `OutboxFlusher` does after exceeding the retry budget without
    /// requiring a full flusher setup in the test.
    public func markFailedForTesting(clientMessageId cmid: String, reason: String) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        try await pool.write { db in
            try db.execute(sql: """
                UPDATE outbox
                SET status = ?, lastError = ?, updatedAt = ?
                WHERE clientMessageId = ?
                """, arguments: [
                    OutboxStatus.failed.rawValue,
                    reason,
                    Date(),
                    cmid
                ])
        }
        await refreshPendingCount()
    }
#endif
}
