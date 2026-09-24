import Foundation

/// `GET /api/v1/links/:linkId/stats` (#7797).
///
/// Écrite à la main, et COMPOSÉE depuis l'adresse générée `.byLinkId` plutôt
/// que depuis un littéral : la route naît en parallèle côté passerelle (#7794)
/// et n'est pas encore dans `route-manifest.json`, d'où le catalogue généré
/// (`LinksEndpoint`) est dérivé. Quand le manifeste la portera, ce type cède
/// la place au cas généré.
struct ShareLinkStatsAddress: MeeshyEndpoint {
    let linkId: String

    var path: String { LinksEndpoint.byLinkId(linkId: linkId).path + "/stats" }
}
