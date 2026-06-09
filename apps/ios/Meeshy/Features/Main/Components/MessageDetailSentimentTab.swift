import SwiftUI
import NaturalLanguage

// MARK: - Sentiment Tab

/// "Sentiment" tab of `MessageDetailSheet`, extracted as a standalone,
/// parameterized sub-view (L5 decomposition). Fully self-contained: it takes
/// the message content as a primitive input, runs on-device sentiment analysis
/// (`NLTagger`), and renders the gauge. `isDark` is passed explicitly so the
/// view is `Equatable` and only re-renders when content or appearance change
/// (cf. "Leaf Views — Zero @ObservedObject Singleton"). Theme colors are read
/// non-observingly from `ThemeManager.shared`.
struct MessageDetailSentimentTab: View, Equatable {
    let content: String
    let isDark: Bool

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let score = Self.analyzeSentiment(content)

        return VStack(spacing: 16) {
            Text(Self.sentimentEmoji(score))
                .font(.system(size: 56))

            Text(Self.sentimentLabel(score))
                .font(.callout.weight(.semibold))
                .foregroundColor(theme.textPrimary)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.error, MeeshyColors.warning, MeeshyColors.warning, MeeshyColors.success],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(height: 12)

                    let normalized = (score + 1) / 2
                    let position = normalized * geo.size.width

                    Circle()
                        .fill(.white)
                        .frame(width: 18, height: 18)
                        .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        .offset(x: max(0, min(position - 9, geo.size.width - 18)))
                }
            }
            .frame(height: 18)
            .padding(.horizontal, 20)

            Text(String(format: "Score : %.2f", score))
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    // MARK: - Sentiment Analysis (on-device, pure)

    private static func analyzeSentiment(_ text: String) -> Double {
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        tagger.string = text
        let (tag, _) = tagger.tag(at: text.startIndex, unit: .paragraph, scheme: .sentimentScore)
        return Double(tag?.rawValue ?? "0") ?? 0
    }

    private static func sentimentEmoji(_ score: Double) -> String {
        if score < -0.6 { return "\u{1F621}" }
        if score < -0.2 { return "\u{1F614}" }
        if score < 0.2 { return "\u{1F610}" }
        if score < 0.6 { return "\u{1F642}" }
        return "\u{1F604}"
    }

    private static func sentimentLabel(_ score: Double) -> String {
        if score < -0.6 { return String(localized: "sentiment.very-negative", defaultValue: "Very negative", bundle: .main) }
        if score < -0.2 { return String(localized: "dashboard.sentiment.negative", defaultValue: "Negative", bundle: .main) }
        if score < 0.2 { return String(localized: "dashboard.sentiment.neutral", defaultValue: "Neutral", bundle: .main) }
        if score < 0.6 { return String(localized: "dashboard.sentiment.positive", defaultValue: "Positive", bundle: .main) }
        return String(localized: "sentiment.very-positive", defaultValue: "Very positive", bundle: .main)
    }
}
