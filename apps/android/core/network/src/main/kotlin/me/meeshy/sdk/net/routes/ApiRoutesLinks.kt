// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run android-endpoints:generate
//
// Les chemins sont relatifs au préfixe d'API (/api/v1/) ; les emplacements {nom}
// sont résolus par @Path. Les routes hors /api/v1 gardent leur chemin complet.

package me.meeshy.sdk.net.routes

public object ApiRoutesLinks {
    public const val BY_IDENTIFIER: String = "links/{identifier}"
    public const val BY_IDENTIFIER_CARD: String = "links/{identifier}/card"
    public const val BY_IDENTIFIER_MESSAGES: String = "links/{identifier}/messages"
    public const val BY_KEY_MEMBERS: String = "links/{key}/members"
    public const val BY_LINK_ID: String = "links/{linkId}"
    public const val BY_LINK_ID_ARRIVALS: String = "links/{linkId}/arrivals"
    public const val BY_LINK_ID_EXTEND: String = "links/{linkId}/extend"
    public const val BY_LINK_ID_STATS: String = "links/{linkId}/stats"
    public const val BY_LINK_ID_TOGGLE: String = "links/{linkId}/toggle"
    public const val CHECK_IDENTIFIER_BY_IDENTIFIER: String = "links/check-identifier/{identifier}"
    public const val MY_LINKS: String = "links/my-links"
    public const val ROOT: String = "links"
    public const val STATS: String = "links/stats"
}
