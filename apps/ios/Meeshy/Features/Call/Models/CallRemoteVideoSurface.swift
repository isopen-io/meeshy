import Foundation
import MeeshyUI

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

/// G4.6 — l'image cède la place à l'avatar (et revient) en fondu : la durée du
/// fondu, une seule loi pour l'image qui s'efface et pour l'anneau de parole.
/// « Réduire les animations » garde le fondu, plus court, et ne déplace rien.
enum CallRemoteVideoFade {
    static func duration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? 0.12 : 0.25
    }
}

/// G4.2 — l'anneau et le halo de la personne dont la caméra est coupée : ils
/// n'existent qu'à la parole, jamais au repos. Le niveau audio reçu du duo passe
/// par la même hystérésis que les vignettes d'un groupe (`ActiveSpeakerDetector`),
/// sans quoi l'anneau clignoterait entre deux syllabes.
struct CallPeerSpeech: Equatable, Sendable {
    private static let peer = "peer"
    private let detector: ActiveSpeakerDetector

    init(detector: ActiveSpeakerDetector = ActiveSpeakerDetector()) {
        self.detector = detector
    }

    var isSpeaking: Bool { detector.isSpeaking(Self.peer) }

    /// Un relevé : un niveau absent (aucune mesure) laisse le maintien s'écouler.
    func recording(level: Double?, at now: Date) -> CallPeerSpeech {
        CallPeerSpeech(detector: detector.recording(level.map { [Self.peer: $0] } ?? [:], at: now))
    }

    /// La couleur de l'anneau et du halo : celle de la personne, la même que sa
    /// ligne de sous-titres et que le liseré de sa vignette de groupe.
    static func colorHex(forPeer userId: String?) -> String {
        userId.map { CallSpeakerColor.hex(for: $0) } ?? MeeshyColors.brandPrimaryHex
    }

    /// Un groupe encore montré en duo : le maillage relève déjà le niveau du pair
    /// principal toutes les 400 ms (`GroupCallMeshCoordinator.speakingUserIds`), et
    /// son verdict se relaie. `nil` hors maillage : le placeholder relève lui-même,
    /// jamais deux relevés `getStats` pour une même connexion.
    static func relayed(meshActive: Bool, speakers: Set<String>, peer userId: String?) -> Bool? {
        guard meshActive else { return nil }
        return userId.map { speakers.contains($0) } ?? false
    }
}
