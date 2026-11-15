import AVFoundation

/// **Ce qu'une vidéo protégée refuse** (#9574) : la couche sécurisée rend
/// l'image noire dans une capture, mais AirPlay, la recopie vers un écran
/// externe et la fenêtre PiP emportent la vidéo HORS de cette couche. Sous un
/// bouclier (`isCaptureShielded`), aucune de ces routes ne s'ouvre.
public struct ProtectedPlaybackPolicy: Equatable, Sendable {
    public let allowsExternalPlayback: Bool
    public let allowsPictureInPicture: Bool

    public static func of(isCaptureShielded: Bool) -> ProtectedPlaybackPolicy {
        ProtectedPlaybackPolicy(
            allowsExternalPlayback: !isCaptureShielded,
            allowsPictureInPicture: !isCaptureShielded
        )
    }

    /// Les contrôles qu'une surface peut offrir sous cette politique : ni
    /// bouton PiP, ni sélecteur AirPlay pour une vidéo protégée.
    public func permitted(_ controls: MeeshyVideoPlayer.ControlSet) -> MeeshyVideoPlayer.ControlSet {
        var permitted = controls
        if !allowsPictureInPicture { permitted.remove(.pip) }
        if !allowsExternalPlayback { permitted.remove(.airplay) }
        return permitted
    }

    /// Ferme (ou rouvre) les routes externes du lecteur. Une lecture AirPlay
    /// en cours revient sur l'appareil dès que la route se ferme.
    public func apply(to player: AVPlayer) {
        if player.allowsExternalPlayback != allowsExternalPlayback {
            player.allowsExternalPlayback = allowsExternalPlayback
        }
        if player.usesExternalPlaybackWhileExternalScreenIsActive != allowsExternalPlayback {
            player.usesExternalPlaybackWhileExternalScreenIsActive = allowsExternalPlayback
        }
    }
}
