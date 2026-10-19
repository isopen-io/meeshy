import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationDashboardContentTypesSection

struct ConversationDashboardContentTypesSection: View {
    let types: [ConversationDashboardContentTypeStat]
    let accent: Color

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let maxCount = types.map(\.count).max() ?? 1
        ConversationDashboardSectionCard(accent: accent) {
            ConversationDashboardSectionHeader(icon: "square.grid.2x2.fill", title: String(localized: "dashboard.section.content-types", defaultValue: "Types de contenu", bundle: .main), accent: accent)

            ForEach(types, id: \.type) { stat in
                HStack(spacing: MeeshySpacing.smPlus) {
                    Image(systemName: stat.icon)
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                        .foregroundColor(stat.color)
                        .frame(width: 20)

                    Text(stat.type)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .frame(width: 60, alignment: .leading)

                    GeometryReader { geo in
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [stat.color.opacity(MeeshyOpacity.heavy), stat.color.opacity(MeeshyOpacity.medium)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(
                                width: max(geo.size.width * CGFloat(stat.count) / CGFloat(max(maxCount, 1)), 4),
                                height: 10
                            )
                    }
                    .frame(height: 10)

                    Text("\(stat.count)")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textSecondary)
                        .frame(width: 40, alignment: .trailing)
                }
                .padding(.vertical, MeeshySpacing.xxs)
            }
        }
    }
}
