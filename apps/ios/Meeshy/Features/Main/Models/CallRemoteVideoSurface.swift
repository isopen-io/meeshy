import Foundation

/// #8788 — ce que montre l'image du correspondant.
///
/// Un pair qui n'envoie AUCUNE image (simulateur, Mac sans caméra, caméra
/// refusée, appel vidéo accepté en audio) n'est pas « en train de charger ».
/// Dès qu'il annonce sa caméra coupée, ou passé le délai d'attente une fois
/// l'audio établi, c'est son avatar et « Caméra désactivée » — jamais un
/// chargement sans fin.
enum CallRemoteVideoSurface: Equatable, Sendable {
    case live
    case cameraOff
    case connecting

    static func resolve(hasTrack: Bool, peerVideoEnabled: Bool, waitElapsed: Bool) -> CallRemoteVideoSurface {
        if hasTrack && peerVideoEnabled { return .live }
        if hasTrack || !peerVideoEnabled || waitElapsed { return .cameraOff }
        return .connecting
    }
}
