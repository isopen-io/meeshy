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

public object ApiRoutesTrackingLinks {
    public const val ADMIN_ALL: String = "tracking-links/admin/all"
    public const val ADMIN_BY_TOKEN_CLICKS: String = "tracking-links/admin/{token}/clicks"
    public const val BY_TOKEN: String = "tracking-links/{token}"
    public const val BY_TOKEN_CLICK: String = "tracking-links/{token}/click"
    public const val BY_TOKEN_CLICKS: String = "tracking-links/{token}/clicks"
    public const val BY_TOKEN_DEACTIVATE: String = "tracking-links/{token}/deactivate"
    public const val BY_TOKEN_REDIRECT_STATUS: String = "tracking-links/{token}/redirect-status"
    public const val BY_TOKEN_RESOLVE: String = "tracking-links/{token}/resolve"
    public const val BY_TOKEN_STATS: String = "tracking-links/{token}/stats"
    public const val CHECK_TOKEN_BY_TOKEN: String = "tracking-links/check-token/{token}"
    public const val CONVERSATION_BY_CONVERSATION_ID: String = "tracking-links/conversation/{conversationId}"
    public const val ROOT: String = "tracking-links"
    public const val STATS: String = "tracking-links/stats"
    public const val USER_ME: String = "tracking-links/user/me"
}
