import Combine
import Foundation
import os

extension MessageSocketRoutes {

    static func messages(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.messageNew, APIMessage.self) { $0.messageReceived.send($1) }
                .observing { [weak m] data in m?.logMessageArrival(data) },
            // #3707 — l'enveloppe libsignal de cet appareil : un chiffré opaque, ouvert par `MeeshyE2EE`.
            m.route(.e2eeEnvelope, E2EEServedEnvelope.self) { _, envelope in E2EEEnvelopeChannel.shared.received.send(envelope) },
            // Les réactions d'un message hors du cache de la conversation active sont ignorées ici : à l'ouverture,
            // le `reactionSummary` servi avec le message fait foi.
            m.route(.reactionAdded, ReactionUpdateEvent.self) { $0.reactionAdded.send($1) }
                .observing { [weak m] data in m?.logReactionArrival(added: true, data) },
            m.route(.reactionRemoved, ReactionUpdateEvent.self) { $0.reactionRemoved.send($1) }
                .observing { [weak m] data in m?.logReactionArrival(added: false, data) },
            m.route(.messageEdited, APIMessage.self) { $0.messageEdited.send($1) },
            m.route(.messageDeleted, MessageDeletedEvent.self) { $0.messageDeleted.send($1) },
            m.route(.messageExpired, MessageExpiredEvent.self) { $0.messageExpired.send($1) },
            m.route(.messageCountdownStarted, MessageCountdownStartedEvent.self) { $0.messageCountdownStarted.send($1) },
            m.route(.messageHiddenForMe, MessageHiddenForMeEvent.self) { $0.messageHiddenForMe.send($1) },
            m.route(.messageRestoredForMe, MessageRestoredForMeEvent.self) { $0.messageRestoredForMe.send($1) },
            m.route(.attachmentReactionAdded, AttachmentReactionUpdateEvent.self) { $0.attachmentReactionAdded.send($1) },
            m.route(.attachmentReactionRemoved, AttachmentReactionUpdateEvent.self) { $0.attachmentReactionRemoved.send($1) },
            m.route(.readStatusUpdated, ReadStatusUpdateEvent.self) { $0.readStatusUpdated.send($1) },
            m.route(.attachmentStatusUpdated, AttachmentStatusUpdatedEvent.self) { $0.attachmentStatusUpdated.send($1) },
            m.route(.messagePendingDelivered, PendingMessagesDeliveredEvent.self) { $0.pendingMessagesDelivered.send($1) },
            m.route(.messageAttachmentUpdated, AttachmentUpdatedEvent.self) { $0.attachmentUpdated.send($1) },
        ]
    }
}

extension MessageSocketManager {

    func logMessageArrival(_ data: [Any]) {
        let payload = data.first as? [String: Any]
        let serverId = payload?["id"] as? String
        let clientMessageId = payload?["clientMessageId"] as? String
        Logger.socket.info("perf:ios.notif.socket.message-new receivedAt=\(Date().timeIntervalSince1970, privacy: .public) serverId=\(serverId ?? "nil", privacy: .public) clientMessageId=\(clientMessageId ?? "nil", privacy: .public)")
    }

    func logReactionArrival(added: Bool, _ data: [Any]) {
        let payload = data.first as? [String: Any]
        let messageId = payload?["messageId"] as? String
        let name = added ? "reaction-added" : "reaction-removed"
        let emoji = added ? (payload?["emoji"] as? String ?? "nil") : "-"
        Logger.socket.info("perf:ios.notif.socket.\(name, privacy: .public) receivedAt=\(Date().timeIntervalSince1970, privacy: .public) messageId=\(messageId ?? "nil", privacy: .public) emoji=\(emoji, privacy: .public)")
    }
}
