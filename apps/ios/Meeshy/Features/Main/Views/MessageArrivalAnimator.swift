import MeeshyUI
import UIKit

/// #11223 — l'entrée animée du DERNIER message arrivé en temps réel, côté
/// UIKit. La DÉCISION est la loi pure `MessageArrivalMotion` ; ce type ne fait
/// que l'armer à la pose du snapshot et la jouer à la réalisation de SA cellule.
///
/// ROULEAU (2026-08-18) tient toujours pour le data source : la pose reste sans
/// animation d'insertion. L'entrée se joue sur la couche de la CELLULE, en
/// animation Core Animation — jamais sur ses propriétés de modèle (`alpha`,
/// `transform`), que la pose des attributs de layout réécrit en plein vol, ni
/// sur la couche du `contentView`, que la scène Focal pose. Elle ne touche ni
/// la hauteur ni l'offset : le défilement automatique est inchangé.
///
/// Un type VALEUR tenu par le contrôleur : aucune `deinit` à isoler.
struct MessageArrivalAnimator {

    private var pending: (item: MessageListItem, armedAt: Date)?

    /// `previous` vide ⇒ premier rendu. Une pose sans arrivée ne désarme pas la
    /// précédente : sa cellule n'est peut-être pas encore réalisée.
    mutating func arm(
        previous: Set<MessageListItem>,
        newestFirst items: [MessageListItem],
        store: MessageStore,
        now: Date = Date()
    ) {
        let reduceMotion = MeeshyMotion.shouldReduce(
            system: UIAccessibility.isReduceMotionEnabled,
            userForced: MeeshyAccessibilityPreferences.shared.reduceMotion
        )
        let arrival = MessageArrivalMotion.animated(
            previous: previous,
            newestFirst: items,
            createdAt: { item in
                guard case .message(let localId) = item else { return nil }
                return store.message(for: localId)?.createdAt
            },
            now: now,
            reduceMotion: reduceMotion
        )
        guard let arrival else { return }
        pending = (item: arrival, armedAt: now)
    }

    /// Joue l'arrivée armée sur SA cellule, une fois ; une réalisation hors de
    /// `MessageArrivalMotion.displayWindow` la laisse tomber.
    mutating func play(on cell: UICollectionViewCell, item: MessageListItem?, now: Date = Date()) {
        guard let armed = pending, item == armed.item else { return }
        pending = nil
        guard MessageArrivalMotion.playsOnDisplay(armedAt: armed.armedAt, now: now) else { return }
        cell.layer.add(Self.entrance(), forKey: "meeshy.messageArrival")
    }

    /// Le fil est renversé (`scaleY: -1`) : un décalage NÉGATIF dans son repère
    /// place la cellule plus BAS à l'écran, d'où elle monte.
    private static func entrance() -> CAAnimation {
        let start = CATransform3DConcat(
            CATransform3DMakeScale(MessageArrivalMotion.startScale, MessageArrivalMotion.startScale, 1),
            CATransform3DMakeTranslation(0, -MessageArrivalMotion.rise, 0)
        )
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.0
        fade.toValue = 1.0
        let lift = CABasicAnimation(keyPath: "transform")
        lift.fromValue = NSValue(caTransform3D: start)
        lift.toValue = NSValue(caTransform3D: CATransform3DIdentity)
        let group = CAAnimationGroup()
        group.animations = [fade, lift]
        group.duration = MessageArrivalMotion.duration
        group.timingFunction = CAMediaTimingFunction(controlPoints: 0.22, 1, 0.36, 1)
        group.fillMode = .backwards
        return group
    }
}
