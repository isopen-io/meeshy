import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MessageViewsMetaRow

/// Une ligne « icône · libellé · valeur » de la fiche « Qui a vu » (méta du
/// message, historique d'envoi).
struct MessageViewsMetaRow: View {
    let icon: String
    let label: String
    let value: String
    let accent: Color
    var valueColor: Color? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: icon)
                .font(.caption2.weight(.medium))
                .foregroundColor(accent.opacity(0.6))
                .frame(width: 16)

            Text(label)
                .font(.caption.weight(.medium))
                .foregroundColor(theme.textMuted)
                .frame(width: 85, alignment: .leading)

            Text(value)
                .font(.caption.weight(.medium))
                .foregroundColor(valueColor ?? theme.textPrimary)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
    }
}

// MARK: - MessageViewsMetaDivider

struct MessageViewsMetaDivider: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        Rectangle()
            .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
            .frame(height: 0.5)
            .padding(.leading, 38)
    }
}
