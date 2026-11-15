import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MessageViewsDeliveryBadge

/// Badge de niveau de livraison (0 envoi · 1 envoyé · 2 distribué · 3 lu ·
/// autre = échec) de la carte auteur de l'onglet « Envoyé ».
struct MessageViewsDeliveryBadge: View {
    let level: Int
    let accent: Color

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let icon: String
        let label: String
        let color: Color

        switch level {
        case 3:
            icon = "eye.fill"
            label = String(localized: "bubble.delivery.read", defaultValue: "Lu", bundle: .main)
            color = .green
        case 2:
            icon = "checkmark.circle.fill"
            label = String(localized: "bubble.delivery.delivered", defaultValue: "Distribué", bundle: .main)
            color = accent
        case 1:
            icon = "checkmark"
            label = String(localized: "bubble.delivery.sent", defaultValue: "Envoyé", bundle: .main)
            color = accent.opacity(0.7)
        case 0:
            icon = "arrow.up.circle"
            label = String(localized: "bubble.delivery.sending", defaultValue: "Envoi en cours", bundle: .main)
            color = theme.textMuted
        default:
            icon = "exclamationmark.circle"
            label = String(localized: "bubble.delivery.failed", defaultValue: "Échec de l'envoi", bundle: .main)
            color = .red
        }

        return HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: icon)
                .font(.caption2.weight(.semibold))
            Text(label)
                .font(.caption2.weight(.semibold))
        }
        .foregroundColor(color)
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.xs)
        .background(
            Capsule()
                .fill(color.opacity(0.12))
        )
        .accessibilityElement(children: .combine)
    }
}
