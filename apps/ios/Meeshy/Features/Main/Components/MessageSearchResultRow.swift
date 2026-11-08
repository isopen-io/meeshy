import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Une rangée de résultat de recherche de MESSAGE

/// La rangée d'un message trouvé — conversation, auteur, extrait surligné. La
/// recherche globale et la section Messages de la liste la partagent (#14619).
/// Entrées primitives et `Equatable` : la frappe ne re-dessine que les rangées
/// dont le résultat ou la requête surlignée a changé.
///
/// Un extrait flouté se VOILE (#16957) : des barres sans aucun caractère, et
/// VoiceOver dit « Message flouté ». Une transcription (#16958) se précède de
/// l'icône de son média, sans aucun geste propre : la rangée n'a qu'un toucher,
/// celui qui ouvre la conversation.
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

                excerpt
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

    private var excerpt: some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xs) {
            if let icon = result.mediaIcon {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)
            }
            if result.isVeiled {
                veil
            } else {
                Text(Self.highlighted(result.content, query: highlightedQuery))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
            }
        }
    }

    private var veil: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "eye.slash")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textMuted)
            Text(Self.veiledLabel)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .redacted(reason: .placeholder)
                .blur(radius: Self.veilBlurRadius)
        }
        .accessibilityHidden(true)
    }

    private static let veilBlurRadius: CGFloat = 8

    static var veiledLabel: String {
        String(localized: "search.messages.veiled", defaultValue: "Message flouté")
    }

    static func mediaLabel(_ kind: APIMessageSearchHit.MediaKind) -> String {
        switch kind {
        case .audio: return String(localized: "search.messages.media.audio", defaultValue: "Message vocal")
        case .video: return String(localized: "search.messages.media.video", defaultValue: "Vidéo")
        case .image: return String(localized: "search.messages.media.image", defaultValue: "Image")
        case .document: return String(localized: "search.messages.media.document", defaultValue: "Document")
        }
    }

    /// Ce que VoiceOver lit de l'extrait : jamais un mot d'un message flouté.
    static func spokenExcerpt(_ result: GlobalSearchMessageResult) -> String {
        let text = result.isVeiled ? veiledLabel : result.content
        guard let kind = result.mediaKind else { return text }
        return "\(mediaLabel(kind)), \(text)"
    }

    static func accessibilityLabel(_ result: GlobalSearchMessageResult) -> String {
        let messageFrom = String(localized: "accessibility.message_from", defaultValue: "Message de")
        let inConversation = String(localized: "accessibility.in_conversation", defaultValue: "dans")
        return "\(messageFrom) \(result.senderName) \(inConversation) \(result.conversationName), \(spokenExcerpt(result)), \(RelativeTimeFormatter.shortString(for: result.createdAt))"
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
