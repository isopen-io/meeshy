import Foundation
import MeeshySDK

/// La période du graphique des clics : sept jours, trente jours, ou depuis le premier clic.
nonisolated enum TrackingInsightsPeriod: String, CaseIterable, Sendable, Hashable {
    case week
    case month
    case all

    var dayCount: Int? {
        switch self {
        case .week: return 7
        case .month: return 30
        case .all: return nil
        }
    }
}

/// Ce que le détail retient d'un clic : d'où, avec quoi, par quelle source, et quand.
nonisolated struct TrackingClickSample: Equatable, Sendable {
    let country: String?
    let device: String?
    let source: String?
    let clickedAt: Date

    init(country: String?, device: String?, source: String?, clickedAt: Date) {
        self.country = country
        self.device = device
        self.source = source
        self.clickedAt = clickedAt
    }

    init(click: TrackingLinkClick) {
        self.init(country: click.country, device: click.device, source: click.socialSource, clickedAt: click.clickedAt)
    }
}

/// Une part : sa clé, son nombre de clics et son pourcentage arrondi.
nonisolated struct TrackingShare: Equatable, Sendable {
    let key: String
    let count: Int
    let percent: Int
}

/// Un jour du graphique et ses clics.
nonisolated struct TrackingDayBucket: Equatable, Sendable {
    let day: Date
    let count: Int
}

/// Les familles d'appareils que la planche nomme : téléphone, ordinateur, tablette — le reste à part.
nonisolated enum TrackingDeviceFamily: String, CaseIterable, Sendable {
    case phone
    case desktop
    case tablet
    case other

    init(device: String?) {
        switch device?.lowercased() {
        case "mobile", "phone": self = .phone
        case "desktop": self = .desktop
        case "tablet": self = .tablet
        default: self = .other
        }
    }

    var systemImage: String {
        switch self {
        case .phone: return "iphone"
        case .desktop: return "desktopcomputer"
        case .tablet: return "ipad"
        case .other: return "globe"
        }
    }
}

/// Ce que les clics reçus DISENT d'un lien : ses pays, ses appareils, ses sources et ses jours. Pur : l'hôte donne les
/// clics, l'heure et le calendrier.
nonisolated struct TrackingLinkInsights: Equatable, Sendable {
    static let directSource = "direct"
    static let shownShares = 4
    static let longestSpanInDays = 365

    let samples: [TrackingClickSample]

    init(samples: [TrackingClickSample]) {
        self.samples = samples
    }

    var countryCount: Int {
        Set(samples.compactMap(\.country)).count
    }

    func countries(limit: Int = TrackingLinkInsights.shownShares) -> [TrackingShare] {
        Array(Self.shares(of: samples.compactMap(\.country)).prefix(limit))
    }

    var devices: [TrackingShare] {
        Self.shares(of: samples.map { TrackingDeviceFamily(device: $0.device).rawValue })
    }

    var sources: [TrackingShare] {
        Self.shares(of: samples.map { sample in
            let trimmed = sample.source?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? Self.directSource : trimmed
        })
    }

    func days(period: TrackingInsightsPeriod, now: Date, calendar: Calendar) -> [TrackingDayBucket] {
        let today = calendar.startOfDay(for: now)
        guard let span = spanInDays(period: period, today: today, calendar: calendar) else { return [] }
        let counts = Dictionary(grouping: samples, by: { calendar.startOfDay(for: $0.clickedAt) }).mapValues(\.count)
        return (0..<span).reversed().compactMap { offset in
            calendar.date(byAdding: .day, value: -offset, to: today).map { TrackingDayBucket(day: $0, count: counts[$0] ?? 0) }
        }
    }

    private func spanInDays(period: TrackingInsightsPeriod, today: Date, calendar: Calendar) -> Int? {
        if let dayCount = period.dayCount { return dayCount }
        guard let first = samples.map(\.clickedAt).min() else { return nil }
        let elapsed = calendar.dateComponents([.day], from: calendar.startOfDay(for: first), to: today).day ?? 0
        return min(max(elapsed, 0) + 1, Self.longestSpanInDays)
    }

    private static func shares(of keys: [String]) -> [TrackingShare] {
        guard !keys.isEmpty else { return [] }
        let total = Double(keys.count)
        return Dictionary(grouping: keys, by: { $0 })
            .map { TrackingShare(key: $0.key, count: $0.value.count, percent: Int((Double($0.value.count) * 100 / total).rounded())) }
            .sorted { $0.count != $1.count ? $0.count > $1.count : $0.key < $1.key }
    }
}
