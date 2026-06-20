import SwiftUI
import MeeshySDK
import MeeshyUI

/// Texte de bulle avec troncature « Voir plus » (depliage a sens unique) gere localement.
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
            !isExpanded && BubbleExpandableText.exceeds(content, limit)
        }
    }

    let content: String
    let isMe: Bool
    let mentionDisplayNames: [String: String]
    let highlightTerm: String?
    let mentionTint: Color
    let linkTint: Color
    /// `[rawURL: token]` outbound-link tracking map → raw URLs link to
    /// `/l/<token>`. Empty by default (no rewrite) for non-message callers.
    var trackedLinks: [String: String] = [:]

    var onLongPress: (() -> Void)? = nil

    @SwiftUI.State private var isExpanded: Bool = false

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.content == rhs.content &&
        lhs.isMe == rhs.isMe &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        lhs.highlightTerm == rhs.highlightTerm &&
        lhs.mentionTint == rhs.mentionTint &&
        lhs.linkTint == rhs.linkTint &&
        lhs.trackedLinks == rhs.trackedLinks
    }

    var body: some View {
        let needsTruncation = !isExpanded && Self.exceeds(content, Self.truncateLimit)
        let textColor = isMe ? Color.white : ThemeManager.shared.textPrimary

        if needsTruncation {
            let truncated = Self.truncateAtWord(content, limit: Self.truncateLimit)
            VStack(alignment: .leading, spacing: 4) {
                MessageTextRenderer.render(truncated + "...", fontSize: 15, color: textColor, mentionColor: mentionTint, accentColor: linkTint, mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames, highlightTerm: highlightTerm, trackedLinks: trackedLinks.isEmpty ? nil : trackedLinks)
                    .fixedSize(horizontal: false, vertical: true)
                    .tint(linkTint)
                    .textSelection(.enabled)

                // Bouton texte « Voir plus » aligné en bas à droite (spec produit).
                // Hit-area élargie via `.frame(minHeight: 28).contentShape(Rectangle())`
                // pour rester au-dessus du minimum thumb-friendly (24pt).
                // `.buttonStyle(.plain)` est OBLIGATOIRE pour que le tap survive au
                // `.simultaneousGesture(LongPressGesture(0.35))` que `BubbleSwipeContainer`
                // pose sur la bulle — sans lui le default style entre en arbitrage avec
                // le long-press parent et le tap est souvent avalé.
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isExpanded = true
                    }
                } label: {
                    Text(String(localized: "bubble.expand.more", defaultValue: "Voir plus", bundle: .main))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(textColor.opacity(0.6))
                        .frame(maxWidth: .infinity, minHeight: 28, alignment: .trailing)
                        .padding(.top, 2)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "bubble.expand.more", defaultValue: "Voir plus", bundle: .main))
            }
        } else {
            // Déplié (ou court) : on affiche le message COMPLET sans aucun
            // bouton. Le dépliage est à sens unique — le chevron "V" a rempli
            // son rôle et disparaît (spec : « déplier uniquement et disparaître,
            // pas de repli »). `isExpanded` reste local à la sous-vue.
            MessageTextRenderer.render(content, fontSize: 15, color: textColor, mentionColor: mentionTint, accentColor: linkTint, mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames, highlightTerm: highlightTerm, trackedLinks: trackedLinks.isEmpty ? nil : trackedLinks)
                .fixedSize(horizontal: false, vertical: true)
                .tint(linkTint)
                .textSelection(.enabled)
        }
    }

    /// `true` iff `s` has MORE than `limit` characters, scanning at most
    /// `limit + 1` of them. Avoids an O(n) full `count` of long messages on
    /// every render — we only need the threshold, not the exact length.
    static func exceeds(_ s: String, _ limit: Int) -> Bool {
        s.index(s.startIndex, offsetBy: limit + 1, limitedBy: s.endIndex) != nil
    }

    static func truncateAtWord(_ text: String, limit: Int) -> String {
        guard exceeds(text, limit) else { return text }
        let prefix = String(text.prefix(limit))
        guard let lastSpace = prefix.lastIndex(of: " ") else { return prefix }
        return String(prefix[prefix.startIndex..<lastSpace])
    }
}
