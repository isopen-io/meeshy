package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
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
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallTopBanner
import me.meeshy.sdk.model.call.CallTopBannerStack
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallLiveFrameDisplay
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.frames.CallLiveFrameSuspension
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.VideoTrack

private const val ANSWER_LINGER_MILLIS = 4_000L

/** Les textes du cadre (nom du groupe, date) se revérifient chaque minute ; la surface ne repeint que s'ils ont changé. */
private const val TEXTS_RECHECK_MILLIS = 60_000L

/**
 * Le cadre en direct autour des deux vidéos ET ce qui se dit à son sujet : la proposition de l'autre
 * à trancher, sa réponse à la mienne, l'échec d'une proposition. Deux couches, un seul contrôleur.
 * Sous un mode (Montage, Effets), la surface quitte la composition : ses rendus lâchent les pistes au lieu de
 * composer des images que la scène du mode recouvre (#13738) ; le cadre reste gardé et revient à la sortie.
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
        if (!CallLiveFrameRule.showsHeldFrame(isVisible(context.state), context.activeMode)) return
        val shared by frame.state.collectAsState()
        val reduceMotion = rememberCallReduceMotion()
        val constrained = rememberCallDeviceConstrained()
        val design = CallLiveFrameRule.display(shared.frameId, CallLiveFrameRule.PEOPLE, constrained, reduceMotion).design
        // #17820 C3.6 : le cadre entre et sort en fondu (court sous « Réduire les animations »), il ne surgit plus d'un coup.
        CallBannerPresence(design, travels = false) { shown ->
            Layer(shown, context.state, shared.remoteSharedName, reduceMotion, constrained)
        }
    }

    @Composable
    private fun Layer(design: CallFrameDesign, state: CallUiState, remoteSharedName: String?, reduceMotion: Boolean, constrained: Boolean) {
        val people = remember(state.peerName, remoteSharedName) { frame.people(state.peerName, remoteSharedName) }
        val call = frame.callContext()
        val texts by produceState(textsResolver.immediate(call), call) {
            while (true) {
                value = textsResolver.texts(call)
                delay(TEXTS_RECHECK_MILLIS)
            }
        }
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
    override val priority: Int = CallTopBannerStack.priority(CallTopBanner.LiveFrame)

    @Composable
    override fun Content(context: CallOverlayContext) = CallLiveFrameStatus(
        frame,
        offersProposal = CallLiveFrameRule.mayShowProposal(
            participants = CallLiveFrameRule.PEOPLE,
            showsVideo = context.state.isVideoCall && context.state.showsConnectedLayout,
            isGroupStage = context.isGroupStage,
        ),
    )
}

@HiltViewModel
class CallLiveFrameViewModel @Inject constructor(
    val controller: CallLiveFrameController,
    val texts: CallFrameTextsResolver,
) : ViewModel()

/** Ce que le haut de l'écran dit du cadre : la carte à trancher, ou une ligne d'état. */
private sealed interface LiveFrameFace {
    data class Proposal(val text: String) : LiveFrameFace

    data class Line(val text: String) : LiveFrameFace
}

/**
 * Le texte du haut de l'écran : la proposition à trancher, la réponse de l'autre, ou l'échec de la mienne. Comme les trois
 * autres bandeaux de la pile, il arrive du haut et y repart par [CallBannerPresence] (#17820 C2.7), à la marge de la pile
 * (C2.1). La proposition n'est montrée qu'en duo vidéo ([offersProposal], C2.10) ; sa mesure ne compte pas pour ma vignette (la loi
 * l'écarte), mais la grille de groupe lui cède sa place (L4.11).
 */
@Composable
internal fun CallLiveFrameStatus(controller: CallLiveFrameController, offersProposal: Boolean = true, modifier: Modifier = Modifier) {
    val state by controller.state.collectAsState()
    val notice by controller.notices.collectAsState()
    val proposed = state.proposal?.takeIf { offersProposal }
        ?.let { p -> CallLiveFrameRule.frames().firstOrNull { it.id == p.frameId }?.let { p to it } }
    val answer = state.answer
    val suspended = CallLiveFrameRule.display(
        state.frameId, CallLiveFrameRule.PEOPLE, rememberCallDeviceConstrained(), rememberCallReduceMotion(),
    ) as? CallLiveFrameDisplay.Suspended
    // L'avis ne s'éteint que lorsqu'il est celui qu'on voit : une proposition à trancher passe devant.
    val shownAnswer = answer?.takeIf { proposed == null }
    val shownNotice = notice?.takeIf { proposed == null && answer == null }
    LaunchedEffect(shownAnswer) {
        if (shownAnswer == null) return@LaunchedEffect
        delay(ANSWER_LINGER_MILLIS)
        controller.dismissAnswer()
    }
    LaunchedEffect(shownNotice) {
        if (shownNotice == null) return@LaunchedEffect
        delay(ANSWER_LINGER_MILLIS)
        controller.noticeShown()
    }
    val face: LiveFrameFace? = when {
        proposed != null -> LiveFrameFace.Proposal(
            proposalText(proposed.first.from, proposed.second.displayName(LocalConfiguration.current.locales[0]?.language)),
        )
        answer != null -> LiveFrameFace.Line(answerText(answer.reply, answer.from))
        notice != null -> LiveFrameFace.Line(stringResource(R.string.call_live_frame_not_proposed))
        suspended != null -> LiveFrameFace.Line(stringResource(suspendedText(suspended.reason)))
        else -> null
    }
    CallBannerPresence(face) { shown ->
        // La pile du haut pose ce bandeau sous l'en-tête (P16.4) : il ne porte que son écart et la marge des autres bandeaux.
        val place = modifier
            .padding(horizontal = CallTopBannerStack.HORIZONTAL_MARGIN_DP.dp)
            .padding(top = CallTopBannerStack.GAP_DP.dp)
            .reportsTopBannerHeight(CallTopBanner.LiveFrame)
        when (shown) {
            is LiveFrameFace.Proposal -> CallLiveFrameProposalCard(shown.text, onAccept = controller::accept, onDecline = controller::decline, modifier = place)
            is LiveFrameFace.Line -> CallLiveFrameNotice(shown.text, modifier = place)
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
    CallGlassPlate(
        modifier = modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        shape = RoundedCornerShape(MeeshyRadius.lg),
    ) {
        CallToneScrim()
        Column(Modifier.padding(MeeshySpacing.md), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.Top) {
                androidx.compose.material3.Icon(MeeshyIcons.Wallpaper, contentDescription = null, tint = CallPalette.Ink, modifier = Modifier.size(20.dp))
                Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                CallLiveFrameButton(stringResource(R.string.call_live_frame_decline), null, onDecline, Modifier.weight(1f))
                CallLiveFrameButton(stringResource(R.string.call_live_frame_accept), CallPalette.BrandDeep, onAccept, Modifier.weight(1f))
            }
        }
    }
}

/** « Non merci » est un verre de bouton (#17323, iOS `callChipGlass`) ; « Appliquer » garde son [accent] plein. */
@Composable
private fun CallLiveFrameButton(label: String, accent: Color?, onClick: () -> Unit, modifier: Modifier) {
    val haptics = LocalHapticFeedback.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val target = modifier
        .height(48.dp)
        .clickable(interactionSource = source, indication = null, role = Role.Button) {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        }
    val text: @Composable () -> Unit = {
        Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink)
    }
    if (accent == null) {
        CallGlassButtonSurface(role = CallButtonRole.Neutral, shape = CircleShape, isPressed = pressed, modifier = target) { text() }
    } else {
        Box(
            target.clip(CircleShape).background(accent).background(CallButtonFill.pressedHighlight(pressed)),
            contentAlignment = Alignment.Center,
        ) { text() }
    }
}

/** Une ligne d'état du cadre : la réponse de l'autre, ou la raison d'une pause. */
@Composable
internal fun CallLiveFrameNotice(text: String, modifier: Modifier = Modifier) {
    CallGlassPlate(
        modifier = modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
    ) {
        CallToneScrim()
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        )
    }
}
