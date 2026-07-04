import SwiftUI
import MeeshySDK

// MARK: - Font Resolution Helper (SwiftUI)
//
// Extrait de l'ancien `FontStylePicker.swift` (vue morte purgée it.85/C10 —
// les styles de police passent par `TextEditToolOptions` depuis la refonte
// des bulles). Pendant CALayer/UIKit, voir `StoryTextFontResolver` (UIFont).

public func storyFont(for style: StoryTextStyle, size: CGFloat) -> Font {
    switch style {
    case .bold:
        return .system(size: size, weight: .black)
    case .neon:
        return .system(size: size, weight: .semibold, design: .rounded)
    case .typewriter:
        return .system(size: size, weight: .regular, design: .monospaced)
    case .handwriting:
        if let name = style.fontName {
            return .custom(name, size: size)
        }
        return .system(size: size, weight: .regular, design: .serif)
    case .classic:
        return .system(size: size, weight: .medium, design: .serif)
    }
}
