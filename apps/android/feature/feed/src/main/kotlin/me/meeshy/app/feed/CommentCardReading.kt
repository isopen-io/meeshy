package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.card.PostCommentCardAuthor
import me.meeshy.sdk.model.card.PostCommentCardComment
import me.meeshy.sdk.model.card.PostCommentCardMedia
import me.meeshy.sdk.model.card.PostCommentCardMediaKind
import me.meeshy.sdk.model.card.PostCommentCardPost
import me.meeshy.sdk.model.card.PostCommentCardSource
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.sdk.model.card.PostCommentCardViewer
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Monte l'atelier « Imagine » sur la carte d'un commentaire (#13922). Le moteur de carte vit dans le module des
 * conversations, que le fil ne connaît pas : l'application le fournit, comme le moteur d'export des scènes
 * ([LocalSceneItemExportHost]). [key] identifie le commentaire imagé.
 */
typealias CommentCardExporter = @Composable (key: String, card: PostCommentCardSubject, onDismiss: () -> Unit) -> Unit

val LocalCommentCardExporter = staticCompositionLocalOf<CommentCardExporter?> { null }

/**
 * **CE QUE LE FIL REMET À LA COMPOSITION** (#13922, jumelle de `PostCommentCardSource.reading` iOS et de
 * `postCommentCardSourceOf` web) : le texte SERVI de chaque commentaire et du post (le Prisme), celui que la rangée visée
 * AFFICHE (sa puce de langue), et les médias que la carte peut nommer. Les règles vivent dans `PostCommentCardComposition`.
 */
internal object CommentCardReading {

    /** Le support d'un commentaire : le post tel que le fil le sert ([servedText], le Prisme ou la langue choisie). */
    fun support(post: ApiPost, servedText: String): PostCommentCardPost = PostCommentCardPost(
        type = post.type,
        visibility = post.visibility,
        createdAtMillis = isoToEpochMillisOrNull(post.createdAt) ?: 0L,
        author = authorOf(post.author),
        text = servedText,
        media = mediaOf(post.media),
        hasStoryCanvas = post.storyEffects != null,
    )

    /**
     * La source d'« Imager » pour [target] : son texte tel que sa rangée l'affiche ([shownText]), le fil chargé autour de
     * lui ([loaded], servi par le Prisme), les commentaires encore en vol ([pending]) et qui image ([viewer]).
     */
    fun source(
        target: ApiPostComment,
        shownText: String?,
        loaded: List<ApiPostComment>,
        pending: Set<String>,
        support: PostCommentCardPost?,
        viewer: MeeshyUser?,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): PostCommentCardSource = PostCommentCardSource(
        post = support,
        target = commentOf(target, shownText ?: target.displayContent(preferences), target.id in pending),
        thread = loaded.filter { it.id != target.id }.map { commentOf(it, it.displayContent(preferences), it.id in pending) },
        viewer = PostCommentCardViewer(
            id = viewer?.id.orEmpty(),
            displayName = viewer?.displayName?.takeIf { it.isNotBlank() } ?: viewer?.username.orEmpty(),
        ),
    )

    private fun commentOf(comment: ApiPostComment, text: String, inFlight: Boolean) = PostCommentCardComment(
        id = comment.id,
        parentId = comment.parentId?.takeIf { it.isNotBlank() },
        createdAtMillis = isoToEpochMillisOrNull(comment.createdAt) ?: 0L,
        author = authorOf(comment.author),
        text = text,
        effectFlags = (comment.effectFlags ?: 0).toLong(),
        inFlight = inFlight,
        media = mediaOf(comment.media),
    )

    private fun authorOf(author: ApiAuthor?) = PostCommentCardAuthor(
        id = author?.id.orEmpty(),
        displayName = author?.displayName,
        username = author?.username,
    )

    /** Les photos, vidéos et sons, dans leur ordre ; un document ou un lieu ne se nomme pas sur une carte. */
    private fun mediaOf(media: List<ApiPostMedia>?): List<PostCommentCardMedia> =
        media.orEmpty().sortedBy { it.order ?: 0 }.mapNotNull { piece -> kindOf(piece.mimeType)?.let { PostCommentCardMedia(piece.id, it) } }

    private fun kindOf(mimeType: String?): PostCommentCardMediaKind? {
        val type = mimeType?.lowercase().orEmpty()
        return when {
            type.startsWith("image/") -> PostCommentCardMediaKind.IMAGE
            type.startsWith("video/") -> PostCommentCardMediaKind.VIDEO
            type.startsWith("audio/") -> PostCommentCardMediaKind.AUDIO
            else -> null
        }
    }
}
