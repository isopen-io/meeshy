package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Comment
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.currentStateAsState
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.LanguageQuickOption
import me.meeshy.ui.component.LanguageQuickStrip
import me.meeshy.ui.component.audio.AudioTrackSurface
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/** Foreground media renders at this fraction of the canvas width, scaled by the object's own [StoryForegroundMediaView.scale]. */
private const val FOREGROUND_WIDTH_FRACTION = 0.45f

/** Wire `StoryTextObject.fontSize` is authored in this 1080-referential design space (iOS parity); the on-screen size scales it by the canvas width. */
private const val TEXT_DESIGN_CANVAS_WIDTH = 1080f

/**
 * A foreground video/image layer positioned at [StoryForegroundMediaView.x]/[y]
 * (canvas-normalised, 0..1) as its center anchor, sized to a fraction of the
 * canvas width scaled by the object's own `scale`. The [playheadSeconds] clock
 * drives keyframe animation via the pure [StoryForegroundMediaView.animated]:
 * position/scale/opacity follow the clip's keyframes for the current instant, or
 * hold their static base when the clip has none. Rotation and inter-slide
 * transitions are still not applied in this projection.
 */
@Composable
internal fun StoryForegroundLayer(
    media: StoryForegroundMediaView,
    playheadSeconds: Float,
    playing: Boolean,
    muted: Boolean,
    modifier: Modifier = Modifier,
) {
    val animated = media.animated(playheadSeconds)
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val aspectRatio = animated.aspectRatio.toFloat().takeIf { it > 0f } ?: 1f
        val targetWidth = maxWidth * FOREGROUND_WIDTH_FRACTION * animated.scale.toFloat().coerceIn(0.2f, 3f)
        val targetHeight = targetWidth / aspectRatio
        val offsetX = maxWidth * animated.x.toFloat() - targetWidth / 2
        val offsetY = maxHeight * animated.y.toFloat() - targetHeight / 2
        val layerModifier = Modifier
            .offset(x = offsetX, y = offsetY)
            .width(targetWidth)
            .aspectRatio(aspectRatio)
            .alpha(animated.opacity.toFloat().coerceIn(0f, 1f))
        if (media.isVideo) {
            ReelVideoSurface(
                mediaUrl = media.url,
                isActive = playing,
                rewindWhenInactive = false,
                muted = muted,
                modifier = layerModifier,
                sourceStartMs = media.sourceWindow?.startMs,
                sourceEndMs = media.sourceWindow?.endMs,
            )
        } else {
            AsyncImage(
                model = media.url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = layerModifier,
            )
        }
    }
}

/**
 * A text overlay positioned at [StoryTextObjectView.x]/[y] (canvas-normalised, 0..1)
 * as its center anchor. The [playheadSeconds] clock drives the pure
 * [StoryTextObjectView.animated]: position follows the object's keyframes and opacity
 * ramps through its fadeIn/fadeOut envelope for the current instant, or holds its
 * static base when the object authored neither. The Prisme-resolved [text] renders in
 * the authored [colorHex]/[align]; wire `fontSize` is a 1080-referential design unit
 * (× the object's `scale`) mapped onto the real canvas width, and [rotation] tilts the
 * glyphs about their own center — iOS `fontSize × scale` parity.
 */
@Composable
internal fun StoryTextObjectLayer(
    textObject: StoryTextObjectView,
    playheadSeconds: Float,
    modifier: Modifier = Modifier,
) {
    val animated = textObject.animated(playheadSeconds)
    var textSize by remember { mutableStateOf(IntSize.Zero) }
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val centerXpx = with(density) { (maxWidth * animated.x.toFloat()).toPx() }
        val centerYpx = with(density) { (maxHeight * animated.y.toFloat()).toPx() }
        val canvasWidthPx = with(density) { maxWidth.toPx() }
        val color = animated.colorHex
            ?.let { runCatching { hexColor(it) }.getOrNull() }
            ?: MeeshyPalette.White
        val textAlign = when (animated.align) {
            "left" -> TextAlign.Start
            "right" -> TextAlign.End
            else -> TextAlign.Center
        }
        val fontSizePx = (animated.fontSize * animated.scale)
            .toFloat()
            .times(canvasWidthPx / TEXT_DESIGN_CANVAS_WIDTH)
            .coerceAtLeast(1f)
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .onSizeChanged { textSize = it }
                .offset {
                    IntOffset(
                        (centerXpx - textSize.width / 2f).roundToInt(),
                        (centerYpx - textSize.height / 2f).roundToInt(),
                    )
                }
                .graphicsLayer { rotationZ = animated.rotation.toFloat() }
                .alpha(animated.opacity.toFloat().coerceIn(0f, 1f))
                .storyTextBacking(animated.background)
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                text = animated.text,
                color = color,
                textAlign = textAlign,
                fontWeight = FontWeight.SemiBold,
                fontSize = with(density) { fontSizePx.toSp() },
                // The EFFECT axis (#4870) — the same table as the composer preview
                // and the two other clients, at the glyphs' real pixel size.
                style = LocalTextStyle.current.copy(shadow = animated.effect.composeShadow(fontSizePx, color)),
            )
        }
    }
}

/**
 * Paints an iOS/web-authored text backing behind the reader's glyphs (glue): a rounded
 * solid fill for [StoryTextBackground.Solid], a translucent frosted scrim approximating the
 * iOS glass blur for [StoryTextBackground.Glass], and nothing for [StoryTextBackground.None].
 * The *choice* of backing is the unit-tested [StoryTextBackground.resolve]; this only renders
 * it, mirroring the composer's own backing so author and reader agree on the look.
 */
private fun Modifier.storyTextBacking(background: StoryTextBackground): Modifier = when (background) {
    StoryTextBackground.None -> this
    is StoryTextBackground.Solid ->
        this.background(readerBackingColor(background.hex), RoundedCornerShape(10.dp))
    is StoryTextBackground.Glass ->
        this.background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(10.dp))
}

/**
 * Parses a `RRGGBB` or `RRGGBBAA` backing hex (gateway parity, no `#`) into a [Color],
 * honouring the alpha byte so a translucent solid renders as authored. Decays to
 * [Color.Transparent] on anything unexpected so a malformed backing never crashes the canvas.
 */
private fun readerBackingColor(hex: String): Color = runCatching {
    val h = hex.removePrefix("#")
    val argb = when (h.length) {
        8 -> h.substring(6, 8) + h.substring(0, 6)
        6 -> "ff$h"
        else -> return Color.Transparent
    }
    Color(argb.toLong(16))
}.getOrDefault(Color.Transparent)

/**
 * Un sticker posé par l'auteur, centré sur son point normalisé, à son côté projeté
 * ([StoryStickerView.sideFraction] de la largeur, plancher 8 dp comme iOS), incliné de sa
 * rotation et fondu selon son enveloppe. Une image intégrée prime sur l'emoji (iOS
 * `StoryStickerLayer`) ; l'emoji reste dessous tant que l'image charge.
 */
@Composable
internal fun StoryStickerLayer(sticker: StoryStickerView, playheadSeconds: Float, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val side = (maxWidth * sticker.sideFraction.toFloat()).coerceAtLeast(MIN_STICKER_SIDE)
        val density = LocalDensity.current
        Box(
            modifier = Modifier
                .offset(
                    x = maxWidth * sticker.x.toFloat() - side / 2,
                    y = maxHeight * sticker.y.toFloat() - side / 2,
                )
                .size(side)
                .graphicsLayer { rotationZ = sticker.rotation.toFloat() }
                .alpha(sticker.opacity(playheadSeconds).toFloat().coerceIn(0f, 1f)),
            contentAlignment = Alignment.Center,
        ) {
            if (sticker.emoji.isNotBlank()) {
                Text(
                    text = sticker.emoji,
                    fontSize = with(density) { (side * STICKER_GLYPH_FRACTION).toSp() },
                    maxLines = 1,
                )
            }
            sticker.imageUrl?.let { url ->
                AsyncImage(
                    model = url,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

/**
 * La puce d'un son de premier plan, aux mesures d'iOS `AudioForegroundChip` (capsule de
 * verre sombre, liseré, onde de marque, marges 12 × 8, contenu 54 ou 92) exprimées sur une
 * scène de 390 de large puis projetées à la largeur réelle : elle garde la même part de la
 * scène que chez l'auteur.
 */
@Composable
internal fun StoryAudioChipLayer(chip: StoryAudioChipView, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val unit = maxWidth / AUDIO_CHIP_REFERENCE_WIDTH
        val contentWidth = unit * if (chip.credit != null) AUDIO_CHIP_CREDIT_WIDTH else AUDIO_CHIP_WAVE_WIDTH
        val chipWidth = unit * (2 * AUDIO_CHIP_PAD_X + AUDIO_CHIP_ICON + AUDIO_CHIP_GAP) + contentWidth
        val chipHeight = unit * (2 * AUDIO_CHIP_PAD_Y + AUDIO_CHIP_ICON)
        val density = LocalDensity.current
        Row(
            modifier = Modifier
                .offset(
                    x = maxWidth * chip.x.toFloat() - chipWidth / 2,
                    y = maxHeight * chip.y.toFloat() - chipHeight / 2,
                )
                .size(width = chipWidth, height = chipHeight)
                .background(Color.Black.copy(alpha = 0.28f), CircleShape)
                .border(width = unit, color = Color.White.copy(alpha = 0.25f), shape = CircleShape)
                .padding(horizontal = unit * AUDIO_CHIP_PAD_X, vertical = unit * AUDIO_CHIP_PAD_Y),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.GraphicEq,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(unit * AUDIO_CHIP_ICON),
            )
            Spacer(Modifier.width(unit * AUDIO_CHIP_GAP))
            val credit = chip.credit
            if (credit != null) {
                Text(
                    text = credit,
                    color = Color.White.copy(alpha = 0.92f),
                    fontSize = with(density) { (unit * AUDIO_CHIP_CREDIT_SIZE).toSp() },
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.width(contentWidth),
                )
            } else {
                AudioChipWave(samples = chip.waveform, width = contentWidth, height = unit * AUDIO_CHIP_ICON)
            }
        }
    }
}

@Composable
private fun AudioChipWave(samples: List<Float>, width: Dp, height: Dp) {
    val bars = audioChipBars(samples)
    Row(
        modifier = Modifier.size(width = width, height = height),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        bars.forEach { level ->
            Box(
                modifier = Modifier
                    .width(width / (bars.size * 2))
                    .height(height * level)
                    .background(Color.White.copy(alpha = 0.92f), CircleShape),
            )
        }
    }
}

/** Les barres de l'onde : les échantillons de l'auteur ramenés à [AUDIO_CHIP_BARS], sinon un motif fixe. */
private fun audioChipBars(samples: List<Float>): List<Float> {
    val finite = samples.filter { it.isFinite() }
    if (finite.isEmpty()) return DEFAULT_WAVE
    return List(AUDIO_CHIP_BARS) { index ->
        finite[index * finite.size / AUDIO_CHIP_BARS].coerceIn(0.2f, 1f)
    }
}

private val MIN_STICKER_SIDE = 8.dp
private const val STICKER_GLYPH_FRACTION = 0.8f
private const val AUDIO_CHIP_REFERENCE_WIDTH = 390f
private const val AUDIO_CHIP_PAD_X = 12f
private const val AUDIO_CHIP_PAD_Y = 8f
private const val AUDIO_CHIP_ICON = 18f
private const val AUDIO_CHIP_GAP = 8f
private const val AUDIO_CHIP_WAVE_WIDTH = 54f
private const val AUDIO_CHIP_CREDIT_WIDTH = 92f
private const val AUDIO_CHIP_CREDIT_SIZE = 12f
private const val AUDIO_CHIP_BARS = 9
private val DEFAULT_WAVE = listOf(0.35f, 0.7f, 0.5f, 0.95f, 0.6f, 0.85f, 0.4f, 0.65f, 0.3f)
