import AVFoundation
import MeeshySDK

// MARK: - Lecteurs préparés et recyclage
//
// Extrait de `SharedAVPlayerManager.swift` (budget de taille) : la politique
// d'adoption d'un lecteur préparé et le retour du lecteur sortant au pool de
// `StoryMediaLoader`. Les lois sont pures et `nonisolated` ; seul `recycle`
// touche l'état du moteur.

extension SharedAVPlayerManager {

    /// Un lecteur préparé s'adopte s'il lit le fichier local — ou, à défaut de
    /// fichier sur le disque, tel quel (comportement d'avant, rien de mieux à
    /// servir). Préparé sur le réseau alors que le fichier est là, il se jette.
    public nonisolated static func mayAdoptPrerolledPlayer(playsLocalFile: Bool, localFileOnDisk: Bool) -> Bool {
        playsLocalFile || !localFileOnDisk
    }

    /// Le lecteur sortant revient au pool s'il est PRÊT et lit le fichier :
    /// un retour en arrière le retrouve décodé. Un lecteur en échec ou en
    /// streaming n'y prendrait que la place d'un voisin utile.
    public nonisolated static func mayRecycleOutgoingPlayer(isReadyToPlay: Bool, playsLocalFile: Bool) -> Bool {
        isReadyToPlay && playsLocalFile
    }

    static func playsLocalFile(_ player: AVPlayer) -> Bool {
        (player.currentItem?.asset as? AVURLAsset)?.url.isFileURL == true
    }

    /// Rend le lecteur que `load()` remplace au pool de `StoryMediaLoader`
    /// (borné à trois) au lieu de le détruire — le retour en arrière d'un réel
    /// ne repart plus à froid.
    ///
    /// La tête RESTE où l'utilisateur l'a laissée quand la position est
    /// reprenable (#10354, `PlaybackResumeLaw.recycledHead`) : le retour
    /// reprend là, à l'instant, par un simple `play()`. Ramenée à zéro, elle
    /// jouait depuis le début pendant le geste, puis un `seek` précis la
    /// replaçait une fois la page posée — plusieurs secondes sur l'appareil.
    func recycle(_ outgoing: AVPlayer, for url: URL) {
        guard Self.mayRecycleOutgoingPlayer(
            isReadyToPlay: outgoing.currentItem?.status == .readyToPlay,
            playsLocalFile: Self.playsLocalFile(outgoing)
        ) else { return }
        PlaybackLoopQueue.dropSuccessors(of: outgoing)
        outgoing.actionAtItemEnd = Self.actionAtItemEnd(looping: false)
        let rewind = PlaybackResumeLaw.recycledHead(
            position: outgoing.currentTime().seconds,
            duration: outgoing.currentItem?.duration.seconds ?? .nan,
            isResumable: Self.isResumable)
        StoryMediaLoader.shared.returnPlayer(outgoing, for: url)
        guard let rewind else {
            // Préroulé là où il est (#9702) : ses tampons sont pleins au
            // `play()` du retour en arrière, l'image ne fige pas.
            Self.prerollIfIdle(outgoing)
            return
        }
        outgoing.seek(to: CMTime(seconds: rewind, preferredTimescale: 600),
                      toleranceBefore: .zero, toleranceAfter: .zero) { finished in
            guard finished else { return }
            Task { @MainActor in Self.prerollIfIdle(outgoing) }
        }
    }

    /// `preroll` lève une exception sur un lecteur qui joue ou dont l'élément
    /// n'est pas prêt : entre le `seek` et sa complétion, le lecteur a pu être
    /// repris (il joue) ou évincé du pool (plus d'élément).
    public nonisolated static func mayPrerollRecycledPlayer(rate: Float, isReadyToPlay: Bool) -> Bool {
        rate == 0 && isReadyToPlay
    }

    /// **Ce que `preroll(atRate:)` exige avant d'être appelé (#10554).**
    ///
    /// AVFoundation lève une exception — donc arrête l'application — quand le
    /// statut du LECTEUR n'est pas « prêt » (`AVPlayer.h` : « This method
    /// throws an exception if the status is not AVPlayerStatusReadyToPlay »).
    /// Les deux sites ne lisaient que le statut de l'ÉLÉMENT : un lecteur en
    /// échec (services média redémarrés) avec un élément encore prêt passait.
    public nonisolated static func isReadyForPreroll(
        playerStatus: AVPlayer.Status, itemStatus: AVPlayerItem.Status?
    ) -> Bool {
        playerStatus == .readyToPlay && itemStatus == .readyToPlay
    }

    private static func prerollIfIdle(_ player: AVPlayer) {
        guard mayPrerollRecycledPlayer(
            rate: player.rate,
            isReadyToPlay: isReadyForPreroll(playerStatus: player.status, itemStatus: player.currentItem?.status)
        ) else { return }
        player.preroll(atRate: 1.0) { _ in }
    }
}
