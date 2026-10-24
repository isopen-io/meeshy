package me.meeshy.app.calls

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.ongoing.CallActivityCaption
import me.meeshy.sdk.model.ongoing.CallActivityLaw
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import me.meeshy.sdk.model.ongoing.OngoingCallPhase
import javax.inject.Inject
import javax.inject.Singleton

/** Les libellés de statut de la notification, dans la langue d'interface du moment. */
interface CallOngoingWording {
    fun current(): CallActivityLaw.Wording
}

@Singleton
class AndroidCallOngoingWording @Inject constructor(
    @ApplicationContext private val context: Context,
) : CallOngoingWording {
    override fun current(): CallActivityLaw.Wording = CallActivityLaw.Wording(
        ringing = context.getString(R.string.call_status_ringing),
        connecting = context.getString(R.string.call_status_connecting),
        audioCall = context.getString(R.string.call_start_audio),
        videoCall = context.getString(R.string.call_start_video),
        onHold = context.getString(R.string.call_service_on_hold),
        reconnecting = context.getString(R.string.call_service_reconnecting),
        ended = context.getString(R.string.call_ended),
    )
}

/**
 * Applique [CallActivityLaw] à l'écran d'appel : à l'émission ou au décroché la notification
 * naît (et le service de premier plan avec elle), chaque changement de phase, de micro ou de
 * sous-titre la met à jour (anti-rebond 250 ms), la fin la clôt par « Appel terminé ».
 * Un appel entrant qui sonne n'ouvre rien. Aucun appel chiffré ou inconnu ne montre de
 * sous-titre : la conversation d'un appel Android n'est pas encore résolue (fail-closed).
 */
@Singleton
class CallOngoingController @Inject constructor(
    private val holder: ActiveCallSnapshotHolder,
    private val services: CallServiceController,
    private val wording: CallOngoingWording,
    private val clock: CallClock,
) {
    private var job: Job? = null
    private var commands: ActiveCallCommands? = null
    private var running: CallActivitySnapshot? = null
    private var connectedSince: Long? = null

    fun attach(
        scope: CoroutineScope,
        ui: StateFlow<CallUiState>,
        onHangUp: () -> Unit,
        onToggleMute: () -> Unit,
        onAnswer: () -> Unit = {},
        onDecline: () -> Unit = {},
    ) {
        detach()
        val bound = object : ActiveCallCommands {
            override fun hangUp() = onHangUp()
            override fun toggleMute() = onToggleMute()
            override fun answer() = onAnswer()
            override fun decline() = onDecline()
        }
        commands = bound
        holder.attach(bound)
        job = scope.launch { ui.collectLatest(::onState) }
    }

    fun detach() {
        job?.cancel()
        job = null
        commands?.let(holder::detach)
        commands = null
        val last = running
        running = null
        connectedSince = null
        if (last != null) {
            holder.publish(null)
            services.sync(null)
        }
    }

    private suspend fun onState(ui: CallUiState) {
        val input = inputOf(ui)
        val step = CallActivityLaw.step(running, input, wording.current())
        if (step.action is CallActivityLaw.Action.Update) delay(DEBOUNCE_MS)
        commit(CallActivityLaw.step(running, input, wording.current()))
    }

    private fun commit(step: CallActivityLaw.Step) {
        running = step.running
        when (val action = step.action) {
            CallActivityLaw.Action.None -> Unit
            is CallActivityLaw.Action.Start -> publish(action.snapshot)
            is CallActivityLaw.Action.Update -> publish(action.snapshot)
            is CallActivityLaw.Action.End -> publish(action.snapshot)
        }
    }

    private fun publish(snapshot: CallActivitySnapshot) {
        holder.publish(snapshot)
        services.sync(snapshot)
    }

    private fun inputOf(ui: CallUiState): CallActivityLaw.Input {
        val phase = phaseOf(ui.status)
        connectedSince = when (phase) {
            OngoingCallPhase.Connected, OngoingCallPhase.Reconnecting -> connectedSince ?: clock.nowMs()
            OngoingCallPhase.Ended -> connectedSince
            else -> null
        }
        return CallActivityLaw.Input(
            phase = phase,
            title = ui.peerName,
            isVideo = ui.isVideoCall,
            isMuted = ui.isMuted,
            connectedSinceEpochMs = connectedSince,
            isEndToEndEncrypted = null,
            captionsActive = ui.captionText != null,
            caption = ui.captionText?.let { CallActivityCaption(speaker = ui.peerName, text = it) },
        )
    }

    private fun phaseOf(status: CallStatus): OngoingCallPhase = when (status) {
        CallStatus.IDLE -> OngoingCallPhase.Idle
        CallStatus.INCOMING -> OngoingCallPhase.RingingIncoming
        CallStatus.OUTGOING_RINGING -> OngoingCallPhase.RingingOutgoing
        CallStatus.CONNECTING -> OngoingCallPhase.Connecting
        CallStatus.CONNECTED -> OngoingCallPhase.Connected
        CallStatus.RECONNECTING -> OngoingCallPhase.Reconnecting
        CallStatus.ENDED -> OngoingCallPhase.Ended
    }

    companion object {
        const val DEBOUNCE_MS: Long = 250L
    }
}
