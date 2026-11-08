import SwiftUI
import MeeshySDK

struct ComposerTextItemRow: View {
    let text: StoryTextObject
    let viewModel: StoryComposerViewModel
    let primaryText: Color
    let secondaryText: Color
    let onEditText: ((String) -> Void)?
    let onShowInTimeline: (() -> Void)?
    let onDeleteText: ((String) -> Void)?

    @Environment(\.colorScheme) private var colorScheme

    @ViewBuilder
    var body: some View {
        let actionTint: Color = secondaryText
        let rowBgFill: Color = colorScheme == .dark
            ? Color.white.opacity(0.07)
            : MeeshyColors.indigo950.opacity(0.05)
        let preview: String = {
            let trimmed = text.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                return String(
                    localized: "story.composer.text.empty",
                    defaultValue: "Texte vide",
                    bundle: .module
                )
            }
            return trimmed
        }()
        let textHex = text.textColor ?? "FFFFFF"
        HStack(spacing: MeeshySpacing.sm) {
            // Pastille couleur — rappelle la couleur courante du texte.
            ZStack {
                RoundedRectangle(cornerRadius: 5)
                    .fill(Color(hex: textHex))
                Text("Aa")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: textHex).readableInk)
            }
            .frame(width: 32, height: 32)
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(Color.white.opacity(0.25), lineWidth: MeeshyBorder.hairline)
            )

            // Aperçu + style
            VStack(alignment: .leading, spacing: 1) {
                Text(preview)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(primaryText)
                    .lineLimit(1)
                Text((text.textStyle ?? "classic").capitalized)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(secondaryText)
            }

            Spacer(minLength: 4)

            HStack(spacing: MeeshySpacing.xsPlus) {
                textActionBtn(icon: "pencil", color: actionTint, tip: "Éditer") {
                    onEditText?(text.id)
                }
                textActionBtn(icon: "timeline.selection", color: actionTint, tip: "Timeline") {
                    viewModel.selectedElementId = text.id
                    onShowInTimeline?()
                }
                textActionBtn(icon: "doc.on.doc", color: actionTint, tip: "Dupliquer") {
                    viewModel.duplicateElement(id: text.id)
                }
                textActionBtn(icon: "trash", color: .red.opacity(0.8), tip: "Supprimer") {
                    HapticFeedback.medium()
                    if let onDeleteText {
                        onDeleteText(text.id)
                    } else {
                        viewModel.deleteElement(id: text.id)
                    }
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                .fill(rowBgFill)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onEditText?(text.id)
            HapticFeedback.light()
        }
    }

    private func textActionBtn(
        icon: String, color: Color, tip: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(color)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tip)
    }
}
