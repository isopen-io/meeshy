import Foundation
import Combine
import GRDB
import os

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
