import Foundation
import MeeshySDK

/// Une entrée par le lien d'une communauté : qui est arrivé, et quand — ou qui attend qu'on le valide (#19505).
nonisolated struct CommunityLinkEntry: Equatable, Sendable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let username: String?
    let avatar: String?
    let joinedAt: Date
    let isPending: Bool

    init(id: String, userId: String, name: String, username: String?, avatar: String?, joinedAt: Date,
         isPending: Bool = false) {
        self.id = id
        self.userId = userId
        self.name = name
        self.username = username
        self.avatar = avatar
        self.joinedAt = joinedAt
        self.isPending = isPending
    }

    /// Un membre dont la date d'arrivée est inconnue ne dit rien des entrées : il n'en est pas une. Le statut
    /// `pending` n'est lu que s'il est servi (#19290) ; absent, la rangée est une entrée faite.
    init?(member: APICommunityMember) {
        guard let joinedAt = member.joinedAt else { return nil }
        self.init(id: member.id, userId: member.userId, name: member.user?.name ?? member.userId,
                  username: member.user?.username, avatar: member.user?.avatar, joinedAt: joinedAt,
                  isPending: member.status?.lowercased() == "pending")
    }
}

/// Ce que les arrivées DISENT d'un lien de communauté (planche `Lien-Communaute`, #18871) : les plus récentes, la
/// semaine, les trente jours et leur moyenne. Pur : l'hôte donne les membres, l'heure et le calendrier.
nonisolated struct CommunityLinkEntries: Equatable, Sendable {
    static let recentLimit = 5
    static let pageSize = 100
    static let windowDays = 30

    let entries: [CommunityLinkEntry]

    init(entries: [CommunityLinkEntry], excludingUserId: String?) {
        self.entries = entries
            .filter { $0.userId != excludingUserId }
            .sorted { $0.joinedAt != $1.joinedAt ? $0.joinedAt > $1.joinedAt : $0.id < $1.id }
    }

    var recent: [CommunityLinkEntry] {
        Array(entries.prefix(Self.recentLimit))
    }

    /// Les entrées FAITES : une demande en attente se montre, mais ne compte pas comme une entrée.
    var joined: [CommunityLinkEntry] {
        entries.filter { !$0.isPending }
    }

    func count(lastDays days: Int, now: Date, calendar: Calendar) -> Int {
        guard let start = calendar.date(byAdding: .day, value: -(days - 1), to: calendar.startOfDay(for: now)) else {
            return 0
        }
        return joined.filter { $0.joinedAt >= start && $0.joinedAt <= now }.count
    }

    func days(now: Date, calendar: Calendar) -> [TrackingDayBucket] {
        TrackingLinkInsights(samples: joined.map {
            TrackingClickSample(country: nil, device: nil, source: nil, clickedAt: $0.joinedAt)
        })
        .days(period: .month, now: now, calendar: calendar)
    }

    func dailyAverage(now: Date, calendar: Calendar) -> Double {
        Double(count(lastDays: Self.windowDays, now: now, calendar: calendar)) / Double(Self.windowDays)
    }

    /// Le serveur range les membres du plus ancien au plus récent : les dernières arrivées sont sur la DERNIÈRE page.
    static func latestPageOffset(total: Int?, pageSize: Int) -> Int? {
        guard let total, total > pageSize else { return nil }
        return total - pageSize
    }
}

/// Qui peut entrer par le lien d'une communauté.
nonisolated enum CommunityEntryRule: Hashable, Sendable {
    case open
    case invitationOnly
    case roleMember
    case everyCountry
    case noExpiry

    static func rules(isPrivate: Bool) -> [CommunityEntryRule] {
        [isPrivate ? .invitationOnly : .open, .roleMember, .everyCountry, .noExpiry]
    }
}

/// Ce que le lecteur est pour la communauté du lien : il l'anime, il la modère, ou il en est membre.
nonisolated enum CommunityLinkStewardship: Equatable, Sendable {
    case animates
    case moderates
    case member

    init(role: String?) {
        switch role?.lowercased() {
        case "admin", "creator": self = .animates
        case "moderator": self = .moderates
        default: self = .member
        }
    }
}
