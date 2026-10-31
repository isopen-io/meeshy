import Foundation

/// LE LIEN ENTRE DEUX PERSONNES — l'échelle des niveaux, miroir de
/// `RELATION_LEVELS` (`packages/shared/types/relation.ts`, #13926).
///
/// Chaque personne ACCORDE un niveau à l'autre ; le niveau effectif est le
/// minimum des deux accords (aucun accès à sens unique). `ATOM` (lien
/// parent/tuteur) est RÉSERVÉ et n'appartient pas à l'échelle : une valeur
/// qu'on ne reconnaît pas se lit `public`, jamais un niveau plus haut
/// (fermé par défaut).
public enum RelationLevel: String, CaseIterable, Sendable, Comparable {
    case `public` = "PUBLIC"
    case community = "COMMUNITY"
    case acquaintance = "ACQUAINTANCE"
    case friend = "FRIEND"
    case close = "CLOSE"
    case blood = "BLOOD"

    /// `parseRelationLevel` : lecture EXACTE, tout le reste vaut `public`.
    public init(wire: String?) {
        self = wire.flatMap(RelationLevel.init(rawValue:)) ?? .public
    }

    private var rank: Int {
        switch self {
        case .public: return 0
        case .community: return 1
        case .acquaintance: return 2
        case .friend: return 3
        case .close: return 4
        case .blood: return 5
        }
    }

    public static func < (lhs: RelationLevel, rhs: RelationLevel) -> Bool {
        lhs.rank < rhs.rank
    }
}

/// Les actions que la loi d'accès gouverne — miroir de `RELATION_FEATURES` et
/// des tables de `packages/shared/utils/relation-levels.ts`, que
/// `RelationAccessCasesTests` relit ligne à ligne.
public enum RelationFeature: String, CaseIterable, Sendable, Decodable {
    case presenceOnline = "presence.online"
    case presenceDetailed = "presence.detailed"
    case gameBasic = "game.basic"
    case gameSparksGlory = "game.sparksGlory"
    case notifyNewContent = "notify.newContent"
    case relayCommentersOnMyPosts = "relay.commentersOnMyPosts"
    case relayMyCommentsElsewhere = "relay.myCommentsElsewhere"
    case dmDirect = "dm.direct"
    case audienceAcquaintances = "audience.acquaintances"
    case audienceClose = "audience.close"
    case audienceBlood = "audience.blood"
    case listeningCategory = "listening.category"
    case listeningTitle = "listening.title"
    case talkie
    case bring
    case locationLive = "location.live"
    case locationHistory = "location.history"
    case locationProximity = "location.proximity"
    case acquaintanceAuto = "acquaintance.auto"

    /// Niveau EFFECTIF minimal (`RELATION_FEATURE_MIN_LEVEL`). La Connaissance
    /// automatique CRÉE le premier lien : sa seule garde est l'âge déclaré.
    public var minimumLevel: RelationLevel {
        switch self {
        case .presenceOnline, .gameBasic, .bring: return .friend
        case .presenceDetailed, .gameSparksGlory, .notifyNewContent, .relayCommentersOnMyPosts,
             .audienceClose, .listeningCategory, .talkie: return .close
        case .relayMyCommentsElsewhere, .audienceBlood, .listeningTitle,
             .locationLive, .locationHistory, .locationProximity: return .blood
        case .dmDirect, .audienceAcquaintances: return .acquaintance
        case .acquaintanceAuto: return .public
        }
    }

    /// Exige un consentement explicite et refusable, à tout âge
    /// (`RELATION_CONSENT_FEATURES`) — jamais un refus d'âge.
    public var requiresConsent: Bool {
        switch self {
        case .bring, .talkie, .listeningCategory, .listeningTitle,
             .locationLive, .locationHistory, .locationProximity: return true
        default: return false
        }
    }

    /// Adressée à UNE AUTRE personne : sans sens envers soi-même
    /// (`RELATION_DIRECTED_FEATURES`).
    public var isDirected: Bool {
        switch self {
        case .bring, .talkie, .acquaintanceAuto: return true
        default: return false
        }
    }

    /// Les seules features qu'ADMIN/BIGBOSS lit sans lien (`RELATION_PRESENCE_FEATURES`).
    public var isPresence: Bool {
        self == .presenceOnline || self == .presenceDetailed
    }
}

/// Âge DÉCLARÉ (`DeclaredAgeClass`) : `unknown` n'est jamais traité en majeur.
public enum RelationAgeClass: String, Sendable, Decodable {
    case minor, adult, unknown
}

/// Consentement résolu par le serveur ; absent se lit `unknown` (fermé).
public enum RelationConsent: String, Sendable, Decodable {
    case granted, refused, unknown
}

public enum RelationAccessReason: String, CaseIterable, Sendable {
    case level, blocked, minor, role, consent
    case own = "self"
}

public struct RelationAccessInput: Sendable, Equatable {
    public let viewerId: String
    public let targetId: String
    public let grantedByViewer: RelationLevel
    public let grantedByTarget: RelationLevel
    public let sharesCommunity: Bool
    public let blockedEitherWay: Bool
    public let viewerMinor: RelationAgeClass
    public let targetMinor: RelationAgeClass
    public let viewerRole: PlatformRole?
    public let feature: RelationFeature
    public let consent: RelationConsent?

    public init(
        viewerId: String, targetId: String,
        grantedByViewer: RelationLevel, grantedByTarget: RelationLevel,
        sharesCommunity: Bool, blockedEitherWay: Bool,
        viewerMinor: RelationAgeClass, targetMinor: RelationAgeClass,
        viewerRole: PlatformRole?, feature: RelationFeature, consent: RelationConsent?
    ) {
        self.viewerId = viewerId
        self.targetId = targetId
        self.grantedByViewer = grantedByViewer
        self.grantedByTarget = grantedByTarget
        self.sharesCommunity = sharesCommunity
        self.blockedEitherWay = blockedEitherWay
        self.viewerMinor = viewerMinor
        self.targetMinor = targetMinor
        self.viewerRole = viewerRole
        self.feature = feature
        self.consent = consent
    }
}

/// LA LOI D'ACCÈS DES CERCLES — miroir de `resolveRelationAccess`
/// (`packages/shared/utils/relation-access.ts`, #13927), rejoué sur les cas
/// COMMUNS `packages/shared/fixtures/relation-access-cases.json`.
///
/// Le miroir ne décide d'AUCUN accès : le serveur reste l'autorité. Il sert à ne
/// pas PROPOSER une action qu'il refusera. Pur, sans état, sans I/O.
///
/// Ordre des verdicts : blocage, identité absente, soi, rôle (présence seule),
/// âge (Connaissance automatique seule), niveau, consentement.
public struct RelationAccess: Sendable, Equatable {
    public let allowed: Bool
    public let effectiveLevel: RelationLevel
    public let reason: RelationAccessReason
    public let requiresConsent: Bool

    /// Minimum des deux accords, relevé à `community` quand une communauté est
    /// partagée et que le lien serait sinon `public`.
    public static func combinedLevel(
        grantedByViewer: RelationLevel,
        grantedByTarget: RelationLevel,
        sharesCommunity: Bool
    ) -> RelationLevel {
        let granted = min(grantedByViewer, grantedByTarget)
        return granted == .public && sharesCommunity ? .community : granted
    }

    public static func resolve(_ input: RelationAccessInput) -> RelationAccess {
        let level = combinedLevel(
            grantedByViewer: input.grantedByViewer,
            grantedByTarget: input.grantedByTarget,
            sharesCommunity: input.sharesCommunity
        )
        let feature = input.feature

        if input.blockedEitherWay { return RelationAccess.denied(.blocked) }
        if input.viewerId.isEmpty || input.targetId.isEmpty { return RelationAccess.denied(.level) }
        if input.viewerId == input.targetId {
            return feature.isDirected
                ? RelationAccess.denied(.own)
                : RelationAccess(allowed: true, effectiveLevel: .blood, reason: .own, requiresConsent: false)
        }
        if input.viewerRole?.administers == true, feature.isPresence {
            return RelationAccess(allowed: true, effectiveLevel: level, reason: .role, requiresConsent: false)
        }
        if feature == .acquaintanceAuto, (input.viewerMinor == .minor) != (input.targetMinor == .minor) {
            return RelationAccess(allowed: false, effectiveLevel: level, reason: .minor, requiresConsent: false)
        }

        let reached = level >= feature.minimumLevel
        guard reached, feature.requiresConsent else {
            return RelationAccess(allowed: reached, effectiveLevel: level, reason: .level, requiresConsent: false)
        }
        let consented = input.consent == .granted
        return RelationAccess(
            allowed: consented, effectiveLevel: level,
            reason: consented ? .level : .consent, requiresConsent: true
        )
    }

    private static func denied(_ reason: RelationAccessReason) -> RelationAccess {
        RelationAccess(allowed: false, effectiveLevel: .public, reason: reason, requiresConsent: false)
    }
}
