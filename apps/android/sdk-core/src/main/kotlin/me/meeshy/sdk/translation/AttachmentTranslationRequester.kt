package me.meeshy.sdk.translation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AttachmentTranslateRequest
import me.meeshy.sdk.net.api.AttachmentTranslationApi
import me.meeshy.sdk.net.apiCall

/**
 * La demande de traduction d'UNE pièce audio (par pièce, pas par message). Le serveur transcrit,
 * traduit et synthétise ; le résultat revient par `audio:translation-ready`. Le fail-closed est à
 * l'appelant ([me.meeshy.sdk.model.translation.ServerTranslationAdmission]) : cette classe ne décide rien.
 */
@Singleton
class AttachmentTranslationRequester @Inject constructor(
    private val api: AttachmentTranslationApi,
) {
    suspend fun request(
        attachmentId: String,
        targetLanguage: String,
        sourceLanguage: String? = null,
    ): NetworkResult<Unit> {
        val target = targetLanguage.trim()
        if (attachmentId.isBlank() || target.isEmpty()) return NetworkResult.Failure(ApiError(message = "blank"))
        val body = AttachmentTranslateRequest(listOf(target), sourceLanguage?.trim()?.takeIf { it.isNotEmpty() })
        return when (val result = apiCall { api.translate(attachmentId, body) }) {
            is NetworkResult.Success -> NetworkResult.Success(Unit)
            is NetworkResult.Failure -> result
        }
    }
}
