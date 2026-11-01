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

public object ApiRoutesRelations {
    public const val BY_USER_ID: String = "relations/{userId}"
    public const val BY_USER_ID_LEVEL: String = "relations/{userId}/level"
    public const val BY_USER_ID_RITUAL: String = "relations/{userId}/ritual"
    public const val CONFIG: String = "relations/config"
    public const val ROOT: String = "relations"
}
