package me.meeshy.app.feed

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.flow.flowOf
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.GalleryPage
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.viewer.MeeshyMediaViewer
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

/**
 * Le geste « commenter ce média » : l'hôte qui sait ouvrir le composer de commentaires fournit ce receveur, qui reçoit le
 * post et le `postMediaId` cités. Absent, le bouton n'est pas offert — la galerie ne devine rien et n'écrit rien.
 */
val LocalGalleryMediaQuote = staticCompositionLocalOf<((postId: String, postMediaId: String) -> Unit)?> { null }

/** Le plein écran des médias d'un post du fil : ses images PUIS les médias de ses commentaires, rendu tant que [gallery] est non nulle. */
@Composable
internal fun FeedImageViewerHost(
    gallery: FeedGallery,
    onDismiss: () -> Unit,
    viewModel: SocialGalleryViewModel = hiltViewModel(),
) {
    val postId = gallery.postId
    val commentsFlow = remember(postId, gallery.commentCount) {
        if (postId == null) flowOf(emptyList()) else viewModel.comments(postId, gallery.commentCount)
    }
    val comments by commentsFlow.collectAsStateWithLifecycle(initialValue = emptyList<ApiPostComment>())
    val social = remember(gallery, comments) { FeedMediaGallery.social(gallery, comments, viewModel.preferences) }
    val strings = rememberRelativeTimeStrings()
    val now = remember(gallery) { System.currentTimeMillis() }
    val context = LocalContext.current
    val savedMessage = stringResource(R.string.feed_media_saved)
    val saveFailedMessage = stringResource(R.string.feed_media_save_failed)
    val quote = LocalGalleryMediaQuote.current
    val accent = remember(gallery.accentHex) { gallery.accentHex?.let { hexColor(it) }?.takeIf { it != Color.Unspecified } ?: MeeshyPalette.White }
    MeeshyMediaViewer(
        gallery = social,
        initialIndex = gallery.startIndex,
        accent = accent,
        onDismiss = onDismiss,
        timestampFor = { page: GalleryPage ->
            page.attribution.createdAtIso?.let { isoToEpochMillisOrNull(it) }?.let { millis ->
                RelativeTimeFormat.short(
                    epochMillis = millis,
                    referenceMillis = now,
                    zone = ZoneId.systemDefault(),
                    locale = Locale.getDefault(),
                    strings = strings,
                )
            }
        },
        canCommentMedia = { page -> postId != null && page.postMediaId != null },
        onCommentMedia = if (postId == null) {
            null
        } else {
            { page: GalleryPage ->
                page.postMediaId?.let {
                    viewModel.quoteMedia(gallery, postId, it)
                    quote?.invoke(postId, it)
                }
                onDismiss()
            }
        },
        onImageSaved = { result ->
            Toast.makeText(context, if (result.isSuccess) savedMessage else saveFailedMessage, Toast.LENGTH_SHORT).show()
        },
    )
}
