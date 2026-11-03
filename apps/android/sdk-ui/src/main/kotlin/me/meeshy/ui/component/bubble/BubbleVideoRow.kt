package me.meeshy.ui.component.bubble

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Image
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.media.VideoDisplayAspect
import me.meeshy.sdk.model.media.VideoDisplayAspectCache
import me.meeshy.sdk.model.media.formatMediaDuration
import me.meeshy.sdk.model.piece.PieceBadge
import me.meeshy.ui.R
import me.meeshy.ui.component.viewer.VideoFirstFrameExtractor
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val VIDEO_WIDTH = 252.dp

/** Le cache de session des ratios d'affichage, par URL : une vidéo déjà vue se dessine juste dès sa seconde apparition. */
internal val BubbleVideoAspectCache = VideoDisplayAspectCache()

/** Le ratio d'une vidéo de bulle : le cache (asset résolu), sinon la métadonnée, sinon 16:9 — jamais plus étroit que 9:16. */
internal fun bubbleVideoRatio(video: BubbleVideo, cache: VideoDisplayAspectCache = BubbleVideoAspectCache): Double {
    val cached = video.url?.let(cache::ratio)
    return VideoDisplayAspect.bubbleRatio(
        VideoDisplayAspect.resolve(assetWidth = null, assetHeight = null, rotationDegrees = 0, thumbnailRatio = cached, metadataRatio = video.metadataRatio),
    )
}

/**
 * La vidéo d'un message, dans la bulle (iOS `MeeshyVideoPlayer` `.inline`) : son poster (la vignette servie, ou la
 * première image d'un envoi local, tout de suite), sa durée, une barre de reprise, et — à la place du bouton lecture —
 * son état : « ↓ taille », anneau de téléchargement, ou « Vidéo indisponible. Réessayer. ». Un toucher ouvre la
 * vidéo dans le lecteur de Meeshy (jamais un `ACTION_VIEW`). Une vidéo protégée ne montre aucun poster.
 */
@Composable
internal fun BubbleVideoRow(
    video: BubbleVideo,
    badge: PieceBadge,
    accent: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val openLabel = stringResource(R.string.bubble_file_open)
    Box(
        modifier = modifier
            .width(VIDEO_WIDTH)
            .aspectRatio(bubbleVideoRatio(video).toFloat())
            .clip(shape)
            .background(Color.Black)
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = openLabel
                }
            },
    ) {
        if (!video.isProtected) VideoPoster(video)
        VideoStateBadge(video, badge)
        if (!video.isProtected) {
            MediaConsumptionProgressBar(
                accent = accent,
                modifier = Modifier.align(Alignment.BottomCenter),
                served = video.servedConsumption,
                totalDurationSeconds = (video.durationSeconds ?: 0).toDouble(),
            )
        }
        formatMediaDuration(video.durationSeconds?.toDouble())?.let { label ->
            Text(
                text = label,
                color = Color.White,
                style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(MeeshySpacing.xs)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f))
                    .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
            )
        }
    }
}

@Composable
internal fun VideoPoster(video: BubbleVideo) {
    val local = video.isOnDevice && video.thumbnailUrl == null
    if (local) {
        val frame by produceState<ImageBitmap?>(null, video.url) {
            val path = video.url?.takeIf { it.startsWith("file://") }?.let { Uri.parse(it).path }
            value = path?.let { VideoFirstFrameExtractor.extractFromFile(it)?.asImageBitmap() }
        }
        frame?.let { Image(bitmap = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    } else if (video.thumbnailUrl != null) {
        AsyncImage(model = video.thumbnailUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun BoxScope.VideoStateBadge(video: BubbleVideo, badge: PieceBadge) {
    val veil = remember { Color.Black.copy(alpha = 0.55f) }
    val center = Modifier.align(Alignment.Center)
    when {
        video.isOnDevice || badge is PieceBadge.None || badge is PieceBadge.Ready || badge is PieceBadge.Sealed ->
            Icon(MeeshyIcons.Play, contentDescription = null, tint = Color.White, modifier = center.size(44.dp).clip(CircleShape).background(veil).padding(MeeshySpacing.sm))
        badge is PieceBadge.Downloading -> CircularProgressIndicator(
            progress = { (badge.percent ?: 0) / 100f },
            color = Color.White,
            modifier = center.size(44.dp).background(veil, CircleShape).padding(MeeshySpacing.xsPlus),
        )
        badge is PieceBadge.Failed -> Text(
            text = stringResource(R.string.media_video_unavailable_retry),
            color = Color.White,
            style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
            modifier = center.clip(CircleShape).background(veil).padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        )
        badge is PieceBadge.Idle -> Text(
            text = "↓ " + (badge.sizeBytes?.let { formatFileSize(it) } ?: ""),
            color = Color.White,
            style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
            modifier = center.clip(CircleShape).background(veil).padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        )
    }
}
