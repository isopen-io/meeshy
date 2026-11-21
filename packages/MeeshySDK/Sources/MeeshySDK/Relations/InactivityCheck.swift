import Foundation

// LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02) — la lecture Swift du contrat `packages/shared/types/inactivity-check.ts`.
// Même forme que le téléphone injoignable (#18737), sur le même téléphone suivi.
//
// JAMAIS un message de conversation. Le serveur juge l'inactivité, pose « Tout va bien ? » à la personne et prévient ses
// Sangs sans réponse : ce fichier ne porte que ce qui voyage. Les charges DESCENDANTES tolèrent un champ inconnu, une
// position ou une batterie illisible (tue, l'état reste) et une annonce d'un genre inconnu (ignorée, l'état reste).

public enum InactivityCheckContract {
    /// `INACTIVITY_CHECK_CONFIG.stateTtlSeconds` : aucun état ne vit plus longtemps, aucun historique.
    public static let stateTtl: TimeInterval = 259_200
    /// `WELLNESS_CHECK_NOTIFICATION_TYPE` : « Tout va bien ? », adressée à soi.
    public static let wellnessCheckNotificationType = "wellness_check"
    /// `INACTIVITY_ALERT_NOTIFICATION_TYPE` : l'alerte et le retour, poussés aux Sangs.
    public static let alertNotificationType = "inactivity_alert"
}

/// `INACTIVITY_DELAY_HOURS` et la coupure (`delayHours: null`) — le choix de la personne, pour tous.
public enum InactivityCheckDelay: String, Sendable, Equatable, CaseIterable {
    case sixHours
    case twelveHours
    case twentyFourHours
    case off

    /// `INACTIVITY_CHECK_CONFIG.defaultDelayHours`.
    public static let `default`: InactivityCheckDelay = .twelveHours

    /// Les heures servies, `nil` quand la vérification est coupée.
    public var hours: Int? {
        switch self {
        case .sixHours: return 6
        case .twelveHours: return 12
        case .twentyFourHours: return 24
        case .off: return nil
        }
    }

    /// `null` coupe ; un délai que ce client ne connaît pas se lit comme le défaut, jamais comme une coupure.
    public init(servedHours: Int?) {
        guard let servedHours else {
            self = .off
            return
        }
        self = Self.allCases.first { $0.hours == servedHours } ?? .default
    }
}

/// `InactivityCheckSettings` — `{ delayHours: 6 | 12 | 24 | null }`. Le corps envoyé porte TOUJOURS la clé : le schéma
/// serveur est strict, et `null` y est la coupure.
public struct InactivityCheckSettings: Codable, Sendable, Equatable {
    public let delay: InactivityCheckDelay

    public init(delay: InactivityCheckDelay) {
        self.delay = delay
    }

    private enum CodingKeys: String, CodingKey { case delayHours }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard c.contains(.delayHours) else {
            self.init(delay: .default)
            return
        }
        if try c.decodeNil(forKey: .delayHours) {
            self.init(delay: .off)
            return
        }
        let hours = try? c.decode(Int.self, forKey: .delayHours)
        self.init(delay: hours.map { InactivityCheckDelay(servedHours: $0) } ?? .default)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let hours = delay.hours {
            try c.encode(hours, forKey: .delayHours)
        } else {
            try c.encodeNil(forKey: .delayHours)
        }
    }
}

/// `InactivityCheckPersonSettings` — `isShared` (clé `shared`) : cette personne est-elle prévenue quand je ne réponds
/// pas ? Accordé par défaut entre Sangs, retirable.
public struct InactivityPersonSettings: Codable, Sendable, Equatable {
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

/// `inactivityCheckPersonSettingsUpdateSchema` — strict : `{shared}` et rien d'autre.
public struct InactivityPersonSettingsUpdate: Encodable, Sendable, Equatable {
    public let isShared: Bool

    public init(isShared: Bool) {
        self.isShared = isShared
    }

    private enum CodingKeys: String, CodingKey {
        case isShared = "shared"
    }
}

/// Ce que la passerelle a répondu à « Je vais bien » (`POST /me/wellness/ok`).
public enum WellnessAnswerOutcome: Sendable, Equatable {
    /// `tracked: true` — la réponse est rangée, les Sangs prévenus apprennent le retour.
    case tracked
    /// `tracked: false` — aucun téléphone suivi : rien n'était en cours.
    case ignored
    /// Hors ligne ou refusé : la question reste posée.
    case failed
}
