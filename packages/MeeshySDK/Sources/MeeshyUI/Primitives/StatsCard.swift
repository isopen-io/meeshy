import SwiftUI
import Combine

/// Card horizontale pour afficher une statistique (icône + label + valeur).
///
/// Design:
/// - HStack(icône 28x28 avec background cercle, VStack(label 12pt muted, value 15pt semibold))
/// - Background glassCard avec tint accent
/// - Padding 14pt
public struct StatsCard: View {
    private let icon: String
    private let label: String
    private let value: String
    private let accentColor: String
    // Leaf primitive — access the ThemeManager singleton without observing it.
    // `colorScheme` preserves theme-flip reactivity (its change re-renders the
    // view, recomputing the derived `theme` colors) without a subscription.
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

    public init(icon: String, label: String, value: String, accentColor: String) {
        self.icon = icon
        self.label = label
        self.value = value
        self.accentColor = accentColor
    }

    public var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            // Icon with circular background
            ZStack {
                Circle()
                    .fill(Color(hex: accentColor).opacity(MeeshyOpacity.light))
                    .frame(width: MeeshyControlSize.large, height: MeeshyControlSize.large)

                Image(systemName: icon)
                    .font(.system(size: MeeshyIconSize.md, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }

            // Label and value
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)

                Text(value)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
            }

            Spacer()
        }
        .padding(MeeshySpacing.mdPlus)
        .background(theme.surfaceGradient(tint: accentColor))
        .glassCard(cornerRadius: MeeshyRadius.smPlus)
    }
}

// MARK: - Preview

#if DEBUG
struct StatsCard_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: MeeshySpacing.md) {
            StatsCard(
                icon: "paperplane.fill",
                label: "Messages envoyés",
                value: "1,234",
                accentColor: MeeshyColors.tileRoseHex
            )

            StatsCard(
                icon: "character.book.closed.fill",
                label: "Traductions",
                value: "567",
                accentColor: MeeshyColors.tileCyanHex
            )

            StatsCard(
                icon: "globe",
                label: "Langues utilisées",
                value: "5",
                accentColor: MeeshyColors.purple500Hex
            )
        }
        .padding()
        .background(Color.black)
    }
}
#endif
