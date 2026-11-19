import Foundation
import Combine
import MeeshySDK

/// Le dernier relevé des visites de MON lien de profil (#19489), daté du jour UTC où la passerelle l'a compté (#19206
/// compte en jours UTC). Un relevé ne ment pas en vieillissant : « ce mois » ne se sert que dans le mois du relevé,
/// « aujourd'hui » que dans son jour ; au-delà, l'écran s'en passe jusqu'au relevé suivant.
nonisolated struct ProfileLinkVisitsReading: Codable, Equatable, Sendable {
    let today: Int?
    let month: Int?
    let day: String

    init(today: Int?, month: Int?, day: String) {
        self.today = today
        self.month = month
        self.day = day
    }

    init(stats: ProfileLinkVisitStats, at date: Date) {
        self.init(today: stats.today, month: stats.month, day: Self.utcDay(date))
    }

    func monthVisits(at now: Date) -> Int? {
        Self.utcDay(now).prefix(7) == day.prefix(7) ? month : nil
    }

    func todayVisits(at now: Date) -> Int? {
        Self.utcDay(now) == day ? today : nil
    }

    static func utcDay(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0) ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

/// D'où la face Liens lit les visites : le cache de l'appareil, puis la passerelle ; où elle les range et ce qu'elle en
/// remet au widget « Mon lien ». Injecté pour les témoins.
struct ProfileLinkVisitsSources {
    let cached: (_ ownerId: String) -> ProfileLinkVisitsReading?
    let fetch: @MainActor () async throws -> ProfileLinkVisitStats
    let save: (_ ownerId: String, _ reading: ProfileLinkVisitsReading) -> Void
    let publish: (_ reading: ProfileLinkVisitsReading, _ link: ProfileLink) -> Void

    @MainActor static let live = ProfileLinkVisitsSources(
        cached: { ProfileLinkVisitsCache.read(ownerId: $0) },
        fetch: { try await ProfileLinkVisitsService.shared.visits() },
        save: { ProfileLinkVisitsCache.write($1, ownerId: $0) },
        publish: { reading, link in WidgetDataManager.shared.publishProfileLinkVisits(reading, for: link) }
    )
}

/// Le relevé gardé sur l'appareil, par compte : il se peint avant le réseau (loi 8, cache d'abord).
nonisolated enum ProfileLinkVisitsCache {
    private static func key(_ ownerId: String) -> String { "profile.links.visits.\(ownerId)" }

    static func read(ownerId: String, defaults: UserDefaults = .standard) -> ProfileLinkVisitsReading? {
        guard let data = defaults.data(forKey: key(ownerId)) else { return nil }
        return try? JSONDecoder().decode(ProfileLinkVisitsReading.self, from: data)
    }

    static func write(_ reading: ProfileLinkVisitsReading, ownerId: String, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(reading) else { return }
        defaults.set(data, forKey: key(ownerId))
    }
}

/// Les visites de mon lien sur la face Liens : le cache se peint tout de suite, la passerelle revalide en silence. Un
/// échec (réseau, ou passerelle qui ne sert pas encore la route) garde ce qui était montré et n'affiche rien d'autre :
/// pas de squelette, pas d'erreur, le billet s'en passe.
@MainActor
final class ProfileLinkVisitsModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var reading: ProfileLinkVisitsReading?

    private let sources: ProfileLinkVisitsSources
    private let now: () -> Date
    private var ownerId: String?

    init(sources: ProfileLinkVisitsSources = .live, now: @escaping () -> Date = { Date() }) {
        self.sources = sources
        self.now = now
    }

    var monthVisits: Int? { reading?.monthVisits(at: now()) }

    func load(ownerId: String?, link: ProfileLink?) async {
        guard let ownerId, let link else {
            self.ownerId = nil
            reading = nil
            return
        }
        if self.ownerId != ownerId {
            self.ownerId = ownerId
            reading = sources.cached(ownerId)
        }
        guard let stats = try? await sources.fetch(), self.ownerId == ownerId else { return }
        let fresh = ProfileLinkVisitsReading(stats: stats, at: now())
        reading = fresh
        sources.save(ownerId, fresh)
        sources.publish(fresh, link)
    }
}
