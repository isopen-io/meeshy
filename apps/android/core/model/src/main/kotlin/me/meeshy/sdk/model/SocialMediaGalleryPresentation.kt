package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.ReaderPrism

/** La nature d'une page de la galerie sociale : image, vidéo du pool, ou scène (emplacement branchable). */
enum class GalleryPageKind { IMAGE, VIDEO, SCENE }

/** Qui a posé la page : l'auteur du post, ou celui du commentaire qui la porte ([commentId]). */
data class GalleryAttribution(
    val name: String?,
    val avatarUrl: String?,
    val createdAtIso: String?,
    val commentId: String? = null,
    /** Le compte de l'auteur, d'où se lit son point de présence ; `null` = aucun point. */
    val userId: String? = null,
)

/** Une scène du post telle que l'hôte la déclare au composeur ; la peinture revient au lot de scène. */
data class GalleryScenePage(
    val index: Int,
    val mediaId: String?,
    val caption: String?,
    val thumbnailUrl: String?,
)

/** Une page de la galerie : son média, sa légende servie par le Prisme, son auteur. */
data class GalleryPage(
    val id: String,
    val kind: GalleryPageKind,
    val url: String?,
    val thumbnailUrl: String?,
    val caption: String?,
    val alt: String?,
    val attribution: GalleryAttribution,
    /** Le média du POST que la page montre (une scène montre celui de son fond) ; `null` pour un média de commentaire. */
    val postMediaId: String?,
    val durationMillis: Int? = null,
) {
    /** Hors page image, le chemin média reçoit une pièce synthétique : aucune consommation, aucun téléchargement. */
    val hasSyntheticAttachment: Boolean get() = kind != GalleryPageKind.IMAGE

    /** Une pièce de publication n'est pas une pièce de message : aucune consommation à reporter. */
    val reportsConsumption: Boolean get() = false
}

/** La galerie composée : les pages, dans l'ordre de la pellicule. */
data class SocialMediaGallery(val pages: List<GalleryPage>) {

    val isEmpty: Boolean get() = pages.isEmpty()

    /** La page d'entrée : le média demandé, sinon la scène qui le montre, sinon la scène d'index [startSceneIndex], sinon la première. */
    fun entryIndex(startMediaId: String?, startSceneIndex: Int): Int {
        if (startMediaId != null) {
            pages.indexOfFirst { it.id == startMediaId }.takeIf { it >= 0 }?.let { return it }
            pages.indexOfFirst { it.kind == GalleryPageKind.SCENE && it.postMediaId == startMediaId }
                .takeIf { it >= 0 }?.let { return it }
        }
        val scenes = pages.withIndex().filter { it.value.kind == GalleryPageKind.SCENE }
        if (scenes.isEmpty()) return 0
        return scenes[startSceneIndex.coerceIn(0, scenes.lastIndex)].index
    }

    /** « Commenter ce média » : la citation du média du POST que la page montre ; un média de commentaire ne se cite pas. */
    fun quotation(pageId: String, post: ApiPost): CommentQuotedMedia? {
        val mediaId = pages.firstOrNull { it.id == pageId }?.postMediaId ?: return null
        val media = post.media.orEmpty().firstOrNull { it.id == mediaId } ?: return null
        val kind = when (media.galleryKind()) {
            GalleryPageKind.IMAGE -> CommentQuotedMedia.Kind.IMAGE
            GalleryPageKind.VIDEO -> CommentQuotedMedia.Kind.VIDEO
            else -> CommentQuotedMedia.Kind.FILE
        }
        return CommentQuotedMedia(postMediaId = media.id, kind = kind, media = media)
    }
}

/** Image ou vidéo : seules natures paginées (l'audio, le lieu et les documents ne feuillettent pas). */
fun ApiPostMedia.galleryKind(): GalleryPageKind? = when {
    mimeType?.startsWith("image/", ignoreCase = true) == true -> GalleryPageKind.IMAGE
    mimeType?.startsWith("video/", ignoreCase = true) == true -> GalleryPageKind.VIDEO
    else -> null
}

/**
 * **UN site compose la galerie** d'un post pour le fil, le détail, le commentaire et le reel — miroir de
 * `PostGalleryLot.compose` iOS : les pages du post (ses scènes quand l'hôte en déclare, ses médias sinon), suivies
 * des médias de ses commentaires, chaque page servie dans la langue du lecteur (Prisme) avec son auteur.
 */
object SocialMediaGalleryPresentation {

    fun compose(
        post: ApiPost,
        comments: List<ApiPostComment>,
        prefs: LanguageResolver.ContentLanguagePreferences,
        scenes: List<GalleryScenePage> = emptyList(),
    ): SocialMediaGallery {
        val reader = ReaderPrism.resolve(prefs)
        val publication = if (scenes.isEmpty()) mediaPages(post, prefs, reader) else scenePages(post, scenes)
        return following(publication, comments, prefs)
    }

    /**
     * [publication] (les pages que l'hôte a déjà composées pour le post) suivie des médias de [comments] ; un identifiant
     * déjà vu garde sa première page. Le site où le fil, qui ne tient qu'une projection du post, rejoint la loi commune.
     */
    fun following(
        publication: List<GalleryPage>,
        comments: List<ApiPostComment>,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): SocialMediaGallery {
        val reader = ReaderPrism.resolve(prefs)
        val seen = HashSet<String>()
        val pages = publication + comments.flatMap { commentPages(it, prefs, reader) }
        return SocialMediaGallery(pages.filter { seen.add(it.id) })
    }

    private fun attribution(post: ApiPost) = GalleryAttribution(
        name = post.author.displayLabel(), avatarUrl = post.author?.avatar, createdAtIso = post.createdAt,
        userId = post.author?.id,
    )

    private fun ApiAuthor?.displayLabel(): String? =
        this?.let { it.displayName?.takeIf(String::isNotBlank) ?: it.username?.takeIf(String::isNotBlank) }

    private fun scenePages(post: ApiPost, scenes: List<GalleryScenePage>): List<GalleryPage> =
        scenes.map { scene ->
            GalleryPage(
                id = "scene:${post.id}#${scene.index}",
                kind = GalleryPageKind.SCENE,
                url = null,
                thumbnailUrl = scene.thumbnailUrl,
                caption = scene.caption.trimmedOrNull(),
                alt = null,
                attribution = attribution(post),
                postMediaId = scene.mediaId,
            )
        }

    private fun mediaPages(
        post: ApiPost,
        prefs: LanguageResolver.ContentLanguagePreferences,
        reader: List<String>,
    ): List<GalleryPage> {
        val pageable = post.media.orEmpty().filter { it.galleryKind() != null }
        val carrier = post.displayContent(prefs).takeIf { pageable.size == 1 }
        val author = attribution(post)
        return pageable.map { it.toPage(caption = firstText(it.resolvedCaption(reader), carrier), author, postMediaId = it.id) }
    }

    private fun commentPages(
        comment: ApiPostComment,
        prefs: LanguageResolver.ContentLanguagePreferences,
        reader: List<String>,
    ): List<GalleryPage> {
        val author = GalleryAttribution(
            name = comment.author.displayLabel(), avatarUrl = comment.author?.avatar,
            createdAtIso = comment.createdAt, commentId = comment.id, userId = comment.author?.id,
        )
        val carrier = comment.displayContent(prefs)
        return comment.media.orEmpty().filter { it.galleryKind() != null }
            .map { it.toPage(caption = firstText(it.resolvedCaption(reader), carrier), author, postMediaId = null) }
    }

    private fun ApiPostMedia.toPage(caption: String?, author: GalleryAttribution, postMediaId: String?) = GalleryPage(
        id = id,
        kind = galleryKind() ?: GalleryPageKind.IMAGE,
        url = fileUrl,
        thumbnailUrl = thumbnailUrl,
        caption = caption,
        alt = alt?.takeIf(String::isNotBlank),
        attribution = author,
        postMediaId = postMediaId,
        durationMillis = duration,
    )

    private fun firstText(own: String?, carrier: String?): String? = own.trimmedOrNull() ?: carrier.trimmedOrNull()

    private fun String?.trimmedOrNull(): String? = this?.trim()?.ifEmpty { null }
}
