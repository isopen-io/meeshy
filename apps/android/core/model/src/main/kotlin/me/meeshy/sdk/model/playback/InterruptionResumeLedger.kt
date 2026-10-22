package me.meeshy.sdk.model.playback

/**
 * **Ce qu'une interruption a mis en pause, et quand le reprendre** — port de iOS
 * `InterruptionResumeLedger` (#11040).
 *
 * Un appel qui arrive, une autre application qui lance un son : ce que joue Meeshy se met en pause.
 * Quand l'interruption se termine, Meeshy reprend là où il s'était arrêté — mais seulement ce qui
 * JOUAIT au moment où elle a commencé, et jamais ce que l'utilisateur a mis en pause lui-même entre
 * temps.
 *
 * Une seule machine d'état pour tous les lecteurs (vidéo partagée, PiP compris, audio, aperçus) :
 * chacun la réécrivait, et chacun en oubliait un cas. Le lecteur traduit ses événements en
 * [Signal], applique l'[Action] rendue, et ne décide de rien d'autre.
 *
 * Un registre par lecteur ; non thread-safe — à confiner au dispatcher qui pilote le lecteur.
 */
public class InterruptionResumeLedger {

    public sealed interface Signal {
        /** L'interruption commence ; [isPlaying] dit si le lecteur jouait. */
        public data class InterruptionBegan(val isPlaying: Boolean) : Signal

        /**
         * L'interruption s'achève. [shouldResume] vient du système, ou d'un appel Meeshy raccroché
         * (que la pile d'appel ne signale pas au système).
         */
        public data class InterruptionEnded(val shouldResume: Boolean) : Signal

        /** La sortie a disparu (casque débranché) : convention de la plateforme, pause sans reprise. */
        public data object OutputLost : Signal

        /** L'utilisateur a mis en pause : sa décision l'emporte sur toute reprise automatique. */
        public data object UserPaused : Signal

        /** L'utilisateur a relancé lui-même : il n'y a plus rien à reprendre. */
        public data object UserStartedPlayback : Signal

        /** Le contenu a quitté le lecteur (arrêt, autre média chargé). */
        public data object ContentReleased : Signal

        /**
         * Retour au premier plan, sans signal de fin d'interruption — la vidéo d'une autre
         * application (YouTube, Instagram) n'en envoie presque jamais.
         */
        public data class ReturnedToForeground(
            val otherAudioPlaying: Boolean,
            val contentStillOnScreen: Boolean,
        ) : Signal
    }

    public enum class Action {
        Pause,
        Resume,
        None,
    }

    /** `true` entre une interruption survenue EN LECTURE et sa résolution. */
    public var holdsInterruptedPlayback: Boolean = false
        private set

    public fun handle(signal: Signal): Action = when (signal) {
        is Signal.InterruptionBegan -> {
            if (signal.isPlaying) {
                holdsInterruptedPlayback = true
                Action.Pause
            } else {
                Action.None
            }
        }

        is Signal.InterruptionEnded -> consume(resuming = signal.shouldResume)

        Signal.OutputLost -> {
            holdsInterruptedPlayback = false
            Action.Pause
        }

        Signal.UserPaused,
        Signal.UserStartedPlayback,
        Signal.ContentReleased,
        -> {
            holdsInterruptedPlayback = false
            Action.None
        }

        is Signal.ReturnedToForeground -> when {
            !signal.contentStillOnScreen -> consume(resuming = false)
            signal.otherAudioPlaying -> Action.None
            else -> consume(resuming = true)
        }
    }

    private fun consume(resuming: Boolean): Action {
        if (!holdsInterruptedPlayback) return Action.None
        holdsInterruptedPlayback = false
        return if (resuming) Action.Resume else Action.None
    }

    public companion object {
        /**
         * Traduit un événement de la session partagée. `null` : rien à en tirer pour un lecteur.
         */
        public fun signalFor(event: MediaSessionEvent, isPlaying: Boolean): Signal? = when (event) {
            MediaSessionEvent.InterruptionBegan -> Signal.InterruptionBegan(isPlaying = isPlaying)

            MediaSessionEvent.InterruptionEndedShouldResume,
            MediaSessionEvent.CallEndedShouldResume,
            -> Signal.InterruptionEnded(shouldResume = true)

            MediaSessionEvent.InterruptionEndedShouldNotResume -> Signal.InterruptionEnded(shouldResume = false)

            MediaSessionEvent.RouteChangedOldDeviceUnavailable -> Signal.OutputLost

            MediaSessionEvent.RouteChangedOther -> null
        }
    }
}
