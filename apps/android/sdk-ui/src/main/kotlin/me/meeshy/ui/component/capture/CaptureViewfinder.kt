package me.meeshy.ui.component.capture

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.composer.capture.CameraResult
import me.meeshy.sdk.model.composer.capture.CaptureAction
import me.meeshy.sdk.model.composer.capture.CaptureEffect
import me.meeshy.sdk.model.composer.capture.CaptureEvent
import me.meeshy.sdk.model.composer.capture.CaptureFlash
import me.meeshy.sdk.model.composer.capture.CaptureFlashMode
import me.meeshy.sdk.model.composer.capture.CaptureHaptic
import me.meeshy.sdk.model.composer.capture.CaptureHold
import me.meeshy.sdk.model.composer.capture.CaptureLensFacing
import me.meeshy.sdk.model.composer.capture.CaptureLockSeal
import me.meeshy.sdk.model.composer.capture.CapturePoint
import me.meeshy.sdk.model.composer.capture.CaptureSessionReducer
import me.meeshy.sdk.model.composer.capture.CaptureSessionState
import me.meeshy.sdk.model.composer.capture.CaptureStage
import me.meeshy.sdk.model.composer.capture.CaptureZoom
import me.meeshy.sdk.model.composer.capture.ShutterGesture
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.permission.PermissionDeniedCard
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.openAppSettings
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le viseur du composeur, de bout en bout : permission, caméra CameraX, machine pure, haptique.
 *
 * Plein écran : la croix (x) en haut à gauche et le glissé vers le bas ferment ; la caméra est RENDUE quand l'écran
 * s'en va. [onDeliver] reçoit la photo (octets d'origine, EXIF compris) ou la vidéo (segments déjà concaténés, sans
 * ré-encodage). Un accès caméra refusé monte le panneau qui explique et ouvre les Réglages, la croix restant.
 */
@Composable
public fun CaptureViewfinder(
    onDisarm: () -> Unit,
    onDeliver: (CameraResult) -> Unit,
    modifier: Modifier = Modifier,
    allowsPhoto: Boolean = true,
    allowsVideo: Boolean = true,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val permissions = rememberPermissionFlow()
    val reduceMotion = LocalReduceMotion.current
    var state by remember { mutableStateOf(CaptureSessionState(armedAtMs = SystemClock.elapsedRealtime(), allowsPhoto = allowsPhoto, allowsVideo = allowsVideo)) }
    var granted by remember { mutableStateOf<Boolean?>(null) }
    var lensMin by remember { mutableStateOf(1f) }
    var lensMax by remember { mutableStateOf(1f) }
    var unavailable by remember { mutableStateOf(false) }
    var viewSize by remember { mutableStateOf(IntSize.Zero) }
    val live = remember { mutableDoubleStateOf(0.0) }
    var zoomStart by remember { mutableStateOf(1f) }
    var holdStartedAt by remember { mutableStateOf(0L) }
    var lockSealing by remember { mutableStateOf(false) }
    var lockProgress by remember { mutableStateOf(0f) }

    val dispatchHolder = remember { arrayOfNulls<(CaptureEvent) -> Unit>(1) }
    val dispatch: (CaptureEvent) -> Unit = { event -> dispatchHolder[0]?.invoke(event) }
    val engine = remember {
        CameraXCaptureEngine(context, lifecycleOwner) { signal ->
            when (signal) {
                is CaptureEngineSignal.Bound -> {
                    lensMin = signal.lens.minZoom
                    lensMax = signal.lens.maxZoom
                    dispatch(CaptureEvent.FlipFinishedIfSwitching)
                }
                is CaptureEngineSignal.BindFailed -> unavailable = true
                is CaptureEngineSignal.PhotoSaved -> {
                    dispatch(CaptureEvent.PhotoDelivered(signal.token))
                    onDeliver(CameraResult.Photo(signal.token, Uri.fromFile(signal.file).toString(), null))
                }
                is CaptureEngineSignal.PhotoFailed -> dispatch(CaptureEvent.PhotoFailed(signal.token))
                is CaptureEngineSignal.RecordingStarted -> dispatch(CaptureEvent.RecordingStarted(signal.token))
                is CaptureEngineSignal.SegmentFinalized -> dispatch(CaptureEvent.SegmentWritten(signal.token, signal.file.absolutePath, signal.durationSec))
                is CaptureEngineSignal.SegmentFailed -> dispatch(CaptureEvent.SegmentLost(signal.token))
                is CaptureEngineSignal.SegmentCancelled -> dispatch(CaptureEvent.RecordingCancelled(signal.token))
            }
        }
    }

    fun run(effect: CaptureEffect, current: CaptureSessionState) {
        when (effect) {
            is CaptureEffect.StartRecording -> {
                engine.setTorch(CaptureFlash.torch(current.flash, current.facing))
                engine.startRecording(effect.token, context.captureFile("video", ".mp4"))
            }
            CaptureEffect.StopRecording -> { engine.stopRecording(); engine.setTorch(me.meeshy.sdk.model.composer.capture.CaptureTorchMode.OFF) }
            CaptureEffect.CancelPendingRecording -> engine.cancelRecording()
            is CaptureEffect.TakePhoto -> engine.takePhoto(effect.token, context.captureFile("photo", ".jpg"))
            is CaptureEffect.DeleteFile -> CaptureFileSweeper.delete(listOf(effect.path))
            is CaptureEffect.Deliver -> scope.launch { deliverVideo(context, effect, onDeliver) }
            is CaptureEffect.SwitchLens -> engine.bind(effect.to)
            is CaptureEffect.FocusAt -> engine.focusAt(effect.point.x * viewSize.width, effect.point.y * viewSize.height)
            is CaptureEffect.ApplyZoom -> engine.setZoom(effect.displayed)
            is CaptureEffect.Haptic -> when (effect.kind) {
                CaptureHaptic.LIGHT -> haptics.light()
                CaptureHaptic.MEDIUM -> haptics.medium()
                CaptureHaptic.SUCCESS -> haptics.success()
                CaptureHaptic.WARNING -> haptics.warning()
            }
            CaptureEffect.Disarm -> onDisarm()
        }
    }

    dispatchHolder[0] = { event ->
        val before = state
        val step = CaptureSessionReducer.reduce(before, event)
        state = step.state
        if (!before.locked && step.state.locked) {
            lockSealing = true
            scope.launch { delay(CaptureLockSeal.holdDurationMs(reduceMotion)); lockSealing = false }
        }
        step.effects.forEach { run(it, step.state) }
    }

    DisposableEffect(engine) {
        onDispose {
            engine.release()
            CaptureFileSweeper.delete(state.segments.map { it.path })
        }
    }

    LaunchedEffect(Unit) {
        val camera = permissions.ensure(PermissionNature.CAMERA)
        granted = camera
        if (camera) {
            permissions.ensure(PermissionNature.MICROPHONE, announcesRefusal = false)
            engine.bind(CaptureLensFacing.BACK)
        }
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && granted == false) {
                scope.launch {
                    if (permissions.stateOf(PermissionNature.CAMERA) == MediaPermissionState.GRANTED) {
                        granted = true
                        engine.bind(state.facing)
                    }
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(state.flash, state.facing) {
        engine.setPhotoFlash(if (state.facing == CaptureLensFacing.BACK) state.flash else CaptureFlashMode.OFF)
    }
    LaunchedEffect(state.stage == CaptureStage.RECORDING) {
        if (state.stage != CaptureStage.RECORDING) return@LaunchedEffect
        val started = SystemClock.elapsedRealtime()
        while (true) {
            live.doubleValue = (SystemClock.elapsedRealtime() - started) / 1000.0
            delay(250)
        }
    }
    FloorBrightness(CaptureFlash.lightsFloor(state.flash, state.facing, state.stage))
    BackHandler { dispatch(CaptureEvent.CloseTapped(SystemClock.elapsedRealtime())) }

    val range = lensMin..maxOf(lensMin, minOf(lensMax, CaptureZoom.CEILING))
    val sceneGestures = CaptureGestureCallbacks(
        onGestureStart = { zoomStart = state.zoom; holdStartedAt = SystemClock.elapsedRealtime() },
        onTap = { at ->
            val point = if (viewSize.width > 0) CapturePoint(at.x / viewSize.width, at.y / viewSize.height) else null
            dispatch(CaptureEvent.SceneTapped(point, SystemClock.elapsedRealtime()))
        },
        onHoldBegan = { if (allowsVideo) dispatch(CaptureEvent.HoldBegan) },
        onHoldMoved = { dx, dy -> holdMoved(state, dx, dy, zoomStart, range, dispatch, { lockProgress = it }) },
        onHoldEnded = { dispatch(CaptureEvent.HoldReleased); lockProgress = 0f },
        onDrag = { dy -> if (state.stage == CaptureStage.RECORDING) dispatch(CaptureEvent.ZoomChanged(CaptureZoom.factor(zoomStart, dy, range))) },
        onDragEnded = { dy -> if (state.stage == CaptureStage.ARMED && dy > DISMISS_DP) dispatch(CaptureEvent.CloseTapped(SystemClock.elapsedRealtime())) },
        onPinch = { scale -> if (!state.holding) dispatch(CaptureEvent.ZoomChanged(CaptureZoom.pinched(zoomStart, scale, range))) },
    )
    val shutterGestures = CaptureGestureCallbacks(
        onGestureStart = { zoomStart = state.zoom },
        onTap = { dispatch(CaptureEvent.ShutterTapped(SystemClock.elapsedRealtime())) },
        onHoldBegan = { if (allowsVideo) dispatch(CaptureEvent.HoldBegan) },
        onHoldMoved = { dx, dy -> holdMoved(state, dx, dy, zoomStart, range, dispatch, { lockProgress = it }) },
        onHoldEnded = { dispatch(CaptureEvent.HoldReleased); lockProgress = 0f },
    )
    val actions = CaptureViewfinderActions(
        onClose = { dispatch(CaptureEvent.CloseTapped(SystemClock.elapsedRealtime())) },
        onFlash = { dispatch(CaptureEvent.FlashTapped) },
        onFlip = { dispatch(CaptureEvent.FlipTapped) },
        onDropSegment = { dispatch(CaptureEvent.DropLastSegment) },
        onValidate = { dispatch(CaptureEvent.Validate) },
        onFlashIntensity = { dispatch(CaptureEvent.FlashIntensityChanged(it)) },
        onFlashSliderHold = { dispatch(CaptureEvent.FlashSliderTouched(it)) },
        onZoomSelect = { dispatch(CaptureEvent.ZoomChanged(it.coerceIn(range))) },
        onZoomStep = { up -> dispatch(CaptureEvent.ZoomChanged(CaptureZoom.stepped(state.zoom, up, range))) },
        onDiscardAnswer = { dispatch(CaptureEvent.DiscardAnswered(it, SystemClock.elapsedRealtime())) },
        sceneGestures = sceneGestures,
        shutterGestures = shutterGestures,
        onViewSize = { viewSize = it },
        onFilmHandsFree = {
            if (allowsVideo) {
                dispatch(CaptureEvent.HoldBegan)
                dispatch(CaptureEvent.HoldDragged(ShutterGesture.SLIDE_TO_LOCK_DP))
                dispatch(CaptureEvent.HoldReleased)
            }
        },
    )
    LaunchedEffect(state.flashSlider.generation, state.flashSlider.visible) {
        if (!state.flashSlider.visible) return@LaunchedEffect
        val generation = state.flashSlider.generation
        delay(me.meeshy.sdk.model.composer.capture.CaptureFlashSliderTimer.LIFETIME_MS)
        dispatch(CaptureEvent.FlashSliderExpired(generation, voiceOver = false))
    }

    Box(modifier.fillMaxSize().background(Color.Black)) {
        PermissionFlowHost(permissions)
        when (granted) {
            false -> RefusedChrome(onDisarm, context)
            else -> CaptureViewfinderContent(
                state = state,
                display = CaptureViewfinderDisplay(
                    elapsedSec = { CaptureSegmentsClock.elapsed(state, live.doubleValue) },
                    zoomPresets = me.meeshy.sdk.model.composer.capture.CaptureZoomScale(1f).let { me.meeshy.sdk.model.composer.capture.CaptureZoomScale.presets(range) },
                    lockSealing = lockSealing,
                    lockProgress = lockProgress,
                    unavailable = unavailable,
                    reduceMotion = reduceMotion,
                ),
                actions = actions,
                preview = { m -> engine.PreviewSurface(m) },
            )
        }
    }
}

private const val DISMISS_DP = 120f

/**
 * Les fichiers d'une prise abandonnée se suppriment HORS de la portée du viseur : « Abandonner » ferme l'écran dans
 * le même geste, et une suppression lancée dans une portée qui meurt avec lui pourrait ne jamais partir.
 */
private object CaptureFileSweeper {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun delete(paths: List<String>) {
        if (paths.isEmpty()) return
        scope.launch { paths.forEach { runCatching { File(it).delete() } } }
    }
}

private fun holdMoved(
    state: CaptureSessionState,
    dx: Float,
    dy: Float,
    zoomStart: Float,
    range: ClosedFloatingPointRange<Float>,
    dispatch: (CaptureEvent) -> Unit,
    progress: (Float) -> Unit,
) {
    dispatch(CaptureEvent.HoldDragged(dx))
    progress(ShutterGesture.lockProgress(dx))
    if (CaptureHold.verticalDrag(state.stage) == CaptureHold.VerticalDrag.ZOOM) {
        dispatch(CaptureEvent.ZoomChanged(CaptureZoom.factor(zoomStart, dy, range)))
    }
}

/** L'accès refusé : la carte qui explique et ouvre les Réglages, et la croix qui reste en haut à gauche. */
@Composable
private fun RefusedChrome(onDisarm: () -> Unit, context: Context) {
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.align(Alignment.Center).padding(24.dp)) {
            PermissionDeniedCard(PermissionNature.CAMERA, onOpenSettings = { context.openAppSettings() }, onDismiss = onDisarm)
        }
        Box(Modifier.align(Alignment.TopStart).statusBarsPadding().padding(horizontal = 14.dp, vertical = 12.dp)) {
            CaptureRoundButton(MeeshyIcons.Close, stringResource(R.string.capture_disarm), onDisarm)
        }
    }
}

/** À l'avant, l'ÉCRAN est le flash : la luminosité monte pendant que le sol blanc est allumé, puis est rendue. */
@Composable
private fun FloorBrightness(lit: Boolean) {
    val context = LocalContext.current
    DisposableEffect(lit) {
        val window = context.findActivity()?.window
        if (lit && window != null) {
            val attrs = window.attributes
            attrs.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
            window.attributes = attrs
        }
        onDispose {
            if (lit && window != null) {
                val attrs = window.attributes
                attrs.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                window.attributes = attrs
            }
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun Context.captureFile(kind: String, extension: String): File {
    val dir = File(cacheDir, "captures").apply { mkdirs() }
    return File(dir, "composer_${kind}_${System.currentTimeMillis()}$extension")
}

private suspend fun deliverVideo(context: Context, effect: CaptureEffect.Deliver, onDeliver: (CameraResult) -> Unit) {
    val first = effect.segments.first()
    val result = withContext(Dispatchers.IO) {
        if (!effect.merge) return@withContext File(first.path)
        val merged = context.captureFile("merged", ".mp4")
        if (CaptureSegmentMerger.concat(effect.segments.map { File(it.path) }, merged)) {
            effect.segments.forEach { File(it.path).delete() }
            merged
        } else {
            merged.delete()
            effect.segments.drop(1).forEach { File(it.path).delete() }
            File(first.path)
        }
    }
    onDeliver(CameraResult.Video(first.id, Uri.fromFile(result).toString()))
}

internal object CaptureSegmentsClock {
    fun elapsed(state: CaptureSessionState, live: Double): Double =
        me.meeshy.sdk.model.composer.capture.CaptureSegments.elapsed(state.segments, live, state.stage == CaptureStage.RECORDING)
}
