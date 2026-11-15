import Foundation

/// Les trois temps du rituel (`RELATION_RITUAL_PHASES`, corps de `POST /relations/:userId/ritual`).
public enum RelationRitualPhase: String, Sendable, Equatable, Hashable, CaseIterable {
    case start, hold, confirm
}

/// Les quatre partages que le rituel présente un à un (`RELATION_RITUAL_CONSENT_KEYS`) :
/// explicites, refusables feature par feature, pour TOUS les âges (décision du porteur).
public enum RelationRitualConsentKey: String, Sendable, Equatable, Hashable, CaseIterable {
    case listeningTitle, locationLive, locationHistory, locationProximity
}

public struct RelationRitualConsents: Codable, Sendable, Equatable {
    public let listeningTitle: Bool
    public let locationLive: Bool
    public let locationHistory: Bool
    public let locationProximity: Bool

    public init(listeningTitle: Bool, locationLive: Bool, locationHistory: Bool, locationProximity: Bool) {
        self.listeningTitle = listeningTitle
        self.locationLive = locationLive
        self.locationHistory = locationHistory
        self.locationProximity = locationProximity
    }

    /// Tout refusé : l'état de départ, le seul sûr. Un partage n'est jamais accordé par défaut.
    public static let allRefused = RelationRitualConsents(
        listeningTitle: false, locationLive: false, locationHistory: false, locationProximity: false
    )

    public func isGranted(_ key: RelationRitualConsentKey) -> Bool {
        switch key {
        case .listeningTitle: return listeningTitle
        case .locationLive: return locationLive
        case .locationHistory: return locationHistory
        case .locationProximity: return locationProximity
        }
    }

    public func setting(_ key: RelationRitualConsentKey, to granted: Bool) -> RelationRitualConsents {
        RelationRitualConsents(
            listeningTitle: key == .listeningTitle ? granted : listeningTitle,
            locationLive: key == .locationLive ? granted : locationLive,
            locationHistory: key == .locationHistory ? granted : locationHistory,
            locationProximity: key == .locationProximity ? granted : locationProximity
        )
    }
}

/// Ce que rend une phase : `start` {token, requestId, expiresAt, holdWindowMs}, `hold`
/// {held, holdWindowMs}, `confirm` {completed, level?}. Tous les champs sont optionnels :
/// chaque phase n'en sert qu'une partie.
public struct RelationRitualStep: Decodable, Sendable, Equatable {
    public let token: String?
    public let requestId: String?
    public let expiresAt: String?
    public let holdWindowMs: Int?
    public let held: Bool?
    public let completed: Bool?
    public let level: String?

    public init(
        token: String? = nil,
        requestId: String? = nil,
        expiresAt: String? = nil,
        holdWindowMs: Int? = nil,
        held: Bool? = nil,
        completed: Bool? = nil,
        level: String? = nil
    ) {
        self.token = token
        self.requestId = requestId
        self.expiresAt = expiresAt
        self.holdWindowMs = holdWindowMs
        self.held = held
        self.completed = completed
        self.level = level
    }
}

/// Les refus TYPÉS du lien et du rituel (`RitualCode` et `RelationRequestRefusalCode`,
/// services/gateway/src/services/relations/bloodRitual.ts). Lus sur le `code` machine d'un
/// refus structuré — jamais sur la phrase, que la passerelle écrit en français.
public enum RelationRefusal: String, Sendable, Equatable {
    case ritualNoRequest = "RELATION_RITUAL_NO_REQUEST"
    case ritualInvalid = "RELATION_RITUAL_INVALID"
    case ritualNotSynchronised = "RELATION_RITUAL_NOT_SYNCHRONISED"
    case ritualLapsed = "RELATION_RITUAL_LAPSED"
    case ritualBusy = "RELATION_RITUAL_BUSY"
    case consentRequired = "RELATION_CONSENT_REQUIRED"
    case phaseSkip = "RELATION_PHASE_SKIP"
    case notEligible = "RELATION_NOT_ELIGIBLE"
    case cooldown = "RELATION_COOLDOWN"

    public static func from(_ error: Error) -> RelationRefusal? {
        guard case .rejected(let rejection)? = error as? MeeshyError, let code = rejection.code else { return nil }
        return RelationRefusal(rawValue: code)
    }
}
