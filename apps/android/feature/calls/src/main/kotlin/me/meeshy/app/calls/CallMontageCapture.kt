package me.meeshy.app.calls

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.ViewConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageStage
import me.meeshy.sdk.model.call.montage.CallMontageStageRule
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.EglBase
import org.webrtc.VideoTrack

private const val HINT_PREFS = "meeshy_call_capture"
private const val HINT_SEEN_KEY = "gesture_hint_seen"
private val STOP_DIAMETER = 76.dp
private val STOP_SQUARE = 24.dp

/**
 * Le mode « Capturer l'appel » (iOS `CallScreenMode.montage`) : la scène du montage CHOISI, sous son choix.
 * Choisir un cadre ne le pose pas sur l'appel (#13732) : il ne sert que la capture, et l'option « Cadre » le
 * garde pendant l'appel. La scène suit `CallMontageFrameStage` d'iOS : l'appel s'il montre déjà ce cadre, le
 * cadre posé sur le flux s'il est servi en direct, sinon l'aperçu peint. La prise se déclenche sur l'élément
 * centré du carrousel (#13733).
 */
@Composable
internal fun CallMontageMode(
    state: CallUiState,
    localTrack: VideoTrack?,
    remoteTrack: VideoTrack?,
    eglContext: EglBase.Context?,
    reduceMotion: Boolean,
    onClose: () -> Unit,
    pickerModifier: Modifier,
) {
    val frameViewModel: CallLiveFrameViewModel = hiltViewModel()
    val captureViewModel: CallCaptureViewModel = hiltViewModel()
    val capture = captureViewModel.controller
    val frame by frameViewModel.controller.state.collectAsStateWithLifecycle()
    val pick by capture.pick.collectAsStateWithLifecycle()
    val constrained = rememberCallDeviceConstrained()
    val people = remember(state.peerName, frame.remoteSharedName) { frameViewModel.controller.people(state.peerName, frame.remoteSharedName) }
    LaunchedEffect(capture) { capture.open(frame.frameId) }
    val scene = remember(people, pick, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff) {
        CallCaptureScene(
            look = CallMontagePickRule.look(pick, people.size),
            subjects = CallCaptureSceneRule.duo(people, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff),
        )
    }
    val offered = CallLiveFrameRule.mayOffer(people.size, state.isVideoCall && state.showsConnectedLayout)
    val shownByCall = CallLiveFrameRule.display(frame.frameId, people.size, constrained, reduceMotion).design?.id?.takeIf { offered }
    val chosenFrame = (scene.look as? CallCaptureLook.Frame)?.design?.id
    val live = chosenFrame?.takeIf { offered }?.let { CallLiveFrameRule.display(it, people.size, constrained, reduceMotion).design }
    val stage = CallMontageStageRule.stage(scene.look, shownByCall, live)
    val window = remember(pick, people.size) { CallMontagePickRule.frameWindow(pick, people.size) }
    val request by rememberUpdatedState(CallCapturePreviewRequest(scene, stage != CallMontageStage.Painted, window))
    val tracks = remember(people, localTrack, remoteTrack) { people.associate { it.id to if (it.isSelf) localTrack else remoteTrack } }
    LaunchedEffect(capture) { capture.startPreview { request } }
    LaunchedEffect(capture, scene.look, stage) { capture.refreshSoon() }
    when (stage) {
        CallMontageStage.Call -> Unit
        is CallMontageStage.Live -> CallMontageLiveStage(stage.design, people, state, localTrack, remoteTrack, eglContext, frameViewModel, reduceMotion, constrained)
        CallMontageStage.Painted -> CallMontagePaintedStage(capture, scene.look, Modifier.fillMaxSize())
    }
    CallMontageCaptureLayer(capture, tracks, reduceMotion, Modifier.fillMaxSize())
    CallMontagePicker(
        live = frameViewModel.controller,
        capture = capture,
        scene = scene,
        people = people,
        isLiveOffered = offered,
        reduceMotion = reduceMotion,
        onClose = onClose,
        modifier = pickerModifier,
    )
}

/** Le cadre choisi, servi en direct, posé sur le flux vidéo à pleine cadence (iOS `CallMontageFrameStage`). */
@Composable
private fun CallMontageLiveStage(
    design: CallFrameDesign,
    people: List<CallFramePerson>,
    state: CallUiState,
    localTrack: VideoTrack?,
    remoteTrack: VideoTrack?,
    eglContext: EglBase.Context?,
    frameViewModel: CallLiveFrameViewModel,
    reduceMotion: Boolean,
    constrained: Boolean,
) {
    val call = frameViewModel.controller.callContext()
    val texts by produceState(frameViewModel.texts.immediate(call), call) { value = frameViewModel.texts.texts(call) }
    val sources = remember(people, localTrack, remoteTrack, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff) {
        CallLiveFrameSources.of(people, localTrack, remoteTrack, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff)
    }
    Box(Modifier.fillMaxSize().background(Color.Black).clearAndSetSemantics { }) {
        CallLiveFrameSurface(
            design = design,
            people = people,
            texts = texts,
            sources = sources,
            eglContext = eglContext,
            playsMotion = CallLiveFrameRule.playsMotion(design, reduceMotion, constrained),
            modifier = Modifier.fillMaxSize(),
        )
    }
}

/**
 * La scène peinte du montage choisi, quelques fois par seconde (iOS `CallMontageStage`) : l'aperçu s'il
 * porte ce rendu, sinon la vignette du classique choisi en attendant, sinon rien — l'appel reste visible
 * dessous, jamais un spinner.
 */
@Composable
private fun CallMontagePaintedStage(capture: CallCaptureController, look: CallCaptureLook, modifier: Modifier) {
    val previews by capture.previews.collectAsStateWithLifecycle()
    val image = CallMontageStageImage.pick(previews, look) ?: return
    Box(modifier.background(Color.Black).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        Image(image.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    }
}

/** L'image que la scène peinte montre pour [look] : l'aperçu de ce rendu, sinon la vignette du classique choisi. */
internal object CallMontageStageImage {
    fun pick(previews: CallCapturePreviews, look: CallCaptureLook): Bitmap? {
        if (previews.look == look) previews.preview?.let { return it }
        return (look as? CallCaptureLook.Classic)?.let { previews.thumbnails[it.style] }
    }
}

/**
 * **LA COUCHE DE PRISE D'UN MODE** (Montage, Effets) — elle tient la capture ouverte sur les pistes de l'appel,
 * salue chaque prise d'un flash blanc et, pendant le film, montre seul le bouton stop au centre, sous son chrono.
 * Elle ne porte AUCUN geste : la photo (deux tapes) et le film (appui long) se déclenchent sur l'élément centré du
 * carrousel du mode (`CallModeShots`, iOS `CallModeGestureRule`, #13733, #13737), qui porte aussi l'astuce. La
 * quitter marque l'astuce comme vue (iOS `onDisappear`).
 */
@Composable
internal fun CallMontageCaptureLayer(
    controller: CallCaptureController,
    tracks: Map<String, VideoTrack?>,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val hints = rememberCaptureHint()

    DisposableEffect(controller) { onDispose { controller.stop(); hints.seen() } }
    LaunchedEffect(controller, tracks) { controller.start(tracks) }

    val previewLabel = stringResource(R.string.call_capture_preview)
    val workingLabel = stringResource(R.string.call_capture_working)

    Box(modifier) {
        Box(
            Modifier
                .fillMaxSize()
                .semantics {
                    contentDescription = previewLabel
                    if (state.isWorking) stateDescription = workingLabel
                },
        )

        CaptureFlash(flashCount = state.flashCount, reduceMotion = reduceMotion)

        state.recordingStartedAtMillis?.let { startedAt ->
            CallCaptureRecordingStop(
                startedAtMillis = startedAt,
                onStop = { scope.launch { controller.stopRecording() } },
                modifier = Modifier.align(Alignment.Center),
            )
        }
    }
}

/** La photo et le film du montage en cours, avec la permission de la galerie ; chacun marque l'astuce comme vue. */
internal class CallCaptureShooter(val shoot: () -> Unit, val film: () -> Unit)

@Composable
internal fun rememberCallCaptureShooter(controller: CallCaptureController, scene: CallCaptureScene, hints: CaptureHintMemory): CallCaptureShooter {
    val latestScene by rememberUpdatedState(scene)
    val permissions = rememberPermissionFlow()
    val scope = rememberCoroutineScope()
    val mayWrite: suspend () -> Boolean = { permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD, announcesRefusal = false) }
    return remember(controller, hints, scope) {
        CallCaptureShooter(
            shoot = {
                hints.seen()
                scope.launch { controller.capture(latestScene, mayWrite) }
            },
            film = {
                hints.seen()
                scope.launch { controller.startRecording({ latestScene }, mayWrite) }
            },
        )
    }
}

/** L'appui long d'iOS (0,45 s) au lieu de celui du système. */
internal class CaptureViewConfiguration(base: ViewConfiguration) : ViewConfiguration by base {
    override val longPressTimeoutMillis: Long = CallModeGestureRule.LONG_PRESS_MILLIS
}

internal class CaptureHintMemory(private val context: Context, initial: Boolean) {
    var hasSeen by mutableStateOf(initial)
        private set

    fun seen() {
        if (hasSeen) return
        hasSeen = true
        context.getSharedPreferences(HINT_PREFS, Context.MODE_PRIVATE).edit().putBoolean(HINT_SEEN_KEY, true).apply()
    }
}

@Composable
internal fun rememberCaptureHint(): CaptureHintMemory {
    val context = LocalContext.current.applicationContext
    return remember(context) {
        val seen = context.getSharedPreferences(HINT_PREFS, Context.MODE_PRIVATE).getBoolean(HINT_SEEN_KEY, false)
        CaptureHintMemory(context, seen)
    }
}

/** Le flash blanc d'une prise (iOS `CallCaptureFlash`) : plus doux et plus court sous « Réduire les animations ». */
@Composable
private fun CaptureFlash(flashCount: Int, reduceMotion: Boolean) {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(flashCount) {
        if (flashCount == 0) return@LaunchedEffect
        alpha.snapTo(if (reduceMotion) 0.35f else 0.85f)
        delay(30)
        alpha.animateTo(0f, tween(if (reduceMotion) 300 else 450))
    }
    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer { this.alpha = alpha.value }
            .background(Color.White)
            .clearAndSetSemantics { },
    )
}

/** Pendant le film : le chrono, puis le bouton stop (iOS `CallModeRecordingStop`). */
@Composable
internal fun CallCaptureRecordingStop(startedAtMillis: Long, onStop: () -> Unit, modifier: Modifier = Modifier) {
    val elapsed by produceState(0L, startedAtMillis) {
        while (true) {
            value = System.currentTimeMillis() - startedAtMillis
            delay(1_000L - value % 1_000L)
        }
    }
    val stopLabel = stringResource(R.string.call_mode_record_stop)
    val stopHint = stringResource(R.string.call_mode_record_stop_hint)
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Row(
            Modifier
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
                .clearAndSetSemantics { },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(CallPalette.Decline))
            Text(
                CallModeGestureRule.clock(elapsed),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = CallPalette.Ink,
            )
        }
        Box(
            Modifier
                .size(STOP_DIAMETER)
                .clip(CircleShape)
                .border(4.dp, Color.White, CircleShape)
                .padding(MeeshySpacing.xs)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.4f))
                .clickable(role = Role.Button, onClickLabel = stopHint, onClick = onStop)
                .semantics { contentDescription = stopLabel },
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(STOP_SQUARE).clip(RoundedCornerShape(MeeshyRadius.xs)).background(CallPalette.Decline))
        }
    }
}
