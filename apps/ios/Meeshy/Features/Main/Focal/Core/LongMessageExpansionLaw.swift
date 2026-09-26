import CoreGraphics

/// Le dépliage EN PLACE d'un message long (#8147) — loi pure, sans UIKit.
///
/// « Lire la suite » déplie le message DANS le fil, « Réduire » le replie ; il
/// n'existe plus de feuille de lecture. Un seul message est déplié à la fois,
/// et tant qu'il l'est — et qu'il est à l'écran — il reçoit l'effet Focal :
/// bloc de verre, loupe, voisins atténués. Les quatre modes de lecture
/// (Bulles, Script, Focal, Rivière) obéissent à cette même loi.
nonisolated enum LongMessageExpansionLaw {

    /// Le message déplié après un toucher sur `toggled` : toucher le déplié
    /// le replie, toucher un autre le remplace (le précédent se replie).
    static func nextExpanded(current: String?, toggled: String) -> String? {
        current == toggled ? nil : toggled
    }

    /// Le bord de la cellule qui NE BOUGE PAS pendant l'animation de hauteur.
    ///
    /// - Déplier : le HAUT reste en place — l'extrait ne bouge pas, la suite
    ///   se déroule dessous, là où l'œil lisait « Lire la suite ».
    /// - Replier : le BAS reste en place — « Réduire » vit sous le texte
    ///   entier ; tenir le haut renverrait le lecteur d'un message de trois
    ///   écrans vers un début hors champ.
    enum Anchor: Equatable {
        case top
        case bottom
    }

    static func anchor(isExpanding: Bool) -> Anchor {
        isExpanding ? .top : .bottom
    }

    /// Le décalage de défilement qui ramène le bord ancré à son ordonnée
    /// VISUELLE d'avant — dans le fil renversé (`scaleY: -1`), augmenter le
    /// décalage fait DESCENDRE le contenu à l'écran. Borné à la plage de
    /// défilement : au bas du fil, un déplié grandit vers le haut plutôt que
    /// de sortir du cadre.
    static func anchoredOffset(
        current: CGFloat,
        edgeBefore: CGFloat,
        edgeAfter: CGFloat,
        minOffset: CGFloat,
        maxOffset: CGFloat
    ) -> CGFloat {
        let target = current + (edgeBefore - edgeAfter)
        return min(max(target, minOffset), max(minOffset, maxOffset))
    }

    /// Le cadre du bloc de verre du déplié (#8161), dans le repère de la
    /// rangée. En Bulles, le verre ÉPOUSE la bulle et en déborde des cotes
    /// partagées (`FOCAL_METRICS` : 6 pt de côté, 3 pt en haut et en bas) —
    /// jamais la largeur entière de la rangée, qui ferait d'une bulle de
    /// 70 % un bandeau. Sans bulle mesurée (rangée plate, Rivière, première
    /// passe), il retombe sur la rangée moins sa gouttière.
    static func glassFrame(bubble: CGRect?, row: CGRect) -> CGRect {
        guard let bubble, !bubble.isEmpty else {
            return row.insetBy(dx: FocalScrollPerspective.focusCardHorizontalInset, dy: 0)
        }
        return bubble.insetBy(
            dx: -FocalScrollPerspective.focusCardHorizontalInset,
            dy: -FocalScrollPerspective.focusCardInnerMargin
        )
    }

    /// L'opacité d'une cellule : le déplié reste pleinement lisible, ses
    /// voisins s'atténuent — seulement tant que le déplié est VISIBLE. Hors
    /// champ, le fil redevient uniforme (le message reste déplié). La
    /// valeur est celle des voisins de la scène Focal
    /// (`FocalScrollPerspective.alphaFloor`, `neighborOpacity` partagé).
    static func alpha(isExpandedCell: Bool, expansionVisible: Bool) -> CGFloat {
        guard expansionVisible, !isExpandedCell else { return 1 }
        return FocalScrollPerspective.alphaFloor
    }
}
