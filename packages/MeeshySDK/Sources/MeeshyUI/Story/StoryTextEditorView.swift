import SwiftUI
import MeeshySDK

// MARK: - Story Text Editor View

public struct StoryTextEditorView: View {
    @Binding public var text: String
    @Binding public var textStyle: StoryTextStyle
    @Binding public var textColor: Color
    @Binding public var textSize: CGFloat
    @Binding public var textBgEnabled: Bool
    @Binding public var textAlignment: TextAlignment

    @State private var isEditing = false
    @FocusState private var isFocused: Bool

    public init(text: Binding<String>, textStyle: Binding<StoryTextStyle>,
                textColor: Binding<Color>, textSize: Binding<CGFloat>,
                textBgEnabled: Binding<Bool>, textAlignment: Binding<TextAlignment>) {
        self._text = text; self._textStyle = textStyle
        self._textColor = textColor; self._textSize = textSize
        self._textBgEnabled = textBgEnabled; self._textAlignment = textAlignment
    }

    public var body: some View {
        VStack(spacing: 16) {
            if isEditing {
                textInputArea
                textControls
            } else {
                textPreview
            }
        }
    }

    // MARK: - Text Preview (tap to edit)

    private var textPreview: some View {
        Group {
            if text.isEmpty {
                Button {
                    isEditing = true
                    isFocused = true
                    HapticFeedback.light()
                } label: {
                    VStack(spacing: 8) {
                        Image(systemName: "textformat")
                            .font(.system(size: 28, weight: .light))
                        Text("Add text")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.white.opacity(0.5))
                    .frame(maxWidth: .infinity, minHeight: 60)
                }
            } else {
                styledText
                    .onTapGesture {
                        isEditing = true
                        isFocused = true
                    }
            }
        }
    }

    // MARK: - Styled Text Display

    private var styledText: some View {
        Text(text)
            .font(storyFont(for: textStyle, size: textSize))
            .foregroundColor(textColor)
            .multilineTextAlignment(textAlignment)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if textBgEnabled {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.black.opacity(0.5))
                    }
                }
            )
            .shadow(color: textStyle == .neon ? textColor.opacity(0.6) : .clear, radius: 10)
    }

    // MARK: - Text Input Area

    private var textInputArea: some View {
        VStack(spacing: 8) {
            TextField("Type something...", text: $text, axis: .vertical)
                .font(storyFont(for: textStyle, size: min(textSize, 24)))
                .foregroundColor(textColor)
                .multilineTextAlignment(textAlignment)
                .focused($isFocused)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.white.opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.white.opacity(0.2), lineWidth: 1)
                        )
                )
                .lineLimit(1...6)

            Button {
                isEditing = false
                isFocused = false
                HapticFeedback.light()
            } label: {
                Text("Done")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(Color(hex: "FF2E63"))
                    )
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Text Controls

    private var textControls: some View {
        VStack(spacing: 12) {
            FontStylePicker(selectedStyle: $textStyle)

            HStack(spacing: 16) {
                sizeSlider
                alignmentToggle
                bgToggle
            }
            .padding(.horizontal, 16)

            colorRow
        }
    }

    private var sizeSlider: some View {
        HStack(spacing: 6) {
            Image(systemName: "textformat.size.smaller")
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.5))

            Slider(value: $textSize, in: 14...60) {
                Text("Text size")
            }
            .tint(Color(hex: "FF2E63"))

            Image(systemName: "textformat.size.larger")
                .font(.system(size: 16))
                .foregroundColor(.white.opacity(0.5))
        }
        .frame(maxWidth: .infinity)
    }

    private var alignmentToggle: some View {
        Button {
            withAnimation(.spring(response: 0.2)) {
                switch textAlignment {
                case .leading: textAlignment = .center
                case .center: textAlignment = .trailing
                default: textAlignment = .leading
                }
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: alignmentIcon)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white.opacity(0.7))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(0.12)))
        }
    }

    private var alignmentIcon: String {
        switch textAlignment {
        case .leading: return "text.alignleft"
        case .center: return "text.aligncenter"
        case .trailing: return "text.alignright"
        }
    }

    private var bgToggle: some View {
        Button {
            withAnimation(.spring(response: 0.2)) { textBgEnabled.toggle() }
            HapticFeedback.light()
        } label: {
            Image(systemName: textBgEnabled ? "a.square.fill" : "a.square")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(textBgEnabled ? Color(hex: "FF2E63") : .white.opacity(0.5))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(0.12)))
        }
    }

    private var colorRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(StoryTextColors.palette, id: \.self) { hex in
                    Button {
                        textColor = Color(hex: hex)
                        HapticFeedback.light()
                    } label: {
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: 28, height: 28)
                            .overlay(
                                Circle()
                                    .stroke(Color.white, lineWidth: textColor == Color(hex: hex) ? 2.5 : 0)
                                    .padding(1)
                            )
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Story Text Colors

public enum StoryTextColors {
    public static let palette: [String] = [
        "FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500",
        "9B59B6", "2ECC71", "FF6B6B", "3498DB", "E91E63",
        "FF7F50", "00CED1", "A855F7", "F59E0B"
    ]
}
