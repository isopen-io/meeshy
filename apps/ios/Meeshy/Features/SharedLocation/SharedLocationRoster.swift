import Foundation
import MeeshySDK

/// À qui je montre ma position, à quelle précision et jusqu'à quand (#16983). Le serveur ne connaît qu'UN partage, dont
/// la durée vaut pour toute la liste (1 h ou 8 h) ; la liste garde l'échéance que j'ai choisie pour CHAQUE personne, et le
/// centre retire la personne du partage serveur à SON échéance. Le terme serveur n'est jamais plus court que la plus
/// lointaine des échéances, et c'est lui qui coupe tout si l'appareil se tait.
struct SharedLocationRoster: Equatable, Codable {

    struct Entry: Equatable, Codable {
        let precision: SharedLocationPrecision
        let until: Date

        init(precision: SharedLocationPrecision, until: Date) {
            self.precision = precision
            self.until = until
        }

        private enum CodingKeys: String, CodingKey { case precision, until }

        /// Une précision inconnue se relit comme la ville : on ouvre plus, jamais l'inverse.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            precision = SharedLocationPrecision(rawValue: try c.decode(String.self, forKey: .precision)) ?? .city
            until = try c.decode(Date.self, forKey: .until)
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(precision.rawValue, forKey: .precision)
            try c.encode(until, forKey: .until)
        }
    }

    static let empty = SharedLocationRoster(entries: [:])

    private let entries: [String: Entry]

    private init(entries: [String: Entry]) {
        self.entries = entries
    }

    var isEmpty: Bool { entries.isEmpty }

    func entry(for userId: String) -> Entry? { entries[userId.lowercased()] }

    /// Ajouter une personne, ou changer sa précision et son échéance : `now + durée`.
    func adding(userId: String, precision: SharedLocationPrecision, duration: SharedLocationShareDuration, now: Date) -> SharedLocationRoster {
        var next = entries
        next[userId.lowercased()] = Entry(precision: precision, until: now.addingTimeInterval(duration.interval))
        return SharedLocationRoster(entries: next)
    }

    func removing(userId: String) -> SharedLocationRoster {
        var next = entries
        next.removeValue(forKey: userId.lowercased())
        return SharedLocationRoster(entries: next)
    }

    /// Sans ceux dont l'échéance est passée.
    func pruned(now: Date) -> SharedLocationRoster {
        SharedLocationRoster(entries: entries.filter { $0.value.until > now })
    }

    /// La plus proche des échéances : le moment où la liste change d'elle-même.
    var nextDeadline: Date? { entries.values.map(\.until).min() }

    /// La durée à demander au serveur : la plus courte qui couvre la plus lointaine des échéances.
    func serverDuration(now: Date) -> SharedLocationShareDuration {
        let farthest = entries.values.map(\.until).max() ?? now
        return farthest.timeIntervalSince(now) <= SharedLocationShareDuration.oneHour.interval ? .oneHour : .eightHours
    }

    /// La liste telle que le serveur la reçoit, dans un ordre stable.
    var recipients: [SharedLocationRecipient] {
        entries.keys.sorted().compactMap { id in entries[id].map { SharedLocationRecipient(userId: id, precision: $0.precision) } }
    }
}
