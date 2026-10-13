import Foundation
import MeeshySDK

// MARK: - La découverte : recherche de personnes, résultats touchés, visites (#10505)

/// Ce qu'une recherche DIT au catalogue v2 : sa longueur, son nombre de
/// résultats, le rang du résultat touché — JAMAIS le texte saisi (l'empreinte
/// éventuelle est l'affaire de la passerelle, sur la requête de recherche
/// elle-même). Seule la recherche de PERSONNES est une découverte : chercher
/// dans ses messages n'en est pas une, et rien n'en part.
///
/// `searchId` est celui que la passerelle a SERVI avec les résultats
/// (`meta.searchId`) : elle n'ouvre que son propre scellé. Sans identifiant
/// servi, l'événement part sans — le client n'en fabrique pas.
nonisolated enum DiscoveryTelemetry {

    static func searchSubmitted(searchId: String?, query: String, peopleCount: Int, at date: Date = Date()) -> SocialEventV2? {
        let length = query.trimmingCharacters(in: .whitespacesAndNewlines).count
        guard length > 0 else { return nil }
        return SocialEventV2(
            occurredAt: date,
            target: nil,
            surface: .search,
            payload: .discovery(SocialDiscovery(action: .searchSubmitted, searchId: searchId, queryLength: length, resultCount: peopleCount, resultKind: .profile))
        )
    }

    static func profileResultTapped(searchId: String?, userId: String, position: Int, at date: Date = Date()) -> SocialEventV2 {
        SocialEventV2(
            occurredAt: date,
            target: SocialTarget(kind: .profile, id: userId),
            surface: .search,
            listing: SocialListing(position: position, rankingSource: .search),
            payload: .discovery(SocialDiscovery(action: .searchResultClick, searchId: searchId, resultKind: .profile))
        )
    }

    /// Sa propre page n'est pas une découverte.
    static func profileVisit(_ userId: String, viewerId: String?, at date: Date = Date()) -> SocialEventV2? {
        guard !userId.isEmpty, userId != viewerId else { return nil }
        return visit(.profileVisit, target: SocialTarget(kind: .profile, id: userId), surface: SocialSurface(.profile), at: date)
    }

    static func visit(_ action: SocialDiscovery.Action, target: SocialTarget, surface: SocialSurface? = nil, at date: Date = Date()) -> SocialEventV2 {
        SocialEventV2(occurredAt: date, target: target, surface: surface, payload: .discovery(SocialDiscovery(action: action)))
    }
}
