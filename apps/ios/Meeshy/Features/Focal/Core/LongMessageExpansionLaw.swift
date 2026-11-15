import Foundation

/// Le dépliage EN PLACE d'un message long (#8147) — loi pure, sans UIKit.
///
/// « Lire la suite » déplie le message DANS le fil ; il n'existe plus de
/// feuille de lecture. Depuis #16463, le déplié est un message ORDINAIRE du
/// mode courant (bulle, bloc Focal, rangée Script, Rivière) : aucune mise en
/// avant, aucun « Réduire ». Il reste déplié tant que la conversation est
/// ouverte — l'état vit chez l'hôte du fil, recréé à chaque ouverture — et
/// plusieurs messages peuvent l'être.
nonisolated enum LongMessageExpansionLaw {

    /// Les messages dépliés après un toucher sur `tapped` : il s'ajoute aux
    /// dépliés, et rien ne se replie.
    static func expanded(after current: Set<String>, tapping tapped: String) -> Set<String> {
        current.union([tapped])
    }

    /// Le bord VISUEL d'une cellule.
    enum Anchor: Equatable {
        case top
        case bottom
    }

    /// Le bord du déplié qui NE BOUGE PAS pendant l'animation de hauteur : le
    /// HAUT — l'extrait ne bouge pas, la suite se déroule dessous, là où l'œil
    /// lisait « Lire la suite ».
    static let anchor: Anchor = .top

    /// La fenêtre pendant laquelle le bord ancré est tenu : la durée du
    /// dépliage, plus la marge d'une re-mesure SwiftUI tardive. Au-delà,
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

    // MARK: - La hauteur s'anime (#8232)

    /// Le tempo du dépliage : la durée et la courbe que joue
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
}
