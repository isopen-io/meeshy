// apps/ios/Meeshy/Features/Main/Views/Bubble/FirstUnreadSeparatorRow.swift

import SwiftUI
import MeeshyUI

/// Le séparateur « N messages non lus » du fil (D-L1..3, #7222) — posé par
/// `MessageListViewController+UnreadSeparator.swift` sur la frontière que
/// `FirstUnreadBoundary.resolve` (S1, `packages/MeeshySDK/.../
/// FirstUnreadBoundary.swift`) élit, une fois à l'ouverture d'un fil qui a
/// des non-lus.
///
/// **Couleur PRIMAIRE (D-L3), jamais l'accent de la conversation** :
/// `MeeshyColors.brandPrimary` — le jeton de MARQUE, distinct de
/// `conversation.accentColor` (dérivé, différent par conversation). Le
/// séparateur de jour (`MessageDaySeparator`, jumeau visuel) reste sur sa
/// propre rampe indigo neutre ; celui-ci porte la couleur de marque pour
/// rester repérable au milieu d'un fil de bulles accentuées.
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
                .foregroundColor(MeeshyColors.brandPrimary)
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

    private var lineColor: Color {
        MeeshyColors.brandPrimary.opacity(isDark ? 0.45 : 0.3)
    }
}
