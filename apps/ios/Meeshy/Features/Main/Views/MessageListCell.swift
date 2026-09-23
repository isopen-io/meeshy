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
/// un `UICollectionViewCell` dont la seule différence est de ne jamais
/// demander une correction self-sizing pour un bruit de mesure.
class MessageListCell: UICollectionViewCell {

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
