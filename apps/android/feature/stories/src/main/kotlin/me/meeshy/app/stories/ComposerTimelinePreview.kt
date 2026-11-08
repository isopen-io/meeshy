package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.collectLatest
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.scene.SceneRootPose
import me.meeshy.sdk.model.scene.TransitionRehearsal
import me.meeshy.sdk.model.scene.TransitionRehearsalPlan
import me.meeshy.sdk.model.scene.TransitionRehearsalRun
import me.meeshy.ui.story.canvas.SceneTimelineBridge

/** L'aperçu de frise vu par la scène : le pont (la tête, le transport) et la fenêtre de scène de chaque objet. */
internal class ComposerTimelinePreview(
    val bridge: SceneTimelineBridge,
    private val windows: Map<String, Pair<Float, Float?>>,
) {
    /** L'opacité de l'objet [id] à la tête courante ; 1 hors aperçu ou sans fenêtre connue. */
    fun opacity(id: String): Float {
        val (start, end) = windows[id] ?: return 1f
        return bridge.objectOpacity(start.toDouble(), end?.toDouble()).toFloat()
    }
}

internal val LocalComposerTimelinePreview = compositionLocalOf<ComposerTimelinePreview?> { null }

/**
 * Branche le pont sur le transport de la frise (#8370) : tant qu'une frise est montée, chaque mouvement de la tête de
 * lecture (scrub ou tick) la pousse dans le pont ; à sa fermeture, le pont rend la scène à l'édition.
 */
@Composable
internal fun rememberComposerTimelineBridge(transport: FriseTransport, playheadSeconds: Float): SceneTimelineBridge {
    val bridge = remember { SceneTimelineBridge() }
    val playhead by rememberUpdatedState(playheadSeconds)
    LaunchedEffect(bridge, transport) {
        snapshotFlow { if (transport.isOpen) playhead.toDouble() else null }.collect { seconds ->
            if (seconds == null) bridge.end() else bridge.scrub(seconds)
        }
    }
    LaunchedEffect(bridge, transport) {
        snapshotFlow { transport.playing }.collect(bridge::setPlaying)
    }
    return bridge
}

/** Les répétitions de transition demandées par le choix d'un effet (#8792) : la plus récente remplace la précédente. */
internal class ComposerRehearsals {
    private val requests = MutableSharedFlow<TransitionRehearsalRun>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val runs: SharedFlow<TransitionRehearsalRun> = requests.asSharedFlow()

    /** Rejoue ouverture, pause, fermeture ; sans effet choisi, rien ne se répète. */
    fun rehearse(opening: StoryTransitionEffect?, closing: StoryTransitionEffect?) {
        TransitionRehearsal.start(opening, closing)?.let(requests::tryEmit)
    }
}

/**
 * La pose de la racine de la scène pendant une répétition, échantillonnée à chaque image et lue à la PEINTURE. Une nouvelle
 * répétition interrompt la précédente et repart de zéro ; la fin rend la pose neutre.
 */
@Composable
internal fun rememberRehearsalPose(runs: Flow<TransitionRehearsalRun>): () -> SceneRootPose {
    var pose by remember { mutableStateOf(SceneRootPose.NEUTRAL) }
    LaunchedEffect(runs) {
        runs.collectLatest { run ->
            try {
                while (true) {
                    val now = withFrameNanos { it }
                    if (run.phaseAt(now) == TransitionRehearsalPlan.Phase.Finished) break
                    pose = run.poseAt(now)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } finally {
                pose = SceneRootPose.NEUTRAL
            }
        }
    }
    return { pose }
}
