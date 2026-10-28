package me.meeshy.ui.component.audio.editor

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.audioedit.AudioEditorBarRole
import me.meeshy.sdk.model.audioedit.AudioEditorSelection
import me.meeshy.sdk.model.audioedit.AudioEditorWaveformGrab
import me.meeshy.sdk.model.audioedit.AudioEditorWaveformLaw
import me.meeshy.ui.R
import me.meeshy.ui.theme.LocalMeeshyTokens

/**
 * La forme d'onde interactive — miroir d'`AudioEditorWaveform` (iOS) : toucher ou glisser n'importe où déplace la
 * tête de lecture ; avec une [selection], les deux poignées se saisissent à moins de 44 dp. Les barres ne sont
 * calculées qu'une fois par jeu de niveaux et de largeur ; [progress] et [selection] sont des lambdas lues dans la
 * phase de DESSIN : la tête avance à 60 i/s sans recomposer. Tout l'ordinaire (niveaux, décodage) se fait hors du
 * fil principal, en amont.
 */
@Composable
fun AudioEditorWaveform(
    levels: List<Float>,
    progress: () -> Double,
    selection: () -> AudioEditorSelection?,
    accent: Color,
    onScrub: (fraction: Double) -> Unit,
    onScrubEnded: () -> Unit,
    onSelectionStart: (fraction: Double) -> Unit,
    onSelectionEnd: (fraction: Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalMeeshyTokens.current
    val density = LocalDensity.current
    val label = stringResource(R.string.audio_editor_a11y_playhead)
    val scrub by rememberUpdatedState(onScrub)
    val scrubEnded by rememberUpdatedState(onScrubEnded)
    val moveStart by rememberUpdatedState(onSelectionStart)
    val moveEnd by rememberUpdatedState(onSelectionEnd)
    val currentSelection by rememberUpdatedState(selection)
    val currentProgress by rememberUpdatedState(progress)
    val handleSlopPx = with(density) { HANDLE_SLOP.toPx() }
    val barWidthPx = with(density) { BAR_WIDTH.toPx() }
    val gapPx = with(density) { BAR_GAP.toPx() }

    val cachedBars = remember(levels) { BarCache(levels) }

    Box(modifier.fillMaxSize()) {
        Canvas(
            Modifier
                .fillMaxSize()
                .semantics {
                    contentDescription = label
                    progressBarRangeInfo = ProgressBarRangeInfo(currentProgress().toFloat(), 0f..1f)
                    setProgress { target -> scrub(target.toDouble()); scrubEnded(); true }
                }
                .pointerInput(handleSlopPx) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        val width = size.width.toFloat().coerceAtLeast(1f)
                        val sel = currentSelection()
                        val grab = AudioEditorWaveformLaw.grab(
                            fraction = (down.position.x / width).toDouble().coerceIn(0.0, 1.0),
                            start = sel?.start,
                            end = sel?.end,
                            slop = (handleSlopPx / width).toDouble(),
                        )
                        fun dispatch(x: Float) {
                            val fraction = (x / width).toDouble().coerceIn(0.0, 1.0)
                            when (grab) {
                                AudioEditorWaveformGrab.SELECTION_START -> moveStart(fraction)
                                AudioEditorWaveformGrab.SELECTION_END -> moveEnd(fraction)
                                AudioEditorWaveformGrab.SCRUB -> scrub(fraction)
                            }
                        }
                        dispatch(down.position.x)
                        drag(down.id) { change ->
                            change.consume()
                            dispatch(change.position.x)
                        }
                        if (grab == AudioEditorWaveformGrab.SCRUB) scrubEnded()
                    }
                },
        ) {
            val barCount = ((size.width + gapPx) / (barWidthPx + gapPx)).toInt().coerceAtLeast(1)
            val bars = cachedBars.forCount(barCount)
            val sel = currentSelection()
            val played = currentProgress()
            val step = size.width / barCount
            val width = (step - gapPx).coerceAtLeast(1f)
            bars.forEachIndexed { index, level ->
                val position = if (barCount > 1) index.toDouble() / (barCount - 1) else 0.0
                val role = AudioEditorWaveformLaw.role(position, played, sel)
                val height = (level * size.height * BAR_FILL).coerceAtLeast(MIN_BAR_PX)
                drawRoundRect(
                    color = colorFor(role, accent, tokens.textPrimary, tokens.error),
                    topLeft = Offset(index * step, (size.height - height) / 2f),
                    size = Size(width, height),
                    cornerRadius = CornerRadius(CORNER_PX),
                )
            }
            sel?.let { drawHandles(it, if (it.isRemoval) tokens.error else accent) }
            drawLine(
                color = Color.White,
                start = Offset((played * size.width).toFloat(), 0f),
                end = Offset((played * size.width).toFloat(), size.height),
                strokeWidth = PLAYHEAD_PX,
            )
        }
        selection()?.let { sel ->
            HandleAccessibility(sel.start, handleLabel(start = true, removal = sel.isRemoval)) { moveStart(it) }
            HandleAccessibility(sel.end, handleLabel(start = false, removal = sel.isRemoval)) { moveEnd(it) }
        }
    }
}

/**
 * La poignée telle que TalkBack la voit — miroir de l'`accessibilityAdjustableAction` des poignées iOS : un nœud
 * de 44 dp centré sur la poignée, nommé, qui annonce sa position et se règle au centième (glisser haut / bas).
 * Il ne porte aucun geste : le doigt reste servi par la forme d'onde dessous.
 */
@Composable
private fun HandleAccessibility(fraction: Double, label: String, onMove: (Double) -> Unit) {
    val slopPx = with(LocalDensity.current) { HANDLE_SLOP.roundToPx() }
    val clamped = fraction.coerceIn(0.0, 1.0)
    Box(
        Modifier
            .fillMaxHeight()
            .layout { measurable, constraints ->
                val placeable = measurable.measure(Constraints.fixed(slopPx, constraints.maxHeight))
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.place((clamped * constraints.maxWidth - slopPx / 2.0).roundToInt(), 0)
                }
            }
            .semantics {
                contentDescription = label
                progressBarRangeInfo = ProgressBarRangeInfo(clamped.toFloat(), 0f..1f, steps = ADJUST_STEPS)
                setProgress { target -> onMove(target.toDouble().coerceIn(0.0, 1.0)); true }
            },
    )
}

@Composable
private fun handleLabel(start: Boolean, removal: Boolean): String = stringResource(
    when {
        removal && start -> R.string.audio_split_handle_start
        removal -> R.string.audio_split_handle_end
        start -> R.string.audio_trim_handle_start
        else -> R.string.audio_trim_handle_end
    },
)

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawHandles(selection: AudioEditorSelection, tint: Color) {
    listOf(selection.start, selection.end).forEach { fraction ->
        val x = (fraction.coerceIn(0.0, 1.0) * size.width).toFloat()
        drawLine(tint, Offset(x, 0f), Offset(x, size.height), strokeWidth = HANDLE_LINE_PX)
        drawCircle(tint, radius = HANDLE_KNOB_PX, center = Offset(x, size.height / 2f))
    }
}

private fun colorFor(role: AudioEditorBarRole, accent: Color, ink: Color, error: Color): Color = when (role) {
    AudioEditorBarRole.IDLE -> ink.copy(alpha = 0.14f)
    AudioEditorBarRole.PLAYED -> accent
    AudioEditorBarRole.KEPT -> accent.copy(alpha = 0.32f)
    AudioEditorBarRole.OUTSIDE -> ink.copy(alpha = 0.07f)
    AudioEditorBarRole.REMOVED -> error.copy(alpha = 0.45f)
}

/** Les barres du dernier nombre demandé : recalculées seulement quand la largeur change le nombre de barres. */
private class BarCache(private val levels: List<Float>) {
    private var count = -1
    private var bars = FloatArray(0)

    fun forCount(requested: Int): FloatArray {
        if (requested != count) {
            bars = AudioEditorWaveformLaw.bars(levels, requested)
            count = requested
        }
        return bars
    }
}

private val HANDLE_SLOP = 44.dp
private val BAR_WIDTH = 3.dp
private val BAR_GAP = 2.dp
private const val BAR_FILL = 0.92f
private const val MIN_BAR_PX = 6f
private const val CORNER_PX = 3f
private const val PLAYHEAD_PX = 4f
private const val HANDLE_LINE_PX = 6f
private const val HANDLE_KNOB_PX = 14f

/** 99 crans entre 0 et 1 : TalkBack règle une poignée au centième, comme `MeeshyAdjustStep` (iOS). */
private const val ADJUST_STEPS = 99
