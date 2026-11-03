package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.playback.InterruptionResumeLedger
import me.meeshy.sdk.model.playback.MediaSessionEvent

/**
 * **Une interruption de la lecture fige l'horloge de la story** — port de iOS `StorySessionInterruption` (#11040).
 *
 * Un appel, un assistant vocal, l'audio d'une autre application : le système retire le focus audio, et la story
 * s'arrêtait de SONNER pendant que sa barre avançait. Désormais sa progression s'arrête avec le son et repart
 * avec la reprise (`AUDIOFOCUS_GAIN`). Interruption finie SANS reprise : la story reste arrêtée comme une pause de
 * l'utilisateur. Pause de l'utilisateur pendant l'interruption : elle l'emporte. La décision appartient à
 * [InterruptionResumeLedger], la même pour tous les lecteurs.
 */
public class StorySessionInterruption {

    public enum class Outcome { None, Freeze, Resume, SettleAsPause }

    private val ledger = InterruptionResumeLedger()

    /** `true` tant qu'une interruption tient la story figée. */
    public var isFrozen: Boolean = false
        private set

    public fun handle(event: MediaSessionEvent, storyIsPlaying: Boolean): Outcome {
        if (!concernsTheClock(event)) return Outcome.None
        val signal = InterruptionResumeLedger.signalFor(event, isPlaying = storyIsPlaying) ?: return Outcome.None
        return apply(ledger.handle(signal))
    }

    /** Retour au premier plan sans signal de fin (la vidéo d'une autre application n'en envoie presque jamais). */
    public fun returnedToForeground(otherAudioPlaying: Boolean): Outcome {
        if (!isFrozen) return Outcome.None
        return apply(
            ledger.handle(
                InterruptionResumeLedger.Signal.ReturnedToForeground(
                    otherAudioPlaying = otherAudioPlaying,
                    contentStillOnScreen = true,
                ),
            ),
        )
    }

    /** L'utilisateur a mis la story en pause : sa pause l'emporte sur toute reprise automatique. */
    public fun userPaused() {
        ledger.handle(InterruptionResumeLedger.Signal.UserPaused)
        isFrozen = false
    }

    private fun concernsTheClock(event: MediaSessionEvent): Boolean = when (event) {
        MediaSessionEvent.InterruptionBegan,
        MediaSessionEvent.InterruptionEndedShouldResume,
        MediaSessionEvent.InterruptionEndedShouldNotResume,
        MediaSessionEvent.CallEndedShouldResume,
        -> true
        MediaSessionEvent.RouteChangedOldDeviceUnavailable,
        MediaSessionEvent.RouteChangedOther,
        -> false
    }

    private fun apply(action: InterruptionResumeLedger.Action): Outcome {
        val wasFrozen = isFrozen
        isFrozen = ledger.holdsInterruptedPlayback
        return when (action) {
            InterruptionResumeLedger.Action.Pause -> Outcome.Freeze
            InterruptionResumeLedger.Action.Resume -> Outcome.Resume
            InterruptionResumeLedger.Action.None -> if (wasFrozen && !isFrozen) Outcome.SettleAsPause else Outcome.None
        }
    }
}
