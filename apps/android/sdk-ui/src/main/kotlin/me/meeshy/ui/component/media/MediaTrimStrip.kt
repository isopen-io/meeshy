package me.meeshy.ui.component.media

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule
import me.meeshy.sdk.model.media.formatMediaDuration
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import kotlin.math.roundToInt

/** Ce que la bande donne à VOIR : la nature du média, pas son stockage. */
public enum class MediaTrimContent { VIDEO, AUDIO }

public const val MEDIA_TRIM_START_HANDLE_TAG: String = "media-trim-handle-start"
public const val MEDIA_TRIM_END_HANDLE_TAG: String = "media-trim-handle-end"

/** Cible tactile de chaque poignée (accessibilité : 48 dp minimum). */
public val MediaTrimHandleTarget: Dp = 48.dp

private val StripHeight = 56.dp
private val ScrimColor = Color.Black.copy(alpha = 0.62f)

/**
 * **La bande de rognage d'un média posé sur une scène.**
 *
 * Elle montre la source ENTIÈRE, deux poignées désignent ce qu'on garde, et les zones écartées
 * restent visibles, assombries : on rogne en regardant ce qu'on RETIRE. Elle n'encode rien : elle
 * publie une paire de bornes à CHAQUE image du geste ([onChange]), sans bouton « Appliquer ».
 * Le plancher de durée, le non-croisement et la conversion points -> secondes vivent dans
 * [MediaTrimRule] ; [frames] (vignettes vidéo) et [waveform] (onde publiée, normalisée) sont
 * fournis par l'appelant, la bande n'extrait rien elle-même.
 */
@Composable
public fun MediaTrimStrip(
    content: MediaTrimContent,
    sourceDuration: Double,
    bounds: MediaTrimBounds,
    accent: Color,
    modifier: Modifier = Modifier,
    frames: List<ImageBitmap> = emptyList(),
    waveform: List<Float> = emptyList(),
    onChange: (MediaTrimBounds) -> Unit,
    onCommit: (() -> Unit)? = null,
) {
    val live = remember { LiveBounds(bounds) }
    live.value = bounds
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        BoxWithConstraints(Modifier.fillMaxWidth().height(StripHeight)) {
            // Les poignées débordent de la bande d'une demi-cible : sans cette marge, la moitié
            // extérieure serait hors des bornes du parent, donc intouchable.
            val inset = MediaTrimHandleTarget / 2
            val stripWidth = (maxWidth - inset * 2).coerceAtLeast(0.dp)
            val density = LocalDensity.current
            val widthPx = with(density) { stripWidth.toPx() }
            val startX = positionOf(bounds.start, sourceDuration, stripWidth)
            val endX = positionOf(bounds.end, sourceDuration, stripWidth)

            Box(Modifier.padding(horizontal = inset).fillMaxWidth().height(StripHeight)) {
                Box(Modifier.fillMaxWidth().height(StripHeight).clip(RoundedCornerShape(MeeshyRadius.xs))) {
                    StripSource(content, frames, waveform, accent)
                    Box(Modifier.width(startX).fillMaxHeight().background(ScrimColor))
                    Box(Modifier.offset(x = endX).width((stripWidth - endX).coerceAtLeast(0.dp)).fillMaxHeight().background(ScrimColor))
                }
                Box(
                    Modifier
                        .offset(x = startX)
                        .width((endX - startX).coerceAtLeast(0.dp))
                        .height(StripHeight)
                        .border(2.dp, accent, RoundedCornerShape(MeeshyRadius.xs)),
                )
            }
            TrimHandle(
                tag = MEDIA_TRIM_START_HANDLE_TAG,
                label = stringResource(R.string.media_trim_handle_start),
                spoken = spokenSecond(bounds.start),
                centerX = inset + startX,
                accent = accent,
                onDelta = { px -> live.move(true, px, widthPx, sourceDuration, onChange) },
                onCommit = onCommit,
            )
            TrimHandle(
                tag = MEDIA_TRIM_END_HANDLE_TAG,
                label = stringResource(R.string.media_trim_handle_end),
                spoken = spokenSecond(bounds.end),
                centerX = inset + endX,
                accent = accent,
                onDelta = { px -> live.move(false, px, widthPx, sourceDuration, onChange) },
                onCommit = onCommit,
            )
        }
        Legend(bounds.duration, sourceDuration, accent)
    }
}

/**
 * Les bornes COURANTES du geste : le geste arrive par événements successifs, parfois avant la
 * recomposition ; chaque delta s'applique donc au résultat du précédent, jamais à un instantané
 * périmé (sans quoi un balayage rapide n'accumulerait rien).
 */
private class LiveBounds(var value: MediaTrimBounds) {
    fun move(
        isStart: Boolean,
        deltaPx: Float,
        stripPx: Float,
        sourceDuration: Double,
        onChange: (MediaTrimBounds) -> Unit,
    ) {
        if (stripPx <= 0f) return
        val delta = MediaTrimRule.seconds(deltaPx, stripPx, sourceDuration)
        val next = if (isStart) {
            MediaTrimRule.movingStart(value, delta, sourceDuration)
        } else {
            MediaTrimRule.movingEnd(value, delta, sourceDuration)
        }
        if (next == value) return
        value = next
        onChange(next)
    }
}

private fun positionOf(second: Double, sourceDuration: Double, width: Dp): Dp {
    if (sourceDuration <= 0.0) return 0.dp
    return width * (second / sourceDuration).coerceIn(0.0, 1.0).toFloat()
}

@Composable
private fun spokenSecond(seconds: Double): String {
    val strings = rememberMediaKindStrings()
    return strings.spokenDuration(seconds) ?: ""
}

@Composable
private fun StripSource(
    content: MediaTrimContent,
    frames: List<ImageBitmap>,
    waveform: List<Float>,
    accent: Color,
) {
    val placeholderLabel = stringResource(R.string.media_trim_loading)
    val waiting = when (content) {
        MediaTrimContent.VIDEO -> frames.isEmpty()
        MediaTrimContent.AUDIO -> waveform.isEmpty()
    }
    if (waiting) {
        // L'attente est dessinée (dégradé à l'accent) et nommée, jamais un rectangle gris muet.
        Box(
            Modifier
                .fillMaxWidth()
                .height(StripHeight)
                .background(Brush.horizontalGradient(listOf(accent.copy(alpha = 0.18f), accent.copy(alpha = 0.06f))))
                .semantics { contentDescription = placeholderLabel },
        )
        return
    }
    when (content) {
        MediaTrimContent.VIDEO -> Box(Modifier.fillMaxWidth().height(StripHeight)) {
            Row(Modifier.fillMaxWidth().height(StripHeight)) {
                frames.forEach { frame ->
                    androidx.compose.foundation.Image(
                        bitmap = frame,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
            if (waveform.isNotEmpty()) {
                Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(StripHeight * 0.34f)) {
                    WaveformBars(waveform, Color.White.copy(alpha = 0.75f))
                }
            }
        }
        MediaTrimContent.AUDIO -> Box(Modifier.fillMaxWidth().height(StripHeight).background(Color.Black.copy(alpha = 0.28f))) {
            WaveformBars(waveform, accent)
        }
    }
}

@Composable
private fun WaveformBars(samples: List<Float>, tint: Color) {
    Canvas(Modifier.fillMaxWidth().fillMaxHeight()) {
        val barWidth = 2.dp.toPx()
        val gap = 1.dp.toPx()
        val count = (size.width / (barWidth + gap)).toInt().coerceAtLeast(1)
        repeat(count) { i ->
            val sample = samples[(i * samples.size / count).coerceIn(0, samples.lastIndex)].coerceIn(0f, 1f)
            val h = (size.height * sample).coerceAtLeast(2.dp.toPx())
            drawRoundRect(
                color = tint,
                topLeft = Offset(i * (barWidth + gap), (size.height - h) / 2f),
                size = Size(barWidth, h),
                cornerRadius = CornerRadius(barWidth / 2f),
            )
        }
    }
}

@Composable
private fun TrimHandle(
    tag: String,
    label: String,
    spoken: String,
    centerX: Dp,
    accent: Color,
    onDelta: (Float) -> Unit,
    onCommit: (() -> Unit)?,
) {
    val currentDelta by rememberUpdatedState(onDelta)
    val currentCommit by rememberUpdatedState(onCommit)
    Box(
        modifier = Modifier
            .offset(x = centerX - MediaTrimHandleTarget / 2)
            .size(width = MediaTrimHandleTarget, height = StripHeight.coerceAtLeast(MediaTrimHandleTarget))
            .testTag(tag)
            .semantics {
                contentDescription = label
                stateDescription = spoken
                role = Role.Button
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = { currentCommit?.invoke() },
                    onDragCancel = { currentCommit?.invoke() },
                ) { change, dragAmount ->
                    change.consume()
                    currentDelta(dragAmount)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(width = 6.dp, height = 28.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(accent),
        )
    }
}

@Composable
private fun Legend(keptSeconds: Double, sourceSeconds: Double, accent: Color) {
    val kept = clock(keptSeconds)
    val total = stringResource(R.string.media_trim_of_total, clock(sourceSeconds))
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        Text(kept, style = MaterialTheme.typography.labelMedium, color = accent)
        Text(total, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun clock(seconds: Double): String = formatMediaDuration(seconds.roundToInt().toDouble()) ?: "0:00"
