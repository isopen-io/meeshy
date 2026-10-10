import UIKit
@preconcurrency import AVFoundation
import MeeshySDK

// MARK: - Le RENDU du fond, repeint en place (#9496)

extension StoryBackgroundLayer {

    /// **Repeint le fond quand SEUL son rendu change** — filtre de slide,
    /// intensité, réglages du média de fond. Rend `false` quand la couche n'a
    /// rien à repeindre en place (aucun bitmap final retenu, aucun player) :
    /// `configure` reprend alors son chemin complet.
    ///
    /// C'est ce qui rend un curseur de réglage fluide sur le fond : une image
    /// repart du bitmap BRUT que le dernier stamp a retenu — ni ThumbHash, ni
    /// rechargement —, une vidéo garde son player et reçoit la composition de
    /// ses réglages, sans que la lecture ne saute.
    @MainActor
    func restyleInPlace(filter: StoryFilter?, filterIntensity: Float, adjustments: ImageAdjustments?) -> Bool {
        switch kind {
        case .image:
            guard let source = stampedSource, let img = contentLayer else { return false }
            setLook(filter: filter, filterIntensity: filterIntensity, adjustments: adjustments)
            stampFinalImage(source.image, imageId: source.imageId, on: img)
            return true
        case .video:
            guard avPlayer != nil else { return false }
            setLook(filter: filter, filterIntensity: filterIntensity, adjustments: adjustments)
            applyBackgroundVideoLook()
            return true
        case .solidColor, .gradient:
            return false
        }
    }

    /// **Pose sur les items du player de fond la composition de ses réglages.**
    ///
    /// Appelé à chaque attache et à chaque changement de réglage. Un fond
    /// BOUCLÉ joue des répliques de son item (`AVPlayerLooper`) : chacune
    /// reçoit la même composition, sinon le premier tour serait réglé et les
    /// suivants non. Un fond sans réglage ne reçoit AUCUNE composition (le
    /// compositeur natif, zéro coût par trame) ; celle que cette couche a posée
    /// est retirée quand les réglages reviennent au neutre.
    @MainActor
    func applyBackgroundVideoLook() {
        guard let player = avPlayer else { return }
        let reglages = StoryBackgroundLook.painted(activeAdjustments, for: .video)
        let signature = reglages.map(StoryMediaAdjustmentsProcessor.signature) ?? ""
        let identite = ObjectIdentifier(player)
        let precedent = appliedBackgroundVideoLook
        guard precedent?.player != identite || precedent?.signature != signature else { return }

        backgroundVideoLookTask?.cancel()
        backgroundVideoLookTask = nil
        appliedBackgroundVideoLook = (identite, signature)

        guard let reglages else {
            if precedent?.player == identite, precedent?.signature.isEmpty == false {
                backgroundPlaybackItems(of: player).forEach { $0.videoComposition = nil }
            }
            return
        }
        // L'asset de l'item joué ; à défaut — une boucle dont les répliques ne
        // sont pas encore en file —, celui que l'attache a ouvert sur la même URL.
        guard let asset = backgroundPlaybackItems(of: player).first?.asset ?? attachedVideoAsset else { return }
        backgroundVideoLookTask = Task { @MainActor [weak self, weak player] in
            guard let composition = try? await StoryVideoAdjustmentsProcessor.composition(for: asset,
                                                                                          adjustments: reglages),
                  !Task.isCancelled, let self, let player,
                  self.appliedBackgroundVideoLook?.player == ObjectIdentifier(player),
                  self.appliedBackgroundVideoLook?.signature == signature else { return }
            self.backgroundPlaybackItems(of: player).forEach { $0.videoComposition = composition }
        }
    }

    /// Les items que ce player JOUE : l'item courant et, pour un fond bouclé,
    /// toutes les répliques de la boucle — chacun une fois.
    @MainActor
    private func backgroundPlaybackItems(of player: AVPlayer) -> [AVPlayerItem] {
        let candidats = (avPlayerLooper?.loopingPlayerItems ?? []) + [player.currentItem].compactMap { $0 }
        var vus = Set<ObjectIdentifier>()
        return candidats.filter { vus.insert(ObjectIdentifier($0)).inserted }
    }
}
