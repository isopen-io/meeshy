import SwiftUI
import MeeshySDK

// MARK: - Story Text Editor View

/// Hierarchical text editor panel with collapsible sections.
/// Shows text input + quick actions by default, expandable sections for styling.
public struct StoryTextEditorView: View {
    @Binding public var textObject: StoryTextObject
    public let onDelete: (() -> Void)?

    @FocusState private var isFocused: Bool
    @State private var expandedSection: TextEditorSection?

    public init(textObject: Binding<StoryTextObject>, onDelete: (() -> Void)? = nil) {
        self._textObject = textObject
        self.onDelete = onDelete
    }

    public var body: some View {
        VStack(spacing: 0) {
            textInputRow
            quickActions
            sectionPicker
            expandedSectionContent
        }
    }

    // MARK: - Text Input

    private var textInputRow: some View {
        HStack(spacing: 8) {
            TextField("Saisissez votre texte...", text: contentBinding, axis: .vertical)
                .font(storyFont(for: textObject.parsedTextStyle, size: min(textObject.resolvedSize, 20)))
                .foregroundColor(Color(hex: textObject.textColor ?? "FFFFFF"))
                .multilineTextAlignment(resolvedAlignment)
                .focused($isFocused)
                .lineLimit(1...4)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(MeeshyColors.indigo400.opacity(isFocused ? 0.6 : 0.2), lineWidth: 1)
                        )
                )

            if let onDelete {
                Button {
                    onDelete()
                    HapticFeedback.medium()
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(Color.white.opacity(0.08)))
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 6)
    }

    // MARK: - Quick Actions (always visible)

    private var quickActions: some View {
        HStack(spacing: 10) {
            // Font style cycle
            Button {
                cycleStyle()
                HapticFeedback.light()
            } label: {
                Text("Aa")
                    .font(storyFont(for: textObject.parsedTextStyle, size: 14))
                    .foregroundColor(.white)
                    .frame(width: 34, height: 30)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.12)))
            }

            // Alignment cycle
            Button {
                cycleAlignment()
                HapticFeedback.light()
            } label: {
                Image(systemName: alignmentIcon)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 34, height: 30)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.12)))
            }

            // Background toggle
            Button {
                textObject.textBg = textObject.hasBg ? nil : "000000"
                HapticFeedback.light()
            } label: {
                Image(systemName: textObject.hasBg ? "a.square.fill" : "a.square")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(textObject.hasBg ? MeeshyColors.brandPrimary : .white.opacity(0.5))
                    .frame(width: 34, height: 30)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.12)))
            }

            Spacer()

            // Current color dot (tap to expand color section)
            Button {
                toggleSection(.color)
            } label: {
                Circle()
                    .fill(Color(hex: textObject.textColor ?? "FFFFFF"))
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(Color.white.opacity(0.4), lineWidth: 1.5))
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 6)
    }

    // MARK: - Section Picker

    private var sectionPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                sectionTab(.style, label: "Style", icon: "textformat")
                sectionTab(.color, label: "Couleur", icon: "paintpalette")
                sectionTab(.size, label: "Taille", icon: "textformat.size")
                sectionTab(.timing, label: "Timing", icon: "clock")
            }
            .padding(.horizontal, 14)
        }
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private func sectionTab(_ section: TextEditorSection, label: String, icon: String) -> some View {
        let isActive = expandedSection == section
        Button {
            toggleSection(section)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(isActive ? .white : .white.opacity(0.5))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule().fill(isActive ? MeeshyColors.brandPrimary.opacity(0.8) : Color.white.opacity(0.08))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Expanded Section Content

    @ViewBuilder
    private var expandedSectionContent: some View {
        if let section = expandedSection {
            Group {
                switch section {
                case .style: styleSection
                case .color: colorSection
                case .size: sizeSection
                case .timing: timingSection
                }
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .padding(.top, 4)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Style Section

    private var styleSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    let isSelected = textObject.parsedTextStyle == style
                    Button {
                        textObject.textStyle = style.rawValue
                        HapticFeedback.light()
                    } label: {
                        VStack(spacing: 4) {
                            Text("Aa")
                                .font(storyFont(for: style, size: 18))
                                .foregroundColor(isSelected ? .white : .white.opacity(0.6))
                                .frame(width: 52, height: 40)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(isSelected ? MeeshyColors.brandPrimary : Color.white.opacity(0.1))
                                )
                            Text(style.displayName)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(isSelected ? .white : .white.opacity(0.4))
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
        }
    }

    // MARK: - Color Section

    private var colorSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(StoryTextColors.palette, id: \.self) { hex in
                    let isSelected = (textObject.textColor ?? "FFFFFF") == hex
                    Button {
                        textObject.textColor = hex
                        HapticFeedback.light()
                    } label: {
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: 30, height: 30)
                            .overlay(
                                Circle().stroke(Color.white, lineWidth: isSelected ? 2.5 : 0).padding(1)
                            )
                            .scaleEffect(isSelected ? 1.15 : 1.0)
                            .animation(.spring(response: 0.2), value: isSelected)
                    }
                }
            }
            .padding(.horizontal, 14)
        }
    }

    // MARK: - Size Section

    private var sizeSection: some View {
        HStack(spacing: 8) {
            Image(systemName: "textformat.size.smaller")
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.4))

            Slider(value: sizeBinding, in: 14...60, step: 1)
                .tint(MeeshyColors.brandPrimary)

            Image(systemName: "textformat.size.larger")
                .font(.system(size: 15))
                .foregroundColor(.white.opacity(0.4))

            Text("\(Int(textObject.resolvedSize))")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundColor(.white.opacity(0.5))
                .frame(width: 28)
        }
        .padding(.horizontal, 14)
    }

    // MARK: - Timing Section

    private var timingSection: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                timingField(label: "Debut", value: startTimeBinding, range: 0...30, unit: "s")
                timingField(label: "Duree", value: durationBinding, range: 0...30, unit: "s")
            }
            HStack(spacing: 12) {
                timingField(label: "Fondu in", value: fadeInBinding, range: 0...5, unit: "s")
                timingField(label: "Fondu out", value: fadeOutBinding, range: 0...5, unit: "s")
            }
        }
        .padding(.horizontal, 14)
    }

    @ViewBuilder
    private func timingField(label: String, value: Binding<Float>, range: ClosedRange<Float>, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white.opacity(0.4))
            HStack(spacing: 4) {
                Slider(value: value, in: range, step: 0.5)
                    .tint(MeeshyColors.indigo400)
                Text("\(String(format: "%.1f", value.wrappedValue))\(unit)")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.white.opacity(0.5))
                    .frame(width: 32)
            }
        }
    }

    // MARK: - Bindings

    private var contentBinding: Binding<String> {
        Binding(get: { textObject.content }, set: { textObject.content = $0 })
    }

    private var sizeBinding: Binding<CGFloat> {
        Binding(get: { textObject.resolvedSize }, set: { textObject.textSize = $0 })
    }

    private var startTimeBinding: Binding<Float> {
        Binding(get: { textObject.startTime ?? 0 }, set: { textObject.startTime = $0 > 0 ? $0 : nil })
    }

    private var durationBinding: Binding<Float> {
        Binding(get: { textObject.displayDuration ?? 0 }, set: { textObject.displayDuration = $0 > 0 ? $0 : nil })
    }

    private var fadeInBinding: Binding<Float> {
        Binding(get: { textObject.fadeIn ?? 0 }, set: { textObject.fadeIn = $0 > 0 ? $0 : nil })
    }

    private var fadeOutBinding: Binding<Float> {
        Binding(get: { textObject.fadeOut ?? 0 }, set: { textObject.fadeOut = $0 > 0 ? $0 : nil })
    }

    // MARK: - Helpers

    private var resolvedAlignment: TextAlignment {
        switch textObject.textAlign {
        case "left": return .leading
        case "right": return .trailing
        default: return .center
        }
    }

    private var alignmentIcon: String {
        switch textObject.textAlign {
        case "left": return "text.alignleft"
        case "right": return "text.alignright"
        default: return "text.aligncenter"
        }
    }

    private func cycleStyle() {
        let all = StoryTextStyle.allCases
        let current = textObject.parsedTextStyle
        let idx = all.firstIndex(of: current) ?? 0
        let next = all[(idx + 1) % all.count]
        textObject.textStyle = next.rawValue
    }

    private func cycleAlignment() {
        switch textObject.textAlign {
        case "left": textObject.textAlign = "center"
        case "center": textObject.textAlign = "right"
        default: textObject.textAlign = "left"
        }
    }

    private func toggleSection(_ section: TextEditorSection) {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) {
            expandedSection = expandedSection == section ? nil : section
        }
    }
}

// MARK: - Section Enum

private enum TextEditorSection {
    case style, color, size, timing
}

// MARK: - Story Text Colors

public enum StoryTextColors {
    public static let palette: [String] = [
        "FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500",
        "9B59B6", "2ECC71", "FF6B6B", "3498DB", "E91E63",
        "FF7F50", "00CED1", "A855F7", "F59E0B"
    ]
}
