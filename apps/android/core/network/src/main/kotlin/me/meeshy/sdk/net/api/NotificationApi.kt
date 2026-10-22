package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MarkReadResponse
import me.meeshy.sdk.model.NotificationCounts
import me.meeshy.sdk.model.ReadNotificationsByTypesRequest
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.model.RegisterDeviceTokenResponse
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.model.UnregisterDeviceTokenRequest
import me.meeshy.sdk.model.UnregisterDeviceTokenResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * La boîte de notifications et l'enregistrement du jeton push — les routes de
 * `services/gateway/src/routes/notifications.ts` et `push-tokens.ts`.
 *
 * Chaque chemin ci-dessous EXISTE sur la passerelle : `RouteManifestRatchetTest`
 * le confronte à `route-manifest.json` et `NotificationRoutesExistOnGatewayTest`
 * aux sources de la passerelle. Les deux routes `device-token` d'avant n'y
 * existaient pas — l'enregistrement du jeton répondait 404 en silence, et le
 * désenregistrement (un `DELETE` avec corps, que Retrofit refuse) levait dès le
 * premier appel.
 */
interface NotificationApi {
    /**
     * The gateway returns `{ success, data: [...], pagination, unreadCount }` —
     * structurally an [ApiResponse] whose `data` is the notification list.
     *
     * `cursor` (#4901) : l'ancre KEYSET que la page précédente a servie
     * (`pagination.nextCursor`), relayée VERBATIM — le serveur tranche APRÈS
     * elle, insensible aux insertions en tête. `offset` reste formulable
     * (repli face à un gateway antérieur) ; le curseur GAGNE côté appelant :
     * quand il est donné, `offset` part nul.
     *
     * `types` et `hideReadTypes` sont des listes CSV de types BRUTS
     * ([me.meeshy.sdk.model.NotificationTypeSelection.csv]) : `types` ne garde
     * que ces types (un onglet de la cloche), `hideReadTypes` retire de la
     * liste les lignes DÉJÀ LUES de ces types (le contenu consommé). Le filtre
     * se joue en base, donc la pagination ne sert jamais de pages de lignes
     * invisibles. Absents ou vides : aucun filtre.
     */
    @GET("notifications")
    suspend fun list(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("unreadOnly") unreadOnly: Boolean? = null,
        @Query("cursor") cursor: String? = null,
        @Query("types") types: String? = null,
        @Query("hideReadTypes") hideReadTypes: String? = null,
    ): ApiResponse<List<ApiNotification>>

    /** Les totaux de toute la boîte par type brut — `{ success, data: { total, unread, byType } }`. */
    @GET("notifications/counts")
    suspend fun counts(): ApiResponse<NotificationCounts>

    /** Returns `{ success, count }` — no `data` envelope. */
    @GET("notifications/unread-count")
    suspend fun unreadCount(): UnreadCountResponse

    @POST("notifications/{id}/read")
    suspend fun markAsRead(@Path("id") notificationId: String): ApiResponse<ApiNotification>

    /** Returns `{ success, count }` — no `data` envelope. */
    @POST("notifications/read-all")
    suspend fun markAllAsRead(): MarkReadResponse

    /**
     * Le contenu d'une conversation est consommé (elle vient de s'ouvrir) : ses
     * notifications ne sont plus « non lues ». Idempotent côté serveur. `{ success, count }`.
     */
    @POST("notifications/conversation/{conversationId}/read")
    suspend fun markConversationAsRead(@Path("conversationId") conversationId: String): MarkReadResponse

    /**
     * Idem pour un post, une story ou un statut qu'on vient d'ouvrir : distinct
     * du « vu » du post, borné à la première vue, qui laisserait non lue toute
     * notification arrivée après. `{ success, count }`.
     */
    @POST("notifications/post/{postId}/read")
    suspend fun markPostAsRead(@Path("postId") postId: String): MarkReadResponse

    /**
     * Un écran consomme une catégorie entière (les demandes d'ami, par exemple) :
     * toutes les notifications de ces types passent à lu. Le corps compte 1 à 30
     * types — [me.meeshy.sdk.model.NotificationTypeSelection.readBatches] découpe.
     */
    @POST("notifications/read-by-types")
    suspend fun markTypesAsRead(@Body body: ReadNotificationsByTypesRequest): MarkReadResponse

    @DELETE("notifications/{id}")
    suspend fun delete(@Path("id") notificationId: String): ApiResponse<Unit>

    /**
     * Enregistre le jeton FCM de l'appareil (upsert par utilisateur, jeton et type).
     * Android envoie `platform = android` et `type = fcm`, jamais `apns`.
     */
    @POST("users/register-device-token")
    suspend fun registerDeviceToken(
        @Body body: RegisterDeviceTokenRequest,
    ): ApiResponse<RegisterDeviceTokenResponse>

    /**
     * Désenregistre un jeton ou tous ceux d'un appareil. `DELETE` AVEC corps :
     * Retrofit ne l'accepte que par `@HTTP(hasBody = true)` — `@DELETE` +
     * `@Body` lève à la création de la requête, au premier appel.
     */
    @HTTP(method = "DELETE", path = "users/register-device-token", hasBody = true)
    suspend fun unregisterDeviceToken(
        @Body body: UnregisterDeviceTokenRequest,
    ): ApiResponse<UnregisterDeviceTokenResponse>
}
