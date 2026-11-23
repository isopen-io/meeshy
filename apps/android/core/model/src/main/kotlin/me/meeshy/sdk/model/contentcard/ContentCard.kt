package me.meeshy.sdk.model.contentcard

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.postTypeFromWire

/**
 * **La carte VIVANTE d'un contenu Meeshy (#19331)**, telle que la bulle et le texte d'un post la montrent : le post
 * que le lecteur a le droit de lire, projeté une fois ([ContentCardProjection]). Les adresses de média restent des
 * CLÉS : l'écran les résout par sa base de média, comme toute autre image.
 */
data class ContentCard(
    /** Le post que le lien désigne, et que le toucher ouvre. */
    val postId: String,
    /** Son genre : la pastille, le libellé dit et la destination du toucher. */
    val type: PostType,
    val author: ContentCardAuthor,
    /** Servi par le Prisme du lecteur ; vide quand le contenu n'a pas de texte. */
    val text: String,
    val moodEmoji: String?,
    val media: ContentCardMedia?,
    val stats: ContentCardStats,
    val createdAtIso: String?,
) {
    /** Trois lignes de texte, deux sous un bloc média. */
    val textMaxLines: Int get() = if (media == null) TEXT_LINES else TEXT_LINES_UNDER_MEDIA

    private companion object {
        const val TEXT_LINES = 3
        const val TEXT_LINES_UNDER_MEDIA = 2
    }
}

/** L'auteur : son nom affiché, sinon `@pseudo`. */
data class ContentCardAuthor(val id: String?, val name: String, val avatarUrl: String?)

/** Les compteurs : les vues pour tout lecteur, et les favoris (le seul compteur d'enregistrements). */
data class ContentCardStats(
    val views: Int,
    val likes: Int,
    val comments: Int,
    val bookmarks: Int,
    val isBookmarkedByMe: Boolean,
)

/** Le premier média VISUEL : sa vignette, son cadre, sa durée de vidéo, et combien d'autres le suivent. */
data class ContentCardMedia(
    val imageUrl: String?,
    val thumbHash: String?,
    val isVideo: Boolean,
    val durationSeconds: Int?,
    /** Largeur sur hauteur du cadre. */
    val aspectRatio: Float,
    val maxHeightDp: Int,
    /** Les médias visuels en plus du premier (« +N »). */
    val extraCount: Int,
)

/**
 * Le post servi → la carte. Le texte descend le Prisme du lecteur par [displayContent] (la descente unique des posts,
 * jamais une nouvelle boucle). Une republication SANS texte ni média propres montre l'original — son auteur, son texte,
 * son média, sa date — et garde son identité et ses compteurs : c'est elle que le lien désigne et que le toucher ouvre.
 */
object ContentCardProjection {
    private const val MIN_ASPECT = 4f / 5f
    private const val MAX_ASPECT = 16f / 9f
    private const val UNKNOWN_ASPECT = 4f / 3f
    private const val PORTRAIT_ASPECT = 9f / 16f
    private const val MAX_HEIGHT_DP = 220
    private const val PORTRAIT_MAX_HEIGHT_DP = 260
    private const val MILLIS_PER_SECOND = 1000

    private object NoPreferences : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    /** [linkType] : le genre que l'adresse annonçait, quand le post servi ne dit pas le sien. */
    fun of(post: ApiPost, prefs: LanguageResolver.ContentLanguagePreferences?, linkType: PostType?): ContentCard {
        val reader = prefs ?: NoPreferences
        val type = postTypeFromWire(post.type) ?: linkType ?: PostType.POST
        val original = post.repostOf?.takeIf { post.content.isNullOrBlank() && post.media.isNullOrEmpty() }
        val shownType = original?.let { postTypeFromWire(it.type) } ?: type
        return ContentCard(
            postId = post.id,
            type = type,
            author = authorOf(original?.author ?: post.author),
            text = (original?.displayContent(reader) ?: post.displayContent(reader)).trim(),
            moodEmoji = (if (original != null) original.moodEmoji else post.moodEmoji)?.takeIf { it.isNotBlank() },
            media = mediaOf(original?.media ?: post.media.orEmpty(), portrait = shownType == PostType.REEL || shownType == PostType.STORY),
            stats = ContentCardStats(
                views = post.viewCount.counted(),
                likes = post.likeCount.counted(),
                comments = post.commentCount.counted(),
                bookmarks = post.bookmarkCount.counted(),
                isBookmarkedByMe = post.isBookmarkedByMe == true,
            ),
            createdAtIso = original.dateOr(post),
        )
    }

    private fun ApiRepostOf?.dateOr(post: ApiPost): String? = if (this != null) createdAt else post.createdAt

    private fun authorOf(author: ApiAuthor?): ContentCardAuthor {
        val name = author?.displayName?.trim()?.takeIf { it.isNotEmpty() }
            ?: author?.username?.trim()?.takeIf { it.isNotEmpty() }?.let { "@$it" }
            ?: ""
        return ContentCardAuthor(id = author?.id, name = name, avatarUrl = author?.avatar?.takeIf { it.isNotBlank() })
    }

    private fun mediaOf(items: List<ApiPostMedia>, portrait: Boolean): ContentCardMedia? {
        val visual = items.filter(::isVisual)
        val first = visual.firstOrNull() ?: return null
        val isVideo = first.mimeType.isVideo()
        val thumbnail = first.thumbnailUrl?.takeIf { it.isNotBlank() }
        return ContentCardMedia(
            imageUrl = if (isVideo) thumbnail else thumbnail ?: first.fileUrl?.takeIf { it.isNotBlank() },
            thumbHash = first.thumbHash?.takeIf { it.isNotBlank() },
            isVideo = isVideo,
            durationSeconds = first.duration?.takeIf { isVideo && it >= 0 }?.let { it / MILLIS_PER_SECOND },
            aspectRatio = if (portrait) PORTRAIT_ASPECT else aspectOf(first),
            maxHeightDp = if (portrait) PORTRAIT_MAX_HEIGHT_DP else MAX_HEIGHT_DP,
            extraCount = visual.size - 1,
        )
    }

    private fun aspectOf(media: ApiPostMedia): Float {
        val width = media.width?.takeIf { it > 0 } ?: return UNKNOWN_ASPECT
        val height = media.height?.takeIf { it > 0 } ?: return UNKNOWN_ASPECT
        return (width.toFloat() / height).coerceIn(MIN_ASPECT, MAX_ASPECT)
    }

    /** Une image, une vidéo — ou un média ancien sans type qui a une adresse, lu comme une image. Jamais un son ni un document. */
    private fun isVisual(media: ApiPostMedia): Boolean {
        val mime = media.mimeType?.trim()?.lowercase()
        if (mime.isNullOrEmpty()) return !media.thumbnailUrl.isNullOrBlank() || !media.fileUrl.isNullOrBlank()
        return mime.startsWith("image/") || mime.startsWith("video/")
    }

    private fun String?.isVideo(): Boolean = this?.trim()?.lowercase()?.startsWith("video/") == true

    private fun Int?.counted(): Int = (this ?: 0).coerceAtLeast(0)
}
