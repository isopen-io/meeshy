package me.meeshy.sdk.attachment

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.decodeFromJsonElement
import me.meeshy.sdk.model.AttachmentConsentError
import me.meeshy.sdk.model.AttachmentStatusUser
import me.meeshy.sdk.model.AttachmentTranslateResponse
import me.meeshy.sdk.model.TranscribeRequest
import me.meeshy.sdk.model.media.AttachmentStatusBody
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AttachmentTranslateRequest
import me.meeshy.sdk.net.api.AttachmentTranslationApi
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.apiCall

/** Issue d'une demande de traduction : succès, consentements à accorder (jamais un « interdit » générique), ou échec. */
sealed interface AttachmentTranslateOutcome {
    data class Success(val response: AttachmentTranslateResponse) : AttachmentTranslateOutcome
    data class ConsentRequired(val error: AttachmentConsentError) : AttachmentTranslateOutcome
    data class Failed(val error: ApiError) : AttachmentTranslateOutcome
}

/** Surface réseau d'UNE pièce jointe : transcrire, traduire, rapporter sa consommation, lire qui l'a vue, l'effacer. */
@Singleton
class AttachmentRepository @Inject constructor(
    private val media: MediaApi,
    private val translation: AttachmentTranslationApi,
) {
    suspend fun transcribe(attachmentId: String, force: Boolean = false): NetworkResult<Unit> =
        apiCall { media.transcribe(attachmentId, TranscribeRequest(force)) }.map { }

    suspend fun translate(
        attachmentId: String,
        targetLanguages: List<String>,
        sourceLanguage: String? = null,
        generateVoiceClone: Boolean? = null,
    ): AttachmentTranslateOutcome {
        val body = AttachmentTranslateRequest(targetLanguages, sourceLanguage, generateVoiceClone)
        return when (val result = apiCall { translation.translate(attachmentId, body) }) {
            is NetworkResult.Success -> AttachmentTranslateOutcome.Success(
                runCatching { MeeshyApi.json.decodeFromJsonElement<AttachmentTranslateResponse>(result.data) }
                    .getOrDefault(AttachmentTranslateResponse()),
            )
            is NetworkResult.Failure -> {
                val e = result.error
                AttachmentConsentError.from(e.httpStatus, e.code, e.message, e.requiredConsents)
                    ?.let { AttachmentTranslateOutcome.ConsentRequired(it) }
                    ?: AttachmentTranslateOutcome.Failed(e)
            }
        }
    }

    suspend fun reportStatus(attachmentId: String, body: AttachmentStatusBody): NetworkResult<Unit> =
        apiCall { media.reportStatus(attachmentId, body) }.map { }

    suspend fun statusDetails(attachmentId: String): NetworkResult<List<AttachmentStatusUser>> =
        apiCall { media.statusDetails(attachmentId) }

    /** Le succès de l'enveloppe suffit : la forme de `data` a varié selon les versions de la passerelle. */
    suspend fun delete(attachmentId: String): NetworkResult<Unit> =
        apiCall { media.delete(attachmentId) }.map { }
}
