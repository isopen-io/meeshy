import Foundation

// « CHUTE DÉTECTÉE » (#18748, SAN-01) — la lecture Swift du contrat `packages/shared/types/fall-detection.ts`.
//
// Donnée de santé (art. 9 RGPD) : rien n'est collecté sans l'ACCORD EXPLICITE de la personne, jamais actif par défaut.
// L'iPhone lit HealthKit (`numberOfTimesFallen`) et rapporte `POST /me/health/fall { detectedAt }` — un instant, aucune
// autre donnée de santé. Chaque Sang autorisé reçoit un push GÉNÉRIQUE (`safety_alert`, aucun mot de santé chez Apple)
// et `fall:detected` dans sa room : l'instant tronqué à la minute, l'expiration, la dernière position et la dernière
// batterie SEULEMENT s'il les reçoit déjà. « Je vais bien » clôt l'épisode (`fall:cleared`). Jamais un message.
// Les charges DESCENDANTES tolèrent un champ inconnu, une annonce inconnue (ignorée) et une raison inconnue (`withdrawn`).

public enum FallDetectionContract {
    /// `FALL_DETECTION_CONFIG.episodeTtlMinutes` : un épisode n'est plus servi 6 h après la chute.
    public static let episodeTtl: TimeInterval = 360 * 60
    /// `FALL_DETECTION_CONFIG.maxReportAgeMinutes` : une chute plus vieille est refusée (l'alerte serait trompeuse).
    public static let maxReportAge: TimeInterval = 30 * 60
    /// `SAFETY_ALERT_PUSH_TYPE` : le push est générique, « alerte de sécurité ».
    public static let safetyAlertPushType = "safety_alert"
    /// La levée de l'alerte, poussée sous le même `collapseId` : elle remplace l'alerte et retire l'état.
    public static let safetyAlertClearedPushType = "safety_alert_cleared"
    /// La catégorie iOS du push (`SAFETY_ALERT_PUSH_CATEGORY`).
    public static let safetyAlertCategory = "MEESHY_SAFETY_ALERT"
}

/// `FALL_CLEARED_REASONS`. Une raison inconnue de ce client se lit `withdrawn` : l'état ne m'est plus servi.
public enum FallClearedReason: String, Sendable, Equatable, CaseIterable {
    case responded
    case expired
    case withdrawn
}

/// `FallState` — l'état servi À MOI : `userId` est tombé à `detectedAt` (à la minute) ; l'épisode cesse à `expiresAt`.
/// Une position ou une batterie illisible se tait.
public struct FallState: Sendable, Equatable, Codable {
    public let userId: String
    public let detectedAt: Date
    public let expiresAt: Date
    public let lastPosition: InactivityLastPosition?
    public let lastBattery: InactivityLastBattery?

    public init(userId: String, detectedAt: Date, expiresAt: Date,
                lastPosition: InactivityLastPosition? = nil, lastBattery: InactivityLastBattery? = nil) {
        self.userId = userId
        self.detectedAt = detectedAt
        self.expiresAt = expiresAt
        self.lastPosition = lastPosition
        self.lastBattery = lastBattery
    }

    /// Passé `expiresAt`, l'épisode ne s'affiche plus : l'expiration est silencieuse côté serveur.
    public func isExpired(at now: Date) -> Bool {
        now >= expiresAt
    }

    /// Ce qui peut se ranger au repos : tout, sauf la dernière position (#16984, leçon de TEL-02).
    public var withoutPosition: FallState {
        FallState(userId: userId, detectedAt: detectedAt, expiresAt: expiresAt, lastBattery: lastBattery)
    }

    private enum CodingKeys: String, CodingKey { case userId, detectedAt, expiresAt, lastPosition, lastBattery }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        self.init(
            userId: userId,
            detectedAt: try InactivityWire.instant(c, .detectedAt),
            expiresAt: try InactivityWire.instant(c, .expiresAt),
            lastPosition: (try? c.decodeIfPresent(InactivityLastPosition.self, forKey: .lastPosition)) ?? nil,
            lastBattery: (try? c.decodeIfPresent(InactivityLastBattery.self, forKey: .lastBattery)) ?? nil
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(WireDate.string(from: detectedAt), forKey: .detectedAt)
        try c.encode(WireDate.string(from: expiresAt), forKey: .expiresAt)
        try c.encodeIfPresent(lastPosition, forKey: .lastPosition)
        try c.encodeIfPresent(lastBattery, forKey: .lastBattery)
    }
}

/// `fall:detected` — l'état servi ; `announcedAt` non nul quand l'annonce doit défiler dans la SyncPill.
public struct FallDetected: Decodable, Sendable, Equatable {
    public let userId: String
    public let state: FallState
    public let announcedAt: Date?

    public init(userId: String, state: FallState, announcedAt: Date? = nil) {
        self.userId = userId
        self.state = state
        self.announcedAt = announcedAt
    }

    private enum CodingKeys: String, CodingKey { case userId, state, announcement }
    private enum AnnouncementKeys: String, CodingKey { case kind, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let state = try c.decode(FallState.self, forKey: .state)
        let userId = (try? c.decode(String.self, forKey: .userId)) ?? state.userId
        guard userId == state.userId else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "état d'une autre personne")
        }
        self.init(userId: userId, state: state, announcedAt: Self.announcedAt(c))
    }

    private static func announcedAt(_ c: KeyedDecodingContainer<CodingKeys>) -> Date? {
        guard let announcement = try? c.nestedContainer(keyedBy: AnnouncementKeys.self, forKey: .announcement),
              (try? announcement.decode(String.self, forKey: .kind)) == "detected" else { return nil }
        return try? InactivityWire.instant(announcement, .at)
    }
}

/// `fall:cleared` — la personne a répondu, l'épisode a expiré, ou il ne m'est plus servi : l'état disparaît.
public struct FallCleared: Decodable, Sendable, Equatable {
    public let userId: String
    public let reason: FallClearedReason

    public init(userId: String, reason: FallClearedReason) {
        self.userId = userId
        self.reason = reason
    }

    private enum CodingKeys: String, CodingKey { case userId, reason }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        let raw = (try? c.decodeIfPresent(String.self, forKey: .reason)) ?? nil
        self.init(userId: userId, reason: raw.flatMap(FallClearedReason.init(rawValue:)) ?? .withdrawn)
    }
}

/// `GET /relations/falls` — les épisodes en cours servis à moi. Un élément illisible est écarté.
public struct FallSnapshot: Decodable, Sendable, Equatable {
    public let items: [FallState]

    public init(items: [FallState]) {
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([Lenient].self, forKey: .items)) ?? nil
        items = (lenient ?? []).compactMap(\.value)
    }

    private struct Lenient: Decodable {
        let value: FallState?

        init(from decoder: Decoder) throws {
            value = try? FallState(from: decoder)
        }
    }
}

/// `fallReportSchema` — strict : `{detectedAt}`, un instant, aucune autre donnée de santé.
public struct FallReport: Encodable, Sendable, Equatable {
    public let detectedAt: Date

    public init(detectedAt: Date) {
        self.detectedAt = detectedAt
    }

    private enum CodingKeys: String, CodingKey { case detectedAt }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(WireDate.string(from: detectedAt), forKey: .detectedAt)
    }
}

/// Ce que la passerelle a répondu au rapport d'une chute.
public enum FallReportOutcome: Sendable, Equatable {
    /// Un épisode neuf : mes Sangs sont prévenus.
    case recorded
    /// La chute appartient à l'épisode en cours : rien n'est repoussé.
    case deduplicated
    /// 403 `FALL_CONSENT_REQUIRED` : l'accord n'est plus là — la collecte s'arrête sur cet appareil.
    case consentRequired
    /// 400 (trop ancienne, dans le futur) : la chute ne sera jamais acceptée, inutile de la renvoyer.
    case rejected
    /// Hors ligne ou erreur serveur : le rapport est à refaire.
    case failed
}

/// `FallConsentSettings` — mon accord explicite et la version du texte en vigueur ; un texte changé se reconsent.
public struct FallConsentSettings: Decodable, Sendable, Equatable {
    public let consentedAt: Date?
    public let consentVersion: String?
    public let currentVersion: String

    public init(consentedAt: Date?, consentVersion: String?, currentVersion: String) {
        self.consentedAt = consentedAt
        self.consentVersion = consentVersion
        self.currentVersion = currentVersion
    }

    /// L'accord vaut seulement s'il porte sur le texte en vigueur.
    public var isConsented: Bool {
        consentedAt != nil && consentVersion == currentVersion
    }

    private enum CodingKeys: String, CodingKey { case consentedAt, consentVersion, currentVersion }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let at = (try? c.decodeIfPresent(String.self, forKey: .consentedAt)) ?? nil
        self.init(consentedAt: at.flatMap(WireDate.date(from:)),
                  consentVersion: (try? c.decodeIfPresent(String.self, forKey: .consentVersion)) ?? nil,
                  currentVersion: try c.decode(String.self, forKey: .currentVersion))
    }
}

/// `fallConsentUpdateSchema` — strict : `{consented: true, version}` ou `{consented: false}`.
public struct FallConsentUpdate: Encodable, Sendable, Equatable {
    public let version: String?

    /// L'accord donné, sur la version lue à l'écran.
    public static func consent(version: String) -> FallConsentUpdate { FallConsentUpdate(version: version) }
    /// Le retrait : la collecte s'arrête, l'épisode s'efface chez mes Sangs.
    public static let withdraw = FallConsentUpdate(version: nil)

    private enum CodingKeys: String, CodingKey { case consented, version }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version != nil, forKey: .consented)
        try c.encodeIfPresent(version, forKey: .version)
    }
}

/// Ce que la passerelle a répondu à un changement d'accord.
public enum FallConsentOutcome: Sendable, Equatable {
    case saved(FallConsentSettings)
    /// 403 `FALL_CONSENT_MINOR` : l'accord est réservé aux 15 ans et plus.
    case minor
    /// 400 `FALL_CONSENT_VERSION_STALE` : le texte lu n'est plus en vigueur, il faut le relire.
    case staleVersion
    case failed
}

/// `FallPersonSettings` — `isShared` (clé `shared`) : cette personne est-elle prévenue si ma montre détecte une chute ?
public struct FallPersonSettings: Codable, Sendable, Equatable {
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

/// `fallPersonSettingsUpdateSchema` — strict : `{shared}` et rien d'autre.
public struct FallPersonSettingsUpdate: Encodable, Sendable, Equatable {
    public let isShared: Bool

    public init(isShared: Bool) {
        self.isShared = isShared
    }

    private enum CodingKeys: String, CodingKey {
        case isShared = "shared"
    }
}
