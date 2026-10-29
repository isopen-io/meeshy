package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.vector.ImageVector
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
import androidx.compose.ui.semantics.isTraversalGroup
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
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallCameraControlsPlacement
import me.meeshy.sdk.model.call.CallCameraRail
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallSelfTileControlsLaw
import me.meeshy.sdk.model.call.CallZoomControl
import me.meeshy.sdk.model.call.camera.CameraPickerLaw
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.collectAsState
import java.util.Locale
import kotlin.math.abs

/** Ce que les commandes de ma caméra savent faire : zoomer, retourner, couper/rallumer. */
internal class CallSelfCameraActions(
    val zoom: CallCameraZoom,
    val onFlip: () -> Unit,
    val onToggleCamera: () -> Unit,
)

/**
 * « Effets · Écran », la rangée au-dessus de ma vignette (iOS `CallCameraRail.effectsRow`) : ce qui part AVEC mon
 * image. Seules les actions que l'appel offre maintenant ([CallPillModel.selfEffects]) — Android n'a pas de partage
 * d'écran : la rangée ne porte qu'« Effets ».
 */
internal class CallSelfEffects(val items: List<CallPillItem>, val onAction: (CallAction) -> Unit)

private const val CHIP_SCRIM_ALPHA = 0.4f
private const val INDICATOR_LINGER_MILLIS = 1_000L
private val CHIP_VISUAL = 36.dp

/**
 * La rangée de ma caméra (iOS `CallCameraRail.cameraRow`) : « Retourner » — ou « Choisir la caméra » quand une
 * caméra est branchée — puis « Allumer / couper ». Caméra coupée, il ne reste que l'allumage.
 */
@Composable
internal fun rememberSelfCameraControlCount(actions: CallSelfCameraActions?, isCameraOn: Boolean): Int = when {
    actions == null -> 0
    isCameraOn -> 2
    else -> 1
}

/** Une caméra est-elle branchée ? Alors « Choisir la caméra » remplace la bascule, à la même place (iOS). */
@Composable
internal fun rememberHasSelectableCameras(zoom: CallCameraZoom): Boolean {
    val selectable by remember(zoom) {
        zoom.state.map { CameraPickerLaw.hasSelectableCameras(it.cameras) }.distinctUntilChanged()
    }.collectAsState(initial = CameraPickerLaw.hasSelectableCameras(zoom.state.value.cameras))
    return selectable
}

/**
 * La rangée posée contre le cadre de ma vignette — ou dans le rail du haut quand mon image est en plein écran :
 * la bascule avant / arrière (ou le choix de caméra, [onPickCamera]) puis l'allumage de la caméra, chacun une
 * cible de 44 dp. Le zoom n'y est pas : il vit dans la vignette ([CallZoomCycleButton]) ou sous la rangée
 * ([CallZoomLensChips]).
 */
@Composable
internal fun CallSelfTileControlsRow(
    actions: CallSelfCameraActions,
    isCameraOn: Boolean,
    modifier: Modifier = Modifier,
    onPickCamera: (() -> Unit)? = null,
    isPaused: Boolean = false,
    effects: CallSelfEffects? = null,
) {
    Row(
        modifier = modifier.callCameraRailSemantics(),
        horizontalArrangement = Arrangement.spacedBy(CallSelfTileControlsLaw.SPACING_DP.dp),
    ) {
        if (isCameraOn) {
            if (onPickCamera != null) {
                CallSelfCameraButton(
                    icon = MeeshyIcons.Camera,
                    label = stringResource(R.string.call_control_camera),
                    onClick = onPickCamera,
                )
            } else {
                CallSelfCameraButton(
                    icon = MeeshyIcons.FlipCamera,
                    label = stringResource(R.string.call_control_flip_camera),
                    hint = stringResource(R.string.call_control_flip_camera_hint),
                    onClick = actions.onFlip,
                )
            }
        }
        CameraToggleButton(actions, isCameraOn, isPaused)
        effects?.let { CallSelfEffectButtons(it) }
    }
}

/** La rangée « Effets · Écran » posée au-dessus de ma vignette. */
@Composable
internal fun CallSelfEffectsRow(effects: CallSelfEffects, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.callCameraRailSemantics(),
        horizontalArrangement = Arrangement.spacedBy(CallSelfTileControlsLaw.SPACING_DP.dp),
    ) { CallSelfEffectButtons(effects) }
}

/** Chaque action de la famille « Mon image » dessinée comme dans la pilule : même icône, même libellé, allumée si active. */
@Composable
private fun CallSelfEffectButtons(effects: CallSelfEffects) {
    effects.items.forEach { item ->
        val active = item.kind == CallPillKind.Active
        CallSelfCameraButton(
            icon = item.icon,
            label = stringResource(item.labelRes),
            hint = item.hintRes?.let { stringResource(it) },
            background = if (active) CallPalette.Brand else Color.Black.copy(alpha = CHIP_SCRIM_ALPHA),
            selected = active,
            onClick = { effects.onAction(item.action) },
        )
    }
}

@Composable
private fun Modifier.callCameraRailSemantics(): Modifier {
    val label = stringResource(R.string.call_control_camera_rail)
    return semantics(mergeDescendants = false) {
        contentDescription = label
        isTraversalGroup = true
    }
}

@Composable
private fun CallSelfCameraButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    hint: String? = null,
    background: Color = Color.Black.copy(alpha = CHIP_SCRIM_ALPHA),
    toggleState: String? = null,
    selected: Boolean? = null,
    tint: Color = CallPalette.Ink,
) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier = Modifier
            .size(CallSelfTileControlsLaw.BUTTON_DP.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClickLabel = hint) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .semantics {
                contentDescription = label
                selected?.let { this.selected = it }
                toggleState?.let {
                    stateDescription = it
                    liveRegion = LiveRegionMode.Polite
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(CHIP_VISUAL).clip(CircleShape).background(background), contentAlignment = Alignment.Center) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        }
    }
}

/**
 * Allumer / couper : l'état bascule tout de suite (`toggleCamera` est optimiste) ; coupée, le disque passe au rouge ;
 * gelée par l'appli ([isPaused]), le glyphe passe à l'ambre et le dit, comme le bouton de la pilule qu'elle remplace.
 */
@Composable
private fun CameraToggleButton(actions: CallSelfCameraActions, isCameraOn: Boolean, isPaused: Boolean) {
    val paused = isPaused && isCameraOn
    CallSelfCameraButton(
        icon = if (isCameraOn && !paused) MeeshyIcons.Video else MeeshyIcons.VideoOff,
        label = stringResource(
            when {
                paused -> R.string.call_control_video_paused
                isCameraOn -> R.string.call_camera_toggle_off
                else -> R.string.call_camera_toggle_on
            },
        ),
        onClick = actions.onToggleCamera,
        background = if (isCameraOn) Color.Black.copy(alpha = CHIP_SCRIM_ALPHA) else MeeshyPalette.Error.copy(alpha = 0.85f),
        toggleState = stringResource(if (isCameraOn) R.string.call_camera_state_on else R.string.call_camera_state_off),
        tint = if (paused) MeeshyTheme.tokens.warning else CallPalette.Ink,
    )
}

/**
 * Les pastilles « 0,5× · 1× · 2× · 3× » de mon image en plein écran (iOS `CallZoomLensChips`) : seuls les
 * objectifs que l'appareil possède, plus 2×. Celle du facteur courant est ambrée et dit le facteur exact.
 */
@Composable
internal fun CallZoomLensChips(zoom: CallCameraZoom, stops: List<Float>, modifier: Modifier = Modifier) {
    val state by zoom.state.collectAsState()
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val haptics = LocalHapticFeedback.current
    val label = stringResource(R.string.call_zoom_label)
    Row(modifier.semantics { contentDescription = label; isTraversalGroup = true }) {
        stops.forEach { stop ->
            val active = abs(state.displayFactor - stop) / stop <= CameraZoomPolicy.SNAP_TOLERANCE
            val shown = CameraZoomPolicy.label(if (active) state.displayFactor else stop, locale)
            val spoken = stringResource(R.string.call_zoom_lens, CameraZoomPolicy.label(stop, locale))
            Box(
                modifier = Modifier
                    .size(CallCameraRail.TARGET_SIDE_DP.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) {
                        zoom.select(stop)
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    }
                    .semantics {
                        contentDescription = spoken
                        selected = active
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = shown,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    color = if (active) MeeshyTheme.tokens.warning else CallPalette.Ink,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
        }
    }
}

/**
 * Dans ma vignette, en haut côté fin (iOS `CallZoomCycleButton`) : un seul bouton qui affiche le facteur courant
 * et passe au palier suivant, puis revient au plus large.
 */
@Composable
internal fun CallZoomCycleButton(zoom: CallCameraZoom, modifier: Modifier = Modifier) {
    val state by zoom.state.collectAsState()
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val haptics = LocalHapticFeedback.current
    val label = stringResource(R.string.call_zoom_label)
    val hint = stringResource(R.string.call_zoom_cycle_hint)
    val value = CameraZoomPolicy.label(state.displayFactor, locale)
    Box(
        modifier = modifier
            .size(CallCameraRail.TARGET_SIDE_DP.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClickLabel = hint) {
                zoom.cycleQuickStop()
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            }
            .semantics {
                contentDescription = label
                stateDescription = value
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(CHIP_VISUAL).clip(CircleShape).background(Color.Black.copy(alpha = CHIP_SCRIM_ALPHA)), contentAlignment = Alignment.Center) {
            Text(
                text = value,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                color = CallPalette.Ink,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

/**
 * La place du zoom dans ma vignette, décidée par [CallCameraRail.zoomControl] : le bouton de palier au coin haut
 * côté fin dès qu'une cible de 44 dp y tient, rien tant que la caméra n'est pas zoomable.
 */
@Composable
internal fun BoxScope.CallSelfTileZoomSlot(zoom: CallCameraZoom, visible: Boolean) {
    val profile by remember(zoom) { zoom.state.map { it.profile }.distinctUntilChanged() }.collectAsState(initial = zoom.state.value.profile)
    BoxWithConstraints(Modifier.matchParentSize()) {
        val control = CallCameraRail.zoomControl(profile, CallCameraControlsPlacement.SelfTile, maxWidth.value, maxHeight.value)
        if (control == CallZoomControl.CycleButton) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
                exit = fadeOut(tween(CallChromeVisibility.FADE_DURATION_MILLIS.toInt())),
                modifier = Modifier.align(Alignment.TopEnd).padding(CallCameraRail.TILE_INSET_DP.dp),
            ) { CallZoomCycleButton(zoom) }
        }
    }
}

/**
 * Mon image en plein écran (iOS `cameraRail`, placement `topCenter`) : les commandes de ma caméra se posent en
 * haut au centre, sous l'en-tête, dans une capsule de verre — Retourner · Caméra · Effets dans l'ordre d'iOS
 * (`CallCameraRail.order`) puis, dessous, les pastilles de zoom.
 */
@Composable
internal fun CallMyImageTopRail(
    actions: CallSelfCameraActions,
    isCameraOn: Boolean,
    modifier: Modifier = Modifier,
    onPickCamera: (() -> Unit)? = null,
    effects: CallSelfEffects? = null,
) {
    val profile by remember(actions.zoom) {
        actions.zoom.state.map { it.profile }.distinctUntilChanged()
    }.collectAsState(initial = actions.zoom.state.value.profile)
    val chips = CallCameraRail.zoomControl(profile, CallCameraControlsPlacement.TopCenter, null, null) as? CallZoomControl.LensChips
    MeeshyGlassSurface(modifier = modifier, shape = RoundedCornerShape(percent = 50)) {
        Column(
            modifier = Modifier.padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xsPlus),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            CallSelfTileControlsRow(actions, isCameraOn, onPickCamera = onPickCamera, effects = effects)
            if (isCameraOn && chips != null) CallZoomLensChips(actions.zoom, chips.stops)
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
