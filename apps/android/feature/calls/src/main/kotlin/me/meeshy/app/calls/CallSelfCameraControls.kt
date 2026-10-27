package me.meeshy.app.calls

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.camera.CallCameraZoom
import me.meeshy.sdk.model.call.CallSelfTileControlsLaw
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.collectAsState
import java.util.Locale

/** Ce que les commandes de ma caméra savent faire : zoomer, retourner, couper/rallumer. */
internal class CallSelfCameraActions(
    val zoom: CallCameraZoom,
    val onFlip: () -> Unit,
    val onToggleCamera: () -> Unit,
)

private const val CHIP_SCRIM_ALPHA = 0.4f
private const val INDICATOR_LINGER_MILLIS = 1_000L
private val CHIP_VISUAL = 36.dp

/** Combien de boutons porte la rangée : une pastille par cran d'objectif tant que la caméra émet, plus la bascule. */
@Composable
internal fun rememberSelfCameraControlCount(actions: CallSelfCameraActions?, isCameraOn: Boolean): Int {
    if (actions == null) return 0
    val stops by remember(actions.zoom) {
        actions.zoom.state.map { it.profile?.quickStops?.size ?: 0 }.distinctUntilChanged()
    }.collectAsState(initial = actions.zoom.state.value.profile?.quickStops?.size ?: 0)
    return 1 + if (isCameraOn && stops > 1) stops else 0
}

/**
 * La rangée posée contre le cadre de ma vignette : les pastilles d'objectifs « 0,5× · 1× · 2× · 3× »
 * (seulement ceux que l'appareil possède) puis, à côté, la bascule avant / arrière. UN APPUI LONG sur
 * la bascule coupe ou rallume la caméra — haptique, icône barrée tant qu'elle est coupée, annoncé par
 * TalkBack (état + action personnalisée).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun CallSelfTileControlsRow(actions: CallSelfCameraActions, isCameraOn: Boolean, modifier: Modifier = Modifier) {
    val state by actions.zoom.state.collectAsState()
    val stops = state.profile?.quickStops.orEmpty().takeIf { isCameraOn && it.size > 1 }.orEmpty()
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val haptics = LocalHapticFeedback.current
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(CallSelfTileControlsLaw.SPACING_DP.dp)) {
        stops.forEach { stop ->
            val active = kotlin.math.abs(state.displayFactor - stop) / stop <= CameraZoomPolicy.SNAP_TOLERANCE
            val label = CameraZoomPolicy.label(if (active) state.displayFactor else stop, locale)
            val spoken = stringResource(R.string.call_zoom_lens, CameraZoomPolicy.label(stop, locale))
            Box(
                modifier = Modifier
                    .size(CallSelfTileControlsLaw.BUTTON_DP.dp)
                    .clip(CircleShape)
                    .combinedClickable(role = Role.Button, onClickLabel = spoken) {
                        actions.zoom.select(stop)
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    }
                    .semantics {
                        contentDescription = spoken
                        selected = active
                    },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(CHIP_VISUAL).clip(CircleShape).background(Color.Black.copy(alpha = CHIP_SCRIM_ALPHA)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = if (active) MeeshyTheme.tokens.warning else CallPalette.Ink,
                        modifier = Modifier.clearAndSetSemantics { },
                    )
                }
            }
        }
        FlipOrToggleButton(actions, isCameraOn)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FlipOrToggleButton(actions: CallSelfCameraActions, isCameraOn: Boolean) {
    val haptics = LocalHapticFeedback.current
    val flipLabel = stringResource(R.string.call_control_flip_camera)
    val flipHint = stringResource(R.string.call_camera_hold_hint)
    val stateText = stringResource(if (isCameraOn) R.string.call_camera_state_on else R.string.call_camera_state_off)
    val toggleLabel = stringResource(if (isCameraOn) R.string.call_camera_toggle_off else R.string.call_camera_toggle_on)
    Box(
        modifier = Modifier
            .size(CallSelfTileControlsLaw.BUTTON_DP.dp)
            .clip(CircleShape)
            .combinedClickable(
                role = Role.Button,
                onClickLabel = flipLabel,
                onLongClickLabel = toggleLabel,
                onClick = actions.onFlip,
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    actions.onToggleCamera()
                },
            )
            .semantics {
                contentDescription = "$flipLabel. $flipHint"
                stateDescription = stateText
                liveRegion = LiveRegionMode.Polite
                customActions = listOf(CustomAccessibilityAction(toggleLabel) { actions.onToggleCamera(); true })
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(CHIP_VISUAL)
                .clip(CircleShape)
                .background(if (isCameraOn) Color.Black.copy(alpha = CHIP_SCRIM_ALPHA) else MeeshyPalette.Error.copy(alpha = 0.85f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (isCameraOn) MeeshyIcons.FlipCamera else MeeshyIcons.VideoOff,
                contentDescription = null,
                tint = CallPalette.Ink,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/** Le corps de ma vignette quand ma caméra est coupée : on le voit, et la bascule reste là pour la rallumer. */
@Composable
internal fun CallSelfCameraOffBody(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().background(CallPalette.Veil.copy(alpha = 0.85f)), contentAlignment = Alignment.Center) {
        Icon(MeeshyIcons.VideoOff, contentDescription = null, tint = CallPalette.InkMuted, modifier = Modifier.size(24.dp).padding(MeeshySpacing.xxs))
    }
}

/**
 * Pincer MA propre image (quand elle occupe tout l'écran) zoome la caméra envoyée ; un double toucher,
 * zoomé, revient à 1×. Le geste ne consomme que le pincement : un toucher simple, lui, traverse.
 */
internal fun Modifier.callCameraPinch(enabled: Boolean, zoom: CallCameraZoom): Modifier =
    if (!enabled) this else pointerInput(zoom) {
        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            var scale = 1f
            var pinched = false
            do {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val pressed = event.changes.count { it.pressed }
                if (pressed >= 2) {
                    val change = event.calculateZoom()
                    if (change != 1f) {
                        scale *= change
                        pinched = true
                        zoom.updatePinch(scale)
                        event.changes.forEach { if (it.positionChanged()) it.consume() }
                    }
                }
            } while (event.changes.any { it.pressed && !it.changedToUp() })
            if (pinched) zoom.endPinch()
        }
    }

/** Le facteur courant (« 2,4× »), au bas de l'image, le temps du geste puis une seconde. */
@Composable
internal fun CallZoomIndicator(zoom: CallCameraZoom, modifier: Modifier = Modifier) {
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val current by zoom.state.collectAsState()
    var shown by remember { mutableStateOf(false) }
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(current.displayFactor, current.isPinching) {
        if (first) {
            first = false
            return@LaunchedEffect
        }
        shown = current.profile != null
        if (!current.isPinching) {
            delay(INDICATOR_LINGER_MILLIS)
            shown = false
        }
    }
    if (shown) {
        Text(
            text = CameraZoomPolicy.label(current.displayFactor, locale),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            modifier = modifier
                .background(Color.Black.copy(alpha = CHIP_SCRIM_ALPHA), CircleShape)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
                .clearAndSetSemantics { },
        )
    }
}
