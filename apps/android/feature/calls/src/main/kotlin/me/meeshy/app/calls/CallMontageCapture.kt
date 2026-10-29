package me.meeshy.app.calls

import android.content.Context
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.platform.ViewConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
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
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallModeGesture
import me.meeshy.sdk.model.call.montage.CallModeGestureOutcome
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.VideoTrack

private const val HINT_PREFS = "meeshy_call_capture"
private const val HINT_SEEN_KEY = "gesture_hint_seen"
private val STOP_DIAMETER = 76.dp
private val STOP_SQUARE = 24.dp

/**
 * Le mode « Capturer l'appel » (iOS `CallScreenMode.montage`) : la scène qui SE déclenche, sous le choix du
 * cadre en direct. Ce que la capture peint suit ce que l'écran montre : le cadre appliqué, les deux
 * personnes dans l'ordre du cadre, chacune branchée sur sa piste.
 */
@Composable
internal fun CallMontageMode(
    state: CallUiState,
    localTrack: VideoTrack?,
    remoteTrack: VideoTrack?,
    reduceMotion: Boolean,
    onClose: () -> Unit,
    pickerModifier: Modifier,
) {
    val frameViewModel: CallLiveFrameViewModel = hiltViewModel()
    val captureViewModel: CallCaptureViewModel = hiltViewModel()
    val frame by frameViewModel.controller.state.collectAsStateWithLifecycle()
    val people = remember(state.peerName, frame.remoteSharedName) { frameViewModel.controller.people(state.peerName, frame.remoteSharedName) }
    val scene = remember(people, frame.frameId, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff) {
        CallCaptureScene(
            look = CallCaptureSceneRule.look(frame.frameId, people.size),
            subjects = CallCaptureSceneRule.duo(people, state.isCameraOn, state.isFrontCamera, state.isPeerCameraOff),
        )
    }
    val tracks = remember(people, localTrack, remoteTrack) { people.associate { it.id to if (it.isSelf) localTrack else remoteTrack } }
    CallMontageCaptureLayer(captureViewModel.controller, scene, tracks, reduceMotion, Modifier.fillMaxSize())
    CallLiveFramePicker(
        controller = frameViewModel.controller,
        peerName = state.peerName,
        onClose = onClose,
        modifier = pickerModifier,
    )
}

/**
 * **LA PRISE DU MODE MONTAGE** — la scène de l'appel SE déclenche, comme le choix affiché du carrousel
 * iOS (`CallModeGestureRule`) : deux tapes photographient le montage en cours, un appui long filme ; pendant
 * le film, seul le bouton stop au centre l'arrête, sous son chrono. Un flash blanc salue chaque prise ;
 * l'astuce des gestes se montre jusqu'au premier usage. TalkBack trouve les deux prises dans les actions
 * de la scène. La couche se pose SOUS le choix du cadre : celui-ci garde ses touchers.
 */
@Composable
internal fun CallMontageCaptureLayer(
    controller: CallCaptureController,
    scene: CallCaptureScene,
    tracks: Map<String, VideoTrack?>,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val state by controller.state.collectAsStateWithLifecycle()
    val latestScene by rememberUpdatedState(scene)
    val permissions = rememberPermissionFlow()
    val scope = rememberCoroutineScope()
    val hints = rememberCaptureHint()
    val mayWrite: suspend () -> Boolean = { permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD, announcesRefusal = false) }

    DisposableEffect(controller) { onDispose { controller.stop(); hints.seen() } }
    LaunchedEffect(controller, tracks) { controller.start(tracks) }

    fun shoot() {
        hints.seen()
        scope.launch { controller.capture(latestScene, mayWrite) }
    }

    fun film() {
        hints.seen()
        scope.launch { controller.startRecording({ latestScene }, mayWrite) }
    }

    val listens = CallModeGestureRule.listensForShots(isSelected = true, isRecording = state.isRecording)
    val photoLabel = stringResource(R.string.call_mode_photo)
    val recordLabel = stringResource(R.string.call_mode_record)
    val previewLabel = stringResource(R.string.call_capture_preview)
    val workingLabel = stringResource(R.string.call_capture_working)
    val baseConfiguration = LocalViewConfiguration.current
    val configuration = remember(baseConfiguration) { CaptureViewConfiguration(baseConfiguration) }

    Box(modifier) {
        CompositionLocalProvider(LocalViewConfiguration provides configuration) {
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(listens) {
                        if (!listens) return@pointerInput
                        detectTapGestures(
                            onDoubleTap = { if (outcome(CallModeGesture.DOUBLE_TAP, state.isRecording) == CallModeGestureOutcome.CAPTURE_PHOTO) shoot() },
                            onLongPress = { if (outcome(CallModeGesture.LONG_PRESS, state.isRecording) == CallModeGestureOutcome.START_RECORDING) film() },
                        )
                    }
                    .semantics {
                        contentDescription = previewLabel
                        if (state.isWorking) stateDescription = workingLabel
                        if (listens) {
                            customActions = listOf(
                                CustomAccessibilityAction(photoLabel) { shoot(); true },
                                CustomAccessibilityAction(recordLabel) { film(); true },
                            )
                        }
                    },
            )
        }

        if (CallModeGestureRule.showsHint(hasSeenHint = hints.hasSeen, isRecording = state.isRecording)) {
            CaptureHint(Modifier.align(Alignment.Center))
        }

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

private fun outcome(gesture: CallModeGesture, isRecording: Boolean): CallModeGestureOutcome =
    CallModeGestureRule.outcome(gesture, isSelected = true, isRecording = isRecording)

/** L'appui long d'iOS (0,45 s) au lieu de celui du système. */
private class CaptureViewConfiguration(base: ViewConfiguration) : ViewConfiguration by base {
    override val longPressTimeoutMillis: Long = CallModeGestureRule.LONG_PRESS_MILLIS
}

private class CaptureHintMemory(private val context: Context, initial: Boolean) {
    var hasSeen by mutableStateOf(initial)
        private set

    fun seen() {
        if (hasSeen) return
        hasSeen = true
        context.getSharedPreferences(HINT_PREFS, Context.MODE_PRIVATE).edit().putBoolean(HINT_SEEN_KEY, true).apply()
    }
}

@Composable
private fun rememberCaptureHint(): CaptureHintMemory {
    val context = LocalContext.current.applicationContext
    return remember(context) {
        val seen = context.getSharedPreferences(HINT_PREFS, Context.MODE_PRIVATE).getBoolean(HINT_SEEN_KEY, false)
        CaptureHintMemory(context, seen)
    }
}

@Composable
private fun CaptureHint(modifier: Modifier) {
    Text(
        text = stringResource(R.string.call_mode_gesture_hint),
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = CallPalette.Ink,
        modifier = modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    )
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
