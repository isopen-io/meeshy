package me.meeshy.app.calls

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
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
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallTopBanner
import me.meeshy.sdk.model.call.CallTopBannerStack
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingNotice
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallVerticalEdge
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.ui.icons.MeeshyIcons

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
            icon = if (active) MeeshyIcons.StopCircle else MeeshyIcons.Record,
            labelRes = if (active) R.string.call_recording_stop else R.string.call_recording_start,
            isActive = active,
            captionRes = R.string.call_recording_caption,
            isDestructive = true,
        )
    }

    override fun perform() {
        if (recording.state.value.phase.isActive) recording.stop()
    }
}

/** Ce que la carte d'accord montre : qui demande, et quoi enregistrer. */
private data class ConsentFace(val requesterName: String, val kind: CallRecordingKind)

/**
 * La carte de consentement : le bandeau « enregistrement » de la pile du haut, SOUS la rangée d'en-tête (R2.1) — elle ne se pose plus
 * au milieu de l'écran, par-dessus le pair. Hors du chrome, donc visible même quand il est masqué ; composée par la pile, elle
 * reste au-dessus des modes Effets et Montage (R2.5). Elle nomme CELUI QUI DEMANDE (R2.2), arrive du haut et y repart (R2.10).
 */
@Singleton
class CallRecordingConsentOverlay @Inject constructor(
    private val recording: CallRecordingController,
) : CallOverlay {
    override val id: String = "call-recording-consent"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner
    override val priority: Int = CallTopBannerStack.priority(CallTopBanner.Recording)

    @Composable
    override fun Content(context: CallOverlayContext) {
        val state by recording.state.collectAsState()
        val face = if (CallRecordingPresenter.asksConsent(state.phase)) {
            ConsentFace(state.phase.requesterName(context.state.participantNames), state.kind)
        } else {
            null
        }
        CallBannerPresence(face) { shown ->
            CallRecordingConsentCard(
                requesterName = shown.requesterName,
                kind = shown.kind,
                onAnswer = { accepted -> recording.answer(accepted) },
                modifier = Modifier
                    .padding(top = CallTopBannerStack.GAP_DP.dp)
                    .reportsTopBannerHeight(CallTopBanner.Recording),
            )
        }
    }
}

/** Ce que la capsule d'enregistrement montre : l'attente ou l'enregistrement, ou l'avis qui suit une fin. */
private sealed interface RecordingFace {
    data class Status(val status: CallRecordingStatus) : RecordingFace

    data class Notice(val notice: CallRecordingNotice) : RecordingFace
}

/**
 * Le voyant « Enregistrement en cours » (persistant chez tous), l'attente de l'accord, et les avis : UNE capsule dont seuls les
 * mots changent de l'attente à l'enregistrement. Elle arrive du haut et y repart (R2.10), et s'efface avec les commandes de l'appel
 * (`CallChromeElement.RecordingStatus`, iOS `showsStatus`, #13766) en montant avec l'en-tête (R3.6) ; la carte de consentement, elle, reste.
 */
@Singleton
class CallRecordingStatusOverlay @Inject constructor(
    private val recording: CallRecordingController,
) : CallOverlay {
    override val id: String = "call-recording-status"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner
    override val priority: Int = CallTopBannerStack.priority(CallTopBanner.Recording)

    @Composable
    override fun Content(context: CallOverlayContext) {
        val state by recording.state.collectAsState()
        val status = CallRecordingPresenter.status(state.phase)
        val notice = state.notice?.takeIf { !CallRecordingPresenter.asksConsent(state.phase) }
        val face = when {
            status != null -> RecordingFace.Status(status)
            notice != null -> RecordingFace.Notice(notice)
            else -> null
        }
        val modifier = Modifier.padding(top = MeeshySpacing.sm).reportsTopBannerHeight(CallTopBanner.Recording)
        CallBannerPresence(face) { shown ->
            CallChromeFade(
                isVisible = context.chrome.isVisible(CallChromeElement.RecordingStatus),
                onRevive = context.onChromeRevive,
                stowsToward = CallVerticalEdge.Top,
                edgeMargin = CallTopBannerStack.HEADER_ROW_CLEARANCE_DP.dp,
            ) {
                when (shown) {
                    is RecordingFace.Status -> CallRecordingStatusPill(
                        text = stringResource(shown.status.textRes),
                        stopWord = stringResource(shown.status.stopWordRes),
                        stopLabel = stringResource(shown.status.stopLabelRes),
                        onStop = { recording.stop() },
                        modifier = modifier,
                    )
                    is RecordingFace.Notice -> CallRecordingNoticePill(
                        notice = shown.notice,
                        onDismiss = recording::dismissNotice,
                        modifier = modifier,
                    )
                }
            }
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
