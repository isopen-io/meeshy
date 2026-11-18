import Foundation
import MeeshySDK

// MARK: - Ce qu'un cercle ouvre (#18870, loi 4)
//
// UN catalogue, lu par la face Actions (« Pas encore ouvert ») comme par « Notre cercle » (ouvert, le cran suivant,
// une proposition reçue) : chaque capacité nommée de la loi d'accès, son libellé et son glyphe. Le cercle qui l'ouvre
// est celui de la loi (`RelationFeature.minimumLevel`) : aucun seuil n'est réécrit ici.

/// Une capacité qu'un cercle ouvre. L'ordre des cas est celui de la planche `Autre-Cercle`.
public nonisolated enum RelationCapability: String, CaseIterable, Sendable {
    case write, presenceOnline, bring, sharedLocation
    case presenceDetailed, talkie, together, battery, unreachable
    case liveLocation, locationHistory, proximity, batteryPull

    public var feature: RelationFeature {
        switch self {
        case .write: return .dmDirect
        case .presenceOnline: return .presenceOnline
        case .bring: return .bring
        case .sharedLocation: return .locationTemporary
        case .presenceDetailed: return .presenceDetailed
        case .talkie: return .talkie
        case .together: return .together
        case .battery: return .deviceBattery
        case .unreachable: return .deviceUnreachable
        case .liveLocation: return .locationLive
        case .locationHistory: return .locationHistory
        case .proximity: return .locationProximity
        case .batteryPull: return .deviceBatteryPull
        }
    }

    public var opensAt: RelationLevel { feature.minimumLevel }

    /// Ce que le cercle `level` ouvre, du cercle `level` vers les plus bas.
    public static func opened(at level: RelationLevel) -> [RelationCapability] {
        RelationLevel.allCases.reversed().filter { $0 <= level }.flatMap { addedBy($0) }
    }

    /// Ce que le cercle `level` ajoute à celui d'en dessous.
    public static func addedBy(_ level: RelationLevel) -> [RelationCapability] {
        allCases.filter { $0.opensAt == level }
    }

    /// Ce qui reste fermé au cercle `level`, groupé par cercle qui l'ouvre, du plus proche au plus lointain.
    public static func lockedGroups(at level: RelationLevel) -> [ProfileRelationLockedGroup] {
        RelationLevel.allCases.filter { $0 > level }.compactMap { opening in
            let capabilities = addedBy(opening)
            return capabilities.isEmpty ? nil : ProfileRelationLockedGroup(opensAt: opening, capabilities: capabilities)
        }
    }

    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module`.
    @MainActor public var title: String {
        switch self {
        case .write: return String(localized: "circles.ours.feature.write", defaultValue: "Vous écrire", bundle: .module)
        case .presenceOnline: return String(localized: "circles.ours.feature.presenceOnline", defaultValue: "Présence « en ligne »", bundle: .module)
        case .bring: return String(localized: "circles.ours.feature.bring", defaultValue: "Bring", bundle: .module)
        case .sharedLocation: return String(localized: "circles.ours.feature.sharedLocation", defaultValue: "Position partagée", bundle: .module)
        case .presenceDetailed: return String(localized: "circles.ours.feature.presenceFull", defaultValue: "Présence détaillée", bundle: .module)
        case .talkie: return String(localized: "circles.ours.feature.talkie", defaultValue: "Talkie", bundle: .module)
        case .together: return String(localized: "circles.ours.feature.together", defaultValue: "Ensemble", bundle: .module)
        case .battery: return String(localized: "circles.ours.feature.battery", defaultValue: "Batterie", bundle: .module)
        case .unreachable: return String(localized: "circles.ours.feature.unreachable", defaultValue: "Injoignable", bundle: .module)
        case .liveLocation: return String(localized: "circles.ours.feature.liveLocation", defaultValue: "Position continue", bundle: .module)
        case .locationHistory: return String(localized: "circles.ours.feature.locationHistory", defaultValue: "Historique 30 jours", bundle: .module)
        case .proximity: return String(localized: "circles.ours.feature.proximity", defaultValue: "Proximité", bundle: .module)
        case .batteryPull: return String(localized: "circles.ours.feature.batteryPull", defaultValue: "Batterie à la demande", bundle: .module)
        }
    }

    /// Le vocabulaire fixe de la planche (brief § 4), en SF Symbols.
    public var systemImage: String {
        switch self {
        case .write: return "bubble.left"
        case .presenceOnline: return "circle.fill"
        case .bring: return "hand.wave"
        case .sharedLocation: return "mappin.and.ellipse"
        case .presenceDetailed: return "eye"
        case .talkie: return "radio"
        case .together: return "play.tv"
        case .battery: return "battery.50percent"
        case .unreachable: return "phone.down"
        case .liveLocation: return "location.fill"
        case .locationHistory: return "clock.arrow.circlepath"
        case .proximity: return "dot.radiowaves.left.and.right"
        case .batteryPull: return "battery.100percent.bolt"
        }
    }
}

/// Les capacités qu'un même cercle ouvrirait : une seule rangée verrouillée (K37) « Talkie et Ensemble · dès Proche ».
public nonisolated struct ProfileRelationLockedGroup: Equatable, Sendable {
    public let opensAt: RelationLevel
    public let capabilities: [RelationCapability]

    public init(opensAt: RelationLevel, capabilities: [RelationCapability]) {
        self.opensAt = opensAt
        self.capabilities = capabilities
    }

    /// Les noms joints selon la langue (« Talkie, Ensemble et Batterie »).
    @MainActor public func title(locale: Locale = .current) -> String {
        let formatter = ListFormatter()
        formatter.locale = locale
        let titles = capabilities.map(\.title)
        return formatter.string(from: titles) ?? titles.joined(separator: ", ")
    }

    /// Ce qui l'ouvre, dit sur la rangée verrouillée : « dès Ami ».
    @MainActor public var requirement: String {
        ProfileRelationLockedGroup.requirement(opensAt: opensAt)
    }

    @MainActor public static func requirement(opensAt level: RelationLevel) -> String {
        switch level {
        case .public: return String(localized: "profile.relation.opensAt.public", defaultValue: "pour tous", bundle: .module)
        case .community: return String(localized: "profile.relation.opensAt.community", defaultValue: "dès Communauté", bundle: .module)
        case .acquaintance: return String(localized: "profile.relation.opensAt.acquaintance", defaultValue: "dès Connaissance", bundle: .module)
        case .friend: return String(localized: "profile.relation.opensAt.friend", defaultValue: "dès Ami", bundle: .module)
        case .close: return String(localized: "profile.relation.opensAt.close", defaultValue: "dès Proche", bundle: .module)
        case .blood: return String(localized: "profile.relation.opensAt.blood", defaultValue: "dès Sang", bundle: .module)
        }
    }

    /// Le glyphe de la première capacité du groupe.
    public var systemImage: String {
        capabilities.first?.systemImage ?? "lock"
    }
}
