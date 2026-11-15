package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.model.StoryCommentsReducer
import me.meeshy.sdk.model.StoryCommentsState

/**
 * Les transitions pures de l'envoi optimiste d'un commentaire de story (iOS `sendComment` + `returnRefusedStoryComment`) :
 * la ligne paraît aussitôt (Pending, compteurs +1), l'ACK ou l'écho temps réel la réconcilie, un échec la passe en Failed
 * (réessai), un refus de la file la retire et rend son texte au composeur. [tempId] est l'identifiant local de la ligne.
 */
object StoryCommentPublish {

    fun pendingRow(tempId: String, text: String, parentId: String?, authorName: String, authorId: String?, avatarUrl: String?): StoryComment =
        StoryComment(
            id = tempId, clientId = tempId, authorName = authorName, avatarUrl = avatarUrl, content = text,
            isTranslated = false, createdAt = null, status = StoryCommentStatus.Pending,
            authorId = authorId, parentId = parentId,
        )

    /** Le commentaire paraît à l'instant : racine en fin de liste, ou réponse sous son parent racine dont le compteur monte (la ligne reste gardée même fil replié, pour que l'écho la retrouve). */
    fun optimistic(state: StoryCommentsState, row: StoryComment): StoryCommentsState {
        if (state.contains(row.id)) return state
        val parentId = row.parentId ?: return state.copy(roots = state.roots + row, count = state.count + 1)
        return state.copy(
            roots = state.roots.map { if (it.id == parentId) it.copy(replyCount = it.replyCount + 1) else it },
            replies = state.replies + (parentId to (state.repliesOf(parentId) + row)),
            count = state.count + 1,
        )
    }

    /** L'ACK du serveur : la ligne locale devient la ligne servie ; si l'écho est arrivé le premier, la ligne locale tombe. */
    fun acknowledged(state: StoryCommentsState, tempId: String, served: StoryComment): StoryCommentsState {
        if (state.find(tempId) == null) return state
        if (state.contains(served.id)) return dropRow(state, tempId)
        return mapRow(state, tempId) { served.copy(parentId = served.parentId ?: it.parentId) }
    }

    /**
     * `comment:added` : l'écho de NOTRE commentaire remplace la ligne en attente sans toucher aux compteurs (déjà montés) ;
     * tout autre commentaire suit [StoryCommentsReducer.added].
     */
    fun echoed(state: StoryCommentsState, comment: StoryComment, serverCount: Int?): StoryCommentsState {
        if (state.contains(comment.id)) return state
        val pending = pendingMatching(state, comment) ?: return StoryCommentsReducer.added(state, comment, serverCount)
        val reconciled = mapRow(state, pending.id) { comment.copy(parentId = comment.parentId ?: it.parentId) }
        return serverCount?.takeIf { it > 0 }?.let { reconciled.copy(count = it) } ?: reconciled
    }

    /** La file a livré : la ligne locale passe en Sent et attend l'écho temps réel qui la remplace par la ligne servie. */
    fun delivered(state: StoryCommentsState, tempId: String): StoryCommentsState = withStatus(state, tempId, StoryCommentStatus.Sent)

    fun failed(state: StoryCommentsState, tempId: String): StoryCommentsState = withStatus(state, tempId, StoryCommentStatus.Failed)

    fun retrying(state: StoryCommentsState, tempId: String): StoryCommentsState = withStatus(state, tempId, StoryCommentStatus.Pending)

    /** La file refuse : la ligne est retirée et les compteurs reprennent ce qu'ils avaient ajouté. Rend aussi le texte. */
    fun refused(state: StoryCommentsState, tempId: String): Refusal? {
        val row = state.find(tempId) ?: return null
        val parentId = row.parentId
        val dropped = dropRow(state, tempId)
        val settled = if (parentId == null) dropped.copy(count = (state.count - 1).coerceAtLeast(0)) else dropped.copy(
            roots = dropped.roots.map { if (it.id == parentId) it.copy(replyCount = (it.replyCount - 1).coerceAtLeast(0)) else it },
            count = (state.count - 1).coerceAtLeast(0),
        )
        return Refusal(settled, row.originalContent, parentId)
    }

    data class Refusal(val state: StoryCommentsState, val text: String, val parentId: String?)

    private val StoryComment.isLocal: Boolean get() = clientId != null && clientId == id

    private fun pendingMatching(state: StoryCommentsState, comment: StoryComment): StoryComment? {
        val candidates = if (comment.parentId == null) state.roots else state.repliesOf(comment.parentId.orEmpty())
        return candidates.firstOrNull {
            it.isLocal && it.status != StoryCommentStatus.Failed && it.parentId == comment.parentId &&
                it.originalContent == comment.originalContent &&
                (it.authorId == null || it.authorId == comment.authorId)
        }
    }

    private fun withStatus(state: StoryCommentsState, tempId: String, status: StoryCommentStatus): StoryCommentsState =
        if (state.find(tempId)?.status == status) state else mapRow(state, tempId) { it.copy(status = status) }

    private fun mapRow(state: StoryCommentsState, id: String, transform: (StoryComment) -> StoryComment): StoryCommentsState =
        state.copy(
            roots = state.roots.map { if (it.id == id) transform(it) else it },
            replies = state.replies.mapValues { (_, rows) -> rows.map { if (it.id == id) transform(it) else it } },
        )

    private fun dropRow(state: StoryCommentsState, id: String): StoryCommentsState =
        state.copy(
            roots = state.roots.filterNot { it.id == id },
            replies = state.replies.mapValues { (_, rows) -> rows.filterNot { it.id == id } },
        )
}
