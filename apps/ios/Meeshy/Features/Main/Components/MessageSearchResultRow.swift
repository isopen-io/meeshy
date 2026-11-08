import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Une rangée de résultat de recherche de MESSAGE

/// La rangée d'un message trouvé — conversation, auteur, extrait surligné. La
/// recherche globale et la section Messages de la liste la partagent (#14619).
/// Entrées primitives et `Equatable` : la frappe ne re-dessine que les rangées
/// dont le résultat ou la requête surlignée a changé.
struct MessageSearchResultRow: View, Equatable {
    let result: GlobalSearchMessageResult
    let highlightedQuery: String
    let isDark: Bool

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: result.conversationName,
                context: .conversationList,
                kind: .entity,
                avatarURL: result.conversationAvatar
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                HStack {
                    Text(result.conversationName)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text(RelativeTimeFormatter.shortString(for: result.createdAt))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(theme.textMuted)
                }

                Text(result.senderName)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo300)
                    .lineLimit(1)

                Text(Self.highlighted(result.content, query: highlightedQuery))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(theme.inputBorder, lineWidth: MeeshyBorder.hairline)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Self.accessibilityLabel(result))
        .accessibilityHint(String(localized: "accessibility.opens_conversation", defaultValue: "Ouvre la conversation"))
        .accessibilityAddTraits(.isButton)
    }

    static func accessibilityLabel(_ result: GlobalSearchMessageResult) -> String {
        let messageFrom = String(localized: "accessibility.message_from", defaultValue: "Message de")
        let inConversation = String(localized: "accessibility.in_conversation", defaultValue: "dans")
        return "\(messageFrom) \(result.senderName) \(inConversation) \(result.conversationName), \(result.content), \(RelativeTimeFormatter.shortString(for: result.createdAt))"
    }

    static func highlighted(_ text: String, query: String) -> AttributedString {
        var attributed = AttributedString(text)
        if let range = attributed.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) {
            attributed[range].foregroundColor = MeeshyColors.error
            attributed[range].font = MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold)
        }
        return attributed
    }
}
