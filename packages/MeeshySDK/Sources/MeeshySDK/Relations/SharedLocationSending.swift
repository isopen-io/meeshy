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

/// Combien de temps le partage court (#19616) : une des durées servies, ou « jusqu'à ce que j'arrête », réservé au Sang
/// et ouvert seulement quand la passerelle l'annonce (`acceptsUntilStopped`). Le serveur rejuge le cercle.
public enum SharedLocationShareTerm: Sendable, Equatable, Hashable {
    case bounded(SharedLocationShareDuration)
    case untilStopped

    /// L'échéance d'une personne sans fin : l'instant que le client garde et que `expiresAt: null` se lit.
    public static let openEndedDeadline = Date.distantFuture

    public static func isOpenEnded(_ deadline: Date) -> Bool {
        deadline >= openEndedDeadline
    }
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

/// Une personne à qui je montre ma position, ce qu'elle en voit et, quand elle tombe avant le terme du partage, SON
/// échéance en secondes (`recipients[].expiresInSeconds`, #18205) : la passerelle la tient, même app tuée.
public struct SharedLocationRecipient: Sendable, Equatable, Hashable {
    public let userId: String
    public let precision: SharedLocationPrecision
    /// Bornée comme le schéma serveur : un entier de 1 s à 8 h. `nil` : le terme du partage vaut pour elle.
    public let expiresInSeconds: Int?

    public init(userId: String, precision: SharedLocationPrecision, expiresInSeconds: Int? = nil) {
        self.userId = userId
        self.precision = precision
        self.expiresInSeconds = expiresInSeconds.map { min(max($0, 1), SharedLocationContract.recipientDeadlineMaxSeconds) }
    }

    var wire: [String: Any] {
        var wire: [String: Any] = ["userId": userId, "precision": precision.rawValue]
        if let expiresInSeconds { wire["expiresInSeconds"] = expiresInSeconds }
        return wire
    }
}

/// D'où vient la position d'un partage : un relevé de l'appareil, suivi tant que le partage court, ou un point choisi à
/// la main sur la carte (#19558), fixe, qui ne demande aucune permission et ne se met jamais à jour (`source: 'manual'`,
/// #19557). Seul `manual` voyage : une passerelle d'avant n'a jamais lu la clé.
public enum SharedLocationPositionSource: String, Sendable, Equatable {
    case device
    case manual
}

/// La charge de `location:share-start`. Démarrer de nouveau REMPLACE le partage : la liste est toujours entière.
/// `notifyRecipients` (« Prévenir ») et `shareBattery` (« Partager aussi ma batterie ») ne partent que vrais (#19204).
public struct SharedLocationStartRequest: Sendable, Equatable {
    /// `SHARED_LOCATION_RECIPIENTS_MAX`.
    public static let maxRecipients = 50

    public let recipients: [SharedLocationRecipient]
    public let duration: SharedLocationShareDuration
    public let fix: SharedLocationFix
    /// Chaque personne qui n'était pas déjà dans le partage remplacé reçoit une notification : un nom, une durée.
    public let notifyRecipients: Bool
    /// La batterie accompagne le partage, pour ses destinataires et jusqu'à son terme seulement.
    public let shareBattery: Bool
    /// Un relevé de l'appareil, ou un point choisi à la main.
    public let source: SharedLocationPositionSource
    /// « Jusqu'à ce que j'arrête » (#19616) : le partage n'a pas de terme ; `durationMinutes` reste pour le schéma.
    public let untilStopped: Bool

    /// `nil` : aucun destinataire valide, ou plus que le plafond. Un destinataire en double garde sa DERNIÈRE précision
    /// et sa dernière échéance (le schéma serveur refuse les doublons, insensibles à la casse).
    public init?(
        recipients: [SharedLocationRecipient],
        duration: SharedLocationShareDuration,
        fix: SharedLocationFix,
        notifyRecipients: Bool = false,
        shareBattery: Bool = false,
        source: SharedLocationPositionSource = .device,
        untilStopped: Bool = false
    ) {
        let valid = recipients.filter { Self.isObjectId($0.userId) }
        let latest = Dictionary(valid.map { ($0.userId.lowercased(), $0) }, uniquingKeysWith: { _, last in last })
        var seen = Set<String>()
        let ordered = valid.compactMap { recipient -> SharedLocationRecipient? in
            let key = recipient.userId.lowercased()
            guard seen.insert(key).inserted, let last = latest[key] else { return nil }
            return SharedLocationRecipient(userId: key, precision: last.precision, expiresInSeconds: last.expiresInSeconds)
        }
        guard !ordered.isEmpty, ordered.count <= Self.maxRecipients else { return nil }
        self.init(validated: ordered, duration: duration, fix: fix, notifyRecipients: notifyRecipients, shareBattery: shareBattery,
                  source: source, untilStopped: untilStopped)
    }

    private init(
        validated recipients: [SharedLocationRecipient],
        duration: SharedLocationShareDuration,
        fix: SharedLocationFix,
        notifyRecipients: Bool,
        shareBattery: Bool,
        source: SharedLocationPositionSource,
        untilStopped: Bool
    ) {
        self.recipients = recipients
        self.duration = duration
        self.fix = fix
        self.notifyRecipients = notifyRecipients
        self.shareBattery = shareBattery
        self.source = source
        self.untilStopped = untilStopped
    }

    /// Au moins une personne part avec sa propre échéance.
    public var carriesDeadlines: Bool { recipients.contains { $0.expiresInSeconds != nil } }

    /// « Prévenir » ou la batterie partent avec ce démarrage.
    public var carriesExtras: Bool { notifyRecipients || shareBattery }

    /// La même liste sans aucune échéance : une passerelle d'avant #18205 refuse la clé (`INVALID`), et le centre retire
    /// alors chacun à son échéance, comme avant.
    public var withoutDeadlines: SharedLocationStartRequest {
        SharedLocationStartRequest(
            validated: recipients.map { SharedLocationRecipient(userId: $0.userId, precision: $0.precision) },
            duration: duration,
            fix: fix,
            notifyRecipients: notifyRecipients,
            shareBattery: shareBattery,
            source: source,
            untilStopped: untilStopped
        )
    }

    /// La même liste sans « Prévenir » ni la batterie : une passerelle d'avant #19204 refuse ces clés (`INVALID`). La
    /// source reste : un point choisi ne part jamais déguisé en relevé de l'appareil. Un partage sans fin le reste aussi :
    /// il ne se dégrade jamais en partage borné que personne n'a choisi.
    public var withoutExtras: SharedLocationStartRequest {
        SharedLocationStartRequest(validated: recipients, duration: duration, fix: fix, notifyRecipients: false, shareBattery: false,
                                   source: source, untilStopped: untilStopped)
    }

    /// Les charges à essayer, dans l'ordre, après un refus `INVALID` : sans les options de #19204, puis sans les
    /// échéances de #18205. Une passerelle qui sert les options sert aussi les échéances (#18205 est antérieure).
    public var legacyFallbacks: [SharedLocationStartRequest] {
        let plain = withoutExtras
        return (carriesExtras ? [plain] : []) + (carriesDeadlines ? [plain.withoutDeadlines] : [])
    }

    public var wire: [String: Any] {
        var wire: [String: Any] = [
            "recipients": recipients.map(\.wire),
            "durationMinutes": duration.rawValue,
            "position": fix.wire,
        ]
        if notifyRecipients { wire["notifyRecipients"] = true }
        if shareBattery { wire["shareBattery"] = true }
        if source == .manual { wire["source"] = source.rawValue }
        if untilStopped { wire["untilStopped"] = true }
        return wire
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
    /// L'accusé n'est pas revenu à temps : la passerelle a PU prendre l'envoi. Jamais lu comme « rien n'est parti » —
    /// le centre garde « Arrêter » à portée tant que le doute n'est pas levé (#18166).
    case unconfirmed
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

/// `data` de l'accusé de `location:share-start` et de `location:share-update`. `expiresAt: null` : le partage n'a pas de
/// terme (#19616) ; une clé absente reste illisible.
struct SharedLocationStartedWire: Decodable, Sendable, Equatable {
    let expiresAt: String?

    private enum CodingKeys: String, CodingKey { case expiresAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        expiresAt = try c.decodeNil(forKey: .expiresAt) ? nil : try c.decode(String.self, forKey: .expiresAt)
    }
}

/// Le verdict d'un démarrage ou d'une mise à jour : le terme servi, ou le refus.
public enum SharedLocationStartVerdict: Sendable, Equatable {
    case started(expiresAt: Date)
    case refused(SharedLocationSendOutcome)

    static func read(_ ack: SocketAck<SharedLocationStartedWire>) -> SharedLocationStartVerdict {
        switch ack {
        case .accepted(let wire):
            guard let raw = wire.expiresAt else { return .started(expiresAt: SharedLocationShareTerm.openEndedDeadline) }
            guard let expiresAt = WireDate.date(from: raw) else { return .refused(.failed) }
            return .started(expiresAt: expiresAt)
        case .acceptedWithoutPayload, .undecodable:
            return .refused(.failed)
        case .refused(let refusal):
            return .refused(SharedLocationSendOutcome.ofRefusal(refusal.code))
        case .timedOut:
            return .refused(.unconfirmed)
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
