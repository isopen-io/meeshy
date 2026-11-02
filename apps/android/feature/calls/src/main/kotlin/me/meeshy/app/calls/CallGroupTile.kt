package me.meeshy.app.calls

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor
import org.webrtc.EglBase
import org.webrtc.VideoTrack

/** Ce que TalkBack lit d'une vignette : son nom (ou son titre à la une), puis ses états — iOS `GroupCallTileView`. */
internal data class CallGroupTileSpeech(val name: String, val states: String)

@Composable
internal fun callGroupTileSpeech(tile: GroupCallStageTile, title: String?): CallGroupTileSpeech {
    val name = title ?: tile.displayName.ifBlank { stringResource(R.string.call_group_tile_unknown) }
    val states = listOfNotNull(
        stringResource(R.string.call_group_tile_speaking).takeIf { tile.isSpeaking },
        stringResource(R.string.call_group_tile_mic_muted).takeIf { tile.isMicMuted },
        stringResource(R.string.call_group_tile_camera_off).takeIf { !tile.showsVideo },
        stringResource(R.string.call_group_tile_screen_sharing).takeIf { tile.isScreenSharing },
        stringResource(R.string.call_group_tile_reconnecting).takeIf { tile.isReconnecting },
    ).joinToString(", ")
    return CallGroupTileSpeech(name, states)
}

/**
 * Une vignette d'appel de groupe — iOS `GroupCallTileView` : la vidéo du membre, ou son avatar caméra coupée ; sa
 * plaque (micro coupé, partage d'écran, reconnexion, nom ou « Écran de X » à la une) ; un liseré à SA couleur, épaissi
 * et plein tant qu'il parle (#13751).
 * Muette pour l'accessibilité : l'hôte la nomme et la rend actionnable.
 */
@Composable
internal fun CallGroupTile(
    tile: GroupCallStageTile,
    track: VideoTrack?,
    eglContext: EglBase.Context,
    mirror: Boolean,
    modifier: Modifier = Modifier,
    fit: Boolean = false,
    title: String? = null,
    zoom: Float = 1f,
) {
    val accent = remember(tile.colorKey) {
        hexColor(DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(tile.colorKey), DynamicColorGenerator.ThemeMode.DARK))
    }
    val shape = RoundedCornerShape(TILE_RADIUS)
    val reduceMotion = rememberCallReduceMotion()
    val ring: AnimationSpec<Dp> = if (reduceMotion) snap() else tween(SPEAKING_FADE_MILLIS, easing = FastOutSlowInEasing)
    val ringWidth by animateDpAsState(if (tile.isSpeaking) SPEAKING_BORDER_WIDTH else BORDER_WIDTH, ring, label = "tileRingWidth")
    val ringAlpha by animateFloatAsState(
        if (tile.isSpeaking) 1f else BORDER_ALPHA,
        if (reduceMotion) snap() else tween(SPEAKING_FADE_MILLIS, easing = FastOutSlowInEasing),
        label = "tileRingAlpha",
    )
    BoxWithConstraints(
        modifier
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .alpha(if (tile.isReconnecting) RECONNECTING_ALPHA else 1f)
            .border(ringWidth, accent.copy(alpha = ringAlpha), shape)
            .clearAndSetSemantics { },
    ) {
        if (track != null) {
            VideoRenderer(
                track = track,
                eglContext = eglContext,
                mirror = mirror,
                fit = fit,
                modifier = Modifier.fillMaxSize().graphicsLayer {
                    scaleX = zoom
                    scaleY = zoom
                },
            )
        } else {
            val name = tile.displayName.ifBlank { "?" }
            MeeshyAvatar(
                name = name,
                imageUrl = tile.avatarUrl,
                size = avatarSize(minOf(maxWidth, maxHeight)),
                modifier = Modifier.align(Alignment.Center),
            )
        }
        CallGroupTilePlate(tile, title, Modifier.align(Alignment.BottomStart).padding(MeeshySpacing.sm))
    }
}

@Composable
private fun CallGroupTilePlate(tile: GroupCallStageTile, title: String?, modifier: Modifier) {
    val name = title ?: tile.displayName.ifBlank { stringResource(R.string.call_group_tile_unknown) }
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(TILE_RADIUS))
            .background(MaterialTheme.colorScheme.scrim.copy(alpha = LABEL_SCRIM_ALPHA))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        if (tile.isMicMuted) {
            Icon(MeeshyIcons.MicOff, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(PLATE_ICON))
        }
        if (tile.isScreenSharing) {
            Icon(MeeshyIcons.FlipToFront, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(PLATE_ICON))
        }
        if (tile.isReconnecting) {
            Icon(MeeshyIcons.Sync, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(PLATE_ICON))
        }
        Text(
            text = name,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** iOS : l'avatar occupe 42 % du petit côté de la vignette. */
private fun avatarSize(side: Dp): Dp = side * AVATAR_RATIO

private val TILE_RADIUS = 16.dp
private val PLATE_ICON = 14.dp
private val BORDER_WIDTH = 1.5.dp
private val SPEAKING_BORDER_WIDTH = 3.dp
private const val SPEAKING_FADE_MILLIS = 200
private const val BORDER_ALPHA = 0.55f
private const val AVATAR_RATIO = 0.42f
private const val RECONNECTING_ALPHA = 0.6f
private const val LABEL_SCRIM_ALPHA = 0.55f
