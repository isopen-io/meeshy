package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.bubble.LocalBubbleMediaAutoDownload
import me.meeshy.ui.component.bubble.LocalBubbleVideoPrefetcher
import me.meeshy.ui.component.video.MeeshyVideoThumbnail
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

internal const val FEED_VIDEO_DURATION_TAG: String = "feed-video-duration"
internal const val FEED_VIDEO_DOWNLOAD_TAG: String = "feed-video-download"

/**
 * **La vidéo d'une carte du fil** (iOS `FeedVideoMediaCell`) : le poster (thumbHash qui patiente sans spinner, puis la vignette),
 * le glyphe de lecture et la durée en pilule BAS-GAUCHE. La lecture s'ouvre dans la galerie plein écran partagée.
 * La politique d'auto-téléchargement ([FeedVideoCellPolicy], la MÊME que la bulle) décide du reste :
 * AUTO met le fichier en cache de lecture, MANUAL pose le glyphe « Télécharger la vidéo », OFFLINE garde la vignette sans lecture.
 */
@Composable
internal fun FeedVideoMediaCell(
    item: FeedMediaItem,
    accent: Color,
    description: String,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val policy = LocalBubbleMediaAutoDownload.current
    val prefetcher = LocalBubbleVideoPrefetcher.current
    val mode = remember(policy) { FeedVideoCellPolicy.mode(policy) }
    if (mode == FeedVideoCellMode.AUTO && prefetcher != null) {
        LaunchedEffect(item.url) { prefetcher.prefetch(item.url) }
    }
    val tint = hexColor(item.thumbnailColor, MeeshyPalette.Indigo500)
    val openLabel = stringResource(R.string.feed_media_view_fullscreen)
    val canOpen = onOpen != null && mode != FeedVideoCellMode.OFFLINE
    Box(
        modifier = modifier.clearAndSetSemantics {
            contentDescription = description
            if (canOpen) {
                role = androidx.compose.ui.semantics.Role.Button
                onClick(label = openLabel) { onOpen?.invoke(); true }
            }
        },
    ) {
        MeeshyVideoThumbnail(
            thumbnailUrl = item.thumbnailUrl,
            extractedFrame = null,
            thumbHash = item.thumbHash,
            placeholderColor = tint,
            accent = accent,
            durationMillis = null,
            modifier = Modifier.fillMaxSize(),
            showPlayBadge = mode == FeedVideoCellMode.AUTO,
            showDurationBadge = false,
            onClick = onOpen.takeIf { canOpen },
        )
        if (mode != FeedVideoCellMode.AUTO) {
            Box(
                modifier = Modifier.align(Alignment.Center).size(48.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).testTag(FEED_VIDEO_DOWNLOAD_TAG),
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Download, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            }
        }
        item.durationLabel?.let { duration ->
            Text(
                text = duration,
                style = MaterialTheme.typography.labelSmall,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(MeeshySpacing.sm)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(MeeshyRadius.pill))
                    .background(Color.Black.copy(alpha = 0.6f))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs)
                    .testTag(FEED_VIDEO_DURATION_TAG),
            )
        }
    }
}
