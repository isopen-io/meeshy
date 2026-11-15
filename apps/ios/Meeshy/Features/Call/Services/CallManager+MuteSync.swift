import Foundation
import MeeshySDK

// #8434 — le micro coupé reste coupé, quel que soit le moment où on le coupe.
//
// `P2PWebRTCClient.startLocalMedia` crée TOUJOURS une piste audio active, et
// chaque repli (vidéo refusée au simulateur, caméra refusée) en recrée une. Un
// micro coupé avant que la piste existe (décroché CallKit, bouton touché
// pendant la connexion) restait donc OUVERT dès qu'elle naissait, pendant que
// l'interface, CallKit et les pairs le disaient coupé. Toute création de
// piste locale passe désormais par `startLocalMediaKeepingMute`.

/// Ce que la resynchronisation du micro demande au média local.
@MainActor
protocol CallLocalMediaProviding: AnyObject {
    func startLocalMedia(isVideo: Bool) async throws
    func muteAudio(_ muted: Bool)
}

extension WebRTCService: CallLocalMediaProviding {}

@MainActor
enum CallMuteSync {
    /// Démarre (ou redémarre) le média local, puis réapplique l'état du micro
    /// à la piste qui vient de naître — y compris quand le démarrage échoue
    /// APRÈS avoir créé la piste audio (la vidéo échoue, l'audio est déjà là).
    /// L'état est lu à la fin : une coupure pendant l'attente compte.
    static func startLocalMedia(
        isVideo: Bool,
        on media: any CallLocalMediaProviding,
        isMuted: () -> Bool
    ) async throws {
        defer { media.muteAudio(isMuted()) }
        try await media.startLocalMedia(isVideo: isVideo)
    }

    /// Un micro coupé avant que la piste existe n'a peut-être jamais été
    /// annoncé (pas encore d'identifiant d'appel) : le pair le redécouvre à
    /// chaque naissance de piste, tant que l'appel est toujours le même.
    static func mustAnnounceMuteToPeers(isMuted: Bool, currentCallId: String?, callId: String) -> Bool {
        isMuted && currentCallId == callId
    }
}

extension CallManager {
    /// Le SEUL chemin de création de la piste locale : `performLocalMediaStart`
    /// et ses deux replis. CallKit n'a rien à réapprendre — `toggleMute` lui a
    /// déjà rapporté la coupure, ou venait de lui.
    func startLocalMediaKeepingMute(isVideo: Bool, callId: String) async throws {
        defer { announceMuteToPeersIfNeeded(callId: callId) }
        try await CallMuteSync.startLocalMedia(isVideo: isVideo, on: webRTCService, isMuted: { isMuted })
    }

    private func announceMuteToPeersIfNeeded(callId: String) {
        guard CallMuteSync.mustAnnounceMuteToPeers(isMuted: isMuted, currentCallId: currentCallId, callId: callId) else { return }
        MessageSocketManager.shared.emitCallToggleAudio(callId: callId, enabled: false)
    }
}
