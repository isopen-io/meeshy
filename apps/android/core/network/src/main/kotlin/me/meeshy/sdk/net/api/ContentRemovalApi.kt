package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ContentRemovalRequest
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.HTTP
import retrofit2.http.Path

/**
 * Le retrait d'un contenu PAR LA MODÉRATION, avec son motif (port de
 * `APIClientProviding.deleteRemovingContent`, iOS).
 *
 * Ces trois DELETE ne servent qu'au cas AVEC motif : un corps `{ "reason": … }`. Sans motif,
 * l'appelant garde les `delete` sans corps de [MessageApi] et [PostApi], inchangés à l'octet près
 * — c'est la rétrocompatibilité des passerelles qui ne lisent aucun corps sur un DELETE.
 * Rendre la [Response] brute évite de décoder la charge de retrait (`{ messageId, deleted, meta }`,
 * `{ message }`…) : un 2xx EST la confirmation (voir `deletionCall`).
 */
interface ContentRemovalApi {
    @HTTP(method = "DELETE", path = "messages/{id}", hasBody = true)
    suspend fun removeMessage(
        @Path("id") messageId: String,
        @Body body: ContentRemovalRequest,
    ): Response<ResponseBody>

    @HTTP(method = "DELETE", path = "posts/{id}", hasBody = true)
    suspend fun removePost(
        @Path("id") postId: String,
        @Body body: ContentRemovalRequest,
    ): Response<ResponseBody>

    @HTTP(method = "DELETE", path = "posts/{id}/comments/{commentId}", hasBody = true)
    suspend fun removeComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
        @Body body: ContentRemovalRequest,
    ): Response<ResponseBody>
}
