package me.meeshy.sdk.media

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.DEFAULT_MEDIA_MIME_TYPE
import me.meeshy.sdk.model.MediaAttachmentWire
import me.meeshy.sdk.model.MessageTranscriptionFiche
import me.meeshy.sdk.model.TranscribeRequest
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.toUploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.apiCall
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pure construction of the multipart parts a media upload sends. Kept out of the
 * repository so the "which field name / which filename / which content type"
 * decisions stay JVM-testable without a network. The gateway accepts file parts
 * under the [FIELD_NAME] field (it filters file parts by type, not name — iOS
 * uses the same `files` name).
 */
object MediaUpload {
    const val FIELD_NAME: String = "files"
    const val DEFAULT_FILE_NAME: String = "upload"

    /** The advertised filename, falling back to [DEFAULT_FILE_NAME] when blank. */
    fun fileName(raw: String): String = raw.takeIf { it.isNotBlank() } ?: DEFAULT_FILE_NAME

    /** The content type, falling back to the octet-stream default when blank. */
    fun mimeType(raw: String): String = raw.takeIf { it.isNotBlank() } ?: DEFAULT_MEDIA_MIME_TYPE

    /**
     * #13820 — le champ par lequel la pièce d'un message déclare sa conversation, posé AVANT les fichiers : la passerelle
     * ne STOCKE jamais la pièce d'une conversation chiffrée de bout en bout (400 `E2EE_PLAINTEXT_REFUSED`). Elle ne peut pas
     * en refuser la RÉCEPTION : les octets déjà partis sur le fil arrivent, et sont jetés sans être gardés.
     */
    const val DESTINATION_FIELD_NAME: String = "conversationId"

    fun destinationPart(conversationId: String): MultipartBody.Part =
        MultipartBody.Part.createFormData(DESTINATION_FIELD_NAME, conversationId)

    /** Builds the multipart `files` part for [item] with resolved name + content type, streamed from its source (#13551). */
    fun formPart(item: MediaUploadItem): MultipartBody.Part {
        val body = item.requestBody(mimeType(item.mimeType).toMediaTypeOrNull())
        return MultipartBody.Part.createFormData(FIELD_NAME, fileName(item.fileName), body)
    }
}

/**
 * Uploads media to the gateway (`POST /attachments/upload`) and returns the
 * domain [UploadedMedia] items a composer references by id. Port of iOS
 * `AttachmentUploader`, generalised to multiple files and any MIME type (iOS only
 * uploads a single compressed JPEG avatar).
 *
 * Unusable rows in the response (blank id or url) are dropped rather than failing
 * the whole upload, so one degenerate attachment never discards the good ones.
 */
@Singleton
class MediaRepository @Inject constructor(
    private val mediaApi: MediaApi,
    private val sanitizer: OutgoingMediaSanitizer,
    private val seeder: UploadedMediaSeeder = UploadedMediaSeeder.None,
) {
    suspend fun upload(items: List<MediaUploadItem>, conversationId: String? = null): NetworkResult<List<UploadedMedia>> {
        if (items.isEmpty()) return NetworkResult.Success(emptyList())
        val clean = mutableListOf<Pair<MediaUploadItem, MediaUploadItem>>()
        try {
            items.forEach { item ->
                when (val result = sanitizer.sanitize(item)) {
                    is NetworkResult.Failure -> return result
                    is NetworkResult.Success -> clean += result.data to item
                }
            }
            val destination = conversationId?.takeIf { it.isNotBlank() }?.let(MediaUpload::destinationPart)
            val parts = listOfNotNull(destination) + clean.map { (sent, _) -> MediaUpload.formPart(sent) }
            val result = apiCall { mediaApi.upload(parts) }
            if (result is NetworkResult.Success) seed(clean.map { (sent, _) -> sent }, result.data.attachments)
            return result.map { response -> response.attachments.mapNotNull { it.toUploadedMedia() } }
        } finally {
            clean.forEach { (sent, original) -> sanitizer.release(sent, original) }
        }
    }

    /**
     * Les octets envoyés entrent au cache sous l'adresse de LEUR pièce (#13861), lus avant que la copie nettoyée ne
     * quitte le disque. La réponse ne se rapproche des fichiers que rang pour rang : si elle n'en compte pas autant,
     * rien ne s'adopte plutôt qu'un fichier sous l'adresse d'un autre.
     */
    private suspend fun seed(sent: List<MediaUploadItem>, attachments: List<MediaAttachmentWire>) {
        if (attachments.size != sent.size) return
        sent.zip(attachments).forEach { (item, wire) -> wire.toUploadedMedia()?.let { seeder.seed(item, it) } }
    }

    /**
     * Demande la transcription d'une pièce son (`POST /attachments/:id/transcribe`, iOS `requestTranscription`). Le
     * résultat d'une transcription lancée arrive par la socket ; celle qui existait déjà revient ici, `null` sinon.
     */
    suspend fun requestTranscription(attachmentId: String): NetworkResult<ApiAttachmentTranscription?> =
        apiCall { mediaApi.transcribe(attachmentId, TranscribeRequest(force = false)) }
            .map { data -> completedTranscription(data) }

    private fun completedTranscription(data: JsonElement): ApiAttachmentTranscription? =
        runCatching { outcomeJson.decodeFromJsonElement(MessageTranscriptionFiche.TranscribeOutcome.serializer(), data) }
            .getOrNull()?.completed

    private companion object {
        val outcomeJson = Json { ignoreUnknownKeys = true }
    }
}
