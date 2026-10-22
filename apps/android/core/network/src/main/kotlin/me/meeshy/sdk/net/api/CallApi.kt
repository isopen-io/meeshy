package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.CallHistoryCleared
import me.meeshy.sdk.model.call.CallHistoryRemoval
import me.meeshy.sdk.model.call.CallRecordingLink
import me.meeshy.sdk.model.call.CallRecordingLinkRequest
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.model.call.InitiateCallRequest
import me.meeshy.sdk.model.call.JoinCallRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Le cycle de vie REST d'un appel — `services/gateway/src/routes/calls-lifecycle.ts`,
 * `calls-consultation.ts` et `calls-recording.ts`. Port de `CallsEndpoint` (iOS).
 *
 * Le temps réel d'un appel (signalisation, présence, sous-titres) reste sur
 * Socket.IO ; cette interface est la voie REST — lancer, rejoindre ou quitter
 * quand le socket n'y est pas (reprise après relance, action d'une notification),
 * relire une session, rattacher un enregistrement, relire la transcription et
 * tenir son propre journal. Le journal paginé (`GET /calls/history`) est
 * [CallHistoryApi], l'appel actif (`GET /calls/active`) [ActiveCallApi].
 *
 * Toute réponse qui rend une session (`callSessionSchema`) se décode en
 * [ActiveCallSession].
 */
interface CallApi {
    /** Lance un appel (201). Plafonné à 5 requêtes par minute côté serveur ; 403 `CALL_NOT_ALLOWED` si la conversation ne l'admet pas. */
    @POST("calls")
    suspend fun initiate(@Body body: InitiateCallRequest): ApiResponse<ActiveCallSession>

    /** Relit une session d'appel : état, participants, durée. Réservé aux membres de la conversation. */
    @GET("calls/{callId}")
    suspend fun details(@Path("callId") callId: String): ApiResponse<ActiveCallSession>

    /**
     * Termine l'appel pour tout le monde. [reason] vaut `rejected` pour REFUSER
     * un appel qui sonne sans l'avoir rejoint (l'action « Refuser » d'une
     * notification, qui n'a pas de socket) ; absent, c'est une fin ordinaire.
     */
    @DELETE("calls/{callId}")
    suspend fun end(
        @Path("callId") callId: String,
        @Query("reason") reason: String? = null,
    ): ApiResponse<ActiveCallSession>

    /** Rejoint un appel actif. Le corps est optionnel côté serveur : `JoinCallRequest()` envoie `{}`. */
    @POST("calls/{callId}/participants")
    suspend fun join(
        @Path("callId") callId: String,
        @Body body: JoinCallRequest,
    ): ApiResponse<ActiveCallSession>

    /**
     * Retire un participant : soi-même, ou un autre quand on est modérateur ou
     * l'initiateur de l'appel. Le serveur dérive le participant de la
     * conversation d'après l'identité de l'appelant ; [participantId] est la clé
     * du roster que l'écran a sous les yeux.
     */
    @DELETE("calls/{callId}/participants/{participantId}")
    suspend fun leave(
        @Path("callId") callId: String,
        @Path("participantId") participantId: String,
    ): ApiResponse<ActiveCallSession>

    /**
     * Rattache le fichier téléversé d'un enregistrement CONSENTI à la bulle
     * d'appel. Seul celui qui a enregistré peut le faire, une fois, avec un
     * attachment audio (ou vidéo) qu'il a téléversé lui-même.
     */
    @POST("calls/{callId}/recordings/{recordingId}/attachment")
    suspend fun linkRecording(
        @Path("callId") callId: String,
        @Path("recordingId") recordingId: String,
        @Body body: CallRecordingLinkRequest,
    ): ApiResponse<CallRecordingLink>

    /**
     * Rejoue le journal de transcription persisté d'un appel (segments finaux et
     * leurs traductions, dans l'ordre de capture). DONNÉE SENSIBLE : réservée
     * aux participants EFFECTIFS de l'appel, jamais journalisée.
     */
    @GET("calls/{callId}/transcript")
    suspend fun transcript(
        @Path("callId") callId: String,
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<CallTranscriptPage>

    /** Retire UN appel du journal de cet utilisateur — les autres membres le gardent. 404 si l'appel n'est dans aucune de ses conversations. */
    @DELETE("calls/history/{callId}")
    suspend fun removeFromHistory(@Path("callId") callId: String): ApiResponse<CallHistoryRemoval>

    /** Vide le journal de cet utilisateur (la fenêtre de 3 mois). Les autres membres gardent le leur. */
    @DELETE("calls/history")
    suspend fun clearHistory(): ApiResponse<CallHistoryCleared>
}
