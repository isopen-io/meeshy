import CoreGraphics

/// Logique pure de décision pour le geste swipe-to-collapse de la bannière
/// d'appel (pill → bulle) et le positionnement de la bulle repliée. Aucune
/// dépendance UI — testable, même principe que `BubbleSwipeResistance`
/// (`BubbleSwipeResistance.swift`).
enum CallBubbleGestureResolver {
    /// Distance horizontale (pt) au-delà de laquelle un swipe engage le
    /// collapse même relâché lentement.
    static let collapseDistanceThreshold: CGFloat = 80
    /// Vélocité horizontale (pt/s) au-delà de laquelle un swipe engage le
    /// collapse même sous le seuil de distance (flick rapide et court).
    static let collapseVelocityThreshold: CGFloat = 500

    /// Diamètre fixe de la bulle — partagé avec `CallBubbleView`.
    static let bubbleDiameter: CGFloat = 56
    /// Marge entre le bord de la bulle et le bord d'écran quand ancrée (même
    /// convention que `minEdgePadding` du FAB principal, `FloatingButtons.swift:68`).
    static let bubbleEdgeMargin: CGFloat = 20
    /// Écart entre la bulle et un bouton du mini-menu.
    static let menuButtonGap: CGFloat = 8
    /// Hauteur (pt), depuis le bas de la zone sûre, réservée au FAB principal —
    /// la bulle ne doit jamais s'y déposer, quel que soit son bord d'ancrage.
    /// Reprend le pire cas `bottomSafeZoneWithSearch` (110pt,
    /// `FloatingButtons.swift:70`) + le rayon du bouton FAB (52/2=26pt) + marge 12pt.
    static let fabExclusionZoneHeight: CGFloat = 148

    /// Vrai si le relâchement du drag doit replier la pill en bulle : distance
    /// OU vélocité au-delà du seuil, direction gauche ou droite indifféremment.
    static func shouldCollapse(translationWidth: CGFloat, velocityWidth: CGFloat) -> Bool {
        abs(translationWidth) > collapseDistanceThreshold
            || abs(velocityWidth) > collapseVelocityThreshold
    }

    /// Bord d'ancrage le plus proche du centre de la bulle au relâchement du
    /// drag de repositionnement. Pile au milieu de l'écran → `.trailing`
    /// (choix déterministe).
    static func snappedEdge(centerX: CGFloat, screenWidth: CGFloat) -> BubbleHorizontalEdge {
        centerX >= screenWidth / 2 ? .trailing : .leading
    }

    /// Décalage horizontal (pt) à appliquer au cluster bulle+3 boutons à la
    /// révélation du mini-menu pour que le bouton du côté ancré (haut-parleur
    /// si `.trailing`, mute si `.leading`) reste entièrement dans l'écran.
    /// Retourne 0 si le cluster tient déjà. Note : avec des marges fixes en
    /// points (pas proportionnelles), le résultat ne dépend pas de
    /// `screenWidth` — le paramètre reste pour la symétrie d'API avec
    /// `snappedEdge` et si les marges deviennent un jour proportionnelles.
    static func menuOffset(edge: BubbleHorizontalEdge, screenWidth: CGFloat, buttonDiameter: CGFloat) -> CGFloat {
        let overflow = buttonDiameter + menuButtonGap - bubbleEdgeMargin
        guard overflow > 0 else { return 0 }
        switch edge {
        case .trailing: return -overflow
        case .leading: return overflow
        }
    }

    /// Clampe une position Y candidate (pt, relative au haut de la zone sûre)
    /// dans les bornes valides pour le centre de la bulle : jamais dans la
    /// zone du FAB principal en bas, jamais hors zone sûre en haut.
    static func clampedVerticalPosition(_ y: CGFloat, availableHeight: CGFloat, bubbleRadius: CGFloat) -> CGFloat {
        let minY = bubbleRadius
        let maxY = max(availableHeight - fabExclusionZoneHeight - bubbleRadius, minY)
        return min(max(y, minY), maxY)
    }
}
