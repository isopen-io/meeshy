import Foundation

/// Les capacités que la fiche par cercle annonce, dans l'ordre où elle les montre — miroir de
/// `PROFILE_CAPABILITY_FEATURE` (`packages/shared/utils/profile-circle-view.ts`, #18861). Le nom est
/// la clé du fil ; la feature est celle de la loi d'accès dont chaque état est le verdict.
public enum ProfileCapability: String, CaseIterable, Sendable {
    case presence
    case presenceDetailed
    case game
    case gameSparks
    case directMessage
    case messageRequest
    case ring
    case talkie
    case together
    case bring
    case listeningCategory
    case listeningTitle
    case locationTemporary
    case locationLive
    case locationHistory
    case locationProximity
    case battery
    case batteryPull
    case unreachable

    public var feature: RelationFeature {
        switch self {
        case .presence: return .presenceOnline
        case .presenceDetailed: return .presenceDetailed
        case .game: return .gameBasic
        case .gameSparks: return .gameSparksGlory
        case .directMessage: return .dmDirect
        case .messageRequest: return .dmRequest
        case .ring: return .callRing
        case .talkie: return .talkie
        case .together: return .together
        case .bring: return .bring
        case .listeningCategory: return .listeningCategory
        case .listeningTitle: return .listeningTitle
        case .locationTemporary: return .locationTemporary
        case .locationLive: return .locationLive
        case .locationHistory: return .locationHistory
        case .locationProximity: return .locationProximity
        case .battery: return .deviceBattery
        case .batteryPull: return .deviceBatteryPull
        case .unreachable: return .deviceUnreachable
        }
    }
}

/// L'état d'une capacité : ouverte ou verrouillée, le cercle qui l'ouvre, et si elle passe par un
/// consentement. Un état ne porte JAMAIS la valeur protégée, ni le choix de la personne.
public struct ProfileCapabilityState: Sendable, Equatable {
    public let isOpen: Bool
    public let circle: RelationLevel
    public let consentRequired: Bool

    public init(isOpen: Bool, circle: RelationLevel, consentRequired: Bool) {
        self.isOpen = isOpen
        self.circle = circle
        self.consentRequired = consentRequired
    }
}

/// LA FICHE PAR CERCLE telle que `GET /directory/people/:handle?expand=circle` la sert, et sa
/// projection locale pour « Voir comme » (`seenAs`).
///
/// Le décodage FERME : seul `"open"` ouvre, un cercle illisible se lit au plancher de la loi (jamais
/// plus bas), une clé qu'un serveur plus récent ajouterait est ignorée sans faire tomber la fiche.
public struct ProfileCircleView: Sendable, Equatable, Decodable {
    public let isSelf: Bool
    public let level: RelationLevel
    public let sharesCommunity: Bool
    /// Une capacité absente ne s'adresse pas à ce lecteur (soi-même) ou n'est pas servie.
    public let capabilities: [ProfileCapability: ProfileCapabilityState]

    public init(isSelf: Bool, level: RelationLevel, sharesCommunity: Bool,
                capabilities: [ProfileCapability: ProfileCapabilityState]) {
        self.isSelf = isSelf
        self.level = level
        self.sharesCommunity = sharesCommunity
        self.capabilities = capabilities
    }

    public func state(of capability: ProfileCapability) -> ProfileCapabilityState? {
        capabilities[capability]
    }

    private enum CodingKeys: String, CodingKey {
        case isSelf, level, sharesCommunity, capabilities
    }

    private struct WireState: Decodable {
        let state: String?
        let circle: String?
        let consentRequired: Bool?
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        isSelf = (try? container.decodeIfPresent(Bool.self, forKey: .isSelf)) ?? false
        level = RelationLevel(wire: try? container.decodeIfPresent(String.self, forKey: .level))
        sharesCommunity = (try? container.decodeIfPresent(Bool.self, forKey: .sharesCommunity)) ?? false
        let wire = (try? container.decodeIfPresent([String: WireState].self, forKey: .capabilities)) ?? [:]
        capabilities = wire.reduce(into: [:]) { result, entry in
            guard let capability = ProfileCapability(rawValue: entry.key) else { return }
            result[capability] = Self.state(of: entry.value, for: capability.feature)
        }
    }

    private static func state(of wire: WireState, for feature: RelationFeature) -> ProfileCapabilityState {
        let circle = wire.circle.flatMap(RelationLevel.init(rawValue:)) ?? feature.minimumLevel
        return ProfileCapabilityState(
            isOpen: wire.state == "open",
            circle: circle,
            consentRequired: wire.consentRequired ?? feature.requiresConsent
        )
    }

    /// L'identifiant du lecteur SYNTHÉTIQUE de « Voir comme » (`SYNTHETIC_VIEWER`).
    static let syntheticViewerId = "viewer-as-circle"

    /// « Voir comme » sans le serveur — miroir de `resolveProfileCircleViewAs` : un lecteur ORDINAIRE
    /// du cercle `level` (rôle USER, âge inconnu), face au propriétaire RÉEL (son âge déclaré, son
    /// rôle). Chaque état est le verdict de `RelationAccess.resolve`, consentement supposé accordé :
    /// la fiche dit ce que le CERCLE ouvre, jamais le choix de la personne.
    public static func seenAs(
        _ level: RelationLevel,
        ownerId: String = "owner",
        ownerMinor: RelationAgeClass = .unknown,
        ownerRole: PlatformRole? = nil
    ) -> ProfileCircleView {
        let capabilities = ProfileCapability.allCases.reduce(into: [ProfileCapability: ProfileCapabilityState]()) { result, capability in
            let verdict = RelationAccess.resolve(RelationAccessInput(
                viewerId: syntheticViewerId, targetId: ownerId,
                grantedByViewer: level, grantedByTarget: level,
                sharesCommunity: false, blockedEitherWay: false,
                viewerMinor: .unknown, targetMinor: ownerMinor,
                viewerRole: .user, targetRole: ownerRole,
                feature: capability.feature, consent: .granted
            ))
            result[capability] = ProfileCapabilityState(
                isOpen: verdict.allowed,
                circle: capability.feature.minimumLevel,
                consentRequired: capability.feature.requiresConsent
            )
        }
        return ProfileCircleView(isSelf: false, level: level, sharesCommunity: false, capabilities: capabilities)
    }
}
