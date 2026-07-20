import SwiftUI
import MeeshySDK
import MeeshyUI

/// Affiche le contenu secondaire (traduction inline) sous une bulle.
/// Was: ThemedMessageBubble.secondaryContentView (ex line 731-767).
///
/// Composant feuille (`Equatable`) — n'observe aucun singleton; tous les
/// inputs theme/colors sont passes en `let` pour permettre `.equatable()`.
struct BubbleSecondaryContent: View, Equatable {
    let content: String
    let langCode: String
    let isMe: Bool
    let textPrimary: Color
    let mentionDisplayNames: [String: String]
    let mentionTint: Color
    let linkTint: Color
    /// `[rawURL: token]` outbound-link tracking map → raw URLs link to
    /// `/l/<token>`. Empty by default (no rewrite).
    var trackedLinks: [String: String] = [:]

    var body: some View {
        let langColor = Color(hex: LanguageDisplay.colorHex(for: langCode))
        let display = LanguageDisplay.from(code: langCode)
        let secondaryTextColor: Color = isMe
            ? .white.opacity(0.85)
            : textPrimary.opacity(0.8)

        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                Circle().fill(langColor).frame(width: 4, height: 4)
                Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
            }

            VStack(alignment: .leading, spacing: 4) {
                if let display = display {
                    HStack(spacing: 4) {
                        Text(display.flag).font(.caption)
                        Text(display.name)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(langColor)
                    }
                }
                MessageTextRenderer.render(
                    content,
                    fontSize: 13,
                    color: secondaryTextColor,
                    mentionColor: mentionTint,
                    accentColor: linkTint,
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames,
                    trackedLinks: trackedLinks.isEmpty ? nil : trackedLinks
                )
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(langColor.opacity(0.12))
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.content == rhs.content
            && lhs.langCode == rhs.langCode
            && lhs.isMe == rhs.isMe
            && lhs.textPrimary == rhs.textPrimary
            && lhs.mentionDisplayNames == rhs.mentionDisplayNames
            && lhs.mentionTint == rhs.mentionTint
            && lhs.linkTint == rhs.linkTint
            && lhs.trackedLinks == rhs.trackedLinks
    }
}
