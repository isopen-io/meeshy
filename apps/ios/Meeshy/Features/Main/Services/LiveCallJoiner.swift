import Foundation
import MeeshySDK
import os

/// « Rejoindre » un appel EN COURS — un seul site pour les deux surfaces qui
/// l'offrent (#7548) : la bulle vivante du fil (`ConversationViewModel
/// .joinOngoingCall`) et la ligne de la LISTE des conversations. Quatre
/// branches :
///   1. ce device est déjà sur CET appel (actif ou en négociation) → ramener
///      l'UI d'appel au premier plan ;
///   2. ce device SONNE sur cet appel (bannière call-waiting) → laisser la
///      bannière/CallKit porter le geste de réponse, pas de double-join ;
///   3. l'appel est actif côté serveur (revalidé via active-call) →
///      `rejoinActiveCall` (réhydratation à froid — app relancée mi-appel) ;
///   4. l'appel n'existe plus → toast « L'appel est terminé ».
@MainActor
struct LiveCallJoiner {
    let context: LiveCallJoinContext
    let activeCallService: ActiveCallServiceProviding

    static var live: LiveCallJoiner {
        LiveCallJoiner(context: .live, activeCallService: ActiveCallService.shared)
    }

    func join(_ request: LiveCallJoinRequest) async {
        if context.currentCallId() == request.callId, !context.isIdle() {
            context.bringCallUIForward()
            return
        }
        guard !context.hasPendingIncomingCall(request.callId) else { return }
        do {
            let session = try await activeCallService.activeCall(conversationId: request.conversationId)
            guard let session, session.id == request.callId else {
                FeedbackToastManager.shared.show(
                    String(localized: "bubble.call.join.ended", defaultValue: "L'appel est terminé", bundle: .main),
                    type: .info
                )
                return
            }
            let remote = session.remoteParticipant(currentUserId: request.currentUserId)
            let displayName = remote?.user?.displayName
                ?? remote?.user?.username
                ?? request.fallbackDisplayName
                ?? String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main)
            let joined = context.rejoinActiveCall(
                request.callId,
                request.conversationId,
                remote?.userId ?? request.fallbackRemoteUserId ?? "",
                displayName,
                request.isVideo
            )
            if !joined {
                Logger.messages.warning("[LiveCallJoiner] rejoinActiveCall refused (state non-idle) for \(request.callId, privacy: .public)")
            }
        } catch {
            FeedbackToastManager.shared.showError(
                String(localized: "bubble.call.join.failed", defaultValue: "Impossible de rejoindre l'appel", bundle: .main)
            )
        }
    }
}

/// Ce qu'il faut savoir pour rejoindre un appel, quelle que soit la surface
/// qui l'offre. Les replis servent quand le serveur ne nomme pas le pair.
struct LiveCallJoinRequest: Equatable {
    let callId: String
    let conversationId: String
    let isVideo: Bool
    let currentUserId: String
    let fallbackRemoteUserId: String?
    let fallbackDisplayName: String?
}

extension LiveCallJoinRequest {
    /// La demande d'une ligne de liste — `nil` quand aucun appel n'y est en cours.
    init?(conversation: Conversation, currentUserId: String) {
        guard let call = conversation.activeCall else { return nil }
        self.init(
            callId: call.id,
            conversationId: conversation.id,
            isVideo: call.kind == "video",
            currentUserId: currentUserId,
            fallbackRemoteUserId: conversation.participantUserId,
            fallbackDisplayName: conversation.name
        )
    }
}
