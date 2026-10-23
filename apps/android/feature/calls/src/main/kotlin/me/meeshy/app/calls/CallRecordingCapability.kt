package me.meeshy.app.calls

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallRecordingController
import me.meeshy.sdk.call.CallRecordingHost
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

/** L'appel en cours tel que le contrôleur d'enregistrement le lit ; mis à jour à chaque transition. */
@Singleton
class CallRecordingCallHost @Inject constructor() : CallRecordingHost {
    @Volatile
    override var recordingCallId: String? = null
        private set

    @Volatile
    override var isEstablished: Boolean = false
        private set

    @Volatile
    override var conversationId: String? = null
        private set

    fun update(callId: String, conversationId: String, established: Boolean) {
        recordingCallId = callId.ifBlank { null }
        this.conversationId = conversationId.ifBlank { null }
        isEstablished = established
    }

    fun clear() {
        recordingCallId = null
        conversationId = null
        isEstablished = false
    }
}

/** Relie le cycle de vie de l'appel au contrôleur : l'appel établi autorise la demande, sa fin éteint tout. */
@Singleton
class CallRecordingFeatureController @Inject constructor(
    private val recording: CallRecordingController,
    private val host: CallRecordingCallHost,
) : CallFeatureController {
    init {
        recording.host = host
    }

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (next) {
            is CallState.Ended, CallState.Idle -> end()
            else -> host.update(session.callId, session.config.conversationId, established = next is CallState.Connected)
        }
    }

    override fun onCleared() = end()

    private fun end() {
        recording.callEnded()
        host.clear()
    }
}

/**
 * Le bouton Enregistrer de la pilule. Au repos il ouvre le panneau (le choix audio / vidéo) ; pendant
 * une demande ou un enregistrement, il l'arrête d'un toucher. Absent tant que l'appel n'est pas établi
 * ou que l'appareil ne sait pas capter.
 */
@Singleton
class CallRecordingActionHandler @Inject constructor(
    private val recording: CallRecordingController,
) : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? {
        val active = recording.state.value.phase.isActive
        if (!active && !recording.mayRequest()) return null
        return CallActionPresentation(
            icon = if (active) Icons.Filled.StopCircle else Icons.Filled.FiberManualRecord,
            labelRes = if (active) R.string.call_recording_stop else R.string.call_recording_start,
            isActive = active,
        )
    }

    override fun perform() {
        if (recording.state.value.phase.isActive) recording.stop()
    }
}

/** La carte de consentement : posée hors du chrome, donc visible même quand il est masqué. */
@Singleton
class CallRecordingConsentOverlay @Inject constructor(
    private val recording: CallRecordingController,
) : CallOverlay {
    override val id: String = "call-recording-consent"
    override val slot: CallOverlaySlot = CallOverlaySlot.Center
    override val priority: Int = 100

    @Composable
    override fun Content(context: CallOverlayContext) {
        val state by recording.state.collectAsState()
        if (!CallRecordingPresenter.asksConsent(state.phase)) return
        CallRecordingConsentCard(
            requesterName = context.state.peerName,
            kind = state.kind,
            accent = context.accent,
            onAnswer = { accepted -> recording.answer(accepted) },
        )
    }
}

/** Le voyant « Enregistrement en cours » (persistant chez tous), l'attente de l'accord, et les avis. */
@Singleton
class CallRecordingStatusOverlay @Inject constructor(
    private val recording: CallRecordingController,
) : CallOverlay {
    override val id: String = "call-recording-status"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner
    override val priority: Int = 100

    @Composable
    override fun Content(context: CallOverlayContext) {
        val state by recording.state.collectAsState()
        val status = CallRecordingPresenter.status(state.phase)
        val notice = state.notice
        val modifier = Modifier.padding(top = MeeshySpacing.sm)
        when {
            status != null -> CallRecordingStatusPill(
                text = stringResource(status.textRes),
                stopLabel = stringResource(status.stopLabelRes),
                onStop = { recording.stop() },
                modifier = modifier,
            )
            notice != null && !CallRecordingPresenter.asksConsent(state.phase) -> CallRecordingNoticePill(
                notice = notice,
                onDismiss = recording::dismissNotice,
                modifier = modifier,
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallRecordingCapabilityModule {
    @Binds
    @IntoSet
    fun bindRecordingFeatureController(impl: CallRecordingFeatureController): CallFeatureController

    @Binds
    @IntoSet
    fun bindRecordingConsentOverlay(impl: CallRecordingConsentOverlay): CallOverlay

    @Binds
    @IntoSet
    fun bindRecordingStatusOverlay(impl: CallRecordingStatusOverlay): CallOverlay

    @Binds
    @IntoMap
    @CallActionKey(CallAction.Recording)
    fun bindRecordingActionHandler(impl: CallRecordingActionHandler): CallActionHandler
}
