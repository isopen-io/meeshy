package me.meeshy.sdk.post

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.comment.CommentMediaResume
import me.meeshy.sdk.model.comment.CommentOwnershipRefusal
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.QuotedPostMediaAnchor
import me.meeshy.sdk.outbox.CommentPayload
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import javax.inject.Inject

/**
 * Le corps de `POST posts/{id}/comments` d'un commentaire en file : [attachmentIds] sont ceux que le publieur vient de
 * rassembler (ou ceux déjà gravés sur la ligne), la transcription mobile ne part qu'avec eux (iOS `CreateCommentBody`).
 */
internal fun CommentPayload.toRequest(attachmentIds: List<String>?): CreateCommentRequest {
    val ids = attachmentIds?.takeIf { it.isNotEmpty() }
    return CreateCommentRequest(
        content = content,
        parentId = parentId,
        originalLanguage = originalLanguage,
        effectFlags = effectFlags,
        attachmentIds = ids,
        location = location,
        quotedPostMedia = quotedPostMediaId?.takeIf { it.isNotBlank() }?.let(::QuotedPostMediaAnchor),
        mobileTranscription = media?.mobileTranscription?.takeIf { ids != null },
    )
}

/** Ce que le rejeu fait d'un refus du serveur : un refus que la même charge rencontrerait encore renonce, le reste se rejoue. */
internal fun ApiError.toCommentSendResult(): SendResult = when {
    httpStatus == HTTP_GONE && code == MUTATION_RESULT_GONE -> SendResult.Success
    httpStatus in DEFINITIVE_REFUSALS && code != "HTTP_$httpStatus" -> SendResult.PermanentFailure("Comment refused: HTTP $httpStatus $code")
    else -> SendResult.TransientFailure
}

private const val HTTP_GONE = 410
private const val MUTATION_RESULT_GONE = "MUTATION_RESULT_GONE"
private val DEFINITIVE_REFUSALS = setOf(400, 403, 404, 422)

/**
 * Le rejeu d'un commentaire À PIÈCES, depuis la file (`CREATE_COMMENT`) : les pièces déjà montées et encore présentables ne
 * repartent pas ([CommentMediaResume]), chaque nouvelle montée est gravée sur la ligne avant la suivante, puis le commentaire
 * est créé sous la clé de sa ligne. Le fichier local survit jusqu'à la création, puis il est nettoyé ; un renoncement le
 * laisse sur le disque pour que « Reprendre » rende le texte ET les pièces.
 */
public class CommentSendSender @Inject constructor(
    private val publisher: CommentPublisher,
    private val files: CommentMediaFiles,
    private val outbox: OutboxRepository,
    private val json: Json,
) {
    public suspend fun send(row: OutboxEntity, comment: CommentPayload, media: CommentMediaPayload): SendResult {
        val owner = row.ownerId
        val plan = CommentMediaResume.plan(media.paths.size, media.uploaded, System.currentTimeMillis()) { index ->
            files.resolve(owner, media.paths[index])?.isFile == true
        }
        if (plan.missing.isNotEmpty()) return SendResult.PermanentFailure("Comment media missing: HTTP 422")
        val pieces = plan.toUpload.mapNotNull { index ->
            files.resolve(owner, media.paths[index])?.let { file ->
                CommentPublisher.Piece(index, file, media.mimeTypes.getOrNull(index) ?: DEFAULT_MIME, media.thumbHashes.getOrNull(index))
            }
        }
        var current = media
        return try {
            publisher.publish(row.targetId, owner, row.cmid, comment, pieces, plan.acquired) { done ->
                current = current.withUploaded(done)
                outbox.rewritePayload(row.cmid, json.encodeToString(CommentPayload.serializer(), comment.copy(media = current)))
            }
            files.discard(owner, media.paths)
            SendResult.Success
        } catch (_: CommentOwnershipRefusal) {
            SendResult.Deferred("Comment author is not the signed-in account")
        } catch (interrupted: CommentPublisher.Interrupted) {
            interrupted.error.toCommentSendResult()
        } catch (cancelled: CancellationException) {
            throw cancelled
        }
    }

    private companion object {
        const val DEFAULT_MIME = "application/octet-stream"
    }
}
