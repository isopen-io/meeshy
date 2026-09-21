// apps/ios/Meeshy/Features/Main/Views/Bubble/FirstUnreadSeparatorRow.swift

import SwiftUI
import MeeshyUI

/// Le séparateur « N messages non lus » du fil (D-L1..3, #7222) — posé par
/// `MessageListViewController+UnreadSeparator.swift` sur la frontière que
/// `FirstUnreadBoundary.resolve` (S1, `packages/MeeshySDK/.../
/// FirstUnreadBoundary.swift`) élit, une fois à l'ouverture d'un fil qui a
/// des non-lus.
///
/// **Couleur PRIMAIRE (D-L3), jamais l'accent de la conversation** : la rampe
/// de MARQUE `MeeshyColors.indigo*`, distincte de `conversation.accentColor`
/// (dérivé, différent par conversation) — c'est CELA que D-L3 oppose.
///
/// La rampe, pas un unique degré : `brandPrimary` (indigo 500) rend 3,75:1
/// sur le fond sombre du fil (mesuré sur la capture `separator-dark.png` du
/// lot), sous le seuil AA de 4,5:1 pour un texte de 11 pt — le libellé s'y
/// lisait nettement moins bien que la pilule de jour juste au-dessus. Le
/// degré CLAIR de la même rampe (indigo 300) rend 8,4:1 et reste le jeton
/// primaire. C'est exactement ce que fait le jumeau visuel
/// `MessageDaySeparator` (indigo 200 / indigo 700) — deux séparateurs voisins
/// ne peuvent pas suivre deux doctrines de lisibilité contraires.
///
/// Le libellé RÉUTILISE `UnreadCountLabel.messages(_:)` — la SEULE règle
/// plurielle « N message(s) non lu(s) » du dépôt dans les 7 langues du
/// catalogue (voir son doc-comment : quatre doublons déjà corrigés ailleurs,
/// ce type n'en écrit pas un cinquième). La mise en page (les deux traits,
/// le padding) reste ICI — le contrat que documente `UnreadCountLabel`.
struct FirstUnreadSeparatorRow: View, Equatable {
    let count: Int
    let isDark: Bool

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.count == rhs.count && lhs.isDark == rhs.isDark
    }

    private var label: String { UnreadCountLabel.messages(count) }

    var body: some View {
        HStack(spacing: 10) {
            Rectangle().fill(lineColor).frame(height: 1)
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundColor(textColor)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
            Rectangle().fill(lineColor).frame(height: 1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isHeader)
    }

    /// Le degré de la rampe de marque qui reste LISIBLE sur le fond du fil —
    /// voir le doc-comment du type : le jeton primaire, jamais l'accent.
    private var textColor: Color {
        isDark ? MeeshyColors.indigo300 : MeeshyColors.brandPrimary
    }

    /// Les deux traits sont DÉCORATIFS (le libellé porte toute l'information,
    /// et `accessibilityElement(children: .ignore)` les retire du lecteur
    /// d'écran) : ils peuvent descendre en opacité là où le texte ne le peut
    /// pas.
    private var lineColor: Color {
        textColor.opacity(isDark ? 0.45 : 0.3)
    }
}
