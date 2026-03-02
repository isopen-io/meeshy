import SwiftUI
import MeeshySDK

// MARK: - Story Text Editor View

public struct StoryTextEditorView: View {
    @Binding public var textObject: StoryTextObject
    public let onDelete: (() -> Void)?

    @State private var isEditing = false
    @FocusState private var isFocused: Bool

    public init(textObject: Binding<StoryTextObject>, onDelete: (() -> Void)? = nil) {
        self._textObject = textObject
        self.onDelete = onDelete
    }

    // Derived bindings into textObject fields
    private var textBinding: Binding<String> {
        Binding(get: { textObject.content }, set: { textObject.content = $0 })
    }

    private var styleBinding: Binding<StoryTextStyle> {
        Binding(
            get: { textObject.parsedTextStyle },
            set: { textObject.textStyle = $0.rawValue }
        )
    }

    private var sizeBinding: Binding<CGFloat> {
        Binding(
            get: { textObject.resolvedSize },
            set: { textObject.textSize = $0 }
        )
    }

    private var colorHex: String { textObject.textColor ?? "FFFFFF" }

    private var alignment: TextAlignment {
        switch textObject.textAlign {
        case "left": return .leading
        case "right": return .trailing
        default: return .center
        }
    }

    private var bgEnabled: Bool { textObject.hasBg }

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
            if textObject.content.isEmpty {
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
        Text(textObject.content)
            .font(storyFont(for: textObject.parsedTextStyle, size: textObject.resolvedSize))
            .foregroundColor(Color(hex: colorHex))
            .multilineTextAlignment(alignment)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if bgEnabled {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.black.opacity(0.5))
                    }
                }
            )
            .shadow(color: textObject.parsedTextStyle == .neon ? Color(hex: colorHex).opacity(0.6) : .clear, radius: 10)
    }

    // MARK: - Text Input Area

    private var textInputArea: some View {
        VStack(spacing: 8) {
            TextField("Type something...", text: textBinding, axis: .vertical)
                .font(storyFont(for: textObject.parsedTextStyle, size: min(textObject.resolvedSize, 24)))
                .foregroundColor(Color(hex: colorHex))
                .multilineTextAlignment(alignment)
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

            HStack(spacing: 12) {
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

                if let onDelete {
                    Button {
                        onDelete()
                        HapticFeedback.medium()
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.red.opacity(0.8))
                            .padding(8)
                            .background(Circle().fill(Color.white.opacity(0.1)))
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Text Controls

    private var textControls: some View {
        VStack(spacing: 12) {
            FontStylePicker(selectedStyle: styleBinding)

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

            Slider(value: sizeBinding, in: 14...60) {
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
                switch textObject.textAlign {
                case "left": textObject.textAlign = "center"
                case "center": textObject.textAlign = "right"
                default: textObject.textAlign = "left"
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
        switch textObject.textAlign {
        case "left": return "text.alignleft"
        case "right": return "text.alignright"
        default: return "text.aligncenter"
        }
    }

    private var bgToggle: some View {
        Button {
            withAnimation(.spring(response: 0.2)) {
                textObject.textBg = textObject.hasBg ? nil : "000000"
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: bgEnabled ? "a.square.fill" : "a.square")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(bgEnabled ? Color(hex: "FF2E63") : .white.opacity(0.5))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(0.12)))
        }
    }

    private var colorRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(StoryTextColors.palette, id: \.self) { hex in
                    Button {
                        textObject.textColor = hex
                        HapticFeedback.light()
                    } label: {
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: 28, height: 28)
                            .overlay(
                                Circle()
                                    .stroke(Color.white, lineWidth: colorHex == hex ? 2.5 : 0)
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
