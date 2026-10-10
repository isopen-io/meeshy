import AVFoundation
import MeeshySDK

// MARK: - Les réglages d'une vidéo posée, sur l'item qui la joue (#9169)

extension StoryMediaLayer {

    /// **Pose sur `item` la composition qui peint les réglages de ce média.**
    ///
    /// Appelé à chaque attache et à chaque reconfiguration à URL constante —
    /// c'est ainsi qu'un curseur du composer repeint la vidéo sans relancer sa
    /// lecture. Rien ne se refait tant que l'item et les valeurs peintes sont
    /// les mêmes ; une vidéo sans réglage ne reçoit AUCUNE composition (le
    /// compositeur natif, zéro coût par trame), et une composition posée par
    /// cette couche est retirée quand les réglages reviennent au neutre.
    ///
    /// Le player PRÊTÉ par le chemin de lecture (O16) reçoit la même
    /// composition : c'est le média de la scène qu'il joue, avec son rendu.
    @MainActor
    func applyVideoLook(to item: AVPlayerItem?) {
        guard let item else { return }
        let reglages = media.flatMap(StoryVideoAdjustmentsProcessor.paintedAdjustments(for:))
        let signature = reglages.map(StoryMediaAdjustmentsProcessor.signature) ?? ""
        let identite = ObjectIdentifier(item)
        let precedent = appliedVideoLook
        guard precedent?.item != identite || precedent?.signature != signature else { return }

        videoLookTask?.cancel()
        videoLookTask = nil
        appliedVideoLook = (identite, signature)

        guard let reglages else {
            if precedent?.item == identite, precedent?.signature.isEmpty == false {
                item.videoComposition = nil
            }
            return
        }

        let asset = item.asset
        videoLookTask = Task { @MainActor [weak self, weak item] in
            guard let composition = try? await StoryVideoAdjustmentsProcessor.composition(for: asset,
                                                                                          adjustments: reglages),
                  !Task.isCancelled, let self, let item,
                  self.appliedVideoLook?.item == ObjectIdentifier(item),
                  self.appliedVideoLook?.signature == signature else { return }
            item.videoComposition = composition
        }
    }

    /// Retire la composition que cette couche a posée — à la fermeture, l'item
    /// d'un player prêté retourne à sa surface tel qu'elle l'a confié.
    @MainActor
    func releaseVideoLook(from item: AVPlayerItem?) {
        videoLookTask?.cancel()
        videoLookTask = nil
        defer { appliedVideoLook = nil }
        guard let item, let applique = appliedVideoLook,
              applique.item == ObjectIdentifier(item), !applique.signature.isEmpty else { return }
        item.videoComposition = nil
    }
}
