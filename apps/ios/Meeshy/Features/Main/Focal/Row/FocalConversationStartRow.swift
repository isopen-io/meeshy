import SwiftUI
import MeeshyUI

/// Rangée « Début de la conversation » — marqueur affiché en tête du fil
/// (contrat §4.5 « Inset de tête », §4.8 : cellule `.conversationStart`
/// enregistrée par WS-6, `DiffableTypes.swift` — ce fichier n'en possède
/// QUE le rendu, pas le montage/inset, propriété WS-6/F-085).
///
/// Vue PURE, plate — aucune bulle, aucune capsule (même esthétique que
/// `FocalSystemNoticeRow`), centrée.
struct FocalConversationStartRow: View, Equatable {
    let conversationName: String
    let isDark: Bool

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(MeeshyFont.relative(20, weight: .light))
                .foregroundColor(ThemeManager.shared.textMuted)
                .accessibilityHidden(true)

            Text(String(
                localized: "focal.row.conversationStart",
                defaultValue: "Début de la conversation avec \(conversationName)",
                bundle: .main
            ))
            .font(MeeshyFont.relative(12.5, weight: .medium))
            .foregroundColor(ThemeManager.shared.textMuted)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.lg)
        .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
        .accessibilityElement(children: .combine)
    }
}
