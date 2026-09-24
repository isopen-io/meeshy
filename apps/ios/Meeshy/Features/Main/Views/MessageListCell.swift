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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
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
