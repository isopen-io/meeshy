import Foundation

// ÉMETTRE MA POSITION À DES PERSONNES (#14109, #16983), côté iOS. Le contrat est `packages/shared/types/shared-location.ts`
// (`sharedLocationStartPayloadSchema`, `SharedLocationAck`) ; ce fichier en est l'écriture Swift. L'appareil envoie UNE
// fois sa position complète, et la passerelle la tronque destinataire par destinataire à la précision choisie : rien ici
// ne floute, rien ne décide d'un droit. Ces briques bornent la charge comme le serveur la borne, pour qu'un relevé absurde
// ne parte jamais.

/// `SHARED_LOCATION_DURATIONS_MINUTES` : 1 h ou 8 h, puis le partage s'arrête seul.
public enum SharedLocationShareDuration: Int, Sendable, Equatable, CaseIterable {
    case oneHour = 60
    case eightHours = 480

    public var interval: TimeInterval { TimeInterval(rawValue * 60) }
}

/// Un relevé de l'appareil, borné comme `sharedLocationPositionSchema`.
public struct SharedLocationFix: Sendable, Equatable {
    public let latitude: Double
    public let longitude: Double
    public let accuracy: Double?

    /// `nil` : un relevé hors du globe ou non fini ne part jamais.
    public init?(latitude: Double, longitude: Double, accuracy: Double? = nil) {
        guard latitude.isFinite, longitude.isFinite, (-90...90).contains(latitude), (-180...180).contains(longitude) else {
            return nil
        }
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy.flatMap { $0.isFinite && $0 >= 0 ? min($0, SharedLocationContract.maxRadiusMeters) : nil }
    }

    /// `location:share-update`, et la `position` de `location:share-start`.
    public var wire: [String: Double] {
        var wire = ["latitude": latitude, "longitude": longitude]
        if let accuracy { wire["accuracy"] = accuracy }
        return wire
    }

    /// La distance au sol, en mètres (haversine) : de quoi juger qu'on a bougé, jamais plus.
    public func distance(to other: SharedLocationFix) -> Double {
        let radians = Double.pi / 180
        let dLat = (other.latitude - latitude) * radians
        let dLon = (other.longitude - longitude) * radians
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(latitude * radians) * cos(other.latitude * radians) * sin(dLon / 2) * sin(dLon / 2)
        return 6_371_000 * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}

/// Une personne à qui je montre ma position, et ce qu'elle en voit.
public struct SharedLocationRecipient: Sendable, Equatable, Hashable {
    public let userId: String
    public let precision: SharedLocationPrecision

    public init(userId: String, precision: SharedLocationPrecision) {
        self.userId = userId
        self.precision = precision
    }
}

/// La charge de `location:share-start`. Démarrer de nouveau REMPLACE le partage : la liste est toujours entière.
public struct SharedLocationStartRequest: Sendable, Equatable {
    /// `SHARED_LOCATION_RECIPIENTS_MAX`.
    public static let maxRecipients = 50

    public let recipients: [SharedLocationRecipient]
    public let duration: SharedLocationShareDuration
    public let fix: SharedLocationFix

    /// `nil` : aucun destinataire valide, ou plus que le plafond. Un destinataire en double garde sa DERNIÈRE précision
    /// (le schéma serveur refuse les doublons, insensibles à la casse).
    public init?(recipients: [SharedLocationRecipient], duration: SharedLocationShareDuration, fix: SharedLocationFix) {
        let valid = recipients.filter { Self.isObjectId($0.userId) }
        let latest = Dictionary(valid.map { ($0.userId.lowercased(), $0.precision) }, uniquingKeysWith: { _, last in last })
        var seen = Set<String>()
        let ordered = valid.compactMap { recipient -> SharedLocationRecipient? in
            let key = recipient.userId.lowercased()
            guard seen.insert(key).inserted, let precision = latest[key] else { return nil }
            return SharedLocationRecipient(userId: key, precision: precision)
        }
        guard !ordered.isEmpty, ordered.count <= Self.maxRecipients else { return nil }
        self.recipients = ordered
        self.duration = duration
        self.fix = fix
    }

    public var wire: [String: Any] {
        [
            "recipients": recipients.map { ["userId": $0.userId, "precision": $0.precision.rawValue] },
            "durationMinutes": duration.rawValue,
            "position": fix.wire,
        ]
    }

    private static func isObjectId(_ value: String) -> Bool {
        value.count == 24 && value.allSatisfy(\.isHexDigit)
    }
}

/// Ce que l'interface dit d'un envoi qui n'a pas abouti.
public enum SharedLocationSendOutcome: String, Sendable, Equatable {
    case invalid
    /// Une mise à jour sans partage en cours côté serveur (arrêté, échu, ou perdu) : l'émetteur s'arrête aussi.
    case notSharing
    case rateLimited
    case unavailable
    case offline
    case failed

    private static let refusals: [String: SharedLocationSendOutcome] = [
        "SHARED_LOCATION_INVALID": .invalid,
        "SHARED_LOCATION_NOT_SHARING": .notSharing,
        "SHARED_LOCATION_RATE_LIMITED": .rateLimited,
        "SHARED_LOCATION_UNAVAILABLE": .unavailable,
    ]

    /// Un code que ce client ne connaît pas vaut un échec, jamais une raison inventée.
    public static func ofRefusal(_ code: String?) -> SharedLocationSendOutcome {
        code.flatMap { refusals[$0] } ?? .failed
    }
}

/// `data` de l'accusé de `location:share-start` et de `location:share-update`.
struct SharedLocationStartedWire: Decodable, Sendable, Equatable {
    let expiresAt: String
}

/// Le verdict d'un démarrage ou d'une mise à jour : le terme servi, ou le refus.
public enum SharedLocationStartVerdict: Sendable, Equatable {
    case started(expiresAt: Date)
    case refused(SharedLocationSendOutcome)

    static func read(_ ack: SocketAck<SharedLocationStartedWire>) -> SharedLocationStartVerdict {
        switch ack {
        case .accepted(let wire):
            guard let expiresAt = WireDate.date(from: wire.expiresAt) else { return .refused(.failed) }
            return .started(expiresAt: expiresAt)
        case .acceptedWithoutPayload, .undecodable:
            return .refused(.failed)
        case .refused(let refusal):
            return .refused(SharedLocationSendOutcome.ofRefusal(refusal.code))
        case .timedOut:
            return .refused(.offline)
        }
    }
}

/// La cadence des mises à jour : sous le débit servi (`SHARED_LOCATION_RATE`, 120 par minute), un relevé ne part que si
/// l'on a vraiment bougé, ou au battement qui garde la position fraîche chez les destinataires.
public enum SharedLocationUpdateGate {
    public struct Sent: Sendable, Equatable {
        public let fix: SharedLocationFix
        public let at: Date

        public init(fix: SharedLocationFix, at: Date) {
            self.fix = fix
            self.at = at
        }
    }

    /// Jamais deux envois plus proches que ça : douze par minute au plus, dix fois sous le débit servi.
    public static let minimumInterval: TimeInterval = 5
    /// Un déplacement plus petit est du bruit GPS.
    public static let minimumDistanceMeters: Double = 50
    /// Immobile, la position est redite à ce rythme.
    public static let heartbeat: TimeInterval = 120

    public static func shouldSend(_ fix: SharedLocationFix, now: Date, last: Sent?) -> Bool {
        guard let last else { return true }
        let elapsed = now.timeIntervalSince(last.at)
        guard elapsed >= minimumInterval else { return false }
        return elapsed >= heartbeat || fix.distance(to: last.fix) >= minimumDistanceMeters
    }
}
