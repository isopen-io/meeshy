package me.meeshy.app.calls

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.BRIGHTNESS_LIMIT
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.SMOOTHING_INTENSITY_MAX
import me.meeshy.sdk.model.call.SMOOTHING_INTENSITY_MIN
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsModeRule
import me.meeshy.sdk.model.call.effects.CallEffectsModeState
import me.meeshy.sdk.model.call.effects.CallVideoEffectsPlan
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.EglBase
import org.webrtc.VideoTrack
import javax.inject.Inject
import kotlin.math.roundToInt

private val COMPANION_WIDTH = 96.dp
private val COMPANION_HEIGHT = 128.dp
private val SIDE_DIAMETER = 48.dp

@HiltViewModel
class CallEffectsViewModel @Inject constructor(val effects: CallVideoEffectsController) : ViewModel()

/**
 * Le mode « Effets de ma caméra » (iOS `CallScreenMode.effects`, `CallEffectsModeControls`) : MON image en
 * plein écran — telle qu'elle part, effet compris —, l'autre en vignette pour rester avec lui, et en bas
 * le choix d'UN effet à la fois : « Visage · Couleur », le carrousel, puis Quitter (rend l'image d'avant),
 * Réglages (luminosité, flou du fond, force du lissage) et Valider. Chaque essai part aussitôt à l'autre.
 * Deux tapes sur la scène photographient mon image, un appui long la filme, comme le mode Montage.
 */
@Composable
internal fun CallEffectsMode(
    state: CallUiState,
    localTrack: VideoTrack?,
    remoteTrack: VideoTrack?,
    eglContext: EglBase.Context,
    reduceMotion: Boolean,
    onClose: () -> Unit,
) {
    val effects = hiltViewModel<CallEffectsViewModel>().effects
    val captureViewModel: CallCaptureViewModel = hiltViewModel()
    val frameViewModel: CallLiveFrameViewModel = hiltViewModel()
    var mode by remember { mutableStateOf(CallEffectsModeState.opening(effects.config.value)) }
    LaunchedEffect(mode.current) { effects.apply(mode.current) }
    val haptics = LocalHapticFeedback.current
    val finish: (Boolean) -> Unit = { validated ->
        effects.apply(mode.exiting(validated))
        if (validated) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        onClose()
    }
    BackHandler { finish(false) }

    val self = remember(state.isCameraOn, state.isFrontCamera) {
        val me = frameViewModel.controller.people(state.peerName, null).filter { it.isSelf }
        CallCaptureScene(
            look = CallCaptureLook.Classic(CallCaptureSceneRule.DEFAULT_STYLE),
            subjects = me.map { CallCaptureSubject(it.id, it.name, it.handle, true, state.isFrontCamera, state.isCameraOn) },
        )
    }
    val tracks = remember(self, localTrack) { self.subjects.associate { it.id to localTrack } }
    val title = stringResource(R.string.call_effects_title)

    Box(Modifier.fillMaxSize().background(Color.Black).semantics { paneTitle = title }) {
        localTrack?.let {
            CallLiveFrameVideo(CallLiveFrameVideoSource(it, isMirrored = state.isFrontCamera), eglContext, Modifier.fillMaxSize())
        }
        CallMontageCaptureLayer(captureViewModel.controller, self, tracks, reduceMotion, Modifier.fillMaxSize())
        remoteTrack?.takeIf { !state.isPeerCameraOff }?.let {
            CallLiveFrameVideo(
                CallLiveFrameVideoSource(it, isMirrored = false),
                eglContext,
                Modifier
                    .align(Alignment.TopEnd)
                    .systemBarsPadding()
                    .padding(MeeshySpacing.lg)
                    .size(COMPANION_WIDTH, COMPANION_HEIGHT)
                    .clip(RoundedCornerShape(MeeshyRadius.lg))
                    .semantics { contentDescription = state.peerName },
            )
        }
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
                .systemBarsPadding()
                .padding(bottom = MeeshySpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            AnimatedContent(
                targetState = mode.showsSettings,
                transitionSpec = { fadeIn(tween(if (reduceMotion) 0 else 200)) togetherWith fadeOut(tween(if (reduceMotion) 0 else 200)) },
                label = "effects-settings",
            ) { settings ->
                if (settings) {
                    EffectsSettings(mode, onChange = { mode = it })
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                        CategoryPicker(mode.category) { mode = mode.showing(it) }
                        EffectsCarousel(mode, reduceMotion, onChange = { mode = it })
                    }
                }
            }
            EffectsActionBar(
                showsSettings = mode.showsSettings,
                onQuit = { finish(false) },
                onSettings = { mode = mode.togglingSettings() },
                onValidate = { finish(true) },
            )
        }
    }
}

@Composable
private fun CategoryPicker(selected: CallEffectsCategory, onSelect: (CallEffectsCategory) -> Unit) {
    val haptics = LocalHapticFeedback.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        CallEffectsCategory.entries.forEachIndexed { index, category ->
            if (index > 0) Text("·", color = CallPalette.InkSecondary, fontWeight = FontWeight.SemiBold)
            val isSelected = category == selected
            Text(
                text = stringResource(categoryLabel(category)),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = if (isSelected) CallPalette.Ink else CallPalette.Ink.copy(alpha = 0.55f),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Tab) {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelect(category)
                    }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md)
                    .semantics { this.selected = isSelected },
            )
        }
    }
}

@Composable
private fun EffectsCarousel(mode: CallEffectsModeState, reduceMotion: Boolean, onChange: (CallEffectsModeState) -> Unit) {
    when (mode.category) {
        CallEffectsCategory.Face -> CallModeCarousel(
            items = CallEffectsModeRule.faces(CallVideoEffectsPlan.DRAWABLE_FACES),
            selection = mode.face,
            title = stringResource(R.string.call_effects_category_face),
            name = { stringResource(faceLabel(it)) },
            glyph = ::faceGlyph,
            reduceMotion = reduceMotion,
            onSelect = { onChange(mode.selecting(it)) },
        )
        CallEffectsCategory.Color -> CallModeCarousel(
            items = CallEffectsModeRule.colors,
            selection = mode.color,
            title = stringResource(R.string.call_effects_category_color),
            name = { stringResource(presetLabel(it)) },
            glyph = ::presetGlyph,
            reduceMotion = reduceMotion,
            onSelect = { onChange(mode.selecting(it)) },
        )
    }
}

/** Réglages (iOS `settingsRow`) : la force du lissage quand il est choisi, puis la luminosité et le flou du fond. */
@Composable
private fun EffectsSettings(mode: CallEffectsModeState, onChange: (CallEffectsModeState) -> Unit) {
    val haptics = LocalHapticFeedback.current
    Column(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (mode.showsSmoothingStrength) {
            val strength = mode.current.skinSmoothingIntensity
            EffectsSlider(
                value = strength,
                range = SMOOTHING_INTENSITY_MIN..SMOOTHING_INTENSITY_MAX,
                label = stringResource(R.string.call_effects_smoothing_strength),
                percent = (strength * 100).roundToInt(),
                onChange = { onChange(mode.withSmoothing(it)) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            val brightness = mode.current.brightness
            EffectsSlider(
                value = brightness,
                range = -BRIGHTNESS_LIMIT..BRIGHTNESS_LIMIT,
                label = stringResource(R.string.call_effects_brightness),
                percent = (brightness / BRIGHTNESS_LIMIT * 100).roundToInt(),
                onChange = { onChange(mode.withBrightness(it)) },
                modifier = Modifier.weight(1f),
            )
            CallPillButton(
                icon = MeeshyIcons.PersonBackgroundDotted,
                kind = if (mode.current.backgroundBlurEnabled) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(R.string.call_effects_blur),
                caption = stringResource(R.string.call_effects_blur),
                toggleState = mode.current.backgroundBlurEnabled,
                diameter = SIDE_DIAMETER,
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onChange(mode.togglingBlur())
                },
            )
        }
    }
}

@Composable
private fun EffectsSlider(
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    label: String,
    percent: Int,
    onChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val valueText = stringResource(R.string.call_effects_percent, percent)
    Slider(
        value = value,
        onValueChange = onChange,
        valueRange = range,
        colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color.White.copy(alpha = 0.3f)),
        modifier = modifier
            .heightIn(min = 48.dp)
            .semantics {
                contentDescription = label
                stateDescription = valueText
            },
    )
}

/** Quitter à gauche, puis Réglages et Valider (iOS `CallModeActionBar`). */
@Composable
private fun EffectsActionBar(showsSettings: Boolean, onQuit: () -> Unit, onSettings: () -> Unit, onValidate: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        CallPillButton(
            icon = MeeshyIcons.Close,
            kind = CallPillKind.Normal,
            label = stringResource(R.string.call_effects_quit),
            caption = stringResource(R.string.call_effects_quit),
            hint = stringResource(R.string.call_effects_quit_hint),
            diameter = SIDE_DIAMETER,
            onClick = onQuit,
        )
        Spacer(Modifier.weight(1f))
        CallPillButton(
            icon = MeeshyIcons.Tune,
            kind = if (showsSettings) CallPillKind.Active else CallPillKind.Normal,
            label = stringResource(R.string.call_effects_settings),
            caption = stringResource(R.string.call_effects_settings),
            hint = stringResource(R.string.call_effects_settings_hint),
            toggleState = showsSettings,
            diameter = SIDE_DIAMETER,
            onClick = {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onSettings()
            },
        )
        CallPillButton(
            icon = MeeshyIcons.Check,
            kind = CallPillKind.Normal,
            label = stringResource(R.string.call_effects_validate),
            caption = stringResource(R.string.call_effects_validate),
            hint = stringResource(R.string.call_effects_validate_hint),
            diameter = SIDE_DIAMETER,
            onClick = onValidate,
        )
    }
}

private fun categoryLabel(category: CallEffectsCategory): Int = when (category) {
    CallEffectsCategory.Face -> R.string.call_effects_category_face
    CallEffectsCategory.Color -> R.string.call_effects_category_color
}

private fun faceLabel(effect: CallFaceEffect): Int = when (effect) {
    CallFaceEffect.None -> R.string.call_effects_face_none
    CallFaceEffect.Smoothing -> R.string.call_effects_face_smoothing
    CallFaceEffect.Toad -> R.string.call_effects_face_toad
    CallFaceEffect.Angel -> R.string.call_effects_face_angel
    CallFaceEffect.Demon -> R.string.call_effects_face_demon
    CallFaceEffect.Volcano -> R.string.call_effects_face_volcano
}

/** iOS `CallEffectsCopy.art` : le symbole barré pour « Aucun », un émoji pour chaque effet. */
private fun faceGlyph(effect: CallFaceEffect): String = when (effect) {
    CallFaceEffect.None -> "⊘"
    CallFaceEffect.Smoothing -> "✨"
    CallFaceEffect.Toad -> "🐸"
    CallFaceEffect.Angel -> "😇"
    CallFaceEffect.Demon -> "😈"
    CallFaceEffect.Volcano -> "🌋"
}

private fun presetLabel(preset: VideoFilterPreset): Int = when (preset) {
    VideoFilterPreset.Natural -> R.string.call_effects_preset_natural
    VideoFilterPreset.Warm -> R.string.call_effects_preset_warm
    VideoFilterPreset.Cool -> R.string.call_effects_preset_cool
    VideoFilterPreset.Vivid -> R.string.call_effects_preset_vivid
    VideoFilterPreset.Muted -> R.string.call_effects_preset_muted
}

/** iOS `presetSymbol` (feuille, soleil, flocon, étincelles, nuage), rendu en glyphes. */
private fun presetGlyph(preset: VideoFilterPreset): String = when (preset) {
    VideoFilterPreset.Natural -> "🍃"
    VideoFilterPreset.Warm -> "☀️"
    VideoFilterPreset.Cool -> "❄️"
    VideoFilterPreset.Vivid -> "✨"
    VideoFilterPreset.Muted -> "☁️"
}
