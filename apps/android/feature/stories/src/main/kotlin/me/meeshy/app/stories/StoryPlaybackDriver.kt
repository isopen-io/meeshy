package me.meeshy.app.stories

import android.content.Context
import android.media.AudioManager
import androidx.compose.animation.core.Animatable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.withFrameMillis
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import coil.imageLoader
import coil.request.ImageRequest
import me.meeshy.sdk.model.story.StoryPlaybackCauses
import me.meeshy.sdk.model.story.StoryPlaybackClock
import me.meeshy.sdk.model.story.StoryPlaybackHold

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. L'horloge du lecteur : « joue-t-il ? », la
 * progression de la story courante, son avance automatique, le comptage d'une vue et le préchargement.
 * Un lot qui change le rythme de lecture édite CE fichier.
 */

/**
 * Ce que le lecteur lit de sa lecture : la progression 0..1 de la story courante, si ses médias jouent, le tour de
 * boucle en cours (une piste qui ne boucle pas repart à chaque tour) et si un média la fait attendre.
 */
internal class StoryPlaybackHandle(
    val progress: Animatable<Float, androidx.compose.animation.core.AnimationVector1D>,
    val playing: Boolean,
    val lap: Int,
    val waiting: Boolean,
)

/** Les raisons qu'a la story d'être retenue, lues sur ce qui recouvre ou occupe le lecteur (iOS `playbackCauses`). */
internal fun storyPlaybackCauses(
    state: StoryViewerUiState,
    cover: StoryViewerCover,
    rail: StoryRailController,
    dragging: Boolean,
    foreground: Boolean,
    interrupted: Boolean,
): StoryPlaybackCauses = StoryPlaybackCauses(
    explicitPause = state.isPaused,
    reacting = rail.reactionBarVisible || rail.showFullEmojiPicker || rail.reactionFlight != null,
    gestureInFlight = dragging || rail.scrubKind != null,
    coveredByScreen = !foreground,
    interrupted = interrupted,
    engaged = cover.sheet || cover.menu || cover.dialog || cover.composing || cover.reading || rail.languageBarVisible,
)

/**
 * L'horloge du lecteur : une [StoryPlaybackClock] pilotée image par image, avec seek. Une story retenue se FIGE
 * (réaction, appui long, glissé, interruption) ou BOUCLE (commentaires, menu, langues, feuilles) : jamais de remise à
 * zéro à la fermeture d'une feuille, la barre reprend à sa position exacte (loi `pause > boucle > avance`). Le minuteur
 * attend le fond utilisable et se fige quand une vidéo bufferise. Une pause de l'utilisateur l'emporte sur la reprise.
 */
@Composable
internal fun rememberStoryPlayback(
    state: StoryViewerUiState,
    slideDurationMs: Int,
    cover: StoryViewerCover,
    rail: StoryRailController,
    dragging: Boolean,
    viewModel: StoryViewerViewModel,
): StoryPlaybackHandle {
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val foreground = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    val signals = viewModel.mediaSignal
    val interruption = viewModel.interruption
    val causes = storyPlaybackCauses(state, cover, rail, dragging, foreground, interruption.frozen)
    val hold = StoryPlaybackHold.resolve(causes)
    // L'interruption fige l'horloge, pas la vidéo : ExoPlayer reprend seul au retour du focus.
    val mediaPlaying = StoryPlaybackHold.resolve(causes.copy(interrupted = false)) != StoryPlaybackHold.Pause

    val progress = remember { Animatable(0f) }
    val clock = remember { StoryPlaybackClock() }
    var lap by remember { mutableIntStateOf(0) }
    val holdNow by rememberUpdatedState(hold)
    val durationNow by rememberUpdatedState(slideDurationMs)
    val readiness = signals.readiness
    val readyNow by rememberUpdatedState(state.canAutoAdvance && !readiness.waiting)
    val stalledNow by rememberUpdatedState(readiness.waiting)
    val slideKey = "${state.groupIndex}:${state.index}:${state.currentStoryId}"
    val live = state.slides.isNotEmpty() && !state.isDismissed

    LaunchedEffect(slideKey, live) {
        if (!live) return@LaunchedEffect
        clock.startSlide(durationNow.toLong())
        progress.snapTo(0f)
        viewModel.markCurrentViewed()
    }
    SideEffect { interruption.bind(isPlaying = { holdNow != StoryPlaybackHold.Pause }, settleAsPause = viewModel::pauseByHold) }
    LaunchedEffect(state.isPaused) { if (state.isPaused) interruption.userPaused() }
    val context = LocalContext.current
    LaunchedEffect(foreground) {
        if (!foreground) return@LaunchedEffect
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        interruption.onReturnedToForeground(otherAudioPlaying = audio?.isMusicActive == true)
    }

    LaunchedEffect(slideKey, live) {
        if (!live) return@LaunchedEffect
        var last = -1L
        var knownDuration = durationNow
        while (true) {
            val now = withFrameMillis { it }
            val delta = if (last < 0) 0L else (now - last).coerceIn(0L, MAX_FRAME_DELTA_MS)
            last = now
            if (durationNow != knownDuration) {
                knownDuration = durationNow
                clock.updateDuration(knownDuration.toLong())
            }
            clock.setPaused(holdNow == StoryPlaybackHold.Pause)
            clock.setInterrupted(interruption.frozen)
            clock.setStalled(stalledNow)
            if (readyNow) clock.markContentReady()
            val tick = clock.advance(delta)
            if (progress.value != tick.progress) progress.snapTo(tick.progress)
            if (!tick.completed) continue
            when (StoryPlaybackHold.endAction(holdNow)) {
                StoryPlaybackHold.EndAction.RestartInPlace -> {
                    progress.snapTo(clock.seekToFraction(0f).progress)
                    signals.rewind()
                    lap++
                }
                StoryPlaybackHold.EndAction.Advance -> {
                    viewModel.advance()
                    return@LaunchedEffect
                }
            }
        }
    }
    return StoryPlaybackHandle(progress, mediaPlaying, lap, waiting = readiness.waiting && live)
}

private const val MAX_FRAME_DELTA_MS = 100L

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
