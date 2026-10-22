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

public object ApiRoutesNotifications {
    public const val ADMIN_CLEAR_ALL: String = "notifications/admin/clear-all"
    public const val BY_ID: String = "notifications/{id}"
    public const val BY_ID_READ: String = "notifications/{id}/read"
    public const val CONVERSATION_BY_CONVERSATION_ID_READ: String = "notifications/conversation/{conversationId}/read"
    public const val COUNTS: String = "notifications/counts"
    public const val POST_BY_POST_ID_READ: String = "notifications/post/{postId}/read"
    public const val READ: String = "notifications/read"
    public const val READ_ALL: String = "notifications/read-all"
    public const val READ_BY_TYPES: String = "notifications/read-by-types"
    public const val ROOT: String = "notifications"
    public const val UNREAD_COUNT: String = "notifications/unread-count"
}
