package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.scene.SceneScrubPlan
import me.meeshy.sdk.model.story.StoryProgressSteps
import me.meeshy.ui.theme.MeeshyPalette

/**
 * **La logique du geste, pure** (iOS `SceneScrubState`) : ce qu'un doigt pointe, ce que la barre montre, ce qui est remis à
 * la lecture au relâcher. Le glissé a une fraction tant que le doigt est posé ; [finish] la rend ET remet TOUJOURS la barre
 * au repos — un « en glissé » resté levé figerait la barre sur une position morte.
 */
internal class StoryProgressScrubState {
    var fraction: Float? = null
        private set

    val isScrubbing: Boolean get() = fraction != null

    /** Le doigt pointe [x] sur une barre de [width] px. Rend `true` si c'est le POSER (début du geste). */
    fun track(x: Float, width: Float): Boolean {
        val began = fraction == null
        fraction = SceneScrubPlan.fraction(x, width)
        return began
    }

    fun finish(): Float? {
        val committed = fraction
        fraction = null
        return committed
    }

    /** Ce que la barre dessine : le doigt pendant le glissé, sinon la lecture. */
    fun displayed(playback: Float): Float = fraction ?: playback
}

/**
 * Ce que l'hôte de lecture remet à la barre : la fraction qu'elle lit (seule elle la lit), et les trois temps du geste.
 * [begin] fige la lecture, [moveTo] redessine la scène à l'instant pointé, [end] reprend DEPUIS la fraction choisie.
 * [adjust] est le réglage d'accessibilité (TalkBack) : un geste complet en un coup.
 */
internal class StoryProgressScrubber(
    val fraction: () -> Float,
    val begin: () -> Unit,
    val moveTo: (Float) -> Unit,
    val end: (Float) -> Unit,
) {
    fun adjust(target: Float) {
        begin()
        moveTo(target)
        end(target)
    }

    companion object {
        /** Inerte : une barre sans lecture (aperçu, test) ne se parcourt pas. */
        val None = StoryProgressScrubber(fraction = { 0f }, begin = {}, moveTo = {}, end = {})
    }
}

/** La piste épaisse, pleine largeur, qui remplace les segments pendant le glissé, avec la poignée du doigt. */
internal val ScrubActiveThickness = 11.dp
internal val ScrubThumbSize = 16.dp

/**
 * La zone tactile de la barre. Poser le doigt remplace les segments par une piste épaisse de la story courante ; la scène se
 * redessine à l'instant pointé ; au relâcher le compte à rebours reprend à la fraction choisie. Le geste n'a aucune distance
 * minimale et prend la main sur la navigation, la fermeture et le cube (le consommateur de la pression est la barre).
 * [onScrubbingChanged] porte l'état « en glissé » aux segments.
 */
@Composable
internal fun StoryScrubTouchArea(
    scrubber: StoryProgressScrubber,
    label: String,
    percentLabel: (Int) -> String,
    onScrubbingChanged: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.(scrubbing: Boolean) -> Unit,
) {
    var dragFraction by remember { mutableStateOf<Float?>(null) }
    val scrubbing = dragFraction != null
    var widthPx by remember { mutableStateOf(0f) }
    val currentScrubber by rememberUpdatedState(scrubber)
    val currentWidth by rememberUpdatedState(widthPx)
    val currentOnScrubbing by rememberUpdatedState(onScrubbingChanged)
    val playbackFraction = scrubber.fraction()
    val shown = dragFraction ?: playbackFraction

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(TOUCH_HEIGHT)
            .onSizeChanged { widthPx = it.width.toFloat() }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val scrubState = StoryProgressScrubState()
                    if (scrubState.track(down.position.x, currentWidth)) {
                        currentOnScrubbing(true)
                        currentScrubber.begin()
                    }
                    dragFraction = scrubState.fraction
                    currentScrubber.moveTo(scrubState.fraction ?: 0f)
                    down.consume()
                    try {
                        drag(down.id) { change ->
                            scrubState.track(change.position.x, currentWidth)
                            dragFraction = scrubState.fraction
                            currentScrubber.moveTo(scrubState.fraction ?: 0f)
                            change.consume()
                        }
                    } finally {
                        val committed = scrubState.finish()
                        dragFraction = null
                        currentOnScrubbing(false)
                        if (committed != null) currentScrubber.end(committed)
                    }
                }
            }
            .semantics {
                contentDescription = label
                stateDescription = percentLabel((shown * 100f).toInt())
                progressBarRangeInfo = ProgressBarRangeInfo(current = shown, range = 0f..1f, steps = StoryProgressSteps.INTERIOR_STEPS)
                setProgress { target ->
                    currentScrubber.adjust(StoryProgressSteps.snap(target))
                    true
                }
            },
    ) {
        content(scrubbing)
        if (scrubbing) ScrubTrack(fraction = shown, modifier = Modifier.align(Alignment.Center))
    }
}

@Composable
private fun ScrubTrack(fraction: Float, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    var widthPx by remember { mutableStateOf(0f) }
    val thumbPx = with(density) { ScrubThumbSize.toPx() }
    Box(modifier.fillMaxWidth().height(ScrubThumbSize).onSizeChanged { widthPx = it.width.toFloat() }) {
        Box(
            Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .height(ScrubActiveThickness)
                .clip(CircleShape)
                .background(MeeshyPalette.White.copy(alpha = 0.3f)),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .drawBehind {
                        val filled = size.width * fraction
                        val left = if (layoutDirection == LayoutDirection.Rtl) size.width - filled else 0f
                        drawRoundRect(
                            color = MeeshyPalette.White,
                            topLeft = Offset(left, 0f),
                            size = Size(filled, size.height),
                            cornerRadius = CornerRadius(size.height / 2f),
                        )
                    },
            )
        }
        val travel = (widthPx - thumbPx).coerceAtLeast(0f)
        val along = (widthPx * fraction - thumbPx / 2f).coerceIn(0f, travel)
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .offset { IntOffset(along.toInt(), 0) }
                .size(ScrubThumbSize)
                .clip(CircleShape)
                .background(MeeshyPalette.White),
        )
    }
}

private val TOUCH_HEIGHT = 24.dp

