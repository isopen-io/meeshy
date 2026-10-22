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

public object ApiRoutesApiLegacyMessages {
    public const val BULK_DELETE_FOR_ME: String = "api/messages/bulk/delete-for-me"
    public const val BY_MESSAGE_ID_DELETE_FOR_ME: String = "api/messages/{messageId}/delete-for-me"
    public const val BY_MESSAGE_ID_RESTORE_FOR_ME: String = "api/messages/{messageId}/restore-for-me"
}
