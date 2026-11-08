package me.meeshy.ui.component.video

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.media.PendingPosterLayer
import me.meeshy.sdk.model.media.formatMediaDurationMillis
import me.meeshy.ui.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.icons.MeeshyIcons

public const val VideoPlayBadgeTestTag: String = "video-play-badge"
public const val VideoDurationBadgeTestTag: String = "video-duration-badge"

/**
 * Affiche statique d'une vidéo : aucune lecture instanciée. Ordre des couches (miroir de
 * `MeeshyVideoThumbnail`, iOS) : vignette serveur, sinon première image extraite ([extractedFrame]),
 * sinon le thumbHash qui patiente SANS spinner, le dégradé de [placeholderColor] n'étant que le repli
 * d'une pièce sans thumbHash. Badge play circulaire en verre centré et capsule de durée noire translucide
 * en bas à droite, en mono, tous deux optionnels. Tappable : libellé TalkBack « Lire la vidéo ».
 */
@Composable
public fun MeeshyVideoThumbnail(
    thumbnailUrl: String?,
    extractedFrame: ImageBitmap?,
    thumbHash: String?,
    placeholderColor: Color,
    accent: Color,
    durationMillis: Long?,
    modifier: Modifier = Modifier,
    showPlayBadge: Boolean = true,
    showDurationBadge: Boolean = true,
    cornerRadius: androidx.compose.ui.unit.Dp = 0.dp,
    onClick: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(cornerRadius)
    val playLabel = stringResource(R.string.video_poster_play)
    val base = modifier.clip(shape)
    val interactive = if (onClick == null) {
        base.semantics { contentDescription = "" }
    } else {
        base
            .clickable(role = Role.Button, onClickLabel = playLabel, onClick = onClick)
            .semantics { contentDescription = playLabel; role = Role.Button }
    }
    Box(interactive, contentAlignment = Alignment.Center) {
        PosterLayer(thumbnailUrl, extractedFrame, thumbHash, placeholderColor)
        if (showPlayBadge) PlayBadge(accent)
        val duration = if (showDurationBadge) formatMediaDurationMillis(durationMillis) else null
        if (duration != null) DurationBadge(duration, Modifier.align(Alignment.BottomEnd))
    }
}

@Composable
private fun PosterLayer(url: String?, frame: ImageBitmap?, thumbHash: String?, color: Color) {
    val hash = rememberThumbHashPainter(thumbHash)
    val pending = PendingPosterLayer.of(thumbHash)
    when {
        !url.isNullOrEmpty() -> Box(Modifier.fillMaxSize()) {
            hash?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        frame != null -> Image(frame, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        pending == PendingPosterLayer.THUMB_HASH && hash != null ->
            Image(hash, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else -> Box(
            Modifier.fillMaxSize().background(
                Brush.linearGradient(listOf(color.copy(alpha = 0.25f), color.copy(alpha = 0.08f))),
            ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Video, null, tint = Color.White.copy(alpha = 0.2f), modifier = Modifier.size(32.dp))
        }
    }
}

@Composable
private fun PlayBadge(accent: Color) {
    MeeshyGlassSurface(
        modifier = Modifier.size(48.dp).testTag(VideoPlayBadgeTestTag),
        shape = CircleShape,
        tint = accent,
    ) {
        Box(Modifier.fillMaxSize().clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
            Icon(MeeshyIcons.Play, null, tint = Color.White, modifier = Modifier.size(28.dp))
        }
    }
}

@Composable
private fun DurationBadge(text: String, modifier: Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        modifier = modifier
            .padding(MeeshySpacing.xs)
            .clip(RoundedCornerShape(MeeshyRadius.xl))
            .background(Color.Black.copy(alpha = 0.6f))
            .padding(horizontal = MeeshySpacing.xs + MeeshySpacing.xxs, vertical = MeeshySpacing.xxs)
            .testTag(VideoDurationBadgeTestTag),
    )
}
