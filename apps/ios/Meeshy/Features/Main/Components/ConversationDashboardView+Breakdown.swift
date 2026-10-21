import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationDashboardBreakdownSection

struct ConversationDashboardBreakdownSection: View {
    let participants: [ConversationDashboardParticipantStat]
    let accent: Color

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ConversationDashboardSectionCard(accent: accent) {
            ConversationDashboardSectionHeader(icon: "person.2.fill", title: String(localized: "dashboard.section.participant-activity", defaultValue: "Activité par participant", bundle: .main), accent: accent)

            let stats = participants.prefix(10)
            let maxCount = stats.first?.messageCount ?? 1

            ForEach(Array(stats.enumerated()), id: \.element.id) { index, stat in
                HStack(spacing: MeeshySpacing.smPlus) {
                    if index < 3 {
                        Text("#\(index + 1)")
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .black, design: .rounded))
                            .foregroundColor(accent)
                            .frame(width: 24)
                    } else {
                        Circle()
                            .fill(Color(hex: DynamicColorGenerator.colorForName(stat.name)))
                            .frame(width: 8, height: 8)
                            .frame(width: 24)
                    }

                    VStack(alignment: .leading, spacing: 1) {
                        Text(stat.name)
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        Text(String(format: String(localized: "dashboard.words-count", defaultValue: "%@ mots", bundle: .main), formatNumber(stat.wordCount)))
                            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                    .frame(width: 80, alignment: .leading)

                    GeometryReader { geo in
                        let width = geo.size.width * CGFloat(stat.messageCount) / CGFloat(max(maxCount, 1))
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [accent, accent.opacity(MeeshyOpacity.strong)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(width, 6), height: 18)
                    }
                    .frame(height: 18)

                    Text("\(stat.messageCount)")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textSecondary)
                        .frame(width: 40, alignment: .trailing)
                }
                .padding(.vertical, MeeshySpacing.xxs)
            }
        }
    }

    /// Le seuil d'abrègement est **10 000, et il est intentionnel** : ce compteur
    /// rend un nombre de MOTS, où « 3 452 mots » informe et « 3,5 k mots » ne
    /// dit plus rien. La bande 1 000–9 999 gardait donc déjà le nombre entier
    /// et groupé (`formatted()`), locale comprise ; seul l'abrègement au-dessus
    /// composait son suffixe à la main, hors CLDR.
    ///
    /// Le repli sous 1 000 passe lui aussi par `formatted()` : `"\(n)"` gravait
    /// les chiffres latins, alors que la bande juste au-dessus rendait déjà les
    /// chiffres de la locale — le même compteur changeait de système d'écriture
    /// en arabe en passant de 999 à 1 000.
    private func formatNumber(_ n: Int) -> String {
        n >= 10_000 ? CompactCountLabel.text(n) : n.formatted()
    }
}
