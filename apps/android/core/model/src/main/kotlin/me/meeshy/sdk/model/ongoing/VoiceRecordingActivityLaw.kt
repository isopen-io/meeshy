package me.meeshy.sdk.model.ongoing

/** Ce que la notification d'un vocal en cours montre : le chrono natif part de [startedAtEpochMs]. */
data class VoiceRecordingSnapshot(
    val startedAtEpochMs: Long,
    val statusLabel: String,
    val isFinished: Boolean,
)

/**
 * **Quand la notification d'un vocal en cours d'enregistrement s'ouvre et se retire.** Miroir
 * Android de `VoiceRecordingActivityLaw` (iOS, #9784) : pure.
 *
 *  - jamais d'enregistrement fantôme : la notification n'existe que tant que l'enregistreur
 *    enregistre ; arrêt, envoi, abandon — elle se retire aussitôt ;
 *  - le chrono ne voyage pas : la notification le déroule seule depuis [Input.startedAtEpochMs] ;
 *  - le niveau sonore n'est pas servi (iOS l'anime, une notification n'a pas de vue vivante) :
 *    la notification ne se réveille donc jamais en cours de prise ;
 *  - aucun nom de conversation, aucun contenu : un libellé neutre.
 */
object VoiceRecordingActivityLaw {

    data class Input(val isRecording: Boolean, val startedAtEpochMs: Long)

    data class Wording(val recording: String)

    sealed interface Action {
        data object None : Action
        data class Start(val snapshot: VoiceRecordingSnapshot) : Action
        data class Update(val snapshot: VoiceRecordingSnapshot) : Action
        data class End(val snapshot: VoiceRecordingSnapshot) : Action
    }

    data class Step(val running: VoiceRecordingSnapshot?, val action: Action)

    fun step(running: VoiceRecordingSnapshot?, input: Input?, wording: Wording): Step {
        if (input == null || !input.isRecording) {
            return running?.let { Step(null, Action.End(it.copy(isFinished = true))) } ?: Step(null, Action.None)
        }
        val next = VoiceRecordingSnapshot(input.startedAtEpochMs, wording.recording, isFinished = false)
        if (running == null || running.startedAtEpochMs != next.startedAtEpochMs) return Step(next, Action.Start(next))
        return Step(next, if (running == next) Action.None else Action.Update(next))
    }
}
