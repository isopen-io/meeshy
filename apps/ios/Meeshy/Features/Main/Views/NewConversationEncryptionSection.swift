import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le choix du mode de chiffrement sur l'écran de création (directive porteur) :
/// une rangée par mode offert, son libellé et ce qu'il fait ;
/// le bout en bout « bientôt » d'un groupe se montre sans se choisir. Vue
/// feuille : elle reçoit l'offre, le mode retenu et l'action, rien d'autre.
struct NewConversationEncryptionSection: View {
    let offer: ConversationCreationEncryption.Offer
    let selectedMode: ConversationCreationEncryption.Mode
    let accentColor: String
    let onSelect: (ConversationCreationEncryption.Mode) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(String(localized: "conversation.encryption.create.header", defaultValue: "Chiffrement", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundStyle(theme.textMuted)
                .textCase(.uppercase)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .accessibilityAddTraits(.isHeader)

            ForEach(offer.choices, id: \.mode) { choice in
                row(choice)
            }

            Text(String(localized: "conversation.encryption.create.footer",
                        defaultValue: "Le chiffrement de bout en bout ne se désactive jamais. Vous pourrez toujours ouvrir une autre conversation, sans chiffrement de bout en bout, avec les mêmes personnes.",
                        bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, MeeshySpacing.mdPlus)
        }
        .padding(.bottom, MeeshySpacing.sm)
        .accessibilityIdentifier("new-conversation-encryption")
    }

    private func row(_ choice: ConversationCreationEncryption.Choice) -> some View {
        let isSelected = choice.available && choice.mode == selectedMode
        let reason = choice.available ? nil : choice.unavailability?.reason

        return Button {
            HapticFeedback.light()
            onSelect(choice.mode)
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(choice.mode.label)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(choice.mode.summary)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    if let reason {
                        Text(reason)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundStyle(MeeshyColors.indigo400)
                    }
                }

                Spacer(minLength: MeeshySpacing.sm)

                // L'état « retenu » est porté par le trait `.isSelected` : le glyphe est décoratif.
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(MeeshyFont.relative(MeeshyIconSize.xl))
                    .foregroundStyle(isSelected ? Color(hex: accentColor) : theme.textMuted.opacity(0.4))
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(isSelected ? Color(hex: accentColor).opacity(0.08) : theme.textPrimary.opacity(MeeshyOpacity.faint))
            )
            .opacity(choice.available ? 1 : 0.5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!choice.available)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("new-conversation-encryption-\(choice.mode.rawValue)")
    }
}
