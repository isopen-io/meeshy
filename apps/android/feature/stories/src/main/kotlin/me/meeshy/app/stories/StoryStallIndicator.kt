package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.sdk.model.scene.SceneScrubPlan
import me.meeshy.sdk.model.story.StoryStallIndicatorLaw
import me.meeshy.ui.component.video.ReelPlayerHandle

/**
 * Ce que dit le lecteur vidéo du fond de la slide : attend-il des données ? Alimenté par la prise [ReelPlayerHandle]
 * que la scène tend (une vidéo qui n'existe plus ne bloque rien). L'horloge s'en sert comme porte avant son départ et
 * comme gel en cours de lecture.
 */
internal class StoryMediaReadinessSignal {
    private var release: (() -> Unit)? = null
    private var handle: ReelPlayerHandle? = null

    var readiness by mutableStateOf(StoryMediaReadiness.Ready)
        private set

    fun onBackgroundPlayer(handle: ReelPlayerHandle?) {
        release?.invoke()
        release = null
        this.handle = handle
        if (handle == null) {
            readiness = readiness.copy(videoBuffering = false)
            return
        }
        release = handle.observeBuffering { buffering -> readiness = readiness.copy(videoBuffering = buffering) }
    }

    /** Un tour de boucle : la vidéo de fond repart de son début avec la barre. */
    fun rewind() {
        handle?.seekTo(0)
    }

    /** Le doigt parcourt la barre : la vidéo de fond (en pause) se cale par seek tolérant sur l'instant pointé. */
    fun scrubTo(playheadSeconds: Double, loops: Boolean) {
        val handle = handle ?: return
        val target = SceneScrubPlan.backgroundSeekMs(playheadSeconds, handle.durationMs(), loops) ?: return
        handle.seekTolerant(target, SceneScrubPlan.SEEK_TOLERANCE_MS)
    }

    /** Le doigt se lève : le seek redevient exact, la lecture repart de là. */
    fun endScrub() {
        handle?.endTolerantSeek()
    }

    /** Couture : les vidéos de premier plan disent ici qu'elles ne sont pas prêtes (retient le départ d'une slide sans fond visuel). */
    fun setForegroundPending(pending: Boolean) {
        readiness = readiness.copy(foregroundPending = pending)
    }

    /** Couture : la piste sonore dira ici qu'elle n'est pas prête dès que son lecteur le rapportera. */
    fun setAudioPending(pending: Boolean) {
        readiness = readiness.copy(audioPending = pending)
    }
}

/**
 * Le disque discret au centre de la carte quand la lecture attend un média (iOS `StoryPlaybackStallIndicator`) : 52 dp,
 * spinner blanc, montré après 350 ms d'attente continue pour qu'un hoquet bref ne clignote pas, disparu en 150 ms.
 */
@Composable
internal fun StoryStallIndicator(waiting: Boolean, modifier: Modifier = Modifier) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(waiting) {
        if (waiting) {
            delay(StoryStallIndicatorLaw.SHOW_DELAY_MS)
            shown = true
        } else {
            shown = false
        }
    }
    val label = stringResource(R.string.story_reader_buffering)
    AnimatedVisibility(
        visible = shown,
        enter = fadeIn(tween(StoryStallIndicatorLaw.FADE_OUT_MS.toInt())),
        exit = fadeOut(tween(StoryStallIndicatorLaw.FADE_OUT_MS.toInt())),
        modifier = modifier,
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(StoryStallIndicatorLaw.DIAMETER_DP.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.35f))
                .semantics { contentDescription = label },
        ) {
            CircularProgressIndicator(color = MeeshyPalette.White, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
        }
    }
}

/**
 * Le petit boucleur de l'en-tête pendant l'attente du contenu (iOS : dans l'anneau de la flèche) : il tourne tant que le
 * compte à rebours n'a pas démarré, puis s'efface pour lui laisser la place. Il n'occupe aucune place une fois parti.
 */
@Composable
internal fun StoryAwaitingSpinner(awaiting: Boolean, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.story_reader_buffering)
    AnimatedVisibility(
        visible = awaiting,
        enter = fadeIn(tween(StoryStallIndicatorLaw.FADE_OUT_MS.toInt())),
        exit = fadeOut(tween(StoryStallIndicatorLaw.FADE_OUT_MS.toInt())),
        modifier = modifier,
    ) {
        CircularProgressIndicator(
            color = MeeshyPalette.White,
            strokeWidth = 2.dp,
            modifier = Modifier.size(18.dp).semantics { contentDescription = label },
        )
    }
}
