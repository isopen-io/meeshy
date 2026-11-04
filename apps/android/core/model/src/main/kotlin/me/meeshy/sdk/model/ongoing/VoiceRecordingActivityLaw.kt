package me.meeshy.sdk.model.ongoing

import kotlin.math.roundToInt

/** Ce que la notification d'un vocal en cours montre : le chrono natif part de [startedAtEpochMs]. */
data class VoiceRecordingSnapshot(
    val startedAtEpochMs: Long,
    val statusLabel: String,
    val isFinished: Boolean,
    val title: String = "",
    val level: Int = 0,
    val lastUpdateEpochMs: Long = 0L,
)

/**
 * **Quand la notification d'un vocal en cours d'enregistrement s'ouvre et se retire.** Miroir
 * Android de `VoiceRecordingActivityLaw` (iOS, #9784) : pure.
 *
 *  - jamais d'enregistrement fantôme : la notification n'existe que tant que l'enregistreur
 *    enregistre ; arrêt, envoi, abandon — elle se retire aussitôt ;
 *  - le chrono ne voyage pas : la notification le déroule seule depuis [Input.startedAtEpochMs] ;
 *  - le niveau sonore est QUANTIFIÉ (0..[MAX_LEVEL]) et ne réveille la notification qu'au plus une fois
 *    par [LEVEL_UPDATE_INTERVAL_MS] : l'enregistreur mesure dix fois par seconde, le système n'en veut pas
 *    autant (iOS `levelUpdateInterval`) ;
 *  - le titre de la conversation accompagne la prise (le texte public de l'écran verrouillé reste neutre).
 */
object VoiceRecordingActivityLaw {

    data class Input(
        val isRecording: Boolean,
        val startedAtEpochMs: Long,
        val title: String = "",
        val levels: List<Float> = emptyList(),
        val nowEpochMs: Long = 0L,
    )

    data class Wording(val recording: String)

    sealed interface Action {
        data object None : Action
        data class Start(val snapshot: VoiceRecordingSnapshot) : Action
        data class Update(val snapshot: VoiceRecordingSnapshot) : Action
        data class End(val snapshot: VoiceRecordingSnapshot) : Action
    }

    data class Step(val running: VoiceRecordingSnapshot?, val action: Action)

    const val MAX_LEVEL: Int = 4
    const val LEVEL_UPDATE_INTERVAL_MS: Long = 1_000L

    fun step(running: VoiceRecordingSnapshot?, input: Input?, wording: Wording): Step {
        if (input == null || !input.isRecording) {
            return running?.let { Step(null, Action.End(it.copy(isFinished = true, level = 0))) } ?: Step(null, Action.None)
        }
        val next = VoiceRecordingSnapshot(
            startedAtEpochMs = input.startedAtEpochMs,
            statusLabel = wording.recording,
            isFinished = false,
            title = input.title,
            level = quantizedLevel(input.levels),
            lastUpdateEpochMs = input.nowEpochMs,
        )
        if (running == null || running.startedAtEpochMs != next.startedAtEpochMs) return Step(next, Action.Start(next))
        if (running.copy(lastUpdateEpochMs = 0L) == next.copy(lastUpdateEpochMs = 0L)) return Step(running, Action.None)
        val onlyLevel = running.title == next.title && running.statusLabel == next.statusLabel
        if (onlyLevel && input.nowEpochMs - running.lastUpdateEpochMs < LEVEL_UPDATE_INTERVAL_MS) return Step(running, Action.None)
        return Step(next, Action.Update(next))
    }

    /** La moyenne des dernières mesures (0..1) en [MAX_LEVEL] + 1 crans. */
    fun quantizedLevel(levels: List<Float>): Int {
        if (levels.isEmpty()) return 0
        val mean = levels.sum() / levels.size
        return (mean.coerceIn(0f, 1f) * MAX_LEVEL).roundToInt()
    }
}
