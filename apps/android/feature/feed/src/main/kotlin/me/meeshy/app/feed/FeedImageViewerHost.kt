package me.meeshy.app.feed

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.viewer.MeeshyImageViewer
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings

/** Visionneuse plein écran des images d'un post du fil, rendue tant que [gallery] est non nulle. */
@Composable
internal fun FeedImageViewerHost(
    gallery: FeedGallery,
    onDismiss: () -> Unit,
) {
    val strings = rememberRelativeTimeStrings()
    val galleryNow = remember(gallery) { System.currentTimeMillis() }
    val galleryTimestamps = remember(gallery, strings) {
        gallery.createdAtIsos.map { iso ->
            iso?.let { isoToEpochMillisOrNull(it) }?.let { millis ->
                RelativeTimeFormat.short(
                    epochMillis = millis,
                    referenceMillis = galleryNow,
                    zone = ZoneId.systemDefault(),
                    locale = Locale.getDefault(),
                    strings = strings,
                )
            }
        }
    }
    val galleryContext = LocalContext.current
    val savedMessage = stringResource(R.string.feed_media_saved)
    val saveFailedMessage = stringResource(R.string.feed_media_save_failed)
    MeeshyImageViewer(
        imageUrls = gallery.imageUrls,
        initialIndex = gallery.startIndex,
        onDismiss = onDismiss,
        captions = gallery.captions,
        authors = gallery.authorNames,
        timestamps = galleryTimestamps,
        thumbnailUrls = gallery.thumbnailUrls,
        altTexts = gallery.altTexts,
        onImageSaved = { result ->
            val message = if (result.isSuccess) savedMessage else saveFailedMessage
            Toast.makeText(galleryContext, message, Toast.LENGTH_SHORT).show()
        },
    )
}
