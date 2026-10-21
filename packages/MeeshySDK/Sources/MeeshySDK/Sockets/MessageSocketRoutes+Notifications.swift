import Combine
import Foundation
import os

extension MessageSocketRoutes {

    static func notifications(_ m: MessageSocketManager, presentedToken: String?) -> [SocketInboundRoute] {
        [
            heartbeatAck(m),
            tokenExpired(presentedToken: presentedToken),
            // La passerelle a RÉVOQUÉ la session (mot de passe changé, révocation de tous les appareils, action
            // admin) puis coupe la socket : `handleSessionRevoked`, jamais `handleUnauthorized` — son
            // `refreshSession(force:)` obtiendrait un JWT neuf et re-armerait la session qu'on vient de révoquer.
            .raw(.authSessionRevoked) { [weak m] data in m?.handleSessionRevoked(data) },
            m.route(.notificationNew, SocketNotificationEvent.self) { manager, event in
                // SyncEngine A5 — observe le `_seq` per-user. `observe(nil)` (passerelle antérieure) est sans effet.
                Task { await SyncSeqTracker.shared.observe(event.seq) }
                manager.notificationReceived.send(event)
            },
            // Pas d'écouteur du `notification` historique : la passerelle n'émet que `notification:new`, et un second
            // canal vers `notificationReceived` doublerait chaque toast si elle émettait les deux un jour.
            m.route(.notificationRead, NotificationReadEvent.self) { $0.notificationRead.send($1) },
            m.route(.notificationDeleted, NotificationDeletedEvent.self) { $0.notificationDeleted.send($1) },
            m.route(.notificationCounts, NotificationCountsEvent.self) { $0.notificationCounts.send($1) },
            m.route(.notificationReadBulk, NotificationReadBulkEvent.self) { $0.notificationReadBulk.send($1) },
            m.route(.notificationDeletedBulk, NotificationDeletedBulkEvent.self) { $0.notificationDeletedBulk.send($1) },
            m.route(.mentionCreated, MentionCreatedEvent.self) { $0.mentionCreated.send($1) },
            m.route(.presenceSnapshot, PresenceSnapshotEvent.self) { $0.presenceSnapshotReceived.send($1) },
            m.route(.userStatus, UserStatusEvent.self) { $0.userStatusChanged.send($1) },
            m.route(.friendRequestCancelled, FriendRequestCancelledEvent.self) { _, event in
                Task { await MessageSocketManager.applyFriendRequestWithdrawal(otherUserId: event.cancelledBy) }
            },
            m.route(.friendRequestRejected, FriendRequestRejectedEvent.self) { _, event in
                Task { await MessageSocketManager.applyFriendRequestRejection(rejecterId: event.rejecterId) }
            },
        ]
    }

    private static func heartbeatAck(_ m: MessageSocketManager) -> SocketInboundRoute {
        .raw(.heartbeatAck) { [weak m] data in
            guard let rtt = SocketHeartbeatAck.rtt(from: data) else { return }
            Logger.socket.debug("heartbeat:ack RTT=\(rtt, format: .fixed(precision: 1))ms")
            m?.connectionRTT.send(rtt)
        }
    }

    /// Le jeton de CE socket, capturé à l'inscription : un socket d'une session quittée (encore en sursis parmi les
    /// transports retirés) ne rafraîchit pas celle du moment.
    private static func tokenExpired(presentedToken: String?) -> SocketInboundRoute {
        .raw(.authTokenExpired) { _ in
            Logger.socket.info("MessageSocket: auth token expired — triggering refresh")
            Task { @MainActor in
                AuthManager.shared.handleUnauthorized(presentedToken: presentedToken)
            }
        }
    }
}

extension MessageSocketManager {

    func handleSessionRevoked(_ data: [Any]) {
        let reason = SessionRevocationReason.fromSocketPayload(data)
        if signalAccountDeleted(sessionRevokedPayload: data) != nil { return } // #10482 — retrait, pas « session fermée »
        Logger.socket.warning("MessageSocket: session revoked — forcing re-authentication")
        Task { @MainActor in
            AuthManager.shared.handleSessionRevoked(reason: reason)
        }
    }
}
