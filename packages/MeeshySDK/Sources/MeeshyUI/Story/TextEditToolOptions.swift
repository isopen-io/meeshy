import SwiftUI
import MeeshySDK

/// Panneau d'options préréglées affiché sous le texte quand une bulle d'outil
/// est dépliée. Chaque option écrit directement dans le `StoryTextObject` via
/// le binding — le canvas et le champ d'édition se mettent à jour live.
/// V1 : presets uniquement (pas de picker système ni de slider continu libre).
struct TextEditToolOptions: View {
    let tool: TextEditTool
    @Binding var textObject: StoryTextObject

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            switch tool {
            case .style:      styleOptions
            case .color:      colorOptions
            case .size:       sizeOptions
            case .align:      alignOptions
            case .background: backgroundOptions
            case .border:     borderOptions
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(MeeshyColors.indigo400.opacity(0.25), lineWidth: 0.5)
        )
    }

    // MARK: - Style

    private var styleOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    let isSel = textObject.parsedTextStyle == style
                    Button {
                        textObject.textStyle = style.rawValue
                        HapticFeedback.light()
                    } label: {
                        Text("Aa")
                            .font(storyFont(for: style, size: 18))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .frame(width: 54, height: 42)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                                : AnyShapeStyle(Color.gray.opacity(0.18)))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Color

    private var colorOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextColors.palette, id: \.self) { hex in
                    let isSel = (textObject.textColor ?? "FFFFFF") == hex
                    Button {
                        textObject.textColor = hex
                        HapticFeedback.light()
                    } label: {
                        colorDot(hex: hex, selected: isSel, size: 32)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Size

    private var sizeOptions: some View {
        HStack(spacing: 10) {
            Image(systemName: "textformat.size.smaller")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(value: $textObject.fontSize, in: 14...160, step: 1)
                .tint(MeeshyColors.brandPrimary)
            Image(systemName: "textformat.size.larger")
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
            Text("\(Int(textObject.fontSize))")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 34)
        }
    }

    // MARK: - Align

    private var alignOptions: some View {
        HStack(spacing: 10) {
            alignButton("left", "text.alignleft")
            alignButton("center", "text.aligncenter")
            alignButton("right", "text.alignright")
        }
    }

    private func alignButton(_ value: String, _ symbol: String) -> some View {
        let isSel = (textObject.textAlign ?? "center") == value
        return Button {
            textObject.textAlign = value
            HapticFeedback.light()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(isSel ? Color.white : Color.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                    : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Background

    private var backgroundOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                bgChip(label: "Aucun", isSel: isBgNone) {
                    textObject.backgroundStyle = StoryTextBackgroundStyle.none
                    textObject.textBg = nil
                }
                bgChip(label: "Verre", isSel: isBgGlass) {
                    textObject.backgroundStyle = .glass(radius: 24)
                    textObject.textBg = nil
                }
                bgSolidChip(hex: "000000", label: "Noir")
                bgSolidChip(hex: "000000A6", label: "Noir 65%")
                bgSolidChip(hex: "FFFFFF", label: "Blanc")
                bgSolidChip(hex: "FFFFFFA6", label: "Blanc 65%")
            }
        }
    }

    private var isBgNone: Bool {
        if case .none = textObject.resolvedBackgroundStyle { return true }
        return false
    }
    private var isBgGlass: Bool {
        if case .glass = textObject.resolvedBackgroundStyle { return true }
        return false
    }
    private func isBgSolid(_ hex: String) -> Bool {
        if case .solid(let h) = textObject.resolvedBackgroundStyle {
            return h.caseInsensitiveCompare(hex) == .orderedSame
        }
        return false
    }

    private func bgChip(label: String, isSel: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isSel ? Color.white : Color.primary)
                .padding(.horizontal, 14)
                .frame(height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                    : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
    }

    private func bgSolidChip(hex: String, label: String) -> some View {
        let isSel = isBgSolid(hex)
        return Button {
            textObject.backgroundStyle = .solid(hex: hex)
            textObject.textBg = nil
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: hex))
                    .frame(width: 16, height: 16)
                    .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 0.5))
                Text(label).font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(isSel ? Color.white : Color.primary)
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                : AnyShapeStyle(Color.gray.opacity(0.18)))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Border

    private var borderOptions: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                borderWidthChip(label: "Aucun", width: nil)
                borderWidthChip(label: "Fin", width: 2)
                borderWidthChip(label: "Moyen", width: 4)
                borderWidthChip(label: "Épais", width: 8)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(StoryTextColors.palette, id: \.self) { hex in
                        let isSel = textObject.borderColor?.caseInsensitiveCompare(hex) == .orderedSame
                        Button {
                            textObject.borderColor = hex
                            if textObject.borderWidth == nil { textObject.borderWidth = 4 }
                            HapticFeedback.light()
                        } label: {
                            colorDot(hex: hex, selected: isSel, size: 28)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .opacity(textObject.borderColor == nil ? 0.4 : 1)
            .disabled(textObject.borderColor == nil)
        }
    }

    private func borderWidthChip(label: String, width: Double?) -> some View {
        let isSel: Bool = {
            if let width { return textObject.borderColor != nil && textObject.borderWidth == width }
            return textObject.borderColor == nil
        }()
        return Button {
            if let width {
                textObject.borderWidth = width
                if textObject.borderColor == nil { textObject.borderColor = "FFFFFF" }
            } else {
                textObject.borderColor = nil
                textObject.borderWidth = nil
            }
            HapticFeedback.light()
        } label: {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isSel ? Color.white : Color.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                    : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Shared

    private func colorDot(hex: String, selected: Bool, size: CGFloat) -> some View {
        Circle()
            .fill(Color(hex: hex))
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color.white, lineWidth: selected ? 3 : 0).padding(1))
            .overlay(Circle().stroke(Color.black.opacity(0.15), lineWidth: 0.5))
            .scaleEffect(selected ? 1.1 : 1.0)
            .animation(.spring(response: 0.2), value: selected)
    }
}
