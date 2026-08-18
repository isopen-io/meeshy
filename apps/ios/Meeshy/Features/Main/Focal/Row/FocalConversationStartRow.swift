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
    /// Libellé de jour du PREMIER message (« Aujourd'hui », « Lundi 9 mai »…),
    /// formaté PAR L'HÔTE via `MessageDayLabel` (même source que les
    /// séparateurs — jamais un second formateur ici). `nil` = premier message
    /// pas encore réalisé : le nom seul, comportement d'avant.
    /// Spec §5 « Premier message lisible » : « Début de la conversation ·
    /// {date} » — la date manquait (lot 3.4, 2026-08-18).
    var firstMessageDayLabel: String? = nil

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

            if let dayLabel = firstMessageDayLabel {
                Text(dayLabel)
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(ThemeManager.shared.textMuted.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.lg)
        .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
        .accessibilityElement(children: .combine)
    }
}
