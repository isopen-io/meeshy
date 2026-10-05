// apps/ios/Meeshy/Features/Main/Views/MessageListCell.swift

import UIKit

/// **Quand une cellule du fil redemande-t-elle une taille ?** (#7624)
///
/// Seulement quand sa hauteur change d'au moins un pixel PHYSIQUE. UIKit
/// compare les attributs self-sizing EXACTEMENT : une hauteur re-mesurée à
/// `36.3333334` quand le layout porte `36.3333333` est pour lui une
/// correction, qui invalide le layout et joue une passe de mise à jour.
///
/// Mesuré au simulateur (fil « Meeshy Global », sonde sur
/// `preferredLayoutAttributesFitting`) : 1 046 des 1 723 corrections de deux
/// séries de flings étaient de ce bruit — le séparateur de jour à lui seul,
/// 759 fois, une par image de défilement. Chacune coûtait une passe
/// `_performBatchUpdates` et entamait le plafond anti-récursion de
/// `MessageListLayout`, retardant les VRAIES corrections des rangées
/// réalisées dans la même image.
///
/// Loi PURE — l'échelle d'affichage est injectée.
nonisolated enum MessageListCellSizingLaw {

    /// La hauteur à rendre au layout : la COURANTE, à l'identique, si la
    /// mesure tombe sur le même pixel ; sinon la mesure calée sur la grille
    /// des pixels — un point fixe, qui ne se re-propose pas à la passe
    /// suivante.
    static func stabilizedHeight(fitted: CGFloat, current: CGFloat, scale: CGFloat) -> CGFloat {
        let pixels = max(scale, 1)
        let fittedPixels = (fitted * pixels).rounded()
        guard fittedPixels != (current * pixels).rounded() else { return current }
        return fittedPixels / pixels
    }
}

/// La cellule de toutes les rangées du fil (messages, séparateurs, frappe) :
/// un `UICollectionViewCell` qui ne demande jamais une correction self-sizing
/// pour un bruit de mesure, ni pour l'endroit de l'écran qu'il traverse.
class MessageListCell: UICollectionViewCell {
    /// **Corps vide, `nonisolated` (SE-0466, #7686).** La cible compile sous
    /// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` : sans cette déclaration,
    /// Swift synthétise une deinit ISOLÉE qui double-libère le scope
    /// task-local au démontage hors d'une tâche sur iOS 26.1 — `pointer being
    /// freed was not allocated` (abrt), reproduit par un test XCTest synchrone
    /// démontant la vue. Un corps vide n'a aucun état à toucher : rien ne
    /// dépend du main actor, donc rien ne change de comportement à le
    /// déclarer `nonisolated`.
    ///
    /// Gardes : `MainActorDeinitSourceGuardTests`, `MeeshyUIDeinitSourceGuardTests`.
    nonisolated deinit {}

    /// **Une rangée du fil n'a pas de zone non sûre** (#7660).
    ///
    /// Le fil s'étend sous la bande de l'îlot et sous l'indicateur d'accueil,
    /// et ses réserves y sont posées À LA MAIN (`applyTopInset`,
    /// `applyBottomInset` ; `contentInsetAdjustmentBehavior = .never`). Une
    /// cellule qui traverse ces bandes recevait pourtant leur `safeAreaInsets`,
    /// que le contenu `UIHostingConfiguration` AJOUTE à sa taille : sa
    /// hauteur suivait sa position à l'écran, pixel par pixel.
    ///
    /// Mesuré au simulateur (fil « Meeshy Global », série de flings) : un
    /// séparateur de jour de 36 pt re-mesuré à 98 pt sous l'îlot (36 + 62),
    /// 1 362 redimensionnements réels, dont 817 joués dans une passe animée
    /// de 0,44 s — 154 une fois la zone neutralisée, estimations comprises.
    ///
    /// Seules les bandes HAUTE et BASSE sont neutralisées : ce sont celles que
    /// le défilement fait traverser. Les bords latéraux (encoche en paysage)
    /// ne dépendent pas de la position de la rangée et restent respectés.
    override var safeAreaInsets: UIEdgeInsets {
        let inherited = super.safeAreaInsets
        return UIEdgeInsets(top: 0, left: inherited.left, bottom: 0, right: inherited.right)
    }

    /// **La pose Focal survit à la mise en page** (#7953).
    ///
    /// La passe Focal pose sur `contentView.layer` la loupe de l'élu et le
    /// passage de ses voisines. `UICollectionViewCell` recale son
    /// `contentView` par son `frame` à chaque mise en page ; sur une vue
    /// transformée, ce `frame` recentre la vue pour ANNULER la translation —
    /// mesuré au simulateur : le passage calculé (+46 pt) n'était pas rendu.
    /// La mise en page se fait donc sur une vue non transformée, et la pose
    /// est rendue telle quelle ensuite.
    override func layoutSubviews() {
        let pose = contentView.layer.transform
        guard !CATransform3DIsIdentity(pose) else { return super.layoutSubviews() }
        contentView.layer.transform = CATransform3DIdentity
        super.layoutSubviews()
        contentView.layer.transform = pose
    }

    /// **Le cadre de l'élu Focal déborde de la cellule, et ses contrôles avec
    /// lui** (#8537). La bande basse (pastille de langue, drapeaux, réactions,
    /// date) est une superposition posée ENTIÈRE sous le contenu : UIKit ne
    /// remet un toucher qu'à une vue dont les bornes le contiennent, et celui-là
    /// partait à la voisine du dessous — « rien ne se passe ». La passe Focal
    /// pose ici l'étendue du cadre (`FocalScrollPerspective.electedTouchOverflow`),
    /// dans le repère UIKit de la cellule ; `.zero` hors élection.
    var touchOverflow: UIEdgeInsets = .zero

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.inset(by: UIEdgeInsets(top: -touchOverflow.top, left: -touchOverflow.left,
                                      bottom: -touchOverflow.bottom, right: -touchOverflow.right)).contains(point)
    }

    /// Dans le débord, le toucher va au contenu SwiftUI, qui le résout par sa
    /// position : ses bornes UIKit ne contiennent pas ce point, le parcours
    /// ordinaire des sous-vues s'arrêterait à la cellule.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard touchOverflow != .zero, !bounds.contains(point) else { return super.hitTest(point, with: event) }
        guard isUserInteractionEnabled, !isHidden, alpha > 0.01, self.point(inside: point, with: event) else { return nil }
        return contentView.hitTest(convert(point, to: contentView), with: event) ?? contentView
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        touchOverflow = .zero
    }

    override func preferredLayoutAttributesFitting(
        _ layoutAttributes: UICollectionViewLayoutAttributes
    ) -> UICollectionViewLayoutAttributes {
        let fitted = super.preferredLayoutAttributesFitting(layoutAttributes)
        let height = MessageListCellSizingLaw.stabilizedHeight(
            fitted: fitted.frame.height,
            current: layoutAttributes.frame.height,
            scale: traitCollection.displayScale
        )
        guard height != fitted.frame.height else { return fitted }
        fitted.frame.size.height = height
        return fitted
    }

}

/// Le fil de conversation. Il ne diffère d'une `UICollectionView` que par
/// l'ORDRE dans lequel il interroge ses cellules au toucher (#8537) : la
/// cellule élue dont le cadre déborde a le premier mot sur son débord — sans
/// quoi la voisine posée par-dessus dans la pile des sous-vues le prenait.
final class MessageListCollectionView: UICollectionView {
    nonisolated deinit {}

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isUserInteractionEnabled, !isHidden, alpha > 0.01 else { return nil }
        return Self.overflowHit(point, in: self, cells: visibleCells, with: event) ?? super.hitTest(point, with: event)
    }

    /// Le toucher d'un point pris dans le DÉBORD d'une cellule élue, ou `nil`
    /// pour laisser décider le parcours ordinaire.
    static func overflowHit(_ point: CGPoint, in container: UIView, cells: [UICollectionViewCell], with event: UIEvent?) -> UIView? {
        for case let cell as MessageListCell in cells where cell.touchOverflow != .zero && !cell.isHidden {
            let local = container.convert(point, to: cell)
            guard !cell.bounds.contains(local), cell.point(inside: local, with: event) else { continue }
            return cell.hitTest(local, with: event)
        }
        return nil
    }
}
