package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.CommentQuotedMedia

/**
 * « Commenter ce média » depuis la galerie du fil (iOS `CommentQuotationStore.designate`) : la citation du média que la
 * page montre, vignette et légende comprises, pour que la puce du composeur la dise avant même qu'elle soit relue du
 * serveur. `null` quand la page n'est pas un média du post (un média de commentaire ne se cite pas).
 */
internal object GalleryMediaQuotation {

    fun of(gallery: FeedGallery, postMediaId: String): CommentQuotedMedia? {
        val page = gallery.pages.firstOrNull { it.mediaId == postMediaId } ?: return null
        return CommentQuotedMedia(
            postMediaId = postMediaId,
            kind = if (page.isVideo) CommentQuotedMedia.Kind.VIDEO else CommentQuotedMedia.Kind.IMAGE,
            media = ApiPostMedia(
                id = postMediaId,
                fileUrl = page.url.takeUnless { page.isVideo },
                thumbnailUrl = page.thumbnailUrl,
                caption = page.caption,
            ),
        )
    }
}
