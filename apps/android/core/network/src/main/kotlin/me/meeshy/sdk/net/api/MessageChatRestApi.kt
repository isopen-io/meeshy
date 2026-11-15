package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.BulkHideForMeRequest
import me.meeshy.sdk.model.MessageTranslationsPayload
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.model.ThreadData
import me.meeshy.sdk.net.routes.ApiRoutesConversations
import me.meeshy.sdk.net.routes.ApiRoutesMessages
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Les routes de message de l'écran de conversation que [MessageApi] ne porte pas (miroir de `MessageService`, iOS).
 *
 * Une interface à part plutôt que des membres de plus sur [MessageApi] : celle-ci est implémentée par des doublures dans
 * les tests de trois modules, et chaque membre ajouté les ferait toutes rougir. Les chemins viennent de
 * [ApiRoutesMessages] / [ApiRoutesConversations] (générés du manifeste de la passerelle) : une route retirée côté serveur
 * casse la compilation, pas la production.
 */
interface MessageChatRestApi {

    /**
     * Une page de messages : `offset`, `before` (plus ancien), `after` (rattrapage) ou `around` (fenêtre centrée) — les
     * modes s'excluent côté serveur. `include_replies` / `include_translations` valent `true` à l'omission ; [languages]
     * (codes séparés par des virgules) restreint les traductions servies à celles du Prisme du lecteur.
     */
    @GET(ApiRoutesConversations.BY_ID_MESSAGES)
    suspend fun page(
        @Path("id") conversationId: String,
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("before") before: String? = null,
        @Query("after") after: String? = null,
        @Query("around") around: String? = null,
        @Query("include_replies") includeReplies: Boolean? = null,
        @Query("include_translations") includeTranslations: Boolean? = null,
        @Query("languages") languages: String? = null,
    ): MessagesApiResponse

    /** Toutes les traductions texte d'UN message (l'explorateur de langues) ; `data` range la liste sous `translations`. */
    @GET(ApiRoutesMessages.BY_MESSAGE_ID_TRANSLATIONS)
    suspend fun translations(@Path("messageId") messageId: String): ApiResponse<MessageTranslationsPayload>

    /** Masque UN message chez moi seul (« supprimer pour moi ») ; aucun autre membre n'en est averti. */
    @DELETE(ApiRoutesMessages.BY_MESSAGE_ID_DELETE_FOR_ME)
    suspend fun hideForMe(@Path("messageId") messageId: String): ApiResponse<JsonElement>

    /** Masque plusieurs messages chez moi seul, en une requête (le corps d'un DELETE : `hasBody`). */
    @HTTP(method = "DELETE", path = "messages/bulk/delete-for-me", hasBody = true)
    suspend fun hideManyForMe(@Body body: BulkHideForMeRequest): ApiResponse<JsonElement>

    /** Annule le masquage d'un message : il revient chez moi. */
    @POST(ApiRoutesMessages.BY_MESSAGE_ID_RESTORE_FOR_ME)
    suspend fun restoreForMe(
        @Path("messageId") messageId: String,
        @Body body: JsonObject = JsonObject(emptyMap()),
    ): ApiResponse<JsonElement>

    /** Les messages épinglés, du plus récemment épinglé au plus ancien. */
    @GET(ApiRoutesConversations.BY_ID_PINNED_MESSAGES)
    suspend fun pinned(
        @Path("id") conversationId: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): ApiResponse<List<ApiMessage>>

    /** Le fil complet d'un message : le parent et toutes ses réponses imbriquées, à plat. */
    @GET(ApiRoutesConversations.BY_ID_THREADS_BY_MESSAGE_ID)
    suspend fun thread(
        @Path("id") conversationId: String,
        @Path("messageId") messageId: String,
    ): ApiResponse<ThreadData>
}
