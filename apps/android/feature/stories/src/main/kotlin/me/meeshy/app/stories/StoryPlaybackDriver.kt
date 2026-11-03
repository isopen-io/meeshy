package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import coil.imageLoader
import coil.request.ImageRequest
import kotlin.math.roundToInt

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. L'horloge du lecteur : « joue-t-il ? », la
 * progression de la story courante, son avance automatique, le comptage d'une vue et le préchargement.
 * Un lot qui change le rythme de lecture édite CE fichier.
 */

/** Une story joue tant qu'elle n'est ni retenue (appui long) ni cachée : app en arrière-plan, appel entrant, écran éteint (#11040). */
@Composable
internal fun rememberStoryPlaying(isPaused: Boolean, dragging: Boolean): Boolean {
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    return !isPaused && !dragging && lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
}

/** La progression 0..1 de la story courante ; elle repart de zéro à chaque nouvelle story et compte UNE vue. */
@Composable
internal fun rememberStoryProgress(
    state: StoryViewerUiState,
    slideDurationMs: Int,
    playing: Boolean,
    frozen: Boolean,
    viewModel: StoryViewerViewModel,
): Animatable<Float, androidx.compose.animation.core.AnimationVector1D> {
    val progress = remember { Animatable(0f) }
    var progressSlideKey by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(
        state.groupIndex,
        state.index,
        state.currentStoryId,
        state.canAutoAdvance,
        slideDurationMs,
        frozen,
        playing,
    ) {
        if (state.slides.isEmpty() || state.isDismissed) return@LaunchedEffect
        val slideKey = "${state.groupIndex}:${state.index}:${state.currentStoryId}"
        if (progressSlideKey != slideKey) {
            // Une nouvelle story repart de zéro et compte UNE vue ; une pause, une
            // feuille ou un retour au premier plan reprennent là où l'horloge s'était figée.
            progressSlideKey = slideKey
            progress.snapTo(0f)
            viewModel.markCurrentViewed()
        }
        if (!playing || frozen) return@LaunchedEffect
        // Gate: hold the countdown until the current slide's media has painted
        // (text-only slides are ready at once). When the gate flips the effect re-runs.
        if (!state.canAutoAdvance) return@LaunchedEffect
        val remainingMs = ((1f - progress.value) * slideDurationMs).roundToInt().coerceAtLeast(0)
        progress.animateTo(1f, tween(durationMillis = remainingMs, easing = LinearEasing))
        viewModel.advance()
    }
    return progress
}

/** Les images des slides voisines se préchargent ; une pile épuisée ferme le lecteur. */
@Composable
internal fun StoryViewerLifecycleEffects(state: StoryViewerUiState, onClose: () -> Unit) {
    val context = LocalContext.current
    LaunchedEffect(state.prefetchUrls) {
        val loader = context.imageLoader
        state.prefetchUrls.forEach { url ->
            loader.enqueue(ImageRequest.Builder(context).data(url).build())
        }
    }
    LaunchedEffect(state.isDismissed) {
        if (state.isDismissed) onClose()
    }
}
