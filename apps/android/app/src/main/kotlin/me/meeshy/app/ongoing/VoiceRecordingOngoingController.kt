package me.meeshy.app.ongoing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ongoing.VoiceRecordingActivityLaw
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot

/**
 * Exécute [VoiceRecordingActivityLaw] : la prise de l'enregistreur entre, la notification sort.
 * Elle se retire à l'instant où la prise s'arrête — jamais d'enregistrement fantôme — et ne se
 * réveille pas en cours de prise : le chronomètre est celui du système.
 */
internal class VoiceRecordingOngoingController(
    private val startedAt: Flow<Long?>,
    private val sink: OngoingNotificationSink<VoiceRecordingSnapshot>,
    private val wording: () -> VoiceRecordingActivityLaw.Wording,
) {
    private var running: VoiceRecordingSnapshot? = null

    fun start(scope: CoroutineScope): Job = scope.launch {
        startedAt.distinctUntilChanged().collect { began ->
            val input = VoiceRecordingActivityLaw.Input(isRecording = began != null, startedAtEpochMs = began ?: 0L)
            val step = VoiceRecordingActivityLaw.step(running, input, wording())
            running = step.running
            when (val action = step.action) {
                VoiceRecordingActivityLaw.Action.None -> Unit
                is VoiceRecordingActivityLaw.Action.Start -> sink.show(action.snapshot)
                is VoiceRecordingActivityLaw.Action.Update -> sink.show(action.snapshot)
                is VoiceRecordingActivityLaw.Action.End -> sink.cancel()
            }
        }
    }
}
