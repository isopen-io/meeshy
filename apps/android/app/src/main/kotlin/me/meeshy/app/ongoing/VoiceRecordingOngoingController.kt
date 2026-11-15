package me.meeshy.app.ongoing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
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
    private val title: Flow<String> = flowOf(""),
    private val levels: Flow<List<Float>> = flowOf(emptyList()),
    private val clock: () -> Long = System::currentTimeMillis,
    private val wording: () -> VoiceRecordingActivityLaw.Wording,
) {
    private var running: VoiceRecordingSnapshot? = null

    fun start(scope: CoroutineScope): Job = scope.launch {
        combine(startedAt.distinctUntilChanged(), title, levels, { began, name, measures -> Triple(began, name, measures) }).collect { (began, name, measures) ->
            val input = VoiceRecordingActivityLaw.Input(
                isRecording = began != null,
                startedAtEpochMs = began ?: 0L,
                title = name,
                levels = measures,
                nowEpochMs = clock(),
            )
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
