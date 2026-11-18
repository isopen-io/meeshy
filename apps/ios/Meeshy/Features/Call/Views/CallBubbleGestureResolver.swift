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
    /// Marge entre le bord de la bulle et le bord d'écran quand ancrée (même
    /// convention que `minEdgePadding` du FAB principal, `FloatingButtons.swift:68`).
    static let bubbleEdgeMargin: CGFloat = 20
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

    /// Clampe une position Y candidate (pt, relative au haut de la zone sûre)
    /// dans les bornes valides pour le centre de la bulle : jamais dans la
    /// zone du FAB principal en bas, jamais hors zone sûre en haut.
    static func clampedVerticalPosition(_ y: CGFloat, availableHeight: CGFloat, bubbleRadius: CGFloat) -> CGFloat {
        let minY = bubbleRadius
        let maxY = max(availableHeight - fabExclusionZoneHeight - bubbleRadius, minY)
        return min(max(y, minY), maxY)
    }

    /// Rayon de coin (pt) de la vignette, le même aux trois paliers (#19701 : plus de cercle).
    static let rectangleCornerRadius: CGFloat = 20
    /// Sensibilité du mapping pinch → progression : un delta d'échelle de 0.25
    /// (25% de zoom) parcourt un palier plein. Valeur de confort, ajustable au
    /// ressenti.
    static let magnificationSensitivity: CGFloat = 4
    /// Vitesse de progression (paliers/s) au-delà de laquelle un relâchement
    /// biaise le snap d'un demi-palier dans le sens du geste — même principe
    /// que `collapseVelocityThreshold` pour le drag de la pilule.
    static let tierVelocityThreshold: CGFloat = 1.5

    /// Taille (pt) du palier donné : un ratio 9:16, aligné sur `preferredContentSize`
    /// du PiP système (`PiPCallController.swift`).
    static func size(for tier: CallBubbleSizeTier) -> CGSize {
        switch tier {
        case .small: return CGSize(width: 90, height: 160)
        case .medium: return CGSize(width: 120, height: 213)
        case .large: return CGSize(width: 160, height: 284)
        }
    }

    /// Taille interpolée linéairement pour une progression continue
    /// `0...2` (`.small...large`), clampée aux bornes. Alimente le morphing
    /// en direct pendant le pinch — `progress` fractionnaire retombe toujours
    /// entre deux paliers adjacents.
    static func interpolatedSize(progress: CGFloat) -> CGSize {
        let maxTier = CallBubbleSizeTier.allCases.count - 1
        let clamped = min(max(progress, 0), CGFloat(maxTier))
        let lowerRaw = Int(clamped.rounded(.down))
        let upperRaw = min(lowerRaw + 1, maxTier)
        let lowerTier = CallBubbleSizeTier(rawValue: lowerRaw) ?? .small
        let upperTier = CallBubbleSizeTier(rawValue: upperRaw) ?? .large
        let fraction = clamped - CGFloat(lowerRaw)
        let lowerSize = size(for: lowerTier)
        let upperSize = size(for: upperTier)
        return CGSize(
            width: lowerSize.width + (upperSize.width - lowerSize.width) * fraction,
            height: lowerSize.height + (upperSize.height - lowerSize.height) * fraction
        )
    }

    /// Progression continue (0...2) correspondant à l'échelle cumulée d'un
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
        return CallBubbleSizeTier(rawValue: rawValue) ?? .small
    }

    // MARK: - #19701 — le glissé avec élan

    /// Le plus long chemin que l'élan ajoute au geste (pt) : un jet vif fait glisser la
    /// vignette sans qu'elle traverse l'écran.
    static let maxGlide: CGFloat = 320

    /// Au lâcher, la vignette poursuit sa course : on vise la position que l'élan du geste
    /// projette (`predictedEndTranslation` de SwiftUI), le surplus d'élan borné à `maxGlide`
    /// sur chaque axe. Le bord le plus proche et la borne verticale s'appliquent ensuite.
    static func glidedTranslation(translation: CGSize, predicted: CGSize) -> CGSize {
        func glide(_ moved: CGFloat, _ projected: CGFloat) -> CGFloat {
            moved + min(max(projected - moved, -maxGlide), maxGlide)
        }
        return CGSize(width: glide(translation.width, predicted.width), height: glide(translation.height, predicted.height))
    }

    /// Le ressort qui pose la vignette à sa place : assez long pour qu'on voie la glisse,
    /// amorti pour ne pas rebondir.
    static let glideResponse: Double = 0.5
    static let glideDamping: Double = 0.82
}
