import UIKit
import Combine
@preconcurrency import UserNotifications
import MeeshySDK
import os

private nonisolated let logger = MeeshyLog.logger(.push)

extension NotificationActionHandler {
    // MARK: - Durable quick reply (R2)

    func handleReply(_ payload: NotificationPayload, userInfo: [AnyHashable: Any], replyText: String?) async {
        guard let conversationId = payload.conversationId else {
            logger.warning("reply action without conversationId — ignoring")
            return
        }
        let text = (replyText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            logger.warning("reply action with empty text — ignoring")
            return
        }
        guard let userId = currentUserId() else {
            logger.warning("reply action without an active user — ignoring")
            return
        }
        guard NotificationReplyFailure.isAddressed(to: userId, userInfo: userInfo) else {
            logger.warning("reply action on a notification addressed to another account — ignoring")
            return
        }

        let originalLanguage = preferredLanguage()
        let item = OfflineQueueItem(
            conversationId: conversationId,
            content: text,
            originalLanguage: originalLanguage,
            replyToId: payload.messageId
        )

        if await refusesEndToEndReply(item, senderId: userId, in: conversationId, userInfo: userInfo) { return }
        await sendReadableReply(item, senderId: userId)

        localMarkRead(conversationId)
        do {
            try await conversationService.markRead(conversationId: conversationId)
        } catch {
            logger.error("post-reply markRead failed: \(error.localizedDescription, privacy: .public)")
        }
        removeDeliveredForConversation(conversationId)
    }

    /// La réponse vers un régime où le serveur lit le message : ligne
    /// optimiste, outbox, puis requête (R2).
    func sendReadableReply(_ item: OfflineQueueItem, senderId: String) async {
        await insertReplyBubble(item, senderId: senderId, replyToId: item.replyToId)
        await prepareReplyQueue()
        var outboxRowLanded = false
        do {
            try await replyQueue.enqueue(item)
            outboxRowLanded = true
        } catch {
            logger.error("reply outbox enqueue failed: \(error.localizedDescription, privacy: .public)")
        }

        do {
            let request = SendMessageRequest(
                content: item.content,
                originalLanguage: item.originalLanguage,
                replyToId: item.replyToId,
                clientMessageId: item.clientMessageId
            )
            _ = try await messageService.send(conversationId: item.conversationId, request: request)
            logger.info("notification reply sent for conversation \(item.conversationId, privacy: .public)")
        } catch {
            logger.error("reply REST send failed: \(error.localizedDescription, privacy: .public)")
            if !outboxRowLanded {
                do {
                    try await messagePersistence.markOptimisticFailed(
                        localId: item.clientMessageId,
                        reason: error.localizedDescription
                    )
                } catch {
                    logger.error("reply markOptimisticFailed failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func insertReplyBubble(_ item: OfflineQueueItem, senderId: String, replyToId: String?) async {
        do {
            try await messagePersistence.insertOptimistic(
                MessageRecord.optimisticText(item: item, senderId: senderId, replyToId: replyToId)
            )
        } catch {
            logger.error("reply optimistic insert failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// #12641, #13067 — la réponse ne sait pas sceller : vers une conversation
    /// chiffrée de bout en bout (loi du fil, #12985), rien ne part ni n'entre
    /// dans la file, et la garde se lit AVANT toute ligne. Le clair va au
    /// coffre sous une bulle scellée en échec, d'où le fil le renvoie chiffré ;
    /// faute de coffre, rien ne s'écrit. Les deux se disent.
    /// #13165 — le régime se CONFIRME (mode du push, puis passerelle relue) :
    /// seul un régime relu où le serveur lit le message laisse partir le clair.
    /// #14667 — un régime NON confirmé n'écrit aucune ligne : le clair attend
    /// au coffre que `confirmRepliesAwaitingRegime` relise le régime.
    private func refusesEndToEndReply(
        _ item: OfflineQueueItem, senderId: String, in conversationId: String, userInfo: [AnyHashable: Any]
    ) async -> Bool {
        switch await replyRegime.destination(of: conversationId, userInfo: userInfo) {
        case .readableByServer:
            return false
        case .endToEnd:
            logger.warning("notification reply refused before transport: end-to-end regime")
            let refusal = await offThreadReply.keep(item, senderId: senderId)
            removeDeliveredForConversation(conversationId)
            notifyRefusedEndToEndReply(conversationId, refusal)
        case .unconfirmed:
            removeDeliveredForConversation(conversationId)
            await awaitingReplies.hold(item, senderId: senderId)
        case .inaccessible:
            removeDeliveredForConversation(conversationId)
            awaitingReplies.refuseInaccessible(conversationId)
        }
        return true
    }

    var replyRegime: NotificationReplyRegime {
        let service = conversationService
        return NotificationReplyRegime(
            destinationGuard: destinationGuard,
            servedMode: { try await service.getByIdTypedRefusals($0).encryptionMode }
        )
    }

    var offThreadReply: EndToEndOffThreadReply {
        EndToEndOffThreadReply(endToEnd: endToEnd, persistence: messagePersistence)
    }


    /// Appelé à chaque réveil de l'outbox (lancement, retour au premier plan,
    /// réseau ou socket retrouvés).
    func confirmRepliesAwaitingRegime() async {
        await awaitingReplies.confirmAll()
    }

    /// Les fiches d'un compte déconnecté se retirent à la sortie de sa session.
    func observeSignOutsForAwaitingReplies(_ authenticated: AnyPublisher<Bool, Never>) {
        awaitingReplies.observeSignOuts(authenticated)
    }
}
