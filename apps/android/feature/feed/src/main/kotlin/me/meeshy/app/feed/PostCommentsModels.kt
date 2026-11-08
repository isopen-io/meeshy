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
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.comment.CommentEditing

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
    /** Le commentaire en cours d'ÉDITION : le composer l'a chargé, l'envoi le remplace en place. */
    val editing: ApiPostComment? = null,
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

/** Le commentaire que le composer édite : son id et sa première ligne, pour le bandeau « Modification ». */
data class CommentEditTarget(val commentId: String, val excerpt: String?, val hasMedia: Boolean = false)

data class PostCommentsUiState(
    val comments: List<CommentPresentation> = emptyList(),
    val replyThreads: Map<String, ReplyThreadUiState> = emptyMap(),
    val mentionDisplayNames: Map<String, String> = emptyMap(),
    val draft: String = "",
    val mention: MentionAutocompleteState = MentionAutocompleteState(),
    val replyTarget: ReplyTarget? = null,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val showSkeleton: Boolean = false,
    val isSubmitting: Boolean = false,
    val canLoadMore: Boolean = false,
    val isEmpty: Boolean = false,
    val errorMessage: String? = null,
    /** The first page could not load: the section draws « Error loading comments » + Try again. */
    val loadFailed: Boolean = false,
    /** A one-shot localized feedback, cleared by [PostCommentsViewModel.consumeNotice]. */
    val notice: CommentNotice? = null,
    val translatingLanguages: Set<String> = emptySet(),
    /** Les pièces jointes au commentaire en cours (#12972). */
    val attachments: CommentAttachmentTray = CommentAttachmentTray(),
    /** La langue que montre la pastille du composeur (#14384) : choisie, sinon détectée, sinon celle du lecteur. */
    val composerLanguageCode: String = ComposerLanguage.DEFAULT,
    /** Le flou et les effets permanents posés sur le commentaire en cours (#14385). */
    val effects: MessageEffects = MessageEffects(),
    /** Le lieu joint au commentaire en cours (#14387) ; il part avec le texte ou une pièce. */
    val place: SharedPlace? = null,
    /** Le commentaire que le composer ÉDITE (bandeau + croix), `null` en création. */
    val editing: CommentEditTarget? = null,
    /** Le lecteur et son rôle : la loi du menu « … » (auteur, modération) les lit. */
    val viewerId: String? = null,
    val viewerRole: String? = null,
    /** La publication a fermé ses commentaires (#16541) : le fil reste lisible, le composeur cède la place au bandeau. */
    val commentsClosed: Boolean = false,
) {
    /** Envoyer : du texte ou une pièce, rien qui se téléverse encore, aucun envoi en vol. */
    val canSubmit: Boolean get() = when (editing) {
        null -> (draft.isNotBlank() || attachments.hasMedia) && !attachments.isUploading && !isSubmitting
        else -> CommentEditing.canSend(draft, editing.hasMedia) && !isSubmitting
    }
}

/**
 * The projected reply thread beneath one top-level comment. When [isExpanded] the full loaded
 * list is shown; when [isPreview] (loaded but collapsed — auto-preloaded, or a manually-collapsed
 * thread falling back to its taste) only the first replies are shown, with [hiddenReplyCount]
 * more available behind a "View all" affordance.
 */
data class ReplyThreadUiState(
    val isExpanded: Boolean,
    val isLoading: Boolean,
    val replies: List<CommentPresentation>,
    val isPreview: Boolean = false,
    val hiddenReplyCount: Int = 0,
)

/**
 * The composer's active reply context: the *root* [parentId] the reply attaches to (flat
 * 2-level threading) and the targeted comment's [authorName] for the "Replying to …" chip.
 */
data class ReplyTarget(
    val parentId: String,
    val authorName: String?,
    /** Le commentaire VISÉ (pas sa racine) : l'ancre `comment-<id>` que la liste garde en vue au-dessus du clavier. */
    val commentId: String? = null,
    /** Sa première ligne, citée dans la bannière « en réponse à ». */
    val excerpt: String? = null,
)

