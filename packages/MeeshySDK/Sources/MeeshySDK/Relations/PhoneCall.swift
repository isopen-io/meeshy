import Foundation

// « EN APPEL » (#18753, ACT-01) — la lecture Swift du contrat `packages/shared/types/phone-call.ts`.
//
// Mes Sangs voient que je suis en appel, JAMAIS avec qui. Le téléphone suivi rapporte un booléen
// (`POST /me/device/call`) ; chaque Sang autorisé reçoit `phone-call:started` / `phone-call:ended` dans sa room. Aucun
// push. Un état porte `expiresAt` : passé ce délai, il ne s'affiche plus (la fin n'a peut-être jamais été rapportée).
// Les charges DESCENDANTES tolèrent un champ inconnu et une annonce d'un genre inconnu (ignorée, l'état reste).

public enum PhoneCallContract {
    /// `PHONE_CALL_CONFIG.reportTtlMinutes` : sans rappel du téléphone depuis ce délai, l'état n'est plus servi.
    public static let reportTtl: TimeInterval = 180 * 60
    /// `PHONE_CALL_CONFIG.servedSinceStepMinutes` : le début servi est arrondi à ce pas.
    public static let servedSinceStep: TimeInterval = 5 * 60
}

/// `PHONE_CALL_ANNOUNCEMENT_KINDS`.
public enum PhoneCallAnnouncementKind: String, Sendable, Equatable, CaseIterable {
    case started
    case ended
}

/// `PhoneCallAnnouncement` — ce qui fait défiler la SyncPill, jamais un message.
public struct PhoneCallAnnouncement: Sendable, Equatable {
    public let kind: PhoneCallAnnouncementKind
    public let at: Date

    public init(kind: PhoneCallAnnouncementKind, at: Date) {
        self.kind = kind
        self.at = at
    }
}

extension PhoneCallAnnouncement: Decodable {
    private enum CodingKeys: String, CodingKey { case kind, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let kind = PhoneCallAnnouncementKind(rawValue: try c.decode(String.self, forKey: .kind)) else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "annonce inconnue")
        }
        self.init(kind: kind, at: try PhoneCallWire.instant(c, .at))
    }
}

/// `PhoneCallState` — `userId` est en appel depuis `since` (arrondi par le serveur) ; l'état cesse d'être servi à
/// `expiresAt`. Trois champs, et rien d'autre : c'est aussi tout ce qui se range au repos.
public struct PhoneCallState: Sendable, Equatable, Codable {
    public let userId: String
    public let since: Date
    public let expiresAt: Date

    public init(userId: String, since: Date, expiresAt: Date) {
        self.userId = userId
        self.since = since
        self.expiresAt = expiresAt
    }

    /// Passé `expiresAt`, l'état ne s'affiche plus : le téléphone n'a peut-être jamais dit la fin.
    public func isExpired(at now: Date) -> Bool {
        now >= expiresAt
    }

    private enum CodingKeys: String, CodingKey { case userId, since, expiresAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        self.init(userId: userId,
                  since: try PhoneCallWire.instant(c, .since),
                  expiresAt: try PhoneCallWire.instant(c, .expiresAt))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(WireDate.string(from: since), forKey: .since)
        try c.encode(WireDate.string(from: expiresAt), forKey: .expiresAt)
    }
}

/// `phone-call:started` — l'état servi, et l'annonce pour la SyncPill. Sans annonce : une mise à jour silencieuse.
public struct PhoneCallStarted: Decodable, Sendable, Equatable {
    public let userId: String
    public let state: PhoneCallState
    public let announcement: PhoneCallAnnouncement?

    public init(userId: String, state: PhoneCallState, announcement: PhoneCallAnnouncement? = nil) {
        self.userId = userId
        self.state = state
        self.announcement = announcement
    }

    private enum CodingKeys: String, CodingKey { case userId, state, announcement }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let state = try c.decode(PhoneCallState.self, forKey: .state)
        let userId = (try? c.decode(String.self, forKey: .userId)) ?? state.userId
        guard userId == state.userId else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "état d'une autre personne")
        }
        self.init(userId: userId, state: state,
                  announcement: (try? c.decodeIfPresent(PhoneCallAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `phone-call:ended` — l'appel est fini, ou ne m'est plus servi : l'état disparaît.
public struct PhoneCallEnded: Decodable, Sendable, Equatable {
    public let userId: String
    public let announcement: PhoneCallAnnouncement?

    public init(userId: String, announcement: PhoneCallAnnouncement? = nil) {
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
                  announcement: (try? c.decodeIfPresent(PhoneCallAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `GET /relations/phone-calls` — les appels en cours servis à moi. Un élément illisible est écarté.
public struct PhoneCallSnapshot: Decodable, Sendable, Equatable {
    public let items: [PhoneCallState]

    public init(items: [PhoneCallState]) {
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([Lenient].self, forKey: .items)) ?? nil
        items = (lenient ?? []).compactMap(\.value)
    }

    private struct Lenient: Decodable {
        let value: PhoneCallState?

        init(from decoder: Decoder) throws {
            value = try? PhoneCallState(from: decoder)
        }
    }
}

/// `phoneCallReportSchema` — strict : `{active}`, aucun numéro, aucun nom, aucune durée.
public struct PhoneCallReport: Encodable, Sendable, Equatable {
    public let active: Bool

    public init(active: Bool) {
        self.active = active
    }
}

/// Ce que la passerelle a répondu au rapport (`PhoneCallAck`).
public enum PhoneCallReportOutcome: Sendable, Equatable {
    /// `tracked: true` — ce téléphone est le téléphone suivi, le rapport est rangé.
    case tracked
    /// `tracked: false` — un autre appareil : rien n'est rangé.
    case ignored
    /// Hors ligne ou refusé : le rapport est à refaire.
    case failed
}

/// `PhoneCallEmitterSettings` — montrer à mes Sangs que je suis en appel, pour tous (couper est le fantôme).
public struct PhoneCallEmitterSettings: Codable, Sendable, Equatable {
    public let sharingEnabled: Bool

    public init(sharingEnabled: Bool) {
        self.sharingEnabled = sharingEnabled
    }
}

/// `PhoneCallPersonSettings` — `isShared` (clé `shared`) : cette personne voit-elle que je suis en appel ? Accordé par
/// défaut entre Sangs, retirable.
public struct PhoneCallPersonSettings: Codable, Sendable, Equatable {
    public let userId: String
    public let isShared: Bool

    public init(userId: String, isShared: Bool) {
        self.userId = userId
        self.isShared = isShared
    }

    private enum CodingKeys: String, CodingKey {
        case userId
        case isShared = "shared"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        isShared = (try? c.decodeIfPresent(Bool.self, forKey: .isShared)) ?? false
    }
}

/// `phoneCallPersonSettingsUpdateSchema` — strict : `{shared}` et rien d'autre.
public struct PhoneCallPersonSettingsUpdate: Encodable, Sendable, Equatable {
    public let isShared: Bool

    public init(isShared: Bool) {
        self.isShared = isShared
    }

    private enum CodingKeys: String, CodingKey {
        case isShared = "shared"
    }
}

/// Un instant du fil, illisible ⇒ refusé.
enum PhoneCallWire {
    static func instant<Key: CodingKey>(_ c: KeyedDecodingContainer<Key>, _ key: Key) throws -> Date {
        guard let date = WireDate.date(from: try c.decode(String.self, forKey: key)) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "instant illisible")
        }
        return date
    }
}
