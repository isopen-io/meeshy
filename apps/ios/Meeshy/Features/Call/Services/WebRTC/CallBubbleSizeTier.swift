import CoreGraphics
import Foundation
import MeeshySDK

/// Palier de taille du PiP quand la bulle est repliée (`.bubble` displayMode)
/// — cercle par défaut, agrandi par pincement jusqu'à `.large`. Ordre des
/// cas = ordre d'agrandissement, `rawValue` sert directement d'axe de
/// progression continue dans `CallBubbleGestureResolver`.
enum CallBubbleSizeTier: Int, Sendable, CaseIterable {
    case circle = 0
    case small = 1
    case medium = 2
    case large = 3
}
