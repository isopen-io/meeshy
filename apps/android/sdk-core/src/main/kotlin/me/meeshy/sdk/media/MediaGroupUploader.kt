package me.meeshy.sdk.media

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.guest.GuestAttachmentRefusal
import me.meeshy.sdk.model.media.OutgoingAttachmentRules
import me.meeshy.sdk.model.media.OutgoingMediaGroup
import me.meeshy.sdk.model.media.TusTranscription
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** Une pièce prête à monter : son identifiant local (celui de la bulle), le fichier, et ce que la création TUS déclare en plus. */
public class GroupUploadItem(
    public val attachmentId: String,
    public val item: MediaUploadItem,
    public val thumbHash: String? = null,
    public val transcription: TusTranscription? = null,
    public val capturedInApp: Boolean = false,
)

/** Ce qu'un groupe devient une fois monté : les identifiants serveur, dans l'ordre du composeur. */
public class UploadedGroup(public val attachmentIds: List<String>, public val media: List<UploadedMedia>)

/** L'envoi d'une pièce jointe d'invité a été REFUSÉ (famille fermée, trop lourde) : définitif, jamais rejoué. */
public class GuestAttachmentRefusedException(public val refusal: GuestAttachmentRefusal) :
    RuntimeException(refusal.serverMessage ?: refusal.reason.code)

/** Un téléversement a échoué, transitoirement ou non : le groupe entier rejoint l'outbox durable. */
public class AttachmentUploadException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

/** Monte UNE pièce de message. Séparé du groupe pour que le parallélisme et l'ordre se prouvent sans réseau. */
public fun interface GroupFileUploader {
    public suspend fun uploadOne(item: GroupUploadItem): NetworkResult<List<UploadedMedia>>
}

/** Le téléverseur TUS des pièces d'un MESSAGE (contexte `attachment`), qui rend compte à la barre globale. */
public class TusGroupFileUploader @Inject constructor(
    private val tus: TusUploadRepository,
) : GroupFileUploader {
    override suspend fun uploadOne(item: GroupUploadItem): NetworkResult<List<UploadedMedia>> =
        tus.upload(
            item = item.item,
            context = TusUploadContext.ATTACHMENT,
            extras = TusUploadExtras(
                thumbHash = item.thumbHash,
                transcription = item.transcription,
                capturedInApp = item.capturedInApp,
                progressId = item.attachmentId,
            ),
        )
}

public fun interface MediaGroupUploading {
    /**
     * Monte les pièces de [group]. [onPromoted] dit, pièce par pièce, quel identifiant serveur remplace l'identifiant local
     * (les transcriptions locales se rekeyent dessus). Lève [GuestAttachmentRefusedException] pour un refus d'invité,
     * [AttachmentUploadException] pour tout autre échec.
     */
    public suspend fun upload(
        group: OutgoingMediaGroup,
        items: List<GroupUploadItem>,
        onPromoted: (localId: String, serverId: String) -> Unit,
    ): UploadedGroup
}

/**
 * Le téléversement d'un groupe de pièces (iOS `TusMediaGroupUploader`) : PARALLÈLE BORNÉ ([OrderedParallelUpload]) et résultats
 * dans l'ordre du COMPOSEUR, jamais celui où les envois finissent — la passerelle en fait le rang des pièces. Un groupe audio
 * part toujours en `audio/mp4`. La première erreur annule les frères et remonte : l'appelant renvoie le groupe entier à l'outbox.
 */
public class MediaGroupUploader(
    private val files: GroupFileUploader,
    private val progress: UploadProgressCenter = UploadProgressCenter(),
    private val parallelism: Int = OrderedParallelUpload.DEFAULT_PARALLELISM,
) : MediaGroupUploading {

    override suspend fun upload(
        group: OutgoingMediaGroup,
        items: List<GroupUploadItem>,
        onPromoted: (localId: String, serverId: String) -> Unit,
    ): UploadedGroup {
        val outgoing = items.map { it.asSent(group.group.isAudio) }
        outgoing.forEach { progress.announce(it.attachmentId, it.item.fileName, it.item.sizeBytes) }
        val results = OrderedParallelUpload.run(outgoing, parallelism) { _, piece -> piece to uploadOrThrow(piece) }
        val media = results.map { (piece, uploaded) ->
            uploaded.also { onPromoted(piece.attachmentId, it.id) }
        }
        return UploadedGroup(media.map { it.id }, media)
    }

    private fun GroupUploadItem.asSent(isAudioGroup: Boolean): GroupUploadItem {
        val mime = OutgoingAttachmentRules.uploadMimeType(isAudioGroup, item.mimeType)
        if (mime == item.mimeType) return this
        return GroupUploadItem(
            attachmentId, MediaUploadItem(item.source, item.fileName, mime, item.durationMs), thumbHash, transcription, capturedInApp,
        )
    }

    private suspend fun uploadOrThrow(piece: GroupUploadItem): UploadedMedia =
        when (val result = files.uploadOne(piece)) {
            is NetworkResult.Success -> result.data.firstOrNull() ?: throw AttachmentUploadException(NO_MEDIA)
            is NetworkResult.Failure -> throw failureOf(result)
        }

    private fun failureOf(failure: NetworkResult.Failure): RuntimeException {
        val reason = GuestAttachmentRefusal.Reason.entries.firstOrNull { it.code == failure.error.code }
        return if (reason != null) {
            GuestAttachmentRefusedException(GuestAttachmentRefusal(reason, failure.error.message))
        } else {
            AttachmentUploadException(failure.error.message)
        }
    }

    private companion object {
        const val NO_MEDIA = "Upload returned no usable media"
    }
}
