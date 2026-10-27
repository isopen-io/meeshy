import Foundation

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

    /// La fenêtre pendant laquelle le bord ancré est tenu : la durée de la
    /// mise en avant, plus la marge d'une re-mesure SwiftUI tardive. Au-delà,
    /// le fil redevient libre — une hauteur qui change plus tard (image,
    /// traduction) obéit aux lois ordinaires du fil.
    static let holdWindow: TimeInterval = FocalMetrics.Focus.expandDuration + 0.35

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

    // MARK: - La hauteur s'anime (#8232)

    /// Le tempo du dépliage ET du repliage : la durée et la courbe que joue
    /// le web (`FOCAL_METRICS.expandDurationMs` / `expandCurve`). Réduire le
    /// mouvement ⇒ aucun tempo : la hauteur se pose d'un coup.
    struct HeightTiming: Equatable {
        let duration: TimeInterval
        /// Points de contrôle de la Bézier cubique `[x1, y1, x2, y2]`.
        let controlPoints: [Double]
    }

    static func heightTiming(reduceMotion: Bool) -> HeightTiming? {
        guard !reduceMotion else { return nil }
        return HeightTiming(duration: FocalMetrics.Focus.expandDuration, controlPoints: FocalMetrics.Focus.expandCurve)
    }

    /// Un intervalle sur l'axe du fil — ordonnée à l'écran et hauteur, dans
    /// le repère INTERNE de la liste (renversée : l'origine est le bord
    /// visuel du BAS).
    struct Span: Equatable {
        let origin: CGFloat
        let length: CGFloat
        var end: CGFloat { origin + length }
    }

    /// Le bord d'une cellule qui GUIDE son contenu pendant l'animation.
    enum Pin: Equatable {
        case origin
        case end
    }

    /// Le bord guide, dans le repère interne, d'un bord VISUEL : la liste
    /// renversée met le haut visuel à la FIN de l'intervalle.
    static func pin(for anchor: Anchor, listIsInverted: Bool) -> Pin {
        (anchor == .top) == listIsInverted ? .end : .origin
    }

    /// Ce qu'une cellule JOUE pendant le tempo. Le layout se pose d'un coup —
    /// une passe, sans animation (#8162 : l'animer par UIKit perdait 2 à 6
    /// images) — puis l'IMAGE rejoue l'écart sur le serveur de rendu :
    ///
    /// - `translationFrom` : le décalage additif de départ, qui revient à 0 ;
    /// - `revealFrom` : pour une cellule qui GRANDIT, la fenêtre visible de
    ///   départ, dans son repère local, qui s'ouvre jusqu'à la cellule
    ///   entière — le texte se DÉROULE depuis le bord guide, jamais une
    ///   hauteur finale qui recouvre ses voisins.
    struct HeightMotion: Equatable {
        let translationFrom: CGFloat
        let revealFrom: Span?
    }

    static func heightMotion(before: Span, after: Span, pin: Pin) -> HeightMotion? {
        let translation = pin == .origin ? before.origin - after.origin : before.end - after.end
        let grows = after.length > before.length + 0.5
        guard abs(translation) > 0.5 || grows else { return nil }
        let reveal = grows
            ? Span(origin: pin == .origin ? 0 : after.length - before.length, length: before.length)
            : nil
        return HeightMotion(translationFrom: translation, revealFrom: reveal)
    }

    /// Le déplacement qu'imprime au fil le changement de hauteur du déplié
    /// à une cellule d'un côté ou de l'autre : au-delà de sa fin, elle suit
    /// son bord de fin ; en deçà, son bord d'origine. Sert aux cellules que
    /// la passe fait ENTRER à l'écran (sans ordonnée d'avant) et à l'image
    /// de celles qu'elle en fait SORTIR (sans cellule d'après).
    static func regionShift(beyondEnd: Bool, expandedBefore: Span, expandedAfter: Span) -> CGFloat {
        beyondEnd ? expandedAfter.end - expandedBefore.end : expandedAfter.origin - expandedBefore.origin
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
