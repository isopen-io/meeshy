package me.meeshy.app.calls

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRemoteVideoFade
import me.meeshy.sdk.model.call.group.GroupCallStageTile
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
 * Une vignette d'appel de groupe — iOS `GroupCallTileView` : la vidéo du membre, ou son avatar caméra coupée teinté de
 * SA couleur ; sa plaque de verre (micro coupé, partage d'écran, reconnexion, nom de la personne — « Écran de X » se
 * lit sur la puce de la scène, U2.5) ; un
 * liseré à SA couleur, et, tant qu'il parle (moi compris), un halo de cette couleur et un liseré épaissi et plein
 * (#13751, P11.5). Le halo et le liseré fondent au rythme du fondu de l'image ([CallRemoteVideoFade]), plus court sous
 * « Réduire les animations » : jamais de bascule sèche.
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
    zoom: Float = 1f,
) {
    val accentHex = remember(tile.colorKey) { CallTileRim.groupTile(tile.colorKey) }
    val accent = remember(accentHex) { hexColor(accentHex) }
    val shape = RoundedCornerShape(TILE_RADIUS)
    val millis = CallRemoteVideoFade.durationMillis(rememberCallReduceMotion())
    val fade = tween<Float>(millis, easing = LinearEasing)
    val halo = animateFloatAsState(if (tile.isSpeaking) 1f else 0f, fade, label = "tileHalo")
    val ringWidth by animateDpAsState(
        if (tile.isSpeaking) SPEAKING_BORDER_WIDTH else BORDER_WIDTH,
        tween(millis, easing = FastOutSlowInEasing),
        label = "tileRingWidth",
    )
    val ringAlpha by animateFloatAsState(if (tile.isSpeaking) 1f else BORDER_ALPHA, fade, label = "tileRingAlpha")
    BoxWithConstraints(
        modifier
            .callTileHalo(accent, halo)
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
            CallAvatarDisc(
                name = tile.displayName.ifBlank { "?" },
                size = avatarSize(minOf(maxWidth, maxHeight)),
                avatarUrl = tile.avatarUrl,
                modifier = Modifier.align(Alignment.Center),
                faceHex = accentHex,
            )
        }
        CallGroupTilePlate(tile, Modifier.align(Alignment.BottomStart).padding(MeeshySpacing.sm))
    }
}

/**
 * P11.5 · P14.4 — le halo de qui parle, à SA couleur : trois couches translucides qui s'élargissent autour de la
 * vignette, posées DERRIÈRE elle et hors de son clip. Il reste dans l'arbre à force 0 au repos (l'hôte en règle le
 * fondu) et ne prend aucun toucher. Sa portée ([CALL_TILE_HALO_REACH]) reste sous l'espace entre deux vignettes.
 */
private fun Modifier.callTileHalo(color: Color, strength: State<Float>): Modifier = drawBehind {
    val force = strength.value
    if (force <= 0f) return@drawBehind
    repeat(HALO_LAYERS) { layer ->
        val grow = CALL_TILE_HALO_REACH.toPx() * (layer + 1) / HALO_LAYERS
        drawRoundRect(
            color = color.copy(alpha = HALO_LAYER_ALPHA * force),
            topLeft = Offset(-grow, -grow),
            size = Size(size.width + grow * 2, size.height + grow * 2),
            cornerRadius = CornerRadius(TILE_RADIUS.toPx() + grow),
        )
    }
}

/** P11.6 · P14.4 · U2.6 — la plaque du nom : une capsule de VERRE (l'atome de l'appel) au ton de l'écran (loi 3). */
@Composable
private fun CallGroupTilePlate(tile: GroupCallStageTile, modifier: Modifier) {
    val name = tile.displayName.ifBlank { stringResource(R.string.call_group_tile_unknown) }
    CallGlassPlate(modifier = modifier, shape = CircleShape) {
        CallToneScrim()
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            if (tile.isMicMuted) {
                Icon(MeeshyIcons.MicOff, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(PLATE_ICON))
            }
            if (tile.isScreenSharing) {
                Icon(MeeshyIcons.FlipToFront, contentDescription = null, tint = CallPalette.Ink, modifier = Modifier.size(PLATE_ICON))
            }
            if (tile.isReconnecting) {
                Icon(MeeshyIcons.Sync, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(PLATE_ICON))
            }
            Text(
                text = name,
                style = MaterialTheme.typography.labelMedium,
                color = CallPalette.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** iOS : l'avatar occupe 42 % du petit côté de la vignette. */
private fun avatarSize(side: Dp): Dp = side * AVATAR_RATIO

private val TILE_RADIUS = 16.dp
private val PLATE_ICON = 14.dp
private val BORDER_WIDTH = 1.5.dp
private val SPEAKING_BORDER_WIDTH = 3.dp
private const val BORDER_ALPHA = 0.55f
private const val AVATAR_RATIO = 0.42f
private const val RECONNECTING_ALPHA = 0.6f
private const val HALO_LAYERS = 3
private const val HALO_LAYER_ALPHA = 0.16f

/** La portée du halo hors de la vignette : sous les 8 dp entre deux vignettes, pour ne jamais en couvrir une voisine. */
internal val CALL_TILE_HALO_REACH = 6.dp
