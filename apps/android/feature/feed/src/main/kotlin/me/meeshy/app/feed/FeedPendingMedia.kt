package me.meeshy.app.feed

import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia

/**
 * A composer media kept on the device while its upload waits (#13417): it stands in the draft
 * under its upload `cmid` — the id the queued post depends on and the outbox swaps for the real
 * one — with the picked item's own type and size, so the reel classification and the tile see
 * what the author picked. [preview] is the picked content Uri when there is one; [size] the shape a photo is seen in
 * ([me.meeshy.sdk.media.MediaUploadImageSize]), which its scene publishes as `aspectRatio` like iOS (#13612).
 */
internal object FeedPendingMedia {
    fun placeholder(cmid: String, item: MediaUploadItem, preview: String?, size: Pair<Int, Int>? = null): UploadedMedia = UploadedMedia(
        id = cmid,
        url = preview.orEmpty(),
        mimeType = item.mimeType,
        fileSize = item.sizeBytes,
        width = size?.first,
        height = size?.second,
        durationMs = null,
        thumbnailUrl = null,
    )
}
