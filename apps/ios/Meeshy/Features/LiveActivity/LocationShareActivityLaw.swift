import Foundation
import MeeshySDK

/// **La loi de l'activité en direct d'un partage de position** (planche `Hors-App`, vues 1 et 2, #19524).
///
/// - Elle PROJETTE les positions qu'on me partage (`SharedLocationsLive`) : le serveur a déjà jugé le cercle, le
///   consentement et la précision ; ma propre position n'y est jamais.
/// - UNE activité à la fois. La personne montrée le reste tant que son partage vit : l'îlot ne saute pas d'un visage à
///   l'autre. Quand il s'arrête, la plus longue échéance suivante prend sa place ; quand plus rien ne vit, l'activité
///   se ferme.
/// - Une personne que l'annuaire n'a pas encore nommée attend : aucune activité ne s'ouvre au nom de « Quelqu'un ».
/// - Le lieu n'apparaît que nommé pour la coordonnée servie, à sa précision, jamais plus fin.
enum LocationShareActivityLaw {

    /// Ce qui est fixé à l'ouverture (`LocationShareActivityAttributes`).
    struct Identity: Equatable, Sendable {
        let userId: String
        let name: String
        let initials: String
        let accentHex: String
        let username: String?
    }

    /// Ma position, telle que l'appareil la connaît déjà (jamais demandée pour l'activité).
    struct Position: Equatable, Sendable {
        let latitude: Double
        let longitude: Double
    }

    struct Shown: Equatable, Sendable {
        let identity: Identity
        let snapshot: LocationShareActivitySnapshot
    }

    /// Le lieu que l'appareil a nommé pour une coordonnée SERVIE.
    struct Place: Equatable, Sendable {
        struct Label: Equatable, Sendable {
            let name: String?
            let city: String?
        }

        let latitude: Double
        let longitude: Double
        let name: String?
        let city: String?

        /// Le nom d'un lieu à la précision servie : à la ville près, seule la ville se nomme ; plus fin, le quartier,
        /// suivi de sa ville quand elle diffère. Jamais une rue.
        static func named(subLocality: String?, locality: String?, precision: SharedLocationPrecision) -> Label {
            let quarter = subLocality.flatMap(nonEmpty)
            let town = locality.flatMap(nonEmpty)
            guard precision != .city, let quarter else { return Label(name: town, city: nil) }
            return Label(name: quarter, city: town == quarter ? nil : town)
        }

        private static func nonEmpty(_ text: String) -> String? {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }

        func names(_ entry: SharedLocationEntry) -> Bool {
            latitude == entry.latitude && longitude == entry.longitude
        }
    }

    enum Action: Equatable, Sendable {
        case none
        case start(Shown)
        case update(Shown)
        /// Une autre personne : l'activité montrée se ferme, la sienne s'ouvre.
        case replace(Shown)
        case end
    }

    struct Step: Equatable, Sendable {
        let shown: Shown?
        let action: Action
    }

    static func step(
        shown: Shown?,
        shares: [String: SharedLocationEntry],
        people: [String: CirclePerson],
        places: [String: Place],
        myPosition: Position? = nil,
        now: Date
    ) -> Step {
        let live = shares.filter { $0.value.deadline > now && people[$0.key] != nil }
        guard let leadId = lead(current: shown?.identity.userId, in: live),
              let entry = live[leadId], let person = people[leadId] else {
            return Step(shown: nil, action: shown == nil ? .none : .end)
        }
        let next = Shown(identity: identity(of: person, userId: leadId),
                         snapshot: snapshot(entry, place: places[leadId], from: myPosition))
        guard let shown else { return Step(shown: next, action: .start(next)) }
        if shown.identity != next.identity { return Step(shown: next, action: .replace(next)) }
        return Step(shown: next, action: shown.snapshot == next.snapshot ? .none : .update(next))
    }

    /// Le mot court de la précision, celui que l'îlot pose après le lieu (« Alfama · quartier »).
    static func precisionWord(_ precision: SharedLocationPrecision) -> String {
        switch precision {
        case .exact:
            return String(localized: "liveActivity.locationShare.precision.exact", defaultValue: "exacte", bundle: .main)
        case .neighborhood:
            return String(localized: "liveActivity.locationShare.precision.neighborhood", defaultValue: "quartier", bundle: .main)
        case .city:
            return String(localized: "liveActivity.locationShare.precision.city", defaultValue: "ville", bundle: .main)
        }
    }

    // MARK: - Interne

    private static func lead(current: String?, in live: [String: SharedLocationEntry]) -> String? {
        if let current, live[current] != nil { return current }
        return live.max { lhs, rhs in
            lhs.value.deadline == rhs.value.deadline ? lhs.key > rhs.key : lhs.value.deadline < rhs.value.deadline
        }?.key
    }

    private static func identity(of person: CirclePerson, userId: String) -> Identity {
        Identity(
            userId: userId,
            name: person.name,
            initials: SharedLocationsMapViewModel.initials(of: person.name),
            accentHex: DynamicColorGenerator.profileAccentHex(userId: userId, name: person.name),
            username: person.username
        )
    }

    private static func snapshot(_ entry: SharedLocationEntry, place: Place?, from me: Position?) -> LocationShareActivitySnapshot {
        let named = place.flatMap { $0.names(entry) ? $0 : nil }
        let closeOne = entry.circle.map { $0 >= .close } ?? false
        return LocationShareActivitySnapshot(
            deadline: entry.deadline,
            precision: precisionWord(entry.precision),
            place: named?.name,
            city: named?.city,
            distanceMeters: closeOne ? me.map { distance(from: $0, to: entry) } : nil,
            closeOne: closeOne
        )
    }

    /// La distance du grand cercle jusqu'à la coordonnée servie, au pas de sa précision, jamais nulle.
    private static func distance(from me: Position, to entry: SharedLocationEntry) -> Int {
        let radians = Double.pi / 180
        let deltaLatitude = (entry.latitude - me.latitude) * radians
        let deltaLongitude = (entry.longitude - me.longitude) * radians
        let haversine = pow(sin(deltaLatitude / 2), 2)
            + cos(me.latitude * radians) * cos(entry.latitude * radians) * pow(sin(deltaLongitude / 2), 2)
        let meters = 2 * 6_371_000 * asin(min(1, sqrt(haversine)))
        let step = distanceStep(entry.precision)
        return max(step, Int((meters / Double(step)).rounded()) * step)
    }

    private static func distanceStep(_ precision: SharedLocationPrecision) -> Int {
        switch precision {
        case .exact: return 100
        case .neighborhood: return 500
        case .city: return 1_000
        }
    }
}
