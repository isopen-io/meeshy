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
    public const val BATTERY: String = "relations/battery"
    public const val BY_USER_ID: String = "relations/{userId}"
    public const val BY_USER_ID_BATTERY: String = "relations/{userId}/battery"
    public const val BY_USER_ID_BATTERY_PULL: String = "relations/{userId}/battery/pull"
    public const val BY_USER_ID_BATTERY_SETTINGS: String = "relations/{userId}/battery/settings"
    public const val BY_USER_ID_FALL_SETTINGS: String = "relations/{userId}/fall/settings"
    public const val BY_USER_ID_INACTIVITY_SETTINGS: String = "relations/{userId}/inactivity/settings"
    public const val BY_USER_ID_LEVEL: String = "relations/{userId}/level"
    public const val BY_USER_ID_LOCATION_HISTORY: String = "relations/{userId}/location/history"
    public const val BY_USER_ID_LOCATION_REQUEST: String = "relations/{userId}/location/request"
    public const val BY_USER_ID_PHONE_CALL_SETTINGS: String = "relations/{userId}/phone-call/settings"
    public const val BY_USER_ID_PHONE_REACHABILITY: String = "relations/{userId}/phone-reachability"
    public const val BY_USER_ID_PHONE_REACHABILITY_SETTINGS: String = "relations/{userId}/phone-reachability/settings"
    public const val BY_USER_ID_RITUAL: String = "relations/{userId}/ritual"
    public const val BY_USER_ID_SETTINGS: String = "relations/{userId}/settings"
    public const val CONFIG: String = "relations/config"
    public const val FALLS: String = "relations/falls"
    public const val INACTIVITY: String = "relations/inactivity"
    public const val LOCATIONS: String = "relations/locations"
    public const val LOCATIONS_MINE: String = "relations/locations/mine"
    public const val NOW_PLAYING: String = "relations/now-playing"
    public const val PHONE_CALLS: String = "relations/phone-calls"
    public const val PHONE_REACHABILITY: String = "relations/phone-reachability"
    public const val ROOT: String = "relations"
    public const val SUMMARY: String = "relations/summary"
}
