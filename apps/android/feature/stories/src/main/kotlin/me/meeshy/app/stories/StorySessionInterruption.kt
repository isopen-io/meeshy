package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.story.StorySessionInterruption

/**
 * **Ce que le focus audio fait à l'horloge d'une story** (iOS `StoryPlaybackInterruptions`, #11040). Les lecteurs vidéo
 * rapportent la perte (un appel, un assistant), le gain (`AUDIOFOCUS_GAIN`) ou la perte définitive ; la loi pure
 * [StorySessionInterruption] décide. Figée, l'horloge attend sans que la vidéo soit coupée : ExoPlayer reprend seul au
 * retour du focus, et l'horloge repart avec lui. Sans reprise (perte définitive), la story reste en pause utilisateur.
 *
 * [bind] relie le contrôleur à son hôte : la story joue-t-elle, et comment se poser en pause utilisateur.
 */
internal class StorySessionInterruptionController {
    private val law = StorySessionInterruption()
    private var isPlaying: () -> Boolean = { true }
    private var settleAsPause: () -> Unit = {}

    /** `true` tant qu'une interruption tient l'horloge. */
    var frozen by mutableStateOf(false)
        private set

    fun bind(isPlaying: () -> Boolean, settleAsPause: () -> Unit) {
        this.isPlaying = isPlaying
        this.settleAsPause = settleAsPause
    }

    fun onFocusLost() = apply(law.handle(MediaSessionEvent.InterruptionBegan, isPlaying()))

    fun onFocusGained() = apply(law.handle(MediaSessionEvent.InterruptionEndedShouldResume, isPlaying()))

    fun onFocusLostForGood() = apply(law.handle(MediaSessionEvent.InterruptionEndedShouldNotResume, isPlaying()))

    fun onReturnedToForeground(otherAudioPlaying: Boolean) = apply(law.returnedToForeground(otherAudioPlaying))

    /** La pause de l'utilisateur l'emporte sur toute reprise automatique. */
    fun userPaused() {
        law.userPaused()
        frozen = law.isFrozen
    }

    private fun apply(outcome: StorySessionInterruption.Outcome) {
        frozen = law.isFrozen
        if (outcome == StorySessionInterruption.Outcome.SettleAsPause) settleAsPause()
    }
}
