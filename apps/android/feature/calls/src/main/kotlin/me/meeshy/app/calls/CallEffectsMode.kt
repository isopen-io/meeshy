package me.meeshy.app.calls

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
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
import me.meeshy.sdk.model.call.CallEffectsCompanionRule
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.CaptionsMode
import me.meeshy.sdk.model.call.SMOOTHING_INTENSITY_MAX
import me.meeshy.sdk.model.call.SMOOTHING_INTENSITY_MIN
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectsBarMode
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsGenreRule
import me.meeshy.sdk.model.call.effects.CallEffectsModeRule
import me.meeshy.sdk.model.call.effects.CallEffectsModeState
import me.meeshy.sdk.model.call.effects.kind
import me.meeshy.sdk.model.call.effects.category
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallCaptureSubject
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.EglBase
import org.webrtc.VideoTrack
import javax.inject.Inject
import kotlin.math.roundToInt

/** La bande basse des commandes du mode, que le bloc des compagnons ne couvre jamais. */
private val BAR_RESERVE = 220.dp

@HiltViewModel
class CallEffectsViewModel @Inject constructor(val effects: CallVideoEffectsController) : ViewModel()

/**
 * Le mode « Effets de ma caméra » (iOS `CallScreenMode.effects`, `CallEffectsModeControls`) : MON image en
 * plein écran — telle qu'elle part, effet compris —, l'autre en vignette pour rester avec lui, et en bas
 * le choix d'UN effet à la fois : le carrousel, puis la barre de verre ‹ (revient à l'appel avec le look) · Réglages
 * (le panneau Luminosité · Flou du fond, force du lissage, prend la place du carrousel) · (+) (un genre absent de la pile ;
 * un appui long liste les effets appliqués pour en annuler un). Aucun Quitter ni Valider : chaque essai part aussitôt à l'autre et se garde.
 * Comme le Montage, la prise se déclenche sur l'effet CENTRÉ du carrousel (#13737) : deux tapes photographient
 * mon image, un appui long la filme ; la scène ne porte aucun geste.
 */
@Composable
internal fun CallEffectsMode(
    state: CallUiState,
    localTrack: VideoTrack?,
    remoteTrack: VideoTrack?,
    eglContext: EglBase.Context,
    reduceMotion: Boolean,
    onClose: () -> Unit,
    onOpenFrames: () -> Unit = {},
    peerUserId: String? = null,
    peerAvatarUrl: String? = null,
) {
    val effects = hiltViewModel<CallEffectsViewModel>().effects
    val captureViewModel: CallCaptureViewModel = hiltViewModel()
    val frameViewModel: CallLiveFrameViewModel = hiltViewModel()
    val session = remember(effects) { CallEffectsController(effects) }
    val mode by session.state.collectAsStateWithLifecycle()
    val setMode: (CallEffectsModeState) -> Unit = { next -> session.change { next } }
    val finish: () -> Unit = { if (session.finish()) onClose() }
    val companions = remember(peerUserId, peerAvatarUrl, state.peerName, state.isCameraOn, state.isPeerCameraOff, state.isPeerMuted, state.isMuted) {
        CallEffectsCompanionRule.duoCompanions(
            peerUserId = peerUserId,
            peerName = state.peerName,
            peerAvatarUrl = peerAvatarUrl,
            isCameraOn = state.isCameraOn,
            isMuted = state.isMuted,
            isPeerCameraOff = state.isPeerCameraOff,
            isPeerMuted = state.isPeerMuted,
        )
    }
    BackHandler { finish() }
    // Le mode peut disparaître autrement que par ‹ (l'appel se termine, la couche change) : le look se garde, la
    // session ne se termine qu'une fois.
    DisposableEffect(session) { onDispose { session.finish() } }

    val self = remember(state.isCameraOn, state.isFrontCamera) {
        val me = frameViewModel.controller.people(state.peerName, null).filter { it.isSelf }
        CallCaptureScene(
            look = CallCaptureLook.Classic(CallCaptureSceneRule.DEFAULT_STYLE),
            subjects = me.map { CallCaptureSubject(it.id, it.name, it.handle, true, state.isFrontCamera, state.isCameraOn) },
        )
    }
    val tracks = remember(self, localTrack) { self.subjects.associate { it.id to localTrack } }
    val title = stringResource(R.string.call_effects_title)
    val capture = captureViewModel.controller
    val captureState by capture.state.collectAsStateWithLifecycle()
    val hints = rememberCaptureHint()
    val shooter = rememberCallCaptureShooter(capture, self, hints)
    val shots = CallModeShots(captureState.isRecording, shooter.shoot, shooter.film)
    val hint = stringResource(R.string.call_mode_gesture_hint)
        .takeIf { CallModeGestureRule.showsHint(hasSeenHint = hints.hasSeen, isRecording = captureState.isRecording) }
    val removeLayer = rememberEffectLayerRemoval(session, mode, capture, frameViewModel.controller)
    val row = CallEffectsGenreRule.row(offersEffects = state.offersEffectsMode(), offersFrames = state.offersCaptureMode())

    Box(Modifier.fillMaxSize().background(Color.Black).semantics { paneTitle = title }) {
        localTrack?.let {
            CallLiveFrameVideo(CallLiveFrameVideoSource(it, isMirrored = state.isFrontCamera), eglContext, Modifier.fillMaxSize())
        }
        CallMontageCaptureLayer(capture, tracks, reduceMotion, Modifier.fillMaxSize())
        CallEffectsCompanionStrip(
            tiles = companions,
            trackFor = { tile -> remoteTrack.takeIf { !tile.isLocal && tile.showsVideo } },
            eglContext = eglContext,
            reduceMotion = reduceMotion,
            modifier = Modifier.systemBarsPadding().padding(bottom = BAR_RESERVE),
        )
        EffectsControls(
            state = state,
            mode = mode,
            row = row,
            reduceMotion = reduceMotion,
            shots = shots,
            hint = hint,
            onChange = setMode,
            onRemove = removeLayer,
            onFinish = finish,
            onOpenFrames = onOpenFrames,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

/**
 * Annuler un effet de la liste (appui long sur (+)) défait son réglage ; la couche « cadre » (posée au Montage) se retire
 * par le chemin du Montage ([CallFrameLayer.remove]), avant que la session ne la sorte de sa pile.
 */
@Composable
private fun rememberEffectLayerRemoval(
    session: CallEffectsController,
    mode: CallEffectsModeState,
    capture: CallCaptureController,
    live: CallLiveFrameController,
): (CallEffectKind) -> Unit {
    val held by live.state.collectAsStateWithLifecycle()
    return { kind ->
        if (kind == CallEffectKind.Frame) {
            CallFrameLayer.remove(capture, live, held = held.frameId, chosen = mode.layers.choice(CallEffectKind.Frame))
        }
        session.change { it.removing(kind) }
    }
}

/**
 * Le bas du mode, de haut en bas : les sous-titres (ils restent, dans leur verre sans rangée, sans bouton Journal — iOS
 * `captionsBand(opensJournal: false)`), le carrousel OU le panneau Luminosité · Flou du fond (un verre séparé), puis
 * la barre ‹ · Réglages · (+) sous la rangée de genres de la famille ([row]).
 */
@Composable
private fun EffectsControls(
    state: CallUiState,
    mode: CallEffectsModeState,
    row: List<CallEffectKind>,
    reduceMotion: Boolean,
    shots: CallModeShots,
    hint: String?,
    onChange: (CallEffectsModeState) -> Unit,
    onRemove: (CallEffectKind) -> Unit,
    onFinish: () -> Unit,
    onOpenFrames: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
            .systemBarsPadding()
            .padding(bottom = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (state.captions.mode != CaptionsMode.Off) {
            CallCaptionsBandHost(state = state, hasOwnGlass = true, opensJournal = false, modifier = Modifier.padding(horizontal = MeeshySpacing.lg))
        }
        EffectsLooksOrPanel(mode, reduceMotion, shots, hint, onChange, onRemove)
        EffectsModeBar(mode, row, reduceMotion, onChange, onFinish, onOpenFrames)
    }
}

/**
 * La barre d'Effets sous la rangée de genres de la famille (#16979, comme iOS `CallEffectsModeControls`) : Visage et
 * Couleur se montrent ici, « Cadres » ouvre le Montage ; (+) ouvre un genre absent de la pile, d'abord en Effets, puis au
 * Montage ([CallEffectsGenreRule.adding]) ; la barre revient au menu de base après chaque choix.
 */
@Composable
internal fun EffectsModeBar(
    mode: CallEffectsModeState,
    row: List<CallEffectKind>,
    reduceMotion: Boolean,
    onChange: (CallEffectsModeState) -> Unit,
    onFinish: () -> Unit,
    onOpenFrames: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    val added = mode.addedGenre(row)
    val open: (CallEffectKind) -> Unit = { kind ->
        if (kind.category == null) onOpenFrames() else onChange(mode.showingAdded(kind))
    }
    EffectsBar(
        chips = row,
        selected = mode.category.kind,
        bar = mode.bar,
        layers = mode.layers,
        reduceMotion = reduceMotion,
        onBack = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onFinish()
        },
        onSettings = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onChange(mode.togglingSettings())
        },
        onAddLook = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            added?.let(open)
        },
        onShowApplied = { onChange(mode.showingApplied()) },
        onChip = { kind -> kind.category?.let { onChange(mode.showing(it)) } ?: onOpenFrames() },
        addsLook = added != null,
    )
}

/** P8b.6 — le panneau (réglages OU liste des effets appliqués) remplace la bande de looks, par le fondu de [EffectsBand]. */
@Composable
private fun EffectsLooksOrPanel(
    mode: CallEffectsModeState,
    reduceMotion: Boolean,
    shots: CallModeShots,
    hint: String?,
    onChange: (CallEffectsModeState) -> Unit,
    onRemove: (CallEffectKind) -> Unit,
) {
    EffectsBand(mode.bar, reduceMotion) { bar ->
        when (bar) {
            CallEffectsBarMode.Base -> EffectsCarousel(mode, reduceMotion, shots, hint, onChange = onChange)
            CallEffectsBarMode.Settings -> EffectsSettingsPanel(mode, onChange = onChange)
            CallEffectsBarMode.Applied -> EffectsAppliedPanel(mode.layers, onRemove)
        }
    }
}

/** Le carrousel de la catégorie montrée : l'effet centré est choisi, et SE déclenche avec [shots] (iOS `CallEffectsModeControls.carousel`). */
@Composable
internal fun EffectsCarousel(
    mode: CallEffectsModeState,
    reduceMotion: Boolean,
    shots: CallModeShots?,
    hint: String?,
    onChange: (CallEffectsModeState) -> Unit,
) {
    when (mode.category) {
        CallEffectsCategory.Face -> CallModeCarousel(
            items = CallEffectsModeRule.faces,
            selection = mode.face,
            title = stringResource(R.string.call_effects_category_face),
            name = { stringResource(faceLabel(it)) },
            glyph = ::faceGlyph,
            reduceMotion = reduceMotion,
            onSelect = { onChange(mode.selecting(it)) },
            hint = hint,
            shots = shots,
        )
        CallEffectsCategory.Color -> CallModeCarousel(
            items = CallEffectsModeRule.colors,
            selection = mode.color,
            title = stringResource(R.string.call_effects_category_color),
            name = { stringResource(presetLabel(it)) },
            glyph = ::presetGlyph,
            reduceMotion = reduceMotion,
            onSelect = { onChange(mode.selecting(it)) },
            hint = hint,
            shots = shots,
        )
    }
}

/**
 * Le panneau Réglages (iOS `settingsPanel`) : un verre SÉPARÉ posé au-dessus de la barre — la force du lissage quand il
 * est choisi, Luminosité (un titre et son curseur), puis Flou du fond (une ligne titrée à interrupteur).
 */
@Composable
internal fun EffectsSettingsPanel(mode: CallEffectsModeState, onChange: (CallEffectsModeState) -> Unit) {
    CallControlsGlass(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg)) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        ) {
            if (mode.showsSmoothingStrength) {
                val strength = mode.current.skinSmoothingIntensity
                EffectsSlider(
                    value = strength,
                    range = SMOOTHING_INTENSITY_MIN..SMOOTHING_INTENSITY_MAX,
                    label = stringResource(R.string.call_effects_smoothing_strength),
                    percent = (strength * 100).roundToInt(),
                    onChange = { onChange(mode.withSmoothing(it)) },
                )
            }
            val brightness = mode.current.brightness
            EffectsSlider(
                value = brightness,
                range = -BRIGHTNESS_LIMIT..BRIGHTNESS_LIMIT,
                label = stringResource(R.string.call_effects_brightness),
                percent = (brightness / BRIGHTNESS_LIMIT * 100).roundToInt(),
                onChange = { onChange(mode.withBrightness(it)) },
            )
            EffectsBlurRow(mode.current.backgroundBlurEnabled) { onChange(mode.togglingBlur()) }
        }
    }
}

/** Un titre visible au-dessus de son curseur ; le lecteur d'écran lit le curseur seul, avec son nom et sa valeur. */
@Composable
private fun EffectsSlider(
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    label: String,
    percent: Int,
    onChange: (Float) -> Unit,
) {
    val valueText = stringResource(R.string.call_effects_percent, percent)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            modifier = Modifier.clearAndSetSemantics { },
        )
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = range,
            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color.White.copy(alpha = 0.3f)),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .semantics {
                    contentDescription = label
                    stateDescription = valueText
                },
        )
    }
}

/** « Flou du fond » : une ligne titrée à interrupteur, toute la ligne se touche (48 dp). */
@Composable
private fun EffectsBlurRow(isOn: Boolean, onToggle: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = isOn, role = Role.Switch) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onToggle()
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.call_effects_blur),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = isOn,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(checkedTrackColor = CallPalette.Accept, checkedThumbColor = Color.White),
        )
    }
}

internal fun faceLabel(effect: CallFaceEffect): Int = when (effect) {
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

/** Les noms des ambiances viennent du catalogue d'iOS (`video.filter.preset.*`), les mêmes qu'ailleurs dans l'appel. */
internal fun presetLabel(preset: VideoFilterPreset): Int = when (preset) {
    VideoFilterPreset.Natural -> R.string.video_filter_preset_natural
    VideoFilterPreset.Warm -> R.string.video_filter_preset_warm
    VideoFilterPreset.Cool -> R.string.video_filter_preset_cool
    VideoFilterPreset.Vivid -> R.string.video_filter_preset_vivid
    VideoFilterPreset.Muted -> R.string.video_filter_preset_muted
    VideoFilterPreset.Golden -> R.string.video_filter_preset_golden
    VideoFilterPreset.Film -> R.string.video_filter_preset_film
    VideoFilterPreset.SoftNight -> R.string.video_filter_preset_softNight
    VideoFilterPreset.Bright -> R.string.video_filter_preset_bright
    VideoFilterPreset.Velvet -> R.string.video_filter_preset_velvet
    VideoFilterPreset.Sky -> R.string.video_filter_preset_sky
    VideoFilterPreset.Monochrome -> R.string.video_filter_preset_monochrome
}

/** iOS `presetSymbol` (feuille, horizon, pellicule, lune, soleil bas, étincelle, nuage-soleil, demi-disque), rendu en glyphes. */
private fun presetGlyph(preset: VideoFilterPreset): String = when (preset) {
    VideoFilterPreset.Natural -> "🍃"
    VideoFilterPreset.Warm -> "☀️"
    VideoFilterPreset.Cool -> "❄️"
    VideoFilterPreset.Vivid -> "✨"
    VideoFilterPreset.Muted -> "☁️"
    VideoFilterPreset.Golden -> "🌅"
    VideoFilterPreset.Film -> "🎞️"
    VideoFilterPreset.SoftNight -> "🌙"
    VideoFilterPreset.Bright -> "🔅"
    VideoFilterPreset.Velvet -> "✦"
    VideoFilterPreset.Sky -> "⛅"
    VideoFilterPreset.Monochrome -> "◐"
}
