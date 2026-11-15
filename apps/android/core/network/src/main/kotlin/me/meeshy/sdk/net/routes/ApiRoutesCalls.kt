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

public object ApiRoutesCalls {
    public const val ACTIVE: String = "calls/active"
    public const val BY_CALL_ID: String = "calls/{callId}"
    public const val BY_CALL_ID_PARTICIPANTS: String = "calls/{callId}/participants"
    public const val BY_CALL_ID_PARTICIPANTS_BY_PARTICIPANT_ID: String = "calls/{callId}/participants/{participantId}"
    public const val BY_CALL_ID_RECORDINGS_BY_RECORDING_ID_ATTACHMENT: String = "calls/{callId}/recordings/{recordingId}/attachment"
    public const val BY_CALL_ID_TRANSCRIPT: String = "calls/{callId}/transcript"
    public const val HISTORY: String = "calls/history"
    public const val HISTORY_BY_CALL_ID: String = "calls/history/{callId}"
    public const val ROOT: String = "calls"
}
