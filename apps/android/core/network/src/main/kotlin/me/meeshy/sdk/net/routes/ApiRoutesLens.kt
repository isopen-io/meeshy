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

public object ApiRoutesLens {
    public const val CREDITS: String = "lens/credits"
    public const val PARTNERS_BY_PARTNER_ID_LOGO: String = "lens/partners/{partnerId}/logo"
    public const val PARTNERS_BY_USER_ID_REVOKE: String = "lens/partners/{userId}/revoke"
    public const val PARTNERS_BY_USER_ID_VERIFY: String = "lens/partners/{userId}/verify"
    public const val PARTNERS_ME: String = "lens/partners/me"
    public const val PARTNERS_PENDING: String = "lens/partners/pending"
    public const val USAGE_BY_SLUG: String = "lens/usage/{slug}"
}
