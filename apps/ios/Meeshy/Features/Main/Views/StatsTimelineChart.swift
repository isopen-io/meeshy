import SwiftUI
import Charts
import MeeshySDK

struct StatsTimelineChart: View {
    let timeline: [TimelinePoint]
    let color: String

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        Chart {
            ForEach(timeline) { point in
                LineMark(
                    x: .value("Date", shortDate(point.date)),
                    y: .value("Messages", point.messages)
                )
                .foregroundStyle(Color(hex: color))
                .interpolationMethod(.catmullRom)

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
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                AxisValueLabel()
                    .font(.system(size: 9))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                AxisValueLabel()
                    .font(.system(size: 9))
                    .foregroundStyle(theme.textMuted)
                AxisGridLine()
                    .foregroundStyle(theme.textMuted.opacity(0.15))
            }
        }
        .accessibilityLabel("Graphique d'activite sur 30 jours")
    }

    private func shortDate(_ dateString: String) -> String {
        let parts = dateString.split(separator: "-")
        guard parts.count == 3 else { return dateString }
        return "\(parts[2])/\(parts[1])"
    }
}
