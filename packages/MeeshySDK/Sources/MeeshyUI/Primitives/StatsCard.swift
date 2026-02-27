import SwiftUI

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
    @ObservedObject private var theme = ThemeManager.shared

    public init(icon: String, label: String, value: String, accentColor: String) {
        self.icon = icon
        self.label = label
        self.value = value
        self.accentColor = accentColor
    }

    public var body: some View {
        HStack(spacing: 12) {
            // Icon with circular background
            ZStack {
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.15))
                    .frame(width: 40, height: 40)

                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }

            // Label and value
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)

                Text(value)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()
        }
        .padding(14)
        .background(theme.surfaceGradient(tint: accentColor))
        .glassCard(cornerRadius: 12)
    }
}

// MARK: - Preview

#if DEBUG
struct StatsCard_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 12) {
            StatsCard(
                icon: "paperplane.fill",
                label: "Messages envoyés",
                value: "1,234",
                accentColor: "FF2E63"
            )

            StatsCard(
                icon: "character.book.closed.fill",
                label: "Traductions",
                value: "567",
                accentColor: "08D9D6"
            )

            StatsCard(
                icon: "globe",
                label: "Langues utilisées",
                value: "5",
                accentColor: "A855F7"
            )
        }
        .padding()
        .background(Color.black)
    }
}
#endif
