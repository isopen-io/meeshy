import SwiftUI
import MeeshySDK

// MARK: - Font Style Picker

public struct FontStylePicker: View {
    @Binding public var selectedStyle: StoryTextStyle

    @ObservedObject private var theme = ThemeManager.shared

    public init(selectedStyle: Binding<StoryTextStyle>) {
        self._selectedStyle = selectedStyle
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    fontStyleButton(style)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func fontStyleButton(_ style: StoryTextStyle) -> some View {
        let isSelected = selectedStyle == style
        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                selectedStyle = style
            }
            HapticFeedback.light()
        } label: {
            Text("Aa")
                .font(fontForStyle(style, size: 16))
                .foregroundColor(isSelected ? .white : .white.opacity(0.6))
                .frame(width: 50, height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSelected ? Color(hex: "FF2E63") : Color.white.opacity(0.12))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(isSelected ? Color(hex: "FF2E63").opacity(0.5) : Color.clear, lineWidth: 1.5)
                )
        }
        .accessibilityLabel(style.displayName)
    }

    private func fontForStyle(_ style: StoryTextStyle, size: CGFloat) -> Font {
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
}

// MARK: - Font Resolution Helper

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
