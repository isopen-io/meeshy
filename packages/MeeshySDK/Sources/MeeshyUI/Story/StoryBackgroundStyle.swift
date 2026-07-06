import SwiftUI
import MeeshySDK

// MARK: - Style SwiftUI du fond coloré (C11)
//
// Rendu SwiftUI UNIQUE de `StoryEffects.background` (hex OU
// "gradient:HEX1:HEX2") — partagé par SlideMiniPreview, le letterbox du
// composer et tout futur consommateur. Direction top-leading →
// bottom-trailing, parité avec le canvas CALayer
// (`StoryBackgroundLayer.GradientDirection.topLeftToBottomRight`).

public func storyBackgroundStyle(_ raw: String?, fallbackHex: String = "1A1A2E") -> AnyShapeStyle {
    guard let raw else { return AnyShapeStyle(Color(hex: fallbackHex)) }
    switch StoryBackgroundValue.parse(raw) {
    case .hex(let h):
        return AnyShapeStyle(Color(hex: h))
    case .gradient(let a, let b):
        return AnyShapeStyle(LinearGradient(
            colors: [Color(hex: a), Color(hex: b)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        ))
    }
}
