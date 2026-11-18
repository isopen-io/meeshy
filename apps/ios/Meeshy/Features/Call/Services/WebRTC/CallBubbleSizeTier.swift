import CoreGraphics
import Foundation
import MeeshySDK

/// Palier de taille de la vignette quand l'appel est réduit (`.bubble` displayMode).
/// #19701 — UNE seule forme, la vignette rectangulaire, en audio comme en vidéo :
/// `.small` par défaut, agrandie par pincement jusqu'à `.large`. Ordre des cas =
/// ordre d'agrandissement, `rawValue` sert directement d'axe de progression
/// continue dans `CallBubbleGestureResolver`.
enum CallBubbleSizeTier: Int, Sendable, CaseIterable {
    case small = 0
    case medium = 1
    case large = 2
}
