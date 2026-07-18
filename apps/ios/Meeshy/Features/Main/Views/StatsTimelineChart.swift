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
                .accessibilityLabel(Text(shortDate(point.date)))
                .accessibilityValue(Text(pointValueLabel(point)))

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
        .accessibilityLabel(Text(String(localized: "stats.timeline.chart.a11y", defaultValue: "Activity chart over 30 days", bundle: .main)))
        .accessibilityValue(Text(accessibilitySummary))
    }

    private var totalMessages: Int {
        timeline.reduce(0) { $0 + $1.messages }
    }

    private var peakPoint: TimelinePoint? {
        timeline.max { $0.messages < $1.messages }
    }

    private var accessibilitySummary: String {
        guard let peak = peakPoint, !timeline.isEmpty else {
            return String(localized: "stats.timeline.chart.empty.a11y", defaultValue: "No activity data yet", bundle: .main)
        }
        return String(
            localized: "stats.timeline.chart.summary.a11y",
            defaultValue: "\(totalMessages) messages total. Peak of \(peak.messages) on \(shortDate(peak.date)).",
            bundle: .main
        )
    }

    private func pointValueLabel(_ point: TimelinePoint) -> String {
        String(
            localized: "stats.timeline.chart.point.a11y",
            defaultValue: "\(point.messages) messages",
            bundle: .main
        )
    }

    private func shortDate(_ dateString: String) -> String {
        let parts = dateString.split(separator: "-")
        guard parts.count == 3 else { return dateString }
        return "\(parts[2])/\(parts[1])"
    }
}
