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

public object ApiRoutesDirectory {
    public const val AVAILABILITY: String = "directory/availability"
    public const val BLOCKS: String = "directory/blocks"
    public const val BLOCKS_BY_USER_ID: String = "directory/blocks/{userId}"
    public const val CONTACTS: String = "directory/contacts"
    public const val FRIEND_REQUESTS: String = "directory/friend-requests"
    public const val FRIEND_REQUESTS_BY_ID: String = "directory/friend-requests/{id}"
    public const val PEOPLE: String = "directory/people"
    public const val PEOPLE_BY_HANDLE: String = "directory/people/{handle}"
    public const val PRESENCE: String = "directory/presence"
}
