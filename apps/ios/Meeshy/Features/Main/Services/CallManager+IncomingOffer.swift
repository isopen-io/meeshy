import Foundation
import MeeshySDK

extension CallManager {
    /// Un `call:initiated` reçu par le socket. Site UNIQUE, appelé par
    /// l'abonnement de `CallManager` ET par `IncomingCallWakeGate`, qui remet
    /// l'événement qui a réveillé la pile (#7955).
    func handleCallOffer(_ event: CallOfferData) {
        let myUserId = AuthManager.shared.currentUser?.id
        guard event.initiator.userId != myUserId else { return }
        guard currentCallId != event.callId else { return }
        // `mode` est l'architecture WebRTC ('p2p' | 'sfu'), PAS le type média,
        // porté par `type` ('audio' | 'video'). Absent (anciens builds
        // gateway) : repli sur `mode == "video"`.
        let isVideo = event.type.map { $0 == "video" } ?? (event.mode == "video")
        let callerName = event.initiator.displayName ?? event.initiator.username
        let dynamicIceServers = event.iceServers?.map { server in
            IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
        }
        handleIncomingCallNotification(
            callId: event.callId,
            fromUserId: event.initiator.userId,
            fromUsername: callerName,
            isVideo: isVideo,
            iceServers: dynamicIceServers,
            conversationId: event.conversationId
        )
    }
}
