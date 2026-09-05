import UIKit
import QuartzCore
import MeeshySDK

// MARK: - StoryCanvasUIView + le mouvement des décorations, en composition

extension StoryCanvasUIView {

    /// **Les décorations qui DÉCLARENT un mouvement**, et elles seules.
    ///
    /// La liste est la garde de performance du lot : une scène sans décoration
    /// animée — le cas courant — ne coûte qu'un `filter` sur un tableau qui
    /// compte quelques entrées, et pas une seule écriture de couche.
    var animatedStickers: [StorySticker] {
        (slide.effects.stickerObjects ?? []).filter { $0.animation != nil }
    }

    /// **Fait vivre les décorations à chaque tick de l'horloge d'édition**
    /// (#4999, directive porteur 2026-09-03).
    ///
    /// ## Ce que cette passe fait, et surtout ce qu'elle NE fait pas
    ///
    /// Elle ne reconstruit RIEN. `rebuildLayers()` empreinte le modèle de
    /// chaque élément et recrée les couches qui ont changé ; l'appeler à 120 Hz
    /// pour un mouvement est exactement le régime que `StoryRendererCache`
    /// existe pour éviter. Le mouvement d'une décoration ne touche pourtant que
    /// deux propriétés de sa couche — sa transformation et son opacité — que
    /// `StoryStickerLayer.applyAnimationPose` sait poser en ABSOLU. On repose
    /// donc la pose sur les couches DÉJÀ montées, et le modèle ne bouge pas
    /// d'un octet : composer n'est pas jouer.
    ///
    /// ## La même fonction qu'au lecteur et à l'export
    ///
    /// `StickerAnimation.pose(at:)` est le site unique du mouvement — celui que
    /// `StoryRenderer` applique en `.play` et que le compositeur applique image
    /// par image. Une seconde implémentation ici ferait mentir l'aperçu sur le
    /// rendu final, ce que la loi 6 interdit. Seule l'HORLOGE diffère, et c'est
    /// justifié : en composition il n'y a pas de playhead, seulement un temps
    /// écoulé depuis la pose (`StoryStickerMotionClock`).
    ///
    /// ## Quand ça s'arrête
    ///
    /// Avec la vidéo et le son, au même instant et pour la même raison : après
    /// `EditClockThrottle.defaultIdleDelay` sans interaction, `driveEditClock`
    /// met `editDisplayLink` en pause et suspend la boucle d'aperçu. La
    /// décoration se fige alors exactement comme la vidéo qu'elle commente —
    /// « vivant tout comme les vidéos et audios » vaut aussi pour le repos.
    /// La reprise ne saute pas : l'horloge ignore les trous.
    ///
    /// ## Mouvement réduit
    ///
    /// Le réglage peut s'activer PENDANT la composition. On ne se contente
    /// donc pas de sortir : on rend aux décorations la pose de l'auteur, une
    /// seule fois (`isPosing`). Sortir sans défaire laisserait une décoration
    /// figée de travers, ce qui est pire que de la laisser bouger.
    func refreshStickerMotion(now: Double) {
        guard playsStickerMotionInEditMode, mode == .edit, !isTimelinePreviewActive else { return }
        let animees = animatedStickers
        guard !animees.isEmpty else { return }

        guard !UIAccessibility.isReduceMotionEnabled else {
            restStickerMotion(animees)
            return
        }

        stickerMotionClock.advance(to: now)
        stickerMotionClock.synchronize(ids: animees.map(\.id))
        let couches = stickerLayersById()
        guard !couches.isEmpty else { return }

        // Sans cette transaction, chaque écriture déclencherait l'animation
        // implicite de Core Animation (0,25 s) et le mouvement se rendrait en
        // traînée : un `shake` deviendrait un flou, un `blink` un fondu.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        for sticker in animees {
            guard let animation = sticker.animation, let couche = couches[sticker.id] else { continue }
            let pose = animation.pose(at: stickerMotionClock.time(forId: sticker.id))
            couche.applyAnimationPose(pose, baseRotationDegrees: sticker.rotation)
            couche.opacity = Float(pose.opacity)
        }
        stickerMotionClock.markPosed()
    }

    /// Rend aux décorations la pose que l'auteur a choisie — la pose
    /// d'identité, qui est par contrat celle de `pose(at: 0)`.
    func restStickerMotion(_ animees: [StorySticker]) {
        guard stickerMotionClock.isPosing else { return }
        let couches = stickerLayersById()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        for sticker in animees {
            guard let couche = couches[sticker.id] else { continue }
            couche.applyAnimationPose(.identity, baseRotationDegrees: sticker.rotation)
            couche.opacity = 1
        }
        stickerMotionClock.markRested()
    }

    /// Les couches de décoration montées, indexées par l'identifiant de leur
    /// objet — `StoryRenderer` pose `layer.name = item.id`, et c'est le seul
    /// lien entre un modèle et sa couche.
    private func stickerLayersById() -> [String: StoryStickerLayer] {
        var index: [String: StoryStickerLayer] = [:]
        for sub in itemsContainer.sublayers ?? [] {
            guard let couche = sub as? StoryStickerLayer, let nom = sub.name else { continue }
            index[nom] = couche
        }
        return index
    }

    /// Couture de test : jouer un tick sans faire tourner de `CADisplayLink`,
    /// exactement comme `_driveEditClockForTesting(now:)` le fait pour la
    /// régulation d'horloge.
    public func _refreshStickerMotionForTesting(now: Double) {
        refreshStickerMotion(now: now)
    }
}
