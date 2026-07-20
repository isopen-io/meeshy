import SwiftUI
import Combine
import Charts
import MeeshySDK
import MeeshyUI

struct StatsTimelineChart: View {
    let timeline: [TimelinePoint]
    let color: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        Chart {
            ForEach(timeline) { point in
                LineMark(
                    x: .value("Date", shortDate(point.date)),
                    y: .value("Messages", point.messages)
                )
                .foregroundStyle(Color(hex: color))
                .interpolationMethod(.catmullRom)
                .accessibilityLabel(shortDate(point.date))
                .accessibilityValue(messagesValue(point.messages))

                AreaMark(
                    x: .value("Date", shortDate(point.date)),
                    y: .value("Messages", point.messages)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color(hex: color).opacity(0.3), Color(hex: color).opacity(0.0)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .interpolationMethod(.catmullRom)
                .accessibilityHidden(true)
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                AxisValueLabel()
                    .font(MeeshyFont.relative(9))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                AxisValueLabel()
                    .font(MeeshyFont.relative(9))
                    .foregroundStyle(theme.textMuted)
                AxisGridLine()
                    .foregroundStyle(theme.textMuted.opacity(0.15))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "stats.timeline.chart.a11y", defaultValue: "Activity chart over 30 days", bundle: .main))
        .accessibilityValue(Self.accessibilitySummary(for: timeline))
    }

    /// VoiceOver value summarising the chart's data so the graph conveys its
    /// content without sight — total volume, busiest day, and the most recent
    /// day. Pure and locale-formatted so it can be unit-tested in isolation.
    static func accessibilitySummary(for timeline: [TimelinePoint]) -> String {
        guard !timeline.isEmpty else {
            return String(
                localized: "stats.timeline.chart.a11y.empty",
                defaultValue: "No activity recorded yet",
                bundle: .main
            )
        }
        let total = timeline.reduce(0) { $0 + $1.messages }
        let peak = timeline.map(\.messages).max() ?? 0
        let latest = timeline.last?.messages ?? 0
        return String(
            localized: "stats.timeline.chart.a11y.summary",
            defaultValue: "\(total) messages total, peak of \(peak) in one day, \(latest) on the most recent day",
            bundle: .main
        )
    }

    private func messagesValue(_ count: Int) -> String {
        String(
            format: String(localized: "stats.timeline.point.a11y", defaultValue: "%d messages", bundle: .main),
            count
        )
    }

    private func shortDate(_ dateString: String) -> String {
        let parts = dateString.split(separator: "-")
        guard parts.count == 3 else { return dateString }
        return "\(parts[2])/\(parts[1])"
    }
}
