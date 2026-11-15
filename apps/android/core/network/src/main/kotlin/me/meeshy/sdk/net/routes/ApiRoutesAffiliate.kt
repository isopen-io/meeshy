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

public object ApiRoutesAffiliate {
    public const val BY_TOKEN_OG: String = "affiliate/{token}/og"
    public const val CLICK_BY_TOKEN: String = "affiliate/click/{token}"
    public const val REGISTER: String = "affiliate/register"
    public const val STATS: String = "affiliate/stats"
    public const val TOKENS: String = "affiliate/tokens"
    public const val TOKENS_BY_ID: String = "affiliate/tokens/{id}"
    public const val TRACK_VISIT: String = "affiliate/track-visit"
    public const val VALIDATE_BY_TOKEN: String = "affiliate/validate/{token}"
}
