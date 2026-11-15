package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ClearHistoryRequest
import me.meeshy.sdk.model.ContentCaptureRequest
import me.meeshy.sdk.model.ContentCaptureResult
import me.meeshy.sdk.model.InviteConversationMemberRequest
import me.meeshy.sdk.model.NewShareLinkRequest
import me.meeshy.sdk.model.ReceiptSummaryRow
import me.meeshy.sdk.model.ReceiptWriteRequest
import me.meeshy.sdk.model.ReceiptWriteResult
import me.meeshy.sdk.model.ReceiptsPayload
import me.meeshy.sdk.net.routes.ApiRoutesConversations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Les routes de conversation de l'écran de chat que [ConversationApi] ne porte pas : accusés, historique, invitation,
 * lien, capture (miroir de `ConversationService` et de `ConversationsEndpoint`, iOS). Voir [MessageChatRestApi] pour la
 * raison d'une interface à part.
 */
interface ConversationChatRestApi {

    /**
     * L'écriture UNIQUE des accusés : `read`, `received` ou `delivered`. Le débit (120 par minute et par COMPTE) est
     * partagé avec `mark-as-read`, `mark-as-received` et `delivery-receipt`.
     */
    @POST(ApiRoutesConversations.BY_CONVERSATION_ID_RECEIPTS)
    suspend fun writeReceipt(
        @Path("conversationId") conversationId: String,
        @Body body: ReceiptWriteRequest,
    ): ApiResponse<ReceiptWriteResult>

    /**
     * La lecture des accusés. [messageIds] (virgules, 100 au plus) ou `scope=recent` ; `detail=summary` rend les
     * compteurs par message (les coches), `detail=people` une page nominative filtrée par [filter].
     */
    @GET(ApiRoutesConversations.BY_CONVERSATION_ID_RECEIPTS)
    suspend fun receipts(
        @Path("conversationId") conversationId: String,
        @Query("messageIds") messageIds: String? = null,
        @Query("scope") scope: String? = null,
        @Query("detail") detail: String? = null,
        @Query("filter") filter: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<ReceiptsPayload>

    /** Adresse HISTORIQUE de la lecture des compteurs (message → ligne) ; elle reste servie le temps des anciennes versions. */
    @GET(ApiRoutesConversations.BY_CONVERSATION_ID_READ_STATUSES)
    suspend fun readStatuses(
        @Path("conversationId") conversationId: String,
        @Query("messageIds") messageIds: String? = null,
    ): ApiResponse<Map<String, ReceiptSummaryRow>>

    /**
     * L'accusé de LIVRAISON d'UN message — la forme que l'extension de notification emploie pour un destinataire hors
     * ligne. Même débit partagé que [writeReceipt].
     */
    @POST(ApiRoutesConversations.BY_CONVERSATION_ID_MESSAGES_BY_MESSAGE_ID_DELIVERY_RECEIPT)
    suspend fun deliveryReceipt(
        @Path("conversationId") conversationId: String,
        @Path("messageId") messageId: String,
        @Body body: JsonObject = JsonObject(emptyMap()),
    ): ApiResponse<JsonElement>

    /** L'état de lecture et de livraison de tous les messages de la conversation (compteurs et détail par membre). */
    @GET(ApiRoutesConversations.BY_ID_STATUS)
    suspend fun status(@Path("id") conversationId: String): ApiResponse<JsonElement>

    /** Vide l'historique chez moi : tout ce qui précède `beforeDate` disparaît de mes appareils, pas de ceux des autres. */
    @POST(ApiRoutesConversations.BY_CONVERSATION_ID_CLEAR_HISTORY)
    suspend fun clearHistory(
        @Path("conversationId") conversationId: String,
        @Body body: ClearHistoryRequest,
    ): ApiResponse<JsonElement>

    /** Annule un « vider l'historique » ou un « supprimer pour moi » de la conversation. */
    @POST(ApiRoutesConversations.BY_CONVERSATION_ID_RESTORE_FOR_ME)
    suspend fun restoreForMe(
        @Path("conversationId") conversationId: String,
        @Body body: JsonObject = JsonObject(emptyMap()),
    ): ApiResponse<JsonElement>

    /** Ajoute un inscrit à la conversation (la passerelle décide des droits ; le client ne fait que cacher le geste). */
    @POST(ApiRoutesConversations.BY_ID_INVITE)
    suspend fun invite(
        @Path("id") conversationId: String,
        @Body body: InviteConversationMemberRequest,
    ): ApiResponse<JsonElement>

    /** Crée un lien de partage ; le compte doit avoir un e-mail vérifié (la passerelle répond sinon par un refus structuré). */
    @POST(ApiRoutesConversations.BY_ID_NEW_LINK)
    suspend fun newLink(
        @Path("id") conversationId: String,
        @Body body: NewShareLinkRequest,
    ): ApiResponse<JsonElement>

    /** Déclare la capture d'un contenu qui disparaît (#9617) ; idempotente par (acteur, message, sorte). */
    @POST(ApiRoutesConversations.BY_ID_MESSAGES_CAPTURE)
    suspend fun capture(
        @Path("id") conversationId: String,
        @Body body: ContentCaptureRequest,
    ): ApiResponse<ContentCaptureResult>

    /** Lève le bannissement d'un membre. */
    @PATCH(ApiRoutesConversations.BY_ID_PARTICIPANTS_BY_USER_ID_UNBAN)
    suspend fun unban(
        @Path("id") conversationId: String,
        @Path("userId") userId: String,
    ): ApiResponse<JsonElement>
}
