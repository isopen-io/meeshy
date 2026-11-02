package me.meeshy.app.stories

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaUploadImageSize
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.scene.ForegroundMediaFrame

/**
 * La forme d'un média posé encore sur l'appareil, lue comme le lecteur la verra (bornes décodées, orientation EXIF
 * appliquée), sans décoder un pixel : la scène le cadre à son ratio dès la pose, au lieu d'un carré qui saute à la forme
 * de la photo quand elle est partie. `null` pour ce qui n'est pas une image décodable.
 */
internal object PendingPlacedMediaRatio {
    suspend fun of(item: MediaUploadItem): Double? = withContext(Dispatchers.IO) {
        MediaUploadImageSize.of(item)?.let { (width, height) -> ForegroundMediaFrame.measuredAspectRatio(width, height) }
    }
}
