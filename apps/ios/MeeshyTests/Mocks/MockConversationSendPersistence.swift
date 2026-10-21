import Foundation
import os
import MeeshySDK
@testable import Meeshy

actor MockConversationSendPersistence: ConversationSendPersisting {

    struct AppliedEvent: Equatable {
        let localId: String
        let event: String
    }

    struct FailedMark: Equatable {
        let localId: String
        let reason: String
    }

    struct Attempt: Equatable {
        let localId: String
        let transport: SendAttemptRecord.Transport
        let outcome: SendAttemptRecord.Outcome
        let errorMessage: String?
    }

    private let failure: (any Error)?
    private let applyEventResult: MessageState?

    private(set) var appliedEvents: [AppliedEvent] = []
    private(set) var failedMarks: [FailedMark] = []
    private(set) var attempts: [Attempt] = []
    private(set) var purgedIds: [[String]] = []

    init(failing failure: (any Error)? = nil, applyEventResult: MessageState? = .sent) {
        self.failure = failure
        self.applyEventResult = applyEventResult
    }

    func applyEvent(localId: String, event: MessageEvent) async throws -> MessageState? {
        if let failure { throw failure }
        appliedEvents.append(AppliedEvent(localId: localId, event: String(describing: event)))
        return applyEventResult
    }

    func markOptimisticFailed(localId: String, reason: String) async throws {
        if let failure { throw failure }
        failedMarks.append(FailedMark(localId: localId, reason: reason))
    }

    func recordSendAttempt(
        localId: String,
        transport: SendAttemptRecord.Transport,
        startedAt: Date,
        outcome: SendAttemptRecord.Outcome,
        errorMessage: String?
    ) async throws {
        if let failure { throw failure }
        attempts.append(Attempt(localId: localId, transport: transport, outcome: outcome, errorMessage: errorMessage))
    }

    func purgeMessages(ids: [String]) async throws {
        if let failure { throw failure }
        purgedIds.append(ids)
    }
}

nonisolated final class SendErrorRecorderSpy: ErrorRecording, Sendable {
    private let storage = OSAllocatedUnfairLock<[RecordedFailure]>(initialState: [])

    var failures: [RecordedFailure] {
        storage.withLock { $0 }
    }

    func record(_ failure: RecordedFailure) {
        storage.withLock { $0.append(failure) }
    }
}

@MainActor
enum SendingRowFixture {
    static func record(localId: String, conversationId: String, content: String = "Bonjour") -> MessageRecord {
        OptimisticTextRecordBuilder.record(
            localId: localId,
            conversationId: conversationId,
            senderId: "00000000000000000000ff99",
            sender: nil,
            text: content,
            originalLanguage: "fr",
            messageType: "text",
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            locationJson: nil,
            stickerJson: nil,
            now: Date(),
            ephemeralDuration: nil
        )
    }
}
