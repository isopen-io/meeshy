import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationDashboardSentimentSection

struct ConversationDashboardSentimentSection: View {
    let analysis: ConversationDashboardClientStats.Sentiment
    let accent: Color

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ConversationDashboardSectionCard(accent: accent) {
            ConversationDashboardSectionHeader(icon: "face.smiling", title: String(localized: "dashboard.section.sentiment", defaultValue: "Sentiment", bundle: .main), accent: accent)

            HStack(spacing: 0) {
                sentimentSegment(
                    emoji: "\u{1F604}",
                    label: String(localized: "dashboard.sentiment.positive", defaultValue: "Positif", bundle: .main),
                    count: analysis.positive,
                    total: analysis.total,
                    color: MeeshyColors.success
                )
                sentimentSegment(
                    emoji: "\u{1F610}",
                    label: String(localized: "dashboard.sentiment.neutral", defaultValue: "Neutre", bundle: .main),
                    count: analysis.neutral,
                    total: analysis.total,
                    color: MeeshyColors.warning
                )
                sentimentSegment(
                    emoji: "\u{1F614}",
                    label: String(localized: "dashboard.sentiment.negative", defaultValue: "Négatif", bundle: .main),
                    count: analysis.negative,
                    total: analysis.total,
                    color: MeeshyColors.error
                )
            }

            sentimentBar(analysis: analysis)
        }
    }

    private func sentimentSegment(emoji: String, label: String, count: Int, total: Int, color: Color) -> some View {
        let pct = total > 0 ? Int(Double(count) / Double(total) * 100) : 0
        return VStack(spacing: MeeshySpacing.xs) {
            Text(emoji)
                .font(MeeshyFont.relative(MeeshyFont.titleSize))
            Text("\(pct)%")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold, design: .rounded))
                .foregroundColor(color)
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private func sentimentBar(analysis: ConversationDashboardClientStats.Sentiment) -> some View {
        let total = max(analysis.total, 1)
        let posFrac = CGFloat(analysis.positive) / CGFloat(total)
        let neuFrac = CGFloat(analysis.neutral) / CGFloat(total)
        let negFrac = CGFloat(analysis.negative) / CGFloat(total)

        let dominantColor: Color = {
            if posFrac >= neuFrac && posFrac >= negFrac { return MeeshyColors.success }
            if neuFrac >= posFrac && neuFrac >= negFrac { return MeeshyColors.warning }
            return MeeshyColors.error
        }()

        return GeometryReader { geo in
            HStack(spacing: MeeshySpacing.xxs) {
                if posFrac > 0 {
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                        .fill(MeeshyColors.success)
                        .frame(width: max(geo.size.width * posFrac - 1, 2))
                }
                if neuFrac > 0 {
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                        .fill(MeeshyColors.warning)
                        .frame(width: max(geo.size.width * neuFrac - 1, 2))
                }
                if negFrac > 0 {
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                        .fill(MeeshyColors.error)
                        .frame(width: max(geo.size.width * negFrac - 1, 2))
                }
            }
        }
        .frame(height: 12)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))
        .shadow(color: dominantColor.opacity(MeeshyOpacity.medium), radius: 4, y: 2)
    }
}
