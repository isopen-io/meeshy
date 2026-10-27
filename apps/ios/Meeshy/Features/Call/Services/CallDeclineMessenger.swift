import Foundation
import MeeshySDK
import os

@MainActor
protocol CallDeclineMessengerProviding {
    func send(_ plan: CallDeclineReplyPlan) async
}

@MainActor
final class CallDeclineMessenger: CallDeclineMessengerProviding {
    nonisolated deinit {}

    static let shared = CallDeclineMessenger()

    private let logger = MeeshyLog.logger(.callDecline)
    private let messageService: MessageServiceProviding
    private let replyQueue: NotificationReplyQueueing
    private let injectedPersistence: OptimisticMessagePersisting?
    private let currentUserId: @MainActor () -> String?
    private let injectedPrepareReplyQueue: (@MainActor () async -> Void)?
    /// La loi du fil appliquée à la conversation de l'appel (#12641, #12985).
    private let destinationGuard: EndToEndDestinationGuard
    /// Le coffre libsignal, seul lieu du clair d'un message chiffré (#13067).
    private let endToEnd: any EndToEndMessagingProviding
    /// Le refus vers une conversation chiffrée se dit dans l'app (#13067).
    private let notifyRefusal: @MainActor (EndToEndSendRefusal) -> Void

    private var messagePersistence: OptimisticMessagePersisting {
        injectedPersistence ?? DependencyContainer.shared.messagePersistence
    }

    private var prepareReplyQueue: @MainActor () async -> Void {
        injectedPrepareReplyQueue ?? {
            await OfflineQueue.shared.configure(pool: DependencyContainer.shared.database.pool)
        }
    }

    init(
        messageService: MessageServiceProviding = MessageService.shared,
        replyQueue: NotificationReplyQueueing = OfflineQueue.shared,
        messagePersistence: OptimisticMessagePersisting? = nil,
        currentUserId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        prepareReplyQueue: (@MainActor () async -> Void)? = nil,
        destinationGuard: EndToEndDestinationGuard = EndToEndDestinationGuard(),
        endToEnd: any EndToEndMessagingProviding = EndToEndMessagingRuntime.shared,
        notifyRefusal: @escaping @MainActor (EndToEndSendRefusal) -> Void = {
            FeedbackToastManager.shared.showError($0.userMessage)
        }
    ) {
        self.destinationGuard = destinationGuard
        self.endToEnd = endToEnd
        self.notifyRefusal = notifyRefusal
        self.messageService = messageService
        self.replyQueue = replyQueue
        self.injectedPersistence = messagePersistence
        self.currentUserId = currentUserId
        self.injectedPrepareReplyQueue = prepareReplyQueue
    }

    func send(_ plan: CallDeclineReplyPlan) async {
        guard let userId = currentUserId() else {
            logger.warning("decline reply without an active user — ignoring")
            return
        }
        let item = OfflineQueueItem(
            conversationId: plan.conversationId,
            content: plan.content,
            originalLanguage: plan.originalLanguage,
            replyToId: nil
        )

        // #12641, #13067 — le refus d'appel ne sait pas sceller : vers une
        // conversation chiffrée de bout en bout, rien ne part ni n'entre dans la
        // file, et la garde se lit AVANT toute ligne. Le clair va au coffre sous
        // une bulle scellée en échec ; faute de coffre, rien ne s'écrit.
        if await destinationGuard.seals(plan.conversationId) {
            logger.warning("decline reply refused before transport: end-to-end conversation")
            let refusal = await EndToEndOffThreadReply(endToEnd: endToEnd, persistence: messagePersistence)
                .keep(item, senderId: userId)
            notifyRefusal(refusal)
            return
        }

        do {
            try await messagePersistence.insertOptimistic(
                MessageRecord.optimisticText(item: item, senderId: userId, replyToId: nil)
            )
        } catch {
            logger.error("decline reply optimistic insert failed: \(error.localizedDescription, privacy: .public)")
        }

        await prepareReplyQueue()
        let outboxRowLanded = await enqueue(item)

        do {
            let request = SendMessageRequest(
                content: plan.content,
                originalLanguage: plan.originalLanguage,
                clientMessageId: item.clientMessageId
            )
            _ = try await messageService.send(conversationId: plan.conversationId, request: request)
        } catch {
            logger.error("decline reply REST send failed: \(error.localizedDescription, privacy: .public)")
            guard !outboxRowLanded else { return }
            await markFailed(localId: item.clientMessageId, reason: error.localizedDescription)
        }
    }

    private func enqueue(_ item: OfflineQueueItem) async -> Bool {
        do {
            try await replyQueue.enqueue(item)
            return true
        } catch {
            logger.error("decline reply outbox enqueue failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func markFailed(localId: String, reason: String) async {
        do {
            try await messagePersistence.markOptimisticFailed(localId: localId, reason: reason)
        } catch {
            logger.error("decline reply markOptimisticFailed failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
