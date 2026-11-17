import Foundation
import MeeshySDK

// MARK: - « Notre cercle » (#18870, planche `Autre-Cercle`)
//
// Le lien tel que `GET /relations` le sert dit le niveau COMMUN et MON accord, jamais celui de l'autre (RG-01 : le
// commun est le minimum des deux ; RG-07 : une baisse est silencieuse). Son accord se DÉDUIT donc du minimum, et seulement
// quand le minimum le trahit déjà : ce résumé ne révèle rien que le niveau commun ne dise. Pur, sans état, sans I/O.

/// Ce que l'autre m'accorde, tel que le lien le laisse lire.
nonisolated enum OurCircleTheirGrant: Equatable, Sendable {
    /// J'accorde plus que le commun : le commun est son accord.
    case exactly(RelationLevel)
    /// Mon accord est le commun : le sien est au moins celui-là, et la fiche n'en dit pas plus.
    case atLeast(RelationLevel)

    var level: RelationLevel {
        switch self {
        case .exactly(let level), .atLeast(let level): return level
        }
    }
}

/// Ce qui manque pour monter d'un cran.
nonisolated enum OurCircleMissing: Equatable, Sendable {
    /// Seul son accord retient le commun : « Il manque : que Léo t'accorde Sang ».
    case theirGrant(RelationLevel)
    /// Mon accord est le commun : chacun doit choisir le cran suivant.
    case bothChoose(RelationLevel)
    /// Ma demande est partie et attend sa réponse.
    case pending(RelationLevel)
}

/// Ce qu'un cercle ouvre, dit par la loi d'accès (`RelationFeature.minimumLevel`) : aucun seuil n'est réécrit ici.
/// L'ordre des cas est celui de la planche.
nonisolated enum OurCircleFeature: String, CaseIterable, Sendable {
    case write, presenceOnline, bring, sharedLocation
    case presenceDetailed, talkie, together, battery, unreachable
    case liveLocation, locationHistory, proximity, batteryPull

    var feature: RelationFeature {
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

    var title: String {
        switch self {
        case .write: return String(localized: "circles.ours.feature.write", defaultValue: "Vous écrire", bundle: .main)
        case .presenceOnline: return String(localized: "circles.ours.feature.presenceOnline", defaultValue: "Présence « en ligne »", bundle: .main)
        case .bring: return String(localized: "circles.ours.feature.bring", defaultValue: "Bring", bundle: .main)
        case .sharedLocation: return String(localized: "circles.ours.feature.sharedLocation", defaultValue: "Position partagée", bundle: .main)
        case .presenceDetailed: return String(localized: "circles.ours.feature.presenceDetailed", defaultValue: "Présence détaillée", bundle: .main)
        case .talkie: return String(localized: "circles.ours.feature.talkie", defaultValue: "Talkie", bundle: .main)
        case .together: return String(localized: "circles.ours.feature.together", defaultValue: "Ensemble", bundle: .main)
        case .battery: return String(localized: "circles.ours.feature.battery", defaultValue: "Batterie", bundle: .main)
        case .unreachable: return String(localized: "circles.ours.feature.unreachable", defaultValue: "Injoignable", bundle: .main)
        case .liveLocation: return String(localized: "circles.ours.feature.liveLocation", defaultValue: "Position continue", bundle: .main)
        case .locationHistory: return String(localized: "circles.ours.feature.locationHistory", defaultValue: "Historique 30 jours", bundle: .main)
        case .proximity: return String(localized: "circles.ours.feature.proximity", defaultValue: "Proximité", bundle: .main)
        case .batteryPull: return String(localized: "circles.ours.feature.batteryPull", defaultValue: "Batterie à la demande", bundle: .main)
        }
    }

    /// Le vocabulaire fixe de la planche (brief § 4), en SF Symbols.
    var systemImage: String {
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

/// Le contenu de la feuille « Notre cercle » pour un lien servi.
nonisolated struct OurCircleSummary: Equatable, Sendable {
    let common: RelationLevel
    let mine: RelationLevel
    let theirs: OurCircleTheirGrant
    let since: Date?
    let next: RelationLevel?
    let opened: [OurCircleFeature]
    let nextOpens: [OurCircleFeature]
    let missing: OurCircleMissing?

    static func make(_ link: RelationLink, pending: RelationLevel?) -> OurCircleSummary {
        let common = link.effectiveLevel
        let mine = max(link.grantedByMe, common)
        let next = RelationRequestRule.rung(after: common)
        return OurCircleSummary(
            common: common,
            mine: mine,
            theirs: mine > common ? .exactly(common) : .atLeast(common),
            since: link.since.flatMap { WireDate.date(from: $0) },
            next: next,
            opened: opened(at: common),
            nextOpens: next.map(addedBy:) ?? [],
            missing: missing(common: common, mine: mine, next: next, pending: pending)
        )
    }

    /// Ce que le cercle commun ouvre, du cran commun vers les plus bas.
    static func opened(at level: RelationLevel) -> [OurCircleFeature] {
        let open = OurCircleFeature.allCases.filter { $0.feature.minimumLevel <= level }
        return RelationLevel.allCases.reversed().flatMap { rung in open.filter { $0.feature.minimumLevel == rung } }
    }

    /// Ce que le cercle `level` ajoute à celui d'en dessous.
    static func addedBy(_ level: RelationLevel) -> [OurCircleFeature] {
        OurCircleFeature.allCases.filter { $0.feature.minimumLevel == level }
    }

    private static func missing(common: RelationLevel, mine: RelationLevel, next: RelationLevel?,
                                pending: RelationLevel?) -> OurCircleMissing? {
        guard let next else { return nil }
        if let pending, pending > common { return .pending(pending) }
        return mine > common ? .theirGrant(next) : .bothChoose(next)
    }
}
