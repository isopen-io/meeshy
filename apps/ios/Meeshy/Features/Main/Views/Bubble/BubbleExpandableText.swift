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
                    // Pas de `.textSelection(.enabled)` : le long-press doit ouvrir
                    // le menu contextuel custom Meeshy (`MessageActionsMenu`, qui
                    // porte « Copier »), jamais le menu d'édition natif iOS
                    // (liquid glass « Copier / Rechercher / Traduire »).

                // Bouton texte « Voir plus » aligné en bas à droite (spec produit).
                //
                // AMÉLIORATION FIABILITÉ (Task ExpandableTextFix) :
                // 1. Décalage horizontal (`.padding(.trailing, 48)`) pour garantir
                //    l'exclusion de la zone de contact du coin inférieur droit.
                //    L'overlay des réactions (bouton "+") fait 40pt de large et
                //    déborde de 4pt vers l'extérieur : 48pt assure une séparation
                //    géométrique absolue.
                // 2. Utilisation de `.highPriorityGesture` avec un `TapGesture`
                //    pour garantir que le tap gagne sur le `LongPressGesture`
                //    simultané du parent (`BubbleSwipeContainer`) et sur la
                //    sélection de texte (`.textSelection(.enabled)`).
                // 3. `.textSelection(.disabled)` explicite sur le bouton pour
                //    qu'un tap imprécis ne déclenche pas le mode sélection.
                Text(String(localized: "bubble.expand.more", defaultValue: "Voir plus", bundle: .main))
                    // Dynamic Type (165i) : libellé texte réel « Voir plus » →
                    // `MeeshyFont.relative` pour qu'il scale sous Dynamic Type. Le
                    // `minHeight: 24` ci-dessous est une hauteur MINIMALE (pas fixe),
                    // donc la rangée grandit sans tronquer aux grandes tailles.
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(textColor.opacity(0.6))
                    // Hauteur de layout compacte (24pt) : l'ancien minHeight 44
                    // creusait ~16pt de vide au-dessus ET en dessous du libellé
                    // avant la date (feedback produit 2026-07-08). La cible
                    // tactile atteint les 44pt HIG via un contentShape étendu
                    // UNIQUEMENT vers le bas (`DownwardExtendedTapShape`, +20pt)
                    // — jamais vers le haut, pour ne pas mordre sur le texte
                    // tronqué / les liens juste au-dessus.
                    .frame(maxWidth: .infinity, minHeight: 24, alignment: .trailing)
                    .padding(.trailing, 48)
                    .contentShape(DownwardExtendedTapShape(extraBottom: 20))
                    .textSelection(.disabled)
                    .highPriorityGesture(
                        TapGesture()
                            .onEnded {
                                HapticFeedback.light()
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    isExpanded = true
                                }
                            }
                    )
                    .accessibilityIdentifier("bubble.expand.more")
                    .accessibilityAddTraits(.isButton)
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
                // Pas de `.textSelection(.enabled)` : voir note ci-dessus — le
                // long-press passe par le menu contextuel custom Meeshy, pas par
                // le menu d'édition natif iOS.
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
