import SwiftUI
import MeeshySDK
import MeeshyUI

/// Texte de bulle avec troncature "show more / show less" gere localement.
///
/// Was: ThemedMessageBubble.expandableTextView (lignes 771-819) +
/// `textTruncateLimit` (ligne 761) + `truncateAtWord` (lignes 859-864).
///
/// L'etat `isExpanded` est encapsule via `@State` pour que la god view
/// n'ait pas a le tracker. Equatable manuel : on exclut `onLongPress` (callback)
/// et `@State` (interne) du test d'egalite.
struct BubbleExpandableText: View, Equatable {
    static let truncateLimit = 512

    /// Etat pur, testable sans SwiftUI.
    struct State: Equatable {
        let content: String
        let isExpanded: Bool

        func needsTruncation(limit: Int = BubbleExpandableText.truncateLimit) -> Bool {
            content.count > limit && !isExpanded
        }
    }

    let content: String
    let isMe: Bool
    let mentionDisplayNames: [String: String]
    let highlightTerm: String?
    let mentionTint: Color
    let linkTint: Color

    var onLongPress: (() -> Void)? = nil

    @SwiftUI.State private var isExpanded: Bool = false

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.content == rhs.content &&
        lhs.isMe == rhs.isMe &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        lhs.highlightTerm == rhs.highlightTerm &&
        lhs.mentionTint == rhs.mentionTint &&
        lhs.linkTint == rhs.linkTint
    }

    var body: some View {
        let needsTruncation = content.count > Self.truncateLimit && !isExpanded
        let textColor = isMe ? Color.white : ThemeManager.shared.textPrimary

        if needsTruncation {
            let truncated = Self.truncateAtWord(content, limit: Self.truncateLimit)
            VStack(alignment: .leading, spacing: 4) {
                MessageTextRenderer.render(truncated + "...", fontSize: 15, color: textColor, mentionColor: mentionTint, accentColor: linkTint, mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames, highlightTerm: highlightTerm)
                    .fixedSize(horizontal: false, vertical: true)
                    .tint(linkTint)

                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isExpanded = true
                    }
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(textColor.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 2)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                MessageTextRenderer.render(content, fontSize: 15, color: textColor, mentionColor: mentionTint, accentColor: linkTint, mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames, highlightTerm: highlightTerm)
                    .fixedSize(horizontal: false, vertical: true)
                    .tint(linkTint)

                if isExpanded && content.count > Self.truncateLimit {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isExpanded = false
                        }
                    } label: {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(textColor.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 2)
                    }
                }
            }
        }
    }

    static func truncateAtWord(_ text: String, limit: Int) -> String {
        guard text.count > limit else { return text }
        let prefix = String(text.prefix(limit))
        guard let lastSpace = prefix.lastIndex(of: " ") else { return prefix }
        return String(prefix[prefix.startIndex..<lastSpace])
    }
}
