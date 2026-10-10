import Foundation
import MeeshySDK

extension CallManager {
    /// Un `call:initiated` reçu par le socket. Site UNIQUE, appelé par
    /// l'abonnement de `CallManager` ET par `IncomingCallWakeGate`, qui remet
    /// l'événement qui a réveillé la pile (#7955).
    func handleCallOffer(_ event: CallOfferData) {
        let myUserId = AuthManager.shared.currentUser?.id
        guard event.principalUserId != myUserId else { return }
        guard currentCallId != event.callId else { return }
        // `mode` est l'architecture WebRTC ('p2p' | 'sfu'), PAS le type média,
        // porté par `type` ('audio' | 'video'). Absent (anciens builds
        // gateway) : repli sur `mode == "video"`.
        let isVideo = event.type.map { $0 == "video" } ?? (event.mode == "video")
        // #8433 — une invitation dit QUI m'invite, pas seulement qui a lancé l'appel.
        let callerName = CallOfferPresentation.callerName(
            initiator: event.initiator.displayName ?? event.initiator.username,
            inviter: event.invitedBy.map { $0.displayName ?? $0.username }
        )
        let dynamicIceServers = event.iceServers?.map { server in
            IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
        }
        handleIncomingCallNotification(
            callId: event.callId,
            fromUserId: event.principalUserId,
            fromUsername: callerName,
            isVideo: isVideo,
            iceServers: dynamicIceServers,
            conversationId: event.conversationId
        )
    }
}

extension CallOfferData {
    /// #9084 — le pair qui m'offrira, donc le principal : l'INVITANT d'une
    /// invitation dans un appel en cours, sinon l'initiateur. La passerelle fait
    /// offrir chaque membre présent au nouveau venu ; seul l'invitant tient la
    /// liaison principale, les autres passent par le maillage.
    var principalUserId: String { invitedBy?.userId ?? initiator.userId }

    /// #9084 — un duo devenu groupe garde `conversationType == "direct"` :
    /// l'invitation le dit par `isGroup`.
    var isGroupCall: Bool {
        isGroup == true || conversationType.map { $0 != "direct" } == true
    }
}
