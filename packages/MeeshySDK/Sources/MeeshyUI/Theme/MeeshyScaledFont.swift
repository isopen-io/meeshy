import SwiftUI
import UIKit

public extension MeeshyFont {
    nonisolated static func uiTextStyle(_ style: Font.TextStyle) -> UIFont.TextStyle {
        switch style {
        case .largeTitle: return .largeTitle
        case .title: return .title1
        case .title2: return .title2
        case .title3: return .title3
        case .headline: return .headline
        case .subheadline: return .subheadline
        case .callout: return .callout
        case .footnote: return .footnote
        case .caption: return .caption1
        case .caption2: return .caption2
        default: return .body
        }
    }

    nonisolated static func contentSizeCategory(_ size: DynamicTypeSize) -> UIContentSizeCategory {
        switch size {
        case .xSmall: return .extraSmall
        case .small: return .small
        case .medium: return .medium
        case .large: return .large
        case .xLarge: return .extraLarge
        case .xxLarge: return .extraExtraLarge
        case .xxxLarge: return .extraExtraExtraLarge
        case .accessibility1: return .accessibilityMedium
        case .accessibility2: return .accessibilityLarge
        case .accessibility3: return .accessibilityExtraLarge
        case .accessibility4: return .accessibilityExtraExtraLarge
        case .accessibility5: return .accessibilityExtraExtraExtraLarge
        @unknown default: return .large
        }
    }

    nonisolated static func scaledPointSize(_ size: CGFloat, at dynamicTypeSize: DynamicTypeSize) -> CGFloat {
        let style = uiTextStyle(textStyle(for: size))
        let reference = UIFont.preferredFont(
            forTextStyle: style,
            compatibleWith: UITraitCollection(preferredContentSizeCategory: .large)).pointSize
        let current = UIFont.preferredFont(
            forTextStyle: style,
            compatibleWith: UITraitCollection(preferredContentSizeCategory: contentSizeCategory(dynamicTypeSize))).pointSize
        guard reference > 0 else { return size }
        return size * current / reference
    }
}

public struct MeeshyScaledFontModifier: ViewModifier {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let size: CGFloat
    let weight: Font.Weight
    let design: Font.Design

    public func body(content: Content) -> some View {
        content.font(.system(
            size: MeeshyFont.scaledPointSize(size, at: dynamicTypeSize),
            weight: weight,
            design: design))
    }
}

public extension View {
    func meeshyScaledFont(
        _ size: CGFloat,
        weight: Font.Weight = .regular,
        design: Font.Design = .default
    ) -> some View {
        modifier(MeeshyScaledFontModifier(size: size, weight: weight, design: design))
    }
}
