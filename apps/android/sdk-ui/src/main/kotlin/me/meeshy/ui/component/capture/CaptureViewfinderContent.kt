package me.meeshy.ui.component.capture

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.composer.capture.CameraSwitchVeil
import me.meeshy.sdk.model.composer.capture.CaptureFlash
import me.meeshy.sdk.model.composer.capture.CaptureHold
import me.meeshy.sdk.model.composer.capture.CaptureLockSeal
import me.meeshy.sdk.model.composer.capture.CaptureSessionState
import me.meeshy.sdk.model.composer.capture.CaptureStage
import me.meeshy.sdk.model.composer.capture.CaptureTopRow
import me.meeshy.sdk.model.composer.capture.ShutterGesture
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyPalette

/** Tout ce que le viseur peut demander à son hôte : un seul point d'entrée par bouton ou geste. */
public class CaptureViewfinderActions(
    val onClose: () -> Unit = {},
    val onFlash: () -> Unit = {},
    val onFlip: () -> Unit = {},
    val onDropSegment: () -> Unit = {},
    val onValidate: () -> Unit = {},
    val onFlashIntensity: (Double) -> Unit = {},
    val onFlashSliderHold: (Boolean) -> Unit = {},
    val onZoomSelect: (Float) -> Unit = {},
    val onZoomStep: (Boolean) -> Unit = {},
    val onDiscardAnswer: (Boolean) -> Unit = {},
    val sceneGestures: CaptureGestureCallbacks = CaptureGestureCallbacks(),
    val shutterGestures: CaptureGestureCallbacks = CaptureGestureCallbacks(),
    val onViewSize: (IntSize) -> Unit = {},
    /** L'équivalent TalkBack de « tenir et glisser vers le verrou » : la prise démarre déjà verrouillée. */
    val onFilmHandsFree: () -> Unit = {},
)

/** Ce que la scène montre en plus de la machine : le temps, le zoom lu sur l'objectif, le verrou en cours de glissé. */
public data class CaptureViewfinderDisplay(
    val elapsedSec: () -> Double = { 0.0 },
    val zoomPresets: List<Float> = emptyList(),
    val lockSealing: Boolean = false,
    val lockProgress: Float = 0f,
    val unavailable: Boolean = false,
    val reduceMotion: Boolean = false,
)

/**
 * Le viseur peint à partir de l'état : aperçu voilé pendant la bascule, rangée haute, curseur de flash sous son bouton,
 * clé du verrou, zoom, déclencheur, phrase du geste. Sans caméra ni permission : c'est ce qui s'éprouve en JVM.
 */
@Composable
public fun CaptureViewfinderContent(
    state: CaptureSessionState,
    display: CaptureViewfinderDisplay,
    actions: CaptureViewfinderActions,
    preview: @Composable (Modifier) -> Unit,
    modifier: Modifier = Modifier,
) {
    val currentActions by rememberUpdatedState(actions)
    val currentState by rememberUpdatedState(state)
    val switching = state.switching
    val reduce = display.reduceMotion
    val veilAlpha by animateFloatAsState(CameraSwitchVeil.opacity(switching), tween(CameraSwitchVeil.durationMs(switching).toInt()), label = "veil-alpha")
    val veilScale by animateFloatAsState(CameraSwitchVeil.scale(switching, reduce), tween(CameraSwitchVeil.durationMs(switching).toInt()), label = "veil-scale")
    val veilBlur by animateFloatAsState(CameraSwitchVeil.blurRadiusDp(switching), tween(CameraSwitchVeil.durationMs(switching).toInt()), label = "veil-blur")
    val floorLit = CaptureFlash.lightsFloor(state.flash, state.facing, state.stage)

    Box(modifier.fillMaxSize().background(Color.Black)) {
        preview(
            Modifier
                .fillMaxSize()
                .onSizeChanged(actions.onViewSize)
                .alpha(veilAlpha)
                .scale(veilScale)
                .blur(veilBlur.dp)
                .pointerInput(Unit) {
                    detectCaptureGestures({ currentActions.sceneGestures }, dragDismisses = { currentState.stage == CaptureStage.ARMED })
                },
        )
        if (display.unavailable) UnavailableNotice()
        TopRow(state, display, actions)
        BottomStack(state, display, actions, floorLit)
        if (state.discard.isPresented) DiscardDialog(actions.onDiscardAnswer)
    }
}

@Composable
private fun BoxScope.TopRow(state: CaptureSessionState, display: CaptureViewfinderDisplay, actions: CaptureViewfinderActions) {
    val input = state.topRow
    val leading = CaptureTopRow.leading(input)
    val trailing = CaptureTopRow.trailing(input)
    Row(
        Modifier.align(Alignment.TopCenter).fillMaxWidth().statusBarsPadding().padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(CaptureTopRow.SPACING_DP.dp), verticalAlignment = Alignment.CenterVertically) {
            leading.forEach { item ->
                if (item == CaptureTopRow.Item.CHRONO) {
                    CaptureChronoChip(display.elapsedSec, CaptureTopRow.segmentCount(state.segments.size, state.stage == CaptureStage.RECORDING), state.stage == CaptureStage.RECORDING)
                } else {
                    CaptureTopItem(item, state.flash, actions)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(CaptureTopRow.SPACING_DP.dp), verticalAlignment = Alignment.CenterVertically) {
            trailing.forEach { CaptureTopItem(it, state.flash, actions) }
        }
    }
    val inset = CaptureTopRow.flashSliderTrailingInsetDp(trailing, MeeshyControlSize.minTouchTarget.value)
    AnimatedVisibility(
        visible = state.flashSlider.visible && CaptureFlash.showsSlider(state.flash) && trailing.contains(CaptureTopRow.Item.FLASH),
        modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 12.dp + MeeshyControlSize.minTouchTarget + 6.dp, end = 14.dp + inset.dp),
        enter = fadeIn(tween(150)) + scaleIn(tween(150), initialScale = 0.85f),
        exit = fadeOut(tween(150)) + scaleOut(tween(150), targetScale = 0.85f),
    ) {
        CaptureFlashIntensitySlider(state.flashIntensity, actions.onFlashIntensity, actions.onFlashSliderHold)
    }
}

@Composable
private fun BoxScope.BottomStack(state: CaptureSessionState, display: CaptureViewfinderDisplay, actions: CaptureViewfinderActions, floorLit: Boolean) {
    val recording = state.stage == CaptureStage.RECORDING
    val showsLock = CaptureHold.showsLock(state.stage, state.holding, state.locked)
    val floor by animateFloatAsState(if (floorLit) state.flashIntensity.toFloat() else 0f, tween(CaptureFlash.BRIGHTNESS_RAMP_MS.toInt()), label = "floor-white")
    Column(
        Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .background(Color.White.copy(alpha = floor))
            .navigationBarsPadding()
            .padding(bottom = 20.dp, top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!recording) {
            CaptureZoomBar(state.zoom, display.zoomPresets, state.switching, display.reduceMotion, actions.onZoomSelect, actions.onZoomStep)
        }
        androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Shutter(state, actions)
                androidx.compose.animation.AnimatedVisibility(
                    visible = showsLock || display.lockSealing,
                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 14.dp),
                    enter = fadeIn(tween(200)) + scaleIn(tween(200), initialScale = 0.8f),
                    exit = fadeOut(tween(200)) + scaleOut(tween(200), targetScale = 0.8f),
                ) {
                    CaptureLockTrack(if (display.lockSealing) 1f else display.lockProgress, display.lockSealing, display.reduceMotion)
                }
            }
        }
        Hint(state)
    }
}

@Composable
private fun Shutter(state: CaptureSessionState, actions: CaptureViewfinderActions) {
    val currentActions by rememberUpdatedState(actions)
    val recording = state.stage == CaptureStage.RECORDING
    val shutterLabel = stringResource(R.string.capture_shutter)
    val filmLabel = stringResource(R.string.capture_shutter_film)
    val inner by animateFloatAsState(if (recording) 0.45f else 1f, tween(160), label = "shutter-inner")
    val ring by animateFloatAsState(if (state.holding) 1.12f else 1f, tween(120), label = "shutter-ring")
    Box(
        Modifier
            .size(84.dp)
            .scale(ring)
            .border(4.dp, Color.White, CircleShape)
            .padding(7.dp)
            .pointerInput(Unit) { detectCaptureGestures({ currentActions.shutterGestures }, dragDismisses = { false }) }
            .semantics {
                contentDescription = shutterLabel
                onClick(label = shutterLabel) { currentActions.shutterGestures.onTap(androidx.compose.ui.geometry.Offset.Zero); true }
                onLongClick(label = filmLabel) { currentActions.onFilmHandsFree(); true }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .fillMaxSize(inner)
                .clip(if (recording) RoundedCornerShape(10.dp) else CircleShape)
                .background(if (recording) MeeshyPalette.Error else Color.White),
        )
    }
}

@Composable
private fun Hint(state: CaptureSessionState) {
    val text = when {
        state.locked -> R.string.capture_hint_locked
        state.stage == CaptureStage.RECORDING || state.holding -> R.string.capture_hint_holding
        state.segments.isNotEmpty() -> null
        else -> R.string.capture_hint_photo
    } ?: return
    val shown = if (state.holding && !state.locked) R.string.capture_hint_lock else text
    Text(
        stringResource(shown),
        color = Color.White.copy(alpha = 0.85f),
        fontSize = 12.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(horizontal = 14.dp),
        maxLines = 2,
    )
}

@Composable
private fun BoxScope.UnavailableNotice() {
    Text(
        stringResource(R.string.capture_camera_unavailable),
        color = Color.White,
        fontSize = 15.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.align(Alignment.Center).padding(32.dp),
    )
}

@Composable
private fun DiscardDialog(answer: (Boolean) -> Unit) {
    AlertDialog(
        onDismissRequest = { answer(false) },
        title = { Text(stringResource(R.string.capture_discard_video)) },
        confirmButton = { TextButton(onClick = { answer(true) }) { Text(stringResource(R.string.capture_discard_confirm), color = MeeshyPalette.Error) } },
        dismissButton = { TextButton(onClick = { answer(false) }) { Text(stringResource(R.string.capture_discard_keep)) } },
    )
}
