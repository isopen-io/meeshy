import Foundation

// LE TÉLÉPHONE INJOIGNABLE (#18737, TEL-01) — la lecture Swift du contrat `packages/shared/types/phone-reachability.ts`
// et `phone-reachability-constants.ts`. Même forme que la batterie des proches (#14147).
//
// JAMAIS un message de conversation. Le serveur sonde le téléphone, décide qu'il est injoignable et choisit le canal
// de chaque lecteur : ce fichier ne porte que ce qui voyage. Les charges DESCENDANTES tolèrent un champ inconnu, une
// cause inconnue (lue `unknown`) et une annonce d'un genre inconnu (ignorée, l'état reste) : un client plus ancien que
// le serveur ne casse pas.

public enum PhoneReachabilityContract {
    /// `PHONE_REACHABILITY_CONFIG.stateTtlSeconds` : aucun état ne vit plus longtemps, aucun historique.
    public static let stateTtl: TimeInterval = 259_200
    /// `PHONE_REACHABILITY_NOTIFICATION_TYPE`.
    public static let notificationType = "device_unreachable"
    /// `PHONE_PROBE_PUSH_TYPE` : le `data.type` du push SILENCIEUX qui sonde le téléphone.
    public static let probePushType = "device_probe"
}

/// `PHONE_UNREACHABLE_CAUSES` — la cause PROBABLE, déduite par le serveur. `unknown` n'est jamais émis : c'est ce qu'un
/// client lit d'une cause ajoutée après lui.
public enum PhoneUnreachableCause: String, Sendable, Equatable, CaseIterable, Codable {
    /// Le dernier épisode de batterie connu était critique ou éteint.
    case battery
    /// Sans réseau ou en mode avion — le serveur ne peut pas les distinguer.
    case network
    case unknown

    /// Une cause servie hors de ce que ce client connaît se lit `unknown`, jamais une erreur.
    public init(wire: String?) {
        self = wire.flatMap(PhoneUnreachableCause.init(rawValue:)) ?? .unknown
    }
}

/// `PHONE_REACHABILITY_ANNOUNCEMENT_KINDS`.
public enum PhoneReachabilityAnnouncementKind: String, Sendable, Equatable, CaseIterable {
    case unreachable
    case reachable
}

/// `PhoneReachabilityAnnouncement` — ce qui fait défiler la SyncPill, jamais un message.
public struct PhoneReachabilityAnnouncement: Sendable, Equatable {
    public let kind: PhoneReachabilityAnnouncementKind
    public let at: Date

    public init(kind: PhoneReachabilityAnnouncementKind, at: Date) {
        self.kind = kind
        self.at = at
    }
}

extension PhoneReachabilityAnnouncement: Decodable {
    private enum CodingKeys: String, CodingKey { case kind, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let kind = PhoneReachabilityAnnouncementKind(rawValue: try c.decode(String.self, forKey: .kind)) else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "annonce inconnue")
        }
        guard let at = WireDate.date(from: try c.decode(String.self, forKey: .at)) else {
            throw DecodingError.dataCorruptedError(forKey: .at, in: c, debugDescription: "instant illisible")
        }
        self.init(kind: kind, at: at)
    }
}

/// `PhoneReachabilityState` — l'état servi À MOI : le téléphone de `userId` est injoignable depuis `unreachableSince`
/// (son dernier signe de vie), probablement pour `cause`.
public struct PhoneReachabilityState: Sendable, Equatable, Codable {
    public let userId: String
    public let unreachableSince: Date
    public let cause: PhoneUnreachableCause

    public init(userId: String, unreachableSince: Date, cause: PhoneUnreachableCause) {
        self.userId = userId
        self.unreachableSince = unreachableSince
        self.cause = cause
    }

    /// L'état ne survit jamais au TTL du contrat : un cache plus vieux ne s'affiche pas.
    public func isExpired(at now: Date) -> Bool {
        now.timeIntervalSince(unreachableSince) > PhoneReachabilityContract.stateTtl
    }

    private enum CodingKeys: String, CodingKey { case userId, unreachableSince, cause }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        guard let since = WireDate.date(from: try c.decode(String.self, forKey: .unreachableSince)) else {
            throw DecodingError.dataCorruptedError(forKey: .unreachableSince, in: c, debugDescription: "instant illisible")
        }
        let rawCause = (try? c.decodeIfPresent(String.self, forKey: .cause)) ?? nil
        self.init(userId: userId, unreachableSince: since, cause: PhoneUnreachableCause(wire: rawCause))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(WireDate.string(from: unreachableSince), forKey: .unreachableSince)
        try c.encode(cause.rawValue, forKey: .cause)
    }
}

/// `phone:unreachable` — l'état servi, et l'annonce quand le canal du lecteur est la SyncPill.
public struct PhoneReachabilityChanged: Decodable, Sendable, Equatable {
    public let userId: String
    public let state: PhoneReachabilityState
    public let announcement: PhoneReachabilityAnnouncement?

    public init(userId: String, state: PhoneReachabilityState, announcement: PhoneReachabilityAnnouncement? = nil) {
        self.userId = userId
        self.state = state
        self.announcement = announcement
    }

    private enum CodingKeys: String, CodingKey { case userId, state, announcement }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let state = try c.decode(PhoneReachabilityState.self, forKey: .state)
        let userId = (try? c.decode(String.self, forKey: .userId)) ?? state.userId
        guard userId == state.userId else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "état d'une autre personne")
        }
        self.init(userId: userId, state: state,
                  announcement: (try? c.decodeIfPresent(PhoneReachabilityAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `phone:reachable` — le téléphone répond de nouveau, ou ne m'est plus servi : l'état disparaît.
public struct PhoneReachabilityCleared: Decodable, Sendable, Equatable {
    public let userId: String
    public let announcement: PhoneReachabilityAnnouncement?

    public init(userId: String, announcement: PhoneReachabilityAnnouncement? = nil) {
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
                  announcement: (try? c.decodeIfPresent(PhoneReachabilityAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `GET /relations/phone-reachability` — les états servis à moi. Un élément illisible est écarté.
public struct PhoneReachabilitySnapshot: Decodable, Sendable, Equatable {
    public let items: [PhoneReachabilityState]

    public init(items: [PhoneReachabilityState]) {
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([Lenient].self, forKey: .items)) ?? nil
        items = (lenient ?? []).compactMap(\.value)
    }

    private struct Lenient: Decodable {
        let value: PhoneReachabilityState?

        init(from decoder: Decoder) throws {
            value = try? PhoneReachabilityState(from: decoder)
        }
    }
}

/// `GET /relations/:userId/phone-reachability` — `state` est nul quand le téléphone répond ou que rien n'est partagé.
public struct PhoneReachabilityStateEnvelope: Decodable, Sendable, Equatable {
    public let state: PhoneReachabilityState?

    private enum CodingKeys: String, CodingKey { case state }

    public init(state: PhoneReachabilityState?) {
        self.state = state
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? c.decodeIfPresent(PhoneReachabilityState.self, forKey: .state)) ?? nil
    }
}

/// `PhoneReachabilityEmitterSettings` — prévenir mes Proches si mon téléphone est injoignable, pour tous (vrai par
/// défaut ; le couper est le fantôme).
public struct PhoneReachabilityEmitterSettings: Codable, Sendable, Equatable {
    public let sharingEnabled: Bool

    public init(sharingEnabled: Bool) {
        self.sharingEnabled = sharingEnabled
    }
}

/// `PhoneReachabilityPersonSettings` — `isShared` (clé `shared`) : l'autre apprend-il que MON téléphone est
/// injoignable, selon la loi maintenant. `alertsMe` (clé `alertMe`, #19433, serveur #19435) : suis-je prévenu quand
/// SON téléphone devient injoignable ; `nil` = le serveur ne le sert pas encore, l'interrupteur n'existe pas.
public struct PhoneReachabilityPersonSettings: Sendable, Equatable, Codable {
    public let userId: String
    public let isShared: Bool
    public let alertsMe: Bool?

    public init(userId: String, isShared: Bool, alertsMe: Bool? = nil) {
        self.userId = userId
        self.isShared = isShared
        self.alertsMe = alertsMe
    }

    private enum CodingKeys: String, CodingKey {
        case userId
        case isShared = "shared"
        case alertsMe = "alertMe"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        isShared = (try? c.decodeIfPresent(Bool.self, forKey: .isShared)) ?? false
        alertsMe = try? c.decodeIfPresent(Bool.self, forKey: .alertsMe)
    }
}

/// Le corps de l'alerte, écrit SEUL (#19435) : le schéma `{shared}` reste strict, les deux réglages voyagent séparés.
public struct PhoneReachabilityAlertUpdate: Encodable, Sendable, Equatable {
    public let alertsMe: Bool

    public init(alertsMe: Bool) {
        self.alertsMe = alertsMe
    }

    private enum CodingKeys: String, CodingKey {
        case alertsMe = "alertMe"
    }
}

/// `phoneReachabilityPersonSettingsUpdateSchema` — strict : `{shared}` et rien d'autre.
public struct PhoneReachabilityPersonSettingsUpdate: Encodable, Sendable, Equatable {
    public let isShared: Bool

    public init(isShared: Bool) {
        self.isShared = isShared
    }

    private enum CodingKeys: String, CodingKey {
        case isShared = "shared"
    }
}

/// Ce que la passerelle a répondu au signe de vie (`POST /me/device/alive`).
public enum PhoneAliveOutcome: Sendable, Equatable {
    /// `tracked: true` — ce téléphone est celui qui est suivi.
    case tracked
    /// `tracked: false` — un autre appareil est suivi, ou le partage est coupé : rien n'est rangé.
    case ignored
    /// Hors ligne ou refusé : la prochaine sonde reposera la question.
    case failed
}
