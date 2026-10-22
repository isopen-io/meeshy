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

public object ApiRoutesMessages {
    public const val BULK_DELETE_FOR_ME: String = "messages/bulk/delete-for-me"
    public const val BY_MESSAGE_ID: String = "messages/{messageId}"
    public const val BY_MESSAGE_ID_DELETE_FOR_ME: String = "messages/{messageId}/delete-for-me"
    public const val BY_MESSAGE_ID_READ_STATUS: String = "messages/{messageId}/read-status"
    public const val BY_MESSAGE_ID_RESTORE_FOR_ME: String = "messages/{messageId}/restore-for-me"
    public const val BY_MESSAGE_ID_STATUS_DETAILS: String = "messages/{messageId}/status-details"
    public const val BY_MESSAGE_ID_TRANSLATIONS: String = "messages/{messageId}/translations"
}
