package me.meeshy.sdk.post

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.outbox.CommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.OutboxWithdrawal
import me.meeshy.sdk.outbox.stateEnum
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Un commentaire pas encore parti, relu de la FILE (iOS `UnsentComment`) : [cmid] est l'id de sa ligne optimiste.
 * [isFailed] = la file a renoncé ; [limit] = la limite du jour qui l'a fait renoncer, quand c'est elle.
 */
public data class UnsentComment(
    val cmid: String,
    val postId: String,
    val payload: CommentPayload,
    val createdAt: Long,
    val isFailed: Boolean,
    val reason: String?,
    val limit: DailyGestureLimit?,
)

/** L'issue d'un geste sur un commentaire non envoyé. */
public enum class UnsentCommentResult { Done, NotTheAuthor, Gone }

/**
 * Les commentaires non envoyés de l'auteur connecté (iOS `OfflineQueue+CommentMedia` / `+PublicationCancel`) : listés par
 * post depuis la file (ils survivent à la fermeture de la feuille et au redémarrage), relancés, annulés. Un commentaire en
 * attente appartient à son auteur : sous un autre compte il n'est ni visible ni touché ([UnsentCommentResult.NotTheAuthor]).
 */
@Singleton
public class UnsentComments @Inject constructor(
    private val outbox: OutboxRepository,
    private val owner: OutboxOwnerSource,
    private val posts: PostRepository,
    private val flush: OutboxFlushScheduler,
    private val json: Json,
) {
    /** Les non-envoyés de [postId], le plus ancien d'abord, vivants (la liste suit la file). */
    public fun observe(postId: String): Flow<List<UnsentComment>> =
        outbox.observeAll().map { rows -> unsentOf(rows, postId) }.distinctUntilChanged()

    public suspend fun unsentComments(postId: String): List<UnsentComment> = unsentOf(rows(), postId)

    /** Relance d'un toucher : la ligne repart avec un budget d'essais neuf. */
    public suspend fun retryCreateComment(cmid: String): UnsentCommentResult {
        val row = ownRow(cmid) ?: return UnsentCommentResult.Gone
        if (!isMine(row)) return UnsentCommentResult.NotTheAuthor
        if (!outbox.retry(cmid)) return UnsentCommentResult.Gone
        flush.schedule()
        return UnsentCommentResult.Done
    }

    /**
     * Retire le commentaire de la file. Une ligne encore en attente rend aussi au post le compteur qu'elle avait ajouté ;
     * une ligne épuisée l'avait déjà rendu à son renoncement.
     */
    public suspend fun cancelCreateComment(cmid: String): UnsentCommentResult {
        val row = ownRow(cmid) ?: return UnsentCommentResult.Gone
        if (!isMine(row)) return UnsentCommentResult.NotTheAuthor
        return when (val withdrawal = outbox.withdrawUnlessInflight(cmid)) {
            is OutboxWithdrawal.Removed -> {
                if (withdrawal.row.stateEnum != OutboxState.EXHAUSTED) posts.rollbackQueuedComment(withdrawal.row.targetId)
                UnsentCommentResult.Done
            }
            OutboxWithdrawal.Marked -> UnsentCommentResult.Done
            OutboxWithdrawal.Absent -> UnsentCommentResult.Gone
        }
    }

    /**
     * « Reprendre » : rend le texte du commentaire (que le composer AJOUTERA à l'existant) et retire la ligne.
     * `null` quand la ligne n'est plus là ou n'est pas à l'auteur connecté.
     */
    public suspend fun resume(cmid: String): String? {
        val row = ownRow(cmid)?.takeIf(::isMine) ?: return null
        val text = decode(row)?.content
        return if (cancelCreateComment(cmid) == UnsentCommentResult.Done) text else null
    }

    private suspend fun rows(): List<OutboxEntity> = outbox.observeAll().first()

    private suspend fun ownRow(cmid: String): OutboxEntity? =
        outbox.row(cmid)?.takeIf { it.kind == OutboxKind.CREATE_COMMENT.name }

    private fun isMine(row: OutboxEntity): Boolean {
        val me = owner.currentOwnerId() ?: return false
        return row.ownerId == me
    }

    private fun unsentOf(rows: List<OutboxEntity>, postId: String): List<UnsentComment> {
        val me = owner.currentOwnerId() ?: return emptyList()
        return rows.asSequence()
            .filter { it.kind == OutboxKind.CREATE_COMMENT.name && it.targetId == postId && it.ownerId == me }
            .distinctBy { it.cmid }
            .sortedBy { it.createdAt }
            .mapNotNull { row ->
                val payload = decode(row) ?: return@mapNotNull null
                val failed = row.stateEnum == OutboxState.EXHAUSTED
                UnsentComment(
                    cmid = row.cmid,
                    postId = row.targetId,
                    payload = payload,
                    createdAt = row.createdAt,
                    isFailed = failed,
                    reason = row.lastError.takeIf { failed },
                    limit = if (failed) DailyGestureLimit.fromReason(row.lastError) else null,
                )
            }
            .toList()
    }

    private fun decode(row: OutboxEntity): CommentPayload? =
        runCatching { json.decodeFromString(CommentPayload.serializer(), row.payload) }.getOrNull()
}
