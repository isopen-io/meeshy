import AVFoundation

// MARK: - Un média muet ne décode pas sa piste audio (#11282)

/// **Couper la sortie n'arrête pas le décodage.**
///
/// `AVPlayer.isMuted` ferme la SORTIE : la piste audio continue d'être lue,
/// décodée, mise en tampon et mixée, pour un son que personne n'entendra. La
/// vignette muette qui boucle dans chaque bulle, carte de feed et commentaire,
/// l'aperçu d'appui long et le réel dont l'utilisateur n'a pas levé le son
/// payaient ce décodage pour rien. `AVPlayerItemTrack.isEnabled = false` sur
/// les pistes AUDIO l'arrête à la source ; l'image n'est pas touchée.
///
/// La loi :
/// - muet, les pistes audio s'éteignent ; audible, elles se rallument ; toute
///   autre piste (image, sous-titres) ne bouge jamais ;
/// - une piste déjà dans l'état voulu n'est pas réécrite ;
/// - un élément n'a ses pistes qu'une fois PRÊT : avant, il n'y a rien à écrire,
///   et l'état voulu se pose à l'instant où il l'est ;
/// - au mute, la sortie se coupe AVANT que la piste ne s'éteigne ; au démute, la
///   piste se rallume SOUS la sortie encore muette, puis la sortie s'ouvre — le
///   son revient sans coupure ni claquement.
///
/// Argumenté, non mesuré : le gain en décodage et en énergie se lit sur
/// Instruments (Energy Log, charge du fil média) sur appareil.
public nonisolated enum AudioTrackActivationLaw {

    /// Ce que la loi sait d'une piste : son médium et son état.
    public nonisolated struct TrackState: Equatable {
        public let mediaType: AVMediaType?
        public let isEnabled: Bool

        public init(mediaType: AVMediaType?, isEnabled: Bool) {
            self.mediaType = mediaType
            self.isEnabled = isEnabled
        }
    }

    /// Les gestes d'une bascule, dans l'ordre où ils s'appliquent.
    public nonisolated enum Step: Equatable, Sendable {
        case silencePlayer
        case disableAudioTracks
        case enableAudioTracks
        case soundPlayer
    }

    /// L'état voulu d'une piste, `nil` : elle n'est pas du ressort de la loi.
    public static func desiredEnabled(mediaType: AVMediaType?, effectiveMuted: Bool) -> Bool? {
        guard mediaType == .audio else { return nil }
        return !effectiveMuted
    }

    /// Pour chaque piste, la valeur à écrire — `nil` : rien à écrire.
    public static func writes(for tracks: [TrackState], effectiveMuted: Bool) -> [Bool?] {
        tracks.map { track in
            guard let desired = desiredEnabled(mediaType: track.mediaType, effectiveMuted: effectiveMuted),
                  desired != track.isEnabled else { return nil }
            return desired
        }
    }

    /// Les pistes d'un élément n'existent qu'une fois l'élément prêt.
    public static func mayTouchTracks(itemStatus: AVPlayerItem.Status?) -> Bool {
        itemStatus == .readyToPlay
    }

    /// Les gestes pour passer de l'état du lecteur (`playerIsMuted`) à l'état
    /// voulu. Rien ne change : aucun geste.
    public static func steps(playerIsMuted: Bool, wantsMuted: Bool) -> [Step] {
        guard playerIsMuted != wantsMuted else { return [] }
        return wantsMuted ? [.silencePlayer, .disableAudioTracks] : [.enableAudioTracks, .soundPlayer]
    }
}
