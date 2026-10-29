package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallLiveFrameDisplay
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.frames.CallLiveFrameSuspension
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.VideoTrack

private const val ANSWER_LINGER_MILLIS = 4_000L
private val STATUS_TOP = 68.dp

/**
 * Le cadre en direct autour des deux vidéos ET ce qui se dit à son sujet : la proposition de l'autre
 * à trancher, sa réponse à la mienne, l'échec d'une proposition. Deux couches, un seul contrôleur.
 */
@Singleton
class CallLiveFrameOverlay @Inject constructor(
    private val frame: CallLiveFrameController,
    private val engine: WebRtcEngine,
    private val textsResolver: CallFrameTextsResolver,
) : CallOverlay {
    override val id: String = "call-live-frame"
    override val slot: CallOverlaySlot = CallOverlaySlot.Background

    override fun isVisible(state: CallUiState): Boolean = state.isVideoCall && state.showsConnectedLayout

    @Composable
    override fun Content(context: CallOverlayContext) {
        val shared by frame.state.collectAsState()
        val reduceMotion = rememberCallReduceMotion()
        val constrained = rememberCallDeviceConstrained()
        val design = CallLiveFrameRule.display(shared.frameId, CallLiveFrameRule.PEOPLE, constrained, reduceMotion).design ?: return
        val state = context.state
        val people = remember(state.peerName, shared.remoteSharedName) { frame.people(state.peerName, shared.remoteSharedName) }
        val call = frame.callContext()
        val texts by produceState(textsResolver.immediate(call), call) { value = textsResolver.texts(call) }
        val remote by engine.remoteVideoTracks.collectAsState(initial = null)
        val local = engine.localVideoTrack
        val sources = remember(local, remote, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff) {
            CallLiveFrameSources.of(people, local, remote, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff)
        }
        val egl = remember(engine) { runCatching { engine.eglBase.eglBaseContext }.getOrNull() }
        CallLiveFrameSurface(
            design = design,
            people = people,
            texts = texts,
            sources = sources,
            eglContext = egl,
            playsMotion = CallLiveFrameRule.playsMotion(design, reduceMotion, constrained),
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/** Les pistes à poser dans les cases : celles qui montrent une image. Une caméra coupée garde sa case, avec son initiale. */
internal object CallLiveFrameSources {
    fun of(
        people: List<CallFramePerson>,
        local: VideoTrack?,
        remote: VideoTrack?,
        isCameraOn: Boolean,
        isFrontCamera: Boolean,
        isPeerCameraOff: Boolean,
    ): Map<String, CallLiveFrameVideoSource> = people.mapNotNull { person ->
        val track = if (person.isSelf) local?.takeIf { isCameraOn } else remote?.takeIf { !isPeerCameraOff }
        track?.let { person.id to CallLiveFrameVideoSource(it, isMirrored = person.isSelf && isFrontCamera) }
    }.toMap()
}

/**
 * Un cadre affiché tient la scène du duo : il pose lui-même chaque vidéo dans sa case. La scène ne
 * dessine alors ni la vidéo plein écran du pair, décodée pour rien sous le cadre, ni ma vignette, qui
 * percerait sa fenêtre. Même condition que le calque qui peint le cadre : suspendu, il n'est pas peint.
 */
internal object CallLiveFrameStage {
    fun framesTheDuo(
        frameId: String?,
        isVideoCall: Boolean,
        showsConnectedLayout: Boolean,
        constrained: Boolean,
        reduceMotion: Boolean,
    ): Boolean = isVideoCall && showsConnectedLayout &&
        CallLiveFrameRule.display(frameId, CallLiveFrameRule.PEOPLE, constrained, reduceMotion).design != null
}

/** Ce qui se dit du cadre en haut de l'écran, sous l'en-tête : une proposition à trancher, une réponse, un échec. */
@Singleton
class CallLiveFrameStatusOverlay @Inject constructor(
    private val frame: CallLiveFrameController,
) : CallOverlay {
    override val id: String = "call-live-frame-status"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner

    @Composable
    override fun Content(context: CallOverlayContext) = CallLiveFrameStatus(frame)
}

@HiltViewModel
class CallLiveFrameViewModel @Inject constructor(val controller: CallLiveFrameController) : ViewModel()

/** Le texte du haut de l'écran : la proposition à trancher, la réponse de l'autre, ou l'échec de la mienne. */
@Composable
internal fun CallLiveFrameStatus(controller: CallLiveFrameController, modifier: Modifier = Modifier) {
    val state by controller.state.collectAsState()
    val notice by controller.notices.collectAsState()
    val proposed = state.proposal?.let { p -> CallLiveFrameRule.frames().firstOrNull { it.id == p.frameId }?.let { p to it } }
    val answer = state.answer
    val suspended = CallLiveFrameRule.display(
        state.frameId, CallLiveFrameRule.PEOPLE, rememberCallDeviceConstrained(), rememberCallReduceMotion(),
    ) as? CallLiveFrameDisplay.Suspended
    Column(modifier.padding(top = STATUS_TOP, start = MeeshySpacing.lg, end = MeeshySpacing.lg)) {
        when {
            proposed != null -> CallLiveFrameProposalCard(
                text = proposalText(proposed.first.from, proposed.second.name),
                onAccept = controller::accept,
                onDecline = controller::decline,
            )
            answer != null -> {
                val text = answerText(answer.reply, answer.from)
                CallLiveFrameNotice(text)
                LaunchedEffect(answer) {
                    delay(ANSWER_LINGER_MILLIS)
                    controller.dismissAnswer()
                }
            }
            notice != null -> {
                CallLiveFrameNotice(stringResource(R.string.call_live_frame_not_proposed))
                LaunchedEffect(notice) {
                    delay(ANSWER_LINGER_MILLIS)
                    controller.noticeShown()
                }
            }
            suspended != null -> CallLiveFrameNotice(stringResource(suspendedText(suspended.reason)))
        }
    }
}

private fun suspendedText(reason: CallLiveFrameSuspension): Int = when (reason) {
    CallLiveFrameSuspension.DEVICE_CONSTRAINED -> R.string.call_live_frame_suspended_device
    CallLiveFrameSuspension.REDUCE_MOTION -> R.string.call_live_frame_suspended_motion
}

@Composable
private fun proposalText(from: String?, frame: String): String =
    if (from.isNullOrBlank()) stringResource(R.string.call_live_frame_proposal_anonymous, frame)
    else stringResource(R.string.call_live_frame_proposal, from, frame)

@Composable
private fun answerText(reply: CallLiveFrameReply, from: String?): String = when {
    reply == CallLiveFrameReply.ACCEPTED && !from.isNullOrBlank() -> stringResource(R.string.call_live_frame_answer_accepted, from)
    reply == CallLiveFrameReply.ACCEPTED -> stringResource(R.string.call_live_frame_answer_accepted_anonymous)
    !from.isNullOrBlank() -> stringResource(R.string.call_live_frame_answer_declined, from)
    else -> stringResource(R.string.call_live_frame_answer_declined_anonymous)
}

/** L'autre m'invite à appliquer son cadre ; rien ne change chez moi tant que je n'ai pas touché « Appliquer ». */
@Composable
internal fun CallLiveFrameProposalCard(text: String, onAccept: () -> Unit, onDecline: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Column(
        modifier = modifier.fillMaxWidth().clip(shape).background(Color.Black.copy(alpha = 0.55f)).padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.Top) {
            androidx.compose.material3.Icon(MeeshyIcons.Wallpaper, contentDescription = null, tint = CallPalette.Ink, modifier = Modifier.size(20.dp))
            Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            CallLiveFrameButton(stringResource(R.string.call_live_frame_decline), Color.White.copy(alpha = 0.16f), onDecline, Modifier.weight(1f))
            CallLiveFrameButton(stringResource(R.string.call_live_frame_accept), CallPalette.BrandDeep, onAccept, Modifier.weight(1f))
        }
    }
}

@Composable
private fun CallLiveFrameButton(label: String, fill: Color, onClick: () -> Unit, modifier: Modifier) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier
            .height(44.dp)
            .clip(CircleShape)
            .background(fill)
            .clickable(role = Role.Button) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) { Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink) }
}

/** Une ligne d'état du cadre : la réponse de l'autre, ou la raison d'une pause. */
@Composable
internal fun CallLiveFrameNotice(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = CallPalette.Ink,
        modifier = modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { },
    )
}
