import Foundation
import MeeshySDK
import os

@MainActor
protocol ConversationSendCoordinatorProviding: AnyObject {
    func emit(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext, socketFirst: Bool) async throws -> SentMessageReceipt
    func emitSocketFallback(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext) async -> SentMessageReceipt?
    func acknowledge(localId: String, serverId: String, at: Date) async -> MessageState?
    func recordFailure(_ error: any Error, localId: String) async
    func enqueueOffline(_ outgoing: OutgoingMessage, clientMessageId: MessageID, intent: MessageProtectionIntent) async -> Result<SentMessageReceipt, SendFailure>
    func enqueueForRetry(_ outgoing: OutgoingMessage, context: SendAttemptContext, cause: any Error) async -> SendFailure
    func markFailed(localId: String, reason: String) async
    func markRetrying(localId: String) async
    func withdraw(localId: String) async
    func exhaust(localId: String) async
}

@MainActor
final class ConversationSendCoordinator: ConversationSendCoordinatorProviding {
    nonisolated deinit {}

    private let conversationId: String
    private let messageService: any MessageServiceProviding
    private let messageSocket: any MessageSocketProviding
    private let offlineQueue: any OfflineMessageQueueing
    private let persistence: any ConversationSendPersisting
    private let recorder: any ErrorRecording

    init(
        conversationId: String,
        messageService: any MessageServiceProviding,
        messageSocket: any MessageSocketProviding,
        offlineQueue: any OfflineMessageQueueing,
        persistence: any ConversationSendPersisting,
        recorder: any ErrorRecording = MeeshyLog.recorder
    ) {
        self.conversationId = conversationId
        self.messageService = messageService
        self.messageSocket = messageSocket
        self.offlineQueue = offlineQueue
        self.persistence = persistence
        self.recorder = recorder
    }

    // MARK: Transport

    func emit(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext, socketFirst: Bool) async throws -> SentMessageReceipt {
        if socketFirst, let receipt = await emitSocketFirst(outgoing, payload: payload, context: context) {
            return receipt
        }
        return try await emitREST(payload: payload, context: context)
    }

    private func emitSocketFirst(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext) async -> SentMessageReceipt? {
        let tempId = context.clientMessageId.rawValue
        Logger.messages.info("SendFlow socket-first START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — message:send before REST")
        let startedAt = Date()
        if let ack = await messageSocket.sendViaSocketFallback(
            conversationId: conversationId,
            content: payload.content,
            attachmentIds: [],
            replyToId: outgoing.relation.replyToId,
            storyReplyToId: outgoing.relation.storyReplyToId,
            originalLanguage: context.language,
            isEncrypted: false,
            clientMessageId: tempId,
            location: outgoing.location
        ) {
            await recordSendAttempt(tempId, transport: .socketFirst, startedAt: startedAt, outcome: .success)
            return SentMessageReceipt(
                clientMessageId: context.clientMessageId,
                delivery: .acknowledged(serverId: MessageID(ack.messageId), at: ack.createdAt ?? Date(), via: .socketFirst)
            )
        }
        await recordSendAttempt(tempId, transport: .socketFirst, startedAt: startedAt, outcome: .failure, errorMessage: "no ACK")
        Logger.messages.info("SendFlow socket-first MISS tempId=\(tempId, privacy: .public) — no ACK, falling through to REST")
        return nil
    }

    private func emitREST(payload: SealedOutgoingPayload, context: SendAttemptContext) async throws -> SentMessageReceipt {
        let tempId = context.clientMessageId.rawValue
        Logger.messages.info("SendFlow POST /messages START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — awaiting response (isSending held)")
        let startedAt = Date()
        let request = payload.request
        let service = messageService
        let convId = conversationId
        do {
            let response = try await withSendTimeout(seconds: ConversationViewModel.sendRESTTimeoutSeconds) {
                try await service.send(conversationId: convId, request: request)
            }
            await recordSendAttempt(tempId, transport: .rest, startedAt: startedAt, outcome: .success)
            Logger.messages.debug("SendFlow POST OK tempId=\(tempId, privacy: .public) serverId=\(response.id, privacy: .public)")
            return SentMessageReceipt(
                clientMessageId: context.clientMessageId,
                delivery: .acknowledged(serverId: MessageID(response.id), at: response.createdAt, via: .rest)
            )
        } catch {
            await recordSendAttempt(tempId, transport: .rest, startedAt: startedAt, outcome: .failure, errorMessage: error.localizedDescription)
            throw error
        }
    }

    func emitSocketFallback(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext) async -> SentMessageReceipt? {
        let tempId = context.clientMessageId.rawValue
        Logger.messages.warning("SendFlow socket-fallback START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — REST failed, awaiting socket ack up to ~10s (isSending held)")
        let startedAt = Date()
        let ack = await messageSocket.sendViaSocketFallback(
            conversationId: conversationId,
            content: payload.content,
            attachmentIds: outgoing.attachments.ids ?? [],
            replyToId: outgoing.relation.replyToId,
            storyReplyToId: outgoing.relation.storyReplyToId,
            originalLanguage: context.language,
            isEncrypted: payload.isEncrypted,
            clientMessageId: tempId,
            location: outgoing.location,
            sticker: outgoing.sticker
        )
        await recordSendAttempt(
            tempId,
            transport: .socketFallback,
            startedAt: startedAt,
            outcome: ack != nil ? .success : .failure,
            errorMessage: ack == nil ? "no ACK" : nil
        )
        guard let ack else { return nil }
        return SentMessageReceipt(
            clientMessageId: context.clientMessageId,
            delivery: .acknowledged(serverId: MessageID(ack.messageId), at: ack.createdAt ?? Date(), via: .socketFallback)
        )
    }

    // MARK: Journal des tentatives

    private func recordSendAttempt(
        _ tempId: String,
        transport: SendAttemptRecord.Transport,
        startedAt: Date,
        outcome: SendAttemptRecord.Outcome,
        errorMessage: String? = nil
    ) async {
        let store = persistence
        await bestEffort("send.recordAttempt", category: .messages, recorder: recorder) {
            try await store.recordSendAttempt(
                localId: tempId,
                transport: transport,
                startedAt: startedAt,
                outcome: outcome,
                errorMessage: errorMessage
            )
        }
    }

    // MARK: États de la ligne

    func acknowledge(localId: String, serverId: String, at: Date) async -> MessageState? {
        let store = persistence
        let state = await bestEffort("send.serverAck", category: .messages, recorder: recorder) {
            try await store.applyEvent(localId: localId, event: .serverAck(serverId: serverId, at: at))
        }
        return state ?? nil
    }

    func recordFailure(_ error: any Error, localId: String) async {
        let store = persistence
        await bestEffort("send.sendFailed", category: .messages, recorder: recorder) {
            try await store.applyEvent(localId: localId, event: .sendFailed(error))
        }
    }

    func markFailed(localId: String, reason: String) async {
        let store = persistence
        await bestEffort("send.markFailed", category: .messages, recorder: recorder) {
            try await store.markOptimisticFailed(localId: localId, reason: reason)
        }
    }

    func markRetrying(localId: String) async {
        let store = persistence
        await bestEffort("send.retrying", category: .messages, recorder: recorder) {
            try await store.applyEvent(localId: localId, event: .retry)
        }
    }

    func withdraw(localId: String) async {
        let store = persistence
        await bestEffort("send.withdraw", category: .messages, recorder: recorder) {
            try await store.purgeMessages(ids: [localId])
        }
    }

    func exhaust(localId: String) async {
        let store = persistence
        await bestEffort("send.retryExhausted", category: .messages, recorder: recorder) {
            try await store.applyEvent(localId: localId, event: .retryExhausted)
        }
    }

    // MARK: Outbox

    func enqueueOffline(_ outgoing: OutgoingMessage, clientMessageId: MessageID, intent: MessageProtectionIntent) async -> Result<SentMessageReceipt, SendFailure> {
        do {
            try await offlineQueue.enqueue(outgoing.offlineQueueItem(clientMessageId: clientMessageId, intent: intent))
            Logger.messages.info("Message enqueued for offline delivery")
            return .success(SentMessageReceipt(clientMessageId: clientMessageId, delivery: .queuedOffline))
        } catch {
            Logger.messages.error("offline enqueue failed: \(error.localizedDescription, privacy: .public)")
            let reason = error.localizedDescription
            await markFailed(localId: clientMessageId.rawValue, reason: reason)
            return .failure(.offlineEnqueueFailed(reason: reason))
        }
    }

    func enqueueForRetry(_ outgoing: OutgoingMessage, context: SendAttemptContext, cause: any Error) async -> SendFailure {
        do {
            try await offlineQueue.enqueue(outgoing.retryQueueItem(context: context))
            return .queuedForRetry(reason: cause.localizedDescription)
        } catch {
            Logger.messages.error("online retry enqueue failed: \(error.localizedDescription, privacy: .public)")
            let reason = "online retry enqueue failed: \(error.localizedDescription)"
            await markFailed(localId: context.clientMessageId.rawValue, reason: reason)
            return .retryEnqueueFailed(reason: reason)
        }
    }
}
