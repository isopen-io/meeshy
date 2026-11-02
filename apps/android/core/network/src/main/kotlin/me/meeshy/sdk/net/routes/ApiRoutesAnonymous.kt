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

public object ApiRoutesAnonymous {
    public const val JOIN_BY_LINK_ID: String = "anonymous/join/{linkId}"
    public const val LEAVE: String = "anonymous/leave"
    public const val LINK_BY_IDENTIFIER: String = "anonymous/link/{identifier}"
    public const val REFRESH: String = "anonymous/refresh"
}
