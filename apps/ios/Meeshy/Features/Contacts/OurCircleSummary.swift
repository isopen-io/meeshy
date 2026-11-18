import Foundation
import MeeshySDK
import MeeshyUI

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

/// Le contenu de la feuille « Notre cercle » pour un lien servi.
nonisolated struct OurCircleSummary: Equatable, Sendable {
    let common: RelationLevel
    let mine: RelationLevel
    let theirs: OurCircleTheirGrant
    let since: Date?
    let next: RelationLevel?
    let opened: [RelationCapability]
    let nextOpens: [RelationCapability]
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
            nextOpens: next.map(addedBy) ?? [],
            missing: missing(common: common, mine: mine, next: next, pending: pending)
        )
    }

    /// Ce que le cercle commun ouvre, du cran commun vers les plus bas — le catalogue du SDK, celui de « Pas encore
    /// ouvert » sur la face Actions.
    static func opened(at level: RelationLevel) -> [RelationCapability] {
        RelationCapability.opened(at: level)
    }

    /// Ce que le cercle `level` ajoute à celui d'en dessous.
    static func addedBy(_ level: RelationLevel) -> [RelationCapability] {
        RelationCapability.addedBy(level)
    }

    private static func missing(common: RelationLevel, mine: RelationLevel, next: RelationLevel?,
                                pending: RelationLevel?) -> OurCircleMissing? {
        guard let next else { return nil }
        if let pending, pending > common { return .pending(pending) }
        return mine > common ? .theirGrant(next) : .bothChoose(next)
    }
}
