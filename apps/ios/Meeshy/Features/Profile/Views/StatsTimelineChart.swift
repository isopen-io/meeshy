import SwiftUI
import MeeshySDK
import MeeshyUI

/// La frise des trente derniers jours de « Mon activité » (#19635) : la courbe du graphique du kit (K50, `.line`),
/// la « Statistiques d'un compte » de la planche. Elle ne dessine rien elle-même : elle range les jours servis en
/// points opaques, nomme le pic et aujourd'hui, borne l'axe à trois dates et dit tout à VoiceOver d'une phrase.
/// Toucher la courbe nomme un jour.
struct StatsTimelineChart: View {
    let timeline: [TimelinePoint]
    var isLoading: Bool = false
    let tint: Color

    @State private var selectedDay: String?

    var body: some View {
        MeeshyChart(kind: .line, points: Self.points(of: timeline), summary: Self.summary(for: timeline),
                    tint: tint, size: .regular, markers: [.peak, .today],
                    axisLabels: Self.axisLabels(of: timeline), selection: $selectedDay,
                    callout: { id in Self.callout(id, in: timeline) }, isLoading: isLoading,
                    emptyText: Self.accessibilitySummary(for: []))
    }

    // MARK: - Les points

    /// Trois dates sur l'axe : le premier jour, le milieu, aujourd'hui.
    static let axisLabelCount = 3

    static func points(of timeline: [TimelinePoint], locale: Locale = .current) -> [MeeshyChartPoint] {
        timeline.map { point in
            let label = dayLabel(point.date, locale: locale)
            return MeeshyChartPoint(id: point.date, value: Double(point.messages), label: label,
                                    spoken: "\(label), \(messagesValue(point.messages))")
        }
    }

    static func axisLabels(of timeline: [TimelinePoint], locale: Locale = .current) -> [String] {
        guard timeline.count > 1 else { return [] }
        let steps = min(axisLabelCount - 1, timeline.count - 1)
        return (0...steps).map { step in
            dayLabel(timeline[(timeline.count - 1) * step / steps].date, locale: locale)
        }
    }

    static func callout(_ id: String, in timeline: [TimelinePoint], locale: Locale = .current) -> MeeshyChartCallout? {
        timeline.first { $0.date == id }.map { point in
            MeeshyChartCallout(title: dayLabel(point.date, locale: locale), value: messagesValue(point.messages))
        }
    }

    // MARK: - Ce que la voix en dit

    /// Le nom du graphique puis ses nombres : « Graphique d'activité sur 30 jours, 17 messages au total, … ».
    static func summary(for timeline: [TimelinePoint]) -> String {
        let title = String(localized: "stats.timeline.chart.a11y", defaultValue: "Graphique d'activité sur 30 jours", bundle: .main)
        return "\(title), \(accessibilitySummary(for: timeline))"
    }

    /// Le volume total, le jour le plus chargé et le dernier jour — sans jamais inventer un nombre sur une frise vide.
    static func accessibilitySummary(for timeline: [TimelinePoint]) -> String {
        guard !timeline.isEmpty else {
            return String(
                localized: "stats.timeline.chart.a11y.empty",
                defaultValue: "Aucune activité enregistrée",
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

    static func messagesValue(_ count: Int) -> String {
        String(
            format: String(localized: "stats.timeline.point.a11y", defaultValue: "%d messages", bundle: .main),
            count
        )
    }

    // MARK: - Les jours

    /// « 9 nov. » dans la langue courante. Le jour servi (année-mois-jour) se lit en UTC et s'écrit en UTC : aucun
    /// fuseau ne le décale d'un jour. Un jour illisible se dit tel quel, jamais remplacé par un autre.
    static func dayLabel(_ date: String, locale: Locale = .current) -> String {
        guard let day = parsedDay(date) else { return date }
        var style = Date.FormatStyle.dateTime.day().month(.abbreviated)
        style.locale = locale
        style.timeZone = utc
        return day.formatted(style)
    }

    private static let utc = TimeZone(secondsFromGMT: 0) ?? .current

    private static func parsedDay(_ date: String) -> Date? {
        let parts = date.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
