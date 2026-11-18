import Foundation

// L'ALERTE D'INACTIVITÉ servie à UN Sang (#18738) — `inactivityAlertStateSchema`, `inactivity:alert`,
// `inactivity:cleared` et l'instantané `GET /relations/inactivity`. Contrat : `InactivityCheck.swift`.

/// `INACTIVITY_ANNOUNCEMENT_KINDS`.
public enum InactivityAnnouncementKind: String, Sendable, Equatable, CaseIterable {
    /// La personne n'a pas répondu à « Tout va bien ? ».
    case alert
    /// Elle a répondu, ou s'est servie de son téléphone : elle va bien.
    case responded
}

/// `InactivityAnnouncement` — ce qui fait défiler la SyncPill, jamais un message.
public struct InactivityAnnouncement: Sendable, Equatable {
    public let kind: InactivityAnnouncementKind
    public let inactiveSince: Date
    public let at: Date

    public init(kind: InactivityAnnouncementKind, inactiveSince: Date, at: Date) {
        self.kind = kind
        self.inactiveSince = inactiveSince
        self.at = at
    }
}

extension InactivityAnnouncement: Decodable {
    private enum CodingKeys: String, CodingKey { case kind, inactiveSince, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let kind = InactivityAnnouncementKind(rawValue: try c.decode(String.self, forKey: .kind)) else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "annonce inconnue")
        }
        self.init(kind: kind,
                  inactiveSince: try InactivityWire.instant(c, .inactiveSince),
                  at: try InactivityWire.instant(c, .at))
    }
}

/// La dernière position, SEULEMENT quand le Sang la reçoit déjà (`location.history`).
public struct InactivityLastPosition: Sendable, Equatable, Codable {
    public let latitude: Double
    public let longitude: Double
    public let accuracy: Double?
    public let recordedAt: Date

    public init(latitude: Double, longitude: Double, accuracy: Double? = nil, recordedAt: Date) {
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy
        self.recordedAt = recordedAt
    }

    private enum CodingKeys: String, CodingKey { case latitude, longitude, accuracy, recordedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let latitude = try c.decode(Double.self, forKey: .latitude)
        let longitude = try c.decode(Double.self, forKey: .longitude)
        guard (-90...90).contains(latitude), (-180...180).contains(longitude) else {
            throw DecodingError.dataCorruptedError(forKey: .latitude, in: c, debugDescription: "coordonnées hors bornes")
        }
        let accuracy = (try? c.decodeIfPresent(Double.self, forKey: .accuracy)) ?? nil
        self.init(latitude: latitude, longitude: longitude, accuracy: accuracy.flatMap { $0 >= 0 ? $0 : nil },
                  recordedAt: try InactivityWire.instant(c, .recordedAt))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(latitude, forKey: .latitude)
        try c.encode(longitude, forKey: .longitude)
        try c.encodeIfPresent(accuracy, forKey: .accuracy)
        try c.encode(WireDate.string(from: recordedAt), forKey: .recordedAt)
    }
}

/// La dernière batterie, SEULEMENT quand le Sang la reçoit déjà (`device.battery`) : un pourcentage entier.
public struct InactivityLastBattery: Sendable, Equatable, Codable {
    public let level: Int
    public let measuredAt: Date

    public init(level: Int, measuredAt: Date) {
        self.level = level
        self.measuredAt = measuredAt
    }

    private enum CodingKeys: String, CodingKey { case level, measuredAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let level = try c.decode(Int.self, forKey: .level)
        guard (0...100).contains(level) else {
            throw DecodingError.dataCorruptedError(forKey: .level, in: c, debugDescription: "niveau hors bornes")
        }
        self.init(level: level, measuredAt: try InactivityWire.instant(c, .measuredAt))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(level, forKey: .level)
        try c.encode(WireDate.string(from: measuredAt), forKey: .measuredAt)
    }
}

/// `InactivityAlertState` — l'état servi À MOI pendant l'alerte : le téléphone de `userId` ne montre plus d'activité
/// depuis `inactiveSince`, ses Sangs ont été prévenus à `alertedAt`. Une position ou une batterie illisible se tait.
public struct InactivityAlertState: Sendable, Equatable, Codable {
    public let userId: String
    public let inactiveSince: Date
    public let alertedAt: Date
    public let lastPosition: InactivityLastPosition?
    public let lastBattery: InactivityLastBattery?

    public init(userId: String, inactiveSince: Date, alertedAt: Date,
                lastPosition: InactivityLastPosition? = nil, lastBattery: InactivityLastBattery? = nil) {
        self.userId = userId
        self.inactiveSince = inactiveSince
        self.alertedAt = alertedAt
        self.lastPosition = lastPosition
        self.lastBattery = lastBattery
    }

    /// L'état ne survit jamais au TTL du contrat, compté depuis l'alerte : un cache plus vieux ne s'affiche pas.
    public func isExpired(at now: Date) -> Bool {
        now.timeIntervalSince(alertedAt) > InactivityCheckContract.stateTtl
    }

    private enum CodingKeys: String, CodingKey { case userId, inactiveSince, alertedAt, lastPosition, lastBattery }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        self.init(
            userId: userId,
            inactiveSince: try InactivityWire.instant(c, .inactiveSince),
            alertedAt: try InactivityWire.instant(c, .alertedAt),
            lastPosition: (try? c.decodeIfPresent(InactivityLastPosition.self, forKey: .lastPosition)) ?? nil,
            lastBattery: (try? c.decodeIfPresent(InactivityLastBattery.self, forKey: .lastBattery)) ?? nil
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(WireDate.string(from: inactiveSince), forKey: .inactiveSince)
        try c.encode(WireDate.string(from: alertedAt), forKey: .alertedAt)
        try c.encodeIfPresent(lastPosition, forKey: .lastPosition)
        try c.encodeIfPresent(lastBattery, forKey: .lastBattery)
    }
}

/// `inactivity:alert` — l'état servi, et l'annonce pour la SyncPill.
public struct InactivityAlertRaised: Decodable, Sendable, Equatable {
    public let userId: String
    public let state: InactivityAlertState
    public let announcement: InactivityAnnouncement?

    public init(userId: String, state: InactivityAlertState, announcement: InactivityAnnouncement? = nil) {
        self.userId = userId
        self.state = state
        self.announcement = announcement
    }

    private enum CodingKeys: String, CodingKey { case userId, state, announcement }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let state = try c.decode(InactivityAlertState.self, forKey: .state)
        let userId = (try? c.decode(String.self, forKey: .userId)) ?? state.userId
        guard userId == state.userId else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "état d'une autre personne")
        }
        self.init(userId: userId, state: state,
                  announcement: (try? c.decodeIfPresent(InactivityAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `inactivity:cleared` — la personne a répondu, ou l'alerte ne m'est plus servie : l'état disparaît.
public struct InactivityAlertCleared: Decodable, Sendable, Equatable {
    public let userId: String
    public let announcement: InactivityAnnouncement?

    public init(userId: String, announcement: InactivityAnnouncement? = nil) {
        self.userId = userId
        self.announcement = announcement
    }

    private enum CodingKeys: String, CodingKey { case userId, announcement }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        self.init(userId: userId,
                  announcement: (try? c.decodeIfPresent(InactivityAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `GET /relations/inactivity` — les alertes en cours servies à moi. Un élément illisible est écarté.
public struct InactivitySnapshot: Decodable, Sendable, Equatable {
    public let items: [InactivityAlertState]

    public init(items: [InactivityAlertState]) {
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([Lenient].self, forKey: .items)) ?? nil
        items = (lenient ?? []).compactMap(\.value)
    }

    private struct Lenient: Decodable {
        let value: InactivityAlertState?

        init(from decoder: Decoder) throws {
            value = try? InactivityAlertState(from: decoder)
        }
    }
}

/// Un instant du fil, illisible ⇒ refusé.
enum InactivityWire {
    static func instant<Key: CodingKey>(_ c: KeyedDecodingContainer<Key>, _ key: Key) throws -> Date {
        guard let date = WireDate.date(from: try c.decode(String.self, forKey: key)) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "instant illisible")
        }
        return date
    }
}
