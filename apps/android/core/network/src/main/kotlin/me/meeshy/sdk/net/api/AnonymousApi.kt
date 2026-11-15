package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.AnonymousRefreshData
import me.meeshy.sdk.model.auth.AnonymousRefreshRequest
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Le renouvellement d'une session d'invité (`AnonymousEndpoint.refresh` côté iOS).
 * Les autres routes anonymes — aperçu du lien, adhésion, sortie — sont dans
 * [ShareLinkApi] : celle-ci n'ajoute que ce qui maintient la session en vie.
 */
interface AnonymousApi {
    /**
     * Maintient la session active et revalide le lien de partage. `401` jeton
     * inconnu, `410` accès retiré / lien désactivé ou expiré / conversation close.
     */
    @POST("anonymous/refresh")
    suspend fun refresh(@Body body: AnonymousRefreshRequest): ApiResponse<AnonymousRefreshData>
}
