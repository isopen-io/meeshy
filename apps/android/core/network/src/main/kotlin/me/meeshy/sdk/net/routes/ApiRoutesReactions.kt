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

public object ApiRoutesReactions {
    public const val BY_MESSAGE_ID: String = "reactions/{messageId}"
    public const val BY_MESSAGE_ID_BY_EMOJI: String = "reactions/{messageId}/{emoji}"
    public const val ROOT: String = "reactions"
    public const val USER_BY_USER_ID: String = "reactions/user/{userId}"
}
