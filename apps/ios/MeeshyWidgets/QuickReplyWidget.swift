import WidgetKit
import SwiftUI
import AppIntents

// ============================================================================
// MARK: - 3. Quick Reply Widget
// ============================================================================

struct QuickReplyWidget: Widget {
    let kind: String = "QuickReply"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ConversationProvider()) { entry in
            QuickReplyWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.quickReply.title", defaultValue: "Quick Reply"))
        .description(String(localized: "widget.quickReply.description", defaultValue: "Quickly reply to recent messages"))
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct QuickReplyWidgetView: View {
    let entry: ConversationEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(String(localized: "widget.quickReply", defaultValue: "Quick Reply"), systemImage: "text.bubble.fill")
                    .font(.headline)
                    .foregroundStyle(WidgetColors.brandPrimary)
                Spacer()
            }

            if let conversation = entry.conversations.first(where: { $0.isUnread }) ?? entry.conversations.first {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        InitialsAvatar(name: conversation.contactName, accentColor: conversation.accentColor, size: 24)
                        Text(conversation.contactName)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }

                    Text(conversation.lastMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .padding(.vertical, 4)

                    HStack(spacing: 8) {
                        QuickReplyButton(label: "\u{1F44D}", conversationId: conversation.id)
                        QuickReplyButton(
                            label: String(localized: "widget.quickReply.ok", defaultValue: "OK"),
                            conversationId: conversation.id
                        )
                        QuickReplyButton(
                            label: String(localized: "widget.quickReply.thanks", defaultValue: "Thanks!"),
                            conversationId: conversation.id
                        )
                        QuickReplyButton(
                            label: String(localized: "widget.quickReply.callMe", defaultValue: "Call me"),
                            conversationId: conversation.id
                        )
                    }
                }
            } else {
                WidgetEmptyState()
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

/// Deux chaînes, pas une — elles n'obéissent pas à la même autorité.
///
/// `label` est du CHROME d'interface : il suit la locale de l'appareil, comme
/// tout le reste du widget. `draft` est du CONTENU : c'est le texte déposé
/// dans le composeur, donc un message que l'utilisateur va signer, et il
/// relève de la langue configurée du COMPTE (Prisme Linguistique).
///
/// Les deux peuvent diverger — un compte francophone sur un iPhone anglais
/// doit lire « Merci ! » sur un bouton intitulé « Thanks! ». La cible widget
/// ne connaît pas la langue du compte ; en attendant que `WidgetDataManager`
/// publie les brouillons résolus dans l'App Group, `draft` suit la locale
/// appareil. C'est déjà strictement mieux que l'anglais servi à tous, et la
/// séparation des deux rôles est ici pour que la moitié restante soit un
/// branchement et non une réécriture.
struct QuickReplyButton: View {
    let label: String
    let draft: String
    let conversationId: String

    init(label: String, draft: String? = nil, conversationId: String) {
        self.label = label
        self.draft = draft ?? label
        self.conversationId = conversationId
    }

    var body: some View {
        WidgetLink(url: WidgetDeepLink.quickReply(conversationId: conversationId, draft: draft)) {
            Text(label)
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(WidgetColors.brandPrimary.opacity(0.15))
                .clipShape(.rect(cornerRadius: 12))
        }
    }
}
