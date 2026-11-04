package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentLikeState
import me.meeshy.sdk.model.CommentRepliesState
import me.meeshy.sdk.model.CommentThreadState
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.ComposerLanguageState
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.MeeshyUser

internal data class Status(
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val notice: CommentNotice? = null,
) {
    /** A first page that failed is drawn as the error state; a next page that failed is a toast. */
    fun fetchFailed(message: String?, loadingMore: Boolean): Status =
        copy(
            isLoading = false,
            isLoadingMore = false,
            error = message,
            notice = if (loadingMore) CommentNotice.LOAD_FAILED else notice,
        )
}

/** The composer's live text and its @-mention autocomplete panel, folded into the projection. */
internal data class ComposerDraft(
    val text: String = "",
    val mention: MentionAutocompleteState = MentionAutocompleteState(),
    val language: ComposerLanguageState = ComposerLanguageState(),
    val effects: MessageEffects = MessageEffects(),
    val place: SharedPlace? = null,
)

/** Ce qui part avec un commentaire en plus de son texte et de ses pièces (#14385, #14387). */
internal data class CommentExtras(val effectFlags: Int?, val place: SharedPlace?, val quotedPostMediaId: String? = null)

/** The projection inputs accumulated before the final [translatingLanguages] fold, threaded
 *  through as one value so the chained `combine` stays within its 5-arg cap. */
internal data class ProjectionBundle(
    val inputs: ProjectionInputs,
    val replyTarget: ReplyTarget?,
    val activeLanguages: Map<String, String>,
    val draft: ComposerDraft,
)

/** The five reactive inputs folded into the projection, threaded past the 5-arg `combine` cap. */
internal data class ProjectionInputs(
    val thread: CommentThreadState,
    val user: MeeshyUser?,
    val status: Status,
    val likes: CommentLikeState,
    val replies: CommentRepliesState,
)

/** La ligne optimiste d'un commentaire en vol : son [tempId], son texte et [me] pour auteur, le temps que le serveur confirme. */
internal fun optimisticCommentRow(tempId: String, content: String, me: MeeshyUser?): ApiPostComment =
    ApiPostComment(
        id = tempId,
        content = content,
        author = me?.let { ApiAuthor(id = it.id, username = it.username, displayName = it.displayName, avatar = it.avatar) },
    )
