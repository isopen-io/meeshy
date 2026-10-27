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

    /// Rayon de coin fixe (pt) partagé par les 3 paliers rectangle — seul le
    /// palier `.circle` a un rayon dérivé (moitié du diamètre, cercle parfait).
    static let rectangleCornerRadius: CGFloat = 20
    /// Sensibilité du mapping pinch → progression : un delta d'échelle de 0.25
    /// (25% de zoom) parcourt un palier plein. Valeur de confort, ajustable au
    /// ressenti.
    static let magnificationSensitivity: CGFloat = 4
    /// Vitesse de progression (paliers/s) au-delà de laquelle un relâchement
    /// biaise le snap d'un demi-palier dans le sens du geste — même principe
    /// que `collapseVelocityThreshold` pour le drag de la pilule.
    static let tierVelocityThreshold: CGFloat = 1.5

    /// Taille (pt) du palier donné. `.circle` est un carré (cercle une fois
    /// clippé en `RoundedRectangle(cornerRadius: diameter/2)`) ; les paliers
    /// rectangle suivent un ratio 9:16, aligné sur `preferredContentSize` du
    /// PiP système (`PiPCallController.swift`).
    static func size(for tier: CallBubbleSizeTier) -> CGSize {
        switch tier {
        case .circle: return CGSize(width: bubbleDiameter, height: bubbleDiameter)
        case .small: return CGSize(width: 90, height: 160)
        case .medium: return CGSize(width: 120, height: 213)
        case .large: return CGSize(width: 160, height: 284)
        }
    }

    /// Taille interpolée linéairement pour une progression continue
    /// `0...3` (`.circle...large`), clampée aux bornes. Alimente le morphing
    /// en direct pendant le pinch — `progress` fractionnaire retombe toujours
    /// entre deux paliers adjacents.
    static func interpolatedSize(progress: CGFloat) -> CGSize {
        let maxTier = CallBubbleSizeTier.allCases.count - 1
        let clamped = min(max(progress, 0), CGFloat(maxTier))
        let lowerRaw = Int(clamped.rounded(.down))
        let upperRaw = min(lowerRaw + 1, maxTier)
        let lowerTier = CallBubbleSizeTier(rawValue: lowerRaw) ?? .circle
        let upperTier = CallBubbleSizeTier(rawValue: upperRaw) ?? .large
        let fraction = clamped - CGFloat(lowerRaw)
        let lowerSize = size(for: lowerTier)
        let upperSize = size(for: upperTier)
        return CGSize(
            width: lowerSize.width + (upperSize.width - lowerSize.width) * fraction,
            height: lowerSize.height + (upperSize.height - lowerSize.height) * fraction
        )
    }

    /// Rayon de coin interpolé. `RoundedRectangle(cornerRadius:)` rend un
    /// cercle parfait à `progress == 0` (rayon = moitié du diamètre) ; au-delà
    /// de `progress == 1` le rayon reste fixe (`rectangleCornerRadius`) — les
    /// 3 paliers rectangle partagent le même arrondi, seule la taille varie
    /// entre eux.
    static func interpolatedCornerRadius(progress: CGFloat) -> CGFloat {
        let clamped = min(max(progress, 0), CGFloat(CallBubbleSizeTier.allCases.count - 1))
        guard clamped < 1 else { return rectangleCornerRadius }
        let circleRadius = bubbleDiameter / 2
        return circleRadius + (rectangleCornerRadius - circleRadius) * clamped
    }

    /// Opacité de la barre de contrôle persistante (mute/speaker/hangup) aux
    /// paliers rectangle : invisible tant qu'on est encore proche du cercle
    /// (`progress <= 0.5`), fondu progressif jusqu'à pleine opacité à
    /// `progress == 1`.
    static func controlBarOpacity(progress: CGFloat) -> Double {
        let clamped = min(max(progress, 0), CGFloat(CallBubbleSizeTier.allCases.count - 1))
        guard clamped > 0.5 else { return 0 }
        guard clamped < 1 else { return 1 }
        return Double((clamped - 0.5) / 0.5)
    }

    /// Progression continue (0...3) correspondant à l'échelle cumulée d'un
    /// `MagnificationGesture` en cours, ancrée sur le palier de départ du
    /// geste. `scale == 1` (aucun pinch) retombe exactement sur
    /// `startingTier.rawValue`.
    static func progress(startingTier: CallBubbleSizeTier, scale: CGFloat) -> CGFloat {
        let maxTier = CGFloat(CallBubbleSizeTier.allCases.count - 1)
        let raw = CGFloat(startingTier.rawValue) + (scale - 1) * magnificationSensitivity
        return min(max(raw, 0), maxTier)
    }

    /// Palier de destination au relâchement du pinch : arrondi de `progress`
    /// au palier le plus proche, biaisé d'un demi-palier dans le sens du
    /// geste si le relâchement est rapide (flick), même principe que
    /// `shouldCollapse` pour le drag de la pilule.
    static func nextTier(progress: CGFloat, velocity: CGFloat) -> CallBubbleSizeTier {
        let maxTier = CGFloat(CallBubbleSizeTier.allCases.count - 1)
        let clamped = min(max(progress, 0), maxTier)
        let velocityBias: CGFloat = abs(velocity) > tierVelocityThreshold ? (velocity > 0 ? 0.5 : -0.5) : 0
        let biased = min(max(clamped + velocityBias, 0), maxTier)
        let rawValue = Int(biased.rounded())
        return CallBubbleSizeTier(rawValue: rawValue) ?? .circle
    }
}
