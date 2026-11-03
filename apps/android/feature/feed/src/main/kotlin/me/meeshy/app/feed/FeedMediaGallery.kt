package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.GalleryAttribution
import me.meeshy.sdk.model.GalleryPage
import me.meeshy.sdk.model.GalleryPageKind
import me.meeshy.sdk.model.SocialMediaGallery
import me.meeshy.sdk.model.SocialMediaGalleryPresentation

/**
 * One page of a feed post's fullscreen media gallery: the full-resolution image
 * [url] plus its own [caption] (the media's caption; the post text only for a
 * single-visual post), the author [authorName] and the [createdAtIso]
 * sent-timestamp to surface in the viewer chrome. Every image of a post shares
 * the author / timestamp, never the caption.
 */
@Immutable
data class FeedGalleryPage(
    val url: String,
    /**
     * Vignette basse résolution, portée séparément du plein format ([url]) — le
     * fond flou assumé pendant que le plein format charge (#3878), jamais
     * l'image affichée nette elle-même.
     */
    val thumbnailUrl: String? = null,
    val caption: String? = null,
    val authorName: String? = null,
    val createdAtIso: String? = null,
    /** This page's own [FeedPostImage.alt] (#6739) — unlike [caption], per-image, not shared across pages. */
    val alt: String? = null,
    /** L'identifiant du média du post que la page montre — l'ancre d'une citation « commenter ce média ». */
    val mediaId: String? = null,
    /** La page montre une VIDÉO : [FeedGalleryPage.url] est alors le fichier vidéo et [FeedGalleryPage.thumbnailUrl] son poster. */
    val isVideo: Boolean = false,
    val durationMillis: Int? = null,
)

/**
 * The fullscreen media gallery resolved for a single feed post: every image of the
 * post flattened in order as [pages], plus the [startIndex] of the tapped image.
 *
 * Port of iOS's feed post lightbox: tapping any tile of a post's media collage
 * opens a pager across *that post's* images, positioned on the tapped one.
 */
@Immutable
data class FeedGallery(
    val pages: List<FeedGalleryPage>,
    val startIndex: Int,
    /** Le post dont la galerie feuillette aussi les médias de commentaires ; `null` : la galerie reste celle de ses images. */
    val postId: String? = null,
    val commentCount: Int = 0,
    val authorId: String? = null,
    val authorAvatarUrl: String? = null,
    /** L'accent de l'auteur (hex), passé en paramètre à la pellicule. */
    val accentHex: String? = null,
) {
    /** The full-resolution image URLs, one per page, in post order. */
    val imageUrls: List<String> get() = pages.map { it.url }

    /**
     * The per-page thumbnail URLs, positionally aligned with [imageUrls]; a page
     * with no thumbnail holds `null`.
     */
    val thumbnailUrls: List<String?> get() = pages.map { it.thumbnailUrl }

    /**
     * The per-page captions, positionally aligned with [imageUrls]; a page with no
     * caption holds `null` (the viewer shows no overlay for it).
     */
    val captions: List<String?> get() = pages.map { it.caption }

    /**
     * The per-page accessibility descriptions, positionally aligned with
     * [imageUrls] (#6739); a page with no author-authored alt text holds `null`
     * (the viewer falls back to its own generic label).
     */
    val altTexts: List<String?> get() = pages.map { it.alt }

    /**
     * The per-page author names, positionally aligned with [imageUrls]; `null` when
     * the post has no resolvable author.
     */
    val authorNames: List<String?> get() = pages.map { it.authorName }

    /**
     * The per-page sent-timestamps (ISO-8601), positionally aligned with
     * [imageUrls]; `null` when the post carries no timestamp.
     */
    val createdAtIsos: List<String?> get() = pages.map { it.createdAtIso }

    /** True when the post carries no showable image — nothing to open. */
    val isEmpty: Boolean get() = pages.isEmpty()
}

/**
 * Pure SSOT that flattens a feed post's images into the fullscreen gallery and
 * resolves where a tap lands.
 *
 * The pages carry the post's *full-resolution* URLs (never the collage thumbnail)
 * so the lightbox is crisp. Each page shows its OWN media caption
 * (`PostMedia.caption`) — `Post.content`, `PostMedia.caption` and alt are three
 * contents, never repeated across pages. The post text is only the fallback of a
 * post with ONE visual (iOS `SocialMediaCaption.map`, `CommentMediaGallery.swift`).
 * Every page carries the post author / timestamp for the viewer chrome. The
 * [startIndex] is the tapped image clamped into the post's own bounds, so an
 * out-of-range or negative index never escapes the gallery. A post with no image
 * yields an empty gallery (`isEmpty` — nothing to open).
 */
object FeedMediaGallery {

    private val EMPTY = FeedGallery(emptyList(), 0)

    fun of(post: FeedPostPresentation, imageIndex: Int): FeedGallery {
        val images = post.images
        if (images.isEmpty()) return EMPTY
        val carrierText = post.content.takeIf { images.size == 1 }
        val authorName = post.authorName?.trim()?.ifBlank { null }
        val createdAtIso = post.createdAtIso?.trim()?.ifBlank { null }
        val pages = images.map { image ->
            FeedGalleryPage(
                url = image.url,
                thumbnailUrl = image.thumbnailUrl,
                caption = mediaCaption(own = image.caption, carrierText = carrierText),
                authorName = authorName,
                createdAtIso = createdAtIso,
                alt = image.alt,
                mediaId = image.id,
            )
        }
        return FeedGallery(
            pages = pages,
            startIndex = imageIndex.coerceIn(0, pages.lastIndex),
            postId = post.id,
            commentCount = post.commentCount,
            authorId = post.authorId,
            authorAvatarUrl = post.authorAvatarUrl,
            accentHex = post.accentHex,
        )
    }

    /**
     * La galerie que la carte du fil ouvre : ses images ET ses vidéos, dans l'ordre du post ([FeedCardMediaRouting.visuals]).
     * [index] est le rang du média touché PARMI ces visuels. Une carte sans visuel n'ouvre rien.
     */
    fun ofVisuals(post: FeedPostPresentation, index: Int): FeedGallery {
        val visuals = FeedCardMediaRouting.visuals(post.media)
        if (visuals.isEmpty()) return EMPTY
        val carrierText = post.content.takeIf { visuals.size == 1 }
        val authorName = post.authorName?.trim()?.ifBlank { null }
        val createdAtIso = post.createdAtIso?.trim()?.ifBlank { null }
        val pages = visuals.map { item ->
            FeedGalleryPage(
                url = item.url,
                thumbnailUrl = item.thumbnailUrl,
                caption = mediaCaption(own = item.caption, carrierText = carrierText),
                authorName = authorName,
                createdAtIso = createdAtIso,
                alt = item.alt,
                mediaId = item.id,
                isVideo = item.type == FeedMediaType.VIDEO,
                durationMillis = item.durationSeconds?.let { it * 1000 },
            )
        }
        return FeedGallery(
            pages = pages,
            startIndex = index.coerceIn(0, pages.lastIndex),
            postId = post.id,
            commentCount = post.commentCount,
            authorId = post.authorId,
            authorAvatarUrl = post.authorAvatarUrl,
            accentHex = post.accentHex,
        )
    }

    /**
     * La galerie des visuels d'un post CITÉ ([embed]) : ses images et vidéos dans l'ordre serveur, attribuées à l'auteur CITÉ
     * (jamais au post extérieur). [index] est le rang du média touché parmi ces visuels.
     */
    fun ofQuotedVisuals(embed: RepostEmbedPresentation, index: Int): FeedGallery {
        val visuals = FeedCardMediaRouting.visuals(embed.media)
        if (visuals.isEmpty()) return EMPTY
        val carrierText = embed.content.takeIf { visuals.size == 1 }
        val authorName = embed.authorName?.trim()?.ifBlank { null }
        val createdAtIso = embed.createdAtIso?.trim()?.ifBlank { null }
        val pages = visuals.map { item ->
            FeedGalleryPage(
                url = item.url,
                thumbnailUrl = item.thumbnailUrl,
                caption = mediaCaption(own = item.caption, carrierText = carrierText),
                authorName = authorName,
                createdAtIso = createdAtIso,
                alt = item.alt,
                mediaId = item.id,
                isVideo = item.type == FeedMediaType.VIDEO,
                durationMillis = item.durationSeconds?.let { it * 1000 },
            )
        }
        return FeedGallery(
            pages = pages,
            startIndex = index.coerceIn(0, pages.lastIndex),
            postId = embed.id,
            authorId = embed.authorId,
            authorAvatarUrl = embed.authorAvatarUrl,
        )
    }

    /**
     * La galerie sociale de [gallery] : ses images (légendes déjà servies par le Prisme, auteur par page) suivies des médias
     * des [comments] du post — la composition commune de `SocialMediaGalleryPresentation`, que le fil rejoint avec ce qu'il tient.
     */
    fun social(
        gallery: FeedGallery,
        comments: List<ApiPostComment>,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): SocialMediaGallery {
        val publication = gallery.pages.mapIndexed { index, page ->
            GalleryPage(
                id = page.mediaId ?: "${gallery.postId.orEmpty()}#$index",
                kind = if (page.isVideo) GalleryPageKind.VIDEO else GalleryPageKind.IMAGE,
                url = page.url,
                thumbnailUrl = page.thumbnailUrl,
                caption = page.caption,
                alt = page.alt?.takeIf { it.isNotBlank() },
                durationMillis = page.durationMillis,
                attribution = GalleryAttribution(
                    name = page.authorName,
                    avatarUrl = gallery.authorAvatarUrl,
                    createdAtIso = page.createdAtIso,
                    userId = gallery.authorId,
                ),
                postMediaId = page.mediaId,
            )
        }
        return SocialMediaGalleryPresentation.following(publication, comments, prefs)
    }

    private fun mediaCaption(own: String?, carrierText: String?): String? =
        listOf(own, carrierText).firstNotNullOfOrNull { it?.trim()?.ifBlank { null } }

    /** La clé du zoom carte → galerie : seulement quand la galerie s'ouvre sur la scène du post, jamais sur un média du carrousel. */
    internal fun zoomKey(postId: String, hasScene: Boolean, startMediaId: String?): String? =
        SceneZoomPolicy.destinationKey(postId, hasScene, startMediaId)
}
