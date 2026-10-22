package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.EmailInvitationRequest
import me.meeshy.sdk.model.EmailInvitationResponse
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestActionBody
import me.meeshy.sdk.model.FriendRequestActionResult
import me.meeshy.sdk.model.RespondFriendRequest
import me.meeshy.sdk.model.SendFriendRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface FriendApi {
    // #4254 — l'adresse CANONIQUE d'envoi (#4162) : elle porte l'union des
    // gardes des deux familles historiques, plus le blocage, qui n'existait
    // dans aucune.
    @POST("directory/friend-requests")
    suspend fun sendFriendRequest(@Body body: SendFriendRequest): ApiResponse<FriendRequest>

    // #4254 — la lecture CANONIQUE, par CURSEUR et dans les DEUX sens.
    // `pagination.nextCursor` est déjà déclaré sur `ApiResponse` (vérifié).
    // Les deux lectures par décalage plus bas restent servies jusqu'à ce que
    // leurs consommateurs basculent ; leur `offset` saute des lignes dès
    // qu'une demande est créée pendant la pagination.
    @GET("directory/friend-requests")
    suspend fun friendRequests(
        @Query("direction") direction: String = "received",
        @Query("status") status: String? = null,
        @Query("q") q: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<FriendRequest>>

    // #4162 — UN geste, UN verbe : accepter, refuser, annuler, écarter sont un
    // seul `PATCH … { action }`. Accepter / refuser rendent la demande (avec,
    // à l'acceptation, la conversation greffée par la passerelle).
    @PATCH("directory/friend-requests/{id}")
    suspend fun act(
        @Path("id") requestId: String,
        @Body body: FriendRequestActionBody,
    ): ApiResponse<FriendRequest>

    // Même adresse, autre forme de succès : `cancel` / `dismiss` SUPPRIMENT la
    // ligne et rendent `{ id, deleted, message }`. Un type distinct, tolérant,
    // parce qu'un type trop strict transformerait un succès serveur en échec
    // client (la file hors ligne ne serait jamais acquittée).
    @PATCH("directory/friend-requests/{id}")
    suspend fun actRemoving(
        @Path("id") requestId: String,
        @Body body: FriendRequestActionBody,
    ): ApiResponse<FriendRequestActionResult>

    // ── Alias historiques ──────────────────────────────────────────────────
    // Gardés COMPILABLES et SERVIS tant que des passerelles installées ne
    // connaissent pas la route canonique (repli rétrocompatible du dépôt) et
    // que leurs consommateurs n'ont pas basculé. Le retrait attend le décompte
    // des appels Android (#4275) : aucun nouveau site ne doit les appeler.

    @Deprecated("Lecture par décalage : saute des lignes. Utiliser friendRequests (curseur).")
    @GET("friend-requests/received")
    suspend fun receivedRequests(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<FriendRequest>>

    @Deprecated("Lecture par décalage : saute des lignes. Utiliser friendRequests (curseur).")
    @GET("friend-requests/sent")
    suspend fun sentRequests(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<FriendRequest>>

    @Deprecated("Alias : utiliser act (PATCH directory/friend-requests/{id}).")
    @PATCH("friend-requests/{id}")
    suspend fun respond(
        @Path("id") requestId: String,
        @Body body: RespondFriendRequest,
    ): ApiResponse<FriendRequest>

    @Deprecated("Alias : utiliser actRemoving avec l'action dismiss.")
    @DELETE("friend-requests/{id}")
    suspend fun deleteRequest(@Path("id") requestId: String): ApiResponse<Unit>

    @POST("invitations/email")
    suspend fun sendEmailInvitation(
        @Body body: EmailInvitationRequest,
    ): ApiResponse<EmailInvitationResponse>
}
