package me.meeshy.app.calls

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.graphics.Bitmap
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameThumbnailCache
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsBarMode
import me.meeshy.sdk.model.call.effects.CallEffectsBarRule
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsModeRule
import me.meeshy.sdk.model.call.effects.category
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageFrameRule
import me.meeshy.sdk.model.call.montage.CallMontageHold
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageScopeToggle
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val THUMB_WIDTH = 48.dp
private val THUMB_HEIGHT = 85.dp
private val THUMB_SPACING = 12.dp
private val SIDE_DIAMETER = 48.dp

/** Les puces de tri du Montage, dans l'ordre de C1 : Filtres · Cadres (pressée) · Visage. */
private val MONTAGE_KINDS = listOf(CallEffectKind.Color, CallEffectKind.Frame, CallEffectKind.Face)

/** (+) depuis le Montage : Visage d'abord, puis Filtres (Effets les offre), le cadre étant celui qu'on tient. */
private val ADDABLE_KINDS = listOf(CallEffectKind.Face, CallEffectKind.Color, CallEffectKind.Frame)

/**
 * **LE CHOIX DU MODE MONTAGE** (#13690, #13732, #13733, #16979) — la barre est celle d'Effets, `‹ · Réglages · (+)` (loi 14) :
 * au-dessus d'elle, les puces de tri dont « Cadres » est pressée, puis la bande des cadres — l'option « Cadre » (garder le
 * cadre pour les deux et le proposer), les ambiances, le carrousel aimanté dont l'élément centré est choisi et SE déclenche
 * (deux tapes : photo ; appui long : film). Ni Quitter ni Valider : ce qui est touché s'applique aussitôt, ‹ revient à
 * l'appel, et après chaque choix la barre revient à son menu de base. « Réglages » porte « Chaque visage » ; (+) ouvre
 * Effets sur un genre absent de la pile (trois couches au plus) et son appui long liste les effets appliqués pour en
 * annuler un. Choisir un cadre ne sert que la capture : rien ne part vers l'appel sans « Cadre ».
 */
@Composable
internal fun CallMontagePicker(
    live: CallLiveFrameController,
    capture: CallCaptureController,
    scene: CallCaptureScene,
    people: List<CallFramePerson>,
    isLiveOffered: Boolean,
    reduceMotion: Boolean,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    layers: CallEffectLayers = CallEffectLayers.EMPTY,
    effectsOffered: Boolean = false,
    onRemoveEffect: (CallEffectKind) -> Unit = {},
    onOpenEffects: (CallEffectsCategory) -> Unit = {},
) {
    val held by live.state.collectAsState()
    val pick by capture.pick.collectAsStateWithLifecycle()
    val captureState by capture.state.collectAsStateWithLifecycle()
    val hints = rememberCaptureHint()
    val shooter = rememberCallCaptureShooter(capture, scene, hints)
    var bar by remember { mutableStateOf(CallEffectsBarMode.Base) }
    val shownBar = CallEffectsBarRule.reconciled(bar, hasLayers = !layers.isEmpty)
    LaunchedEffect(shownBar) { bar = shownBar }
    val chosenFrame = CallFrameLayer.chosen(pick, people.size)
    val removeLayer: (CallEffectKind) -> Unit = { kind ->
        if (kind == CallEffectKind.Frame) CallFrameLayer.remove(capture, live, held.frameId, chosenFrame) else onRemoveEffect(kind)
        bar = CallEffectsBarRule.afterRemoval
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
            .padding(top = MeeshySpacing.md, bottom = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        EffectsBand(shownBar, reduceMotion) { shown ->
            when (shown) {
                CallEffectsBarMode.Base -> MontageLooksBand(live, capture, people, isLiveOffered, reduceMotion, layers, shooter, hints)
                CallEffectsBarMode.Settings -> MontageSettingsPanel(facesEnabled = !captureState.isWorking && !captureState.isRecording, onFaces = shooter.faces)
                CallEffectsBarMode.Applied -> EffectsAppliedPanel(layers, removeLayer)
            }
        }
        EffectsBar(
            chips = if (effectsOffered) MONTAGE_KINDS else listOf(CallEffectKind.Frame),
            selected = CallEffectKind.Frame,
            bar = shownBar,
            layers = layers,
            reduceMotion = reduceMotion,
            onBack = onClose,
            onSettings = { bar = CallEffectsBarRule.afterSettings(shownBar) },
            onAddLook = { CallEffectsModeRule.addingKind(CallEffectKind.Frame, ADDABLE_KINDS, layers)?.category?.let(onOpenEffects) },
            onShowApplied = { bar = CallEffectsBarRule.afterShowingApplied(shownBar, hasLayers = !layers.isEmpty) },
            onChip = { kind -> kind.category?.let(onOpenEffects) },
            addsLook = effectsOffered,
        )
    }
}

/**
 * La bande des cadres, sur le menu de base : l'option « Cadre » (pressée en blanc quand le cadre est gardé), les puces
 * (« Classiques », les ambiances mises en avant, puis « Plus d'ambiances »), puis le carrousel, chaque vignette peinte sur
 * les visages de l'appel. Trois couches déjà posées sans cadre : un cadre n'est pas choisi (un classique, si).
 */
@Composable
private fun MontageLooksBand(
    live: CallLiveFrameController,
    capture: CallCaptureController,
    people: List<CallFramePerson>,
    isLiveOffered: Boolean,
    reduceMotion: Boolean,
    layers: CallEffectLayers,
    shooter: CallCaptureShooter,
    hints: CaptureHintMemory,
) {
    val held by live.state.collectAsState()
    val pick by capture.pick.collectAsStateWithLifecycle()
    val captureState by capture.state.collectAsStateWithLifecycle()
    val count = people.size
    val chip = CallMontagePickRule.shownChip(pick, count)
    val hold = CallMontagePickRule.hold(pick, count, held.frameId, isLiveOffered)
    val haptics = LocalHapticFeedback.current
    val mayPickFrame = layers.allows(CallEffectKind.Frame)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md), horizontalAlignment = Alignment.CenterHorizontally) {
        hold?.let { option ->
            FrameHoldChip(option, enabled = CallMontagePickRule.holdEnabled(captureState.isRecording)) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                live.apply(CallLiveFrameRule.toggledHold(held.frameId, option.frameId))
            }
        }
        MoodChips(
            chips = CallMontagePickRule.chips(pick, count),
            selected = chip,
            isEnabled = !captureState.isRecording,
            toggle = CallMontagePickRule.scopeToggle(pick, count),
            onScope = { showsAll -> capture.setScope(if (showsAll) CallFrameScope.SPOTLIGHT else CallFrameScope.ALL, count) },
        ) { tapped ->
            if (tapped !is CallMontageMoodChip.Mood || mayPickFrame) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                capture.show(tapped, count)
            }
        }
        MontageFramesCarousel(capture, people, layers, shooter, hints, reduceMotion)
    }
}

/**
 * Le carrousel aimanté des cadres : l'élément centré est choisi et SE déclenche (deux tapes : photo ; appui long : film),
 * chaque vignette peinte sur les visages de l'appel. Un cadre refusé par la pile pleine n'est pas choisi.
 */
@Composable
private fun MontageFramesCarousel(
    capture: CallCaptureController,
    people: List<CallFramePerson>,
    layers: CallEffectLayers,
    shooter: CallCaptureShooter,
    hints: CaptureHintMemory,
    reduceMotion: Boolean,
) {
    val pick by capture.pick.collectAsStateWithLifecycle()
    val captureState by capture.state.collectAsStateWithLifecycle()
    val previews by capture.previews.collectAsStateWithLifecycle()
    val count = people.size
    val chip = CallMontagePickRule.shownChip(pick, count)
    val scope = CallMontagePickRule.scope(pick, count)
    val selection = CallMontagePickRule.selection(pick, count)
    val classicNames = CallMontageStyle.entries.associateWith { stringResource(styleName(it)) }
    val language = LocalConfiguration.current.locales[0]?.language
    val nextDeclination = stringResource(R.string.call_live_frame_declination_next)
    val previousDeclination = stringResource(R.string.call_live_frame_declination_previous)
    val mayPickFrame = layers.allows(CallEffectKind.Frame)
    fun stepDeclination(offset: Int): Boolean {
        val current = CallMontagePickRule.choice(pick, count) as? CallMontageChoice.Frame ?: return false
        val next = CallFrameStyleRule.neighbour(current.id, offset) ?: return false
        capture.select(CallMontageChoice.Frame(next.id))
        return true
    }
    key(chip, scope) {
        CallModeCarousel(
            items = CallMontagePickRule.items(pick, count),
            selection = selection,
            title = stringResource(R.string.call_mode_montage_title),
            name = { item -> choiceName(CallMontagePickRule.declined(pick, item, count), classicNames, language) },
            reduceMotion = reduceMotion,
            onSelect = { item -> if (item != selection && (item !is CallMontageChoice.Frame || mayPickFrame)) capture.select(item) },
            nextLabel = stringResource(R.string.call_montage_next),
            previousLabel = stringResource(R.string.call_montage_previous),
            itemWidth = THUMB_WIDTH,
            itemHeight = THUMB_HEIGHT,
            spacing = THUMB_SPACING,
            hint = stringResource(R.string.call_mode_gesture_hint)
                .takeIf { CallModeGestureRule.showsHint(hasSeenHint = hints.hasSeen, isRecording = captureState.isRecording) },
            shots = CallModeShots(captureState.isRecording, shooter.shoot, shooter.film),
            extraActions = if (CallMontageFrameRule.declinations(selection).size > 1) {
                listOf(
                    CustomAccessibilityAction(nextDeclination) { stepDeclination(1) },
                    CustomAccessibilityAction(previousDeclination) { stepDeclination(-1) },
                )
            } else {
                emptyList()
            },
        ) { item, isShown ->
            MontageCell(
                item = item,
                posed = CallMontagePickRule.declined(pick, item, count),
                isSelected = isShown && item == selection,
                previews = previews,
                people = people,
                onDecline = { id -> capture.select(CallMontageChoice.Frame(id)) },
            )
        }
    }
}

/**
 * « Réglages » au Montage : un verre séparé, posé au-dessus de la barre à la place de la bande de cadres. « Chaque
 * visage » n'a pas de place dessinée sur C1 ; il se range ici (comme sur iOS), refusé pendant une prise ou un film.
 */
@Composable
private fun MontageSettingsPanel(facesEnabled: Boolean, onFaces: () -> Unit) {
    CallControlsGlass(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg)) {
        Row(Modifier.fillMaxWidth().padding(MeeshySpacing.md), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = MeeshyIcons.Account,
                kind = CallPillKind.Normal,
                label = stringResource(R.string.call_capture_faces),
                caption = stringResource(R.string.call_capture_faces),
                hint = stringResource(R.string.call_capture_faces_hint),
                diameter = SIDE_DIAMETER,
                enabled = facesEnabled,
                onClick = onFaces,
            )
        }
    }
}

/**
 * L'option « Cadre » (C1) : une puce de verre au-dessus des ambiances, pressée en blanc quand le cadre affiché est GARDÉ
 * pendant l'appel (et proposé à l'autre). Refusée pendant une prise ou un film, désactivée et non seulement sourde.
 */
@Composable
internal fun FrameHoldChip(option: CallMontageHold, enabled: Boolean, onToggle: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val kind = if (option.isOn) CallPillKind.Active else CallPillKind.Normal
    val label = stringResource(R.string.call_live_frame_label)
    CallGlassButtonSurface(
        role = kind.glassRole(),
        shape = CircleShape,
        isPressed = pressed,
        modifier = Modifier
            .heightIn(min = 48.dp)
            .alpha(if (enabled) 1f else 0.4f)
            .clickable(enabled = enabled, interactionSource = source, indication = null, onClickLabel = stringResource(R.string.call_live_frame_hold_hint), role = Role.Switch, onClick = onToggle)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                toggleableState = ToggleableState(option.isOn)
            },
    ) {
        Row(Modifier.padding(horizontal = MeeshySpacing.lg), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Icon(MeeshyIcons.Wallpaper, contentDescription = null, tint = CallButtonFill.glyph(kind), modifier = Modifier.size(20.dp))
            Text(
                text = stringResource(R.string.call_live_frame_caption),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = CallButtonFill.glyph(kind),
            )
        }
    }
}

/** La vignette d'un cadre peinte avec les initiales : ce qui tient la place tant que les visages ne sont pas peints. */
@Composable
internal fun FrameThumbnail(design: CallFrameDesign, people: List<CallFramePerson>) {
    val density = LocalDensity.current
    val w = with(density) { THUMB_WIDTH.roundToPx() }
    val h = with(density) { THUMB_HEIGHT.roundToPx() }
    val locale = LocalConfiguration.current.locales[0]
    val date = remember(locale) { DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date()) }
    TrimThumbnailsOnMemoryPressure()
    val bitmap by produceState<ImageBitmap?>(null, design.id, w, h, people, date) {
        val texts = CallFrameTexts(groupName = null, isGroup = false, date = date, accentHex = null)
        val cache = CallFrameThumbnailCache.shared
        value = cache.image(design.id, people.size, w, h)?.asImageBitmap() ?: withContext(Dispatchers.Default) {
            CallFrameRenderer.render(design, people.map { CallFramePortrait(it.id, it.name, it.handle, it.isSelf, null) }, texts, w, h)
                ?.also { cache.store(it, design.id, people.size, w, h) }
                ?.asImageBitmap()
        }
    }
    bitmap?.let { Image(it, contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize()) }
}

/** Sous pression mémoire, le cache de vignettes se vide : elles se repeignent à la demande. */
@Composable
private fun TrimThumbnailsOnMemoryPressure() {
    val context = LocalContext.current.applicationContext
    DisposableEffect(context) {
        val callbacks = object : ComponentCallbacks2 {
            override fun onTrimMemory(level: Int) = CallFrameThumbnailCache.shared.trimMemory(level)
            override fun onConfigurationChanged(newConfig: Configuration) = Unit
            override fun onLowMemory() = CallFrameThumbnailCache.shared.removeAll()
        }
        context.registerComponentCallbacks(callbacks)
        onDispose { context.unregisterComponentCallbacks(callbacks) }
    }
}



/** Le nom d'un classique, celui d'iOS (`CallCaptureCopy.styleName`). */
@StringRes
internal fun styleName(style: CallMontageStyle): Int = when (style) {
    CallMontageStyle.SCREEN -> R.string.call_capture_style_screen
    CallMontageStyle.COVER -> R.string.call_capture_style_cover
    CallMontageStyle.GOLD -> R.string.call_capture_style_gold
    CallMontageStyle.REDCARPET -> R.string.call_capture_style_redcarpet
    CallMontageStyle.GRID -> R.string.call_capture_style_grid
    CallMontageStyle.STRIP -> R.string.call_capture_style_strip
    CallMontageStyle.POLAROID -> R.string.call_capture_style_polaroid
    CallMontageStyle.MAGAZINE -> R.string.call_capture_style_magazine
    CallMontageStyle.FILM -> R.string.call_capture_style_film
    CallMontageStyle.NEON -> R.string.call_capture_style_neon
    CallMontageStyle.NOIR -> R.string.call_capture_style_noir
    CallMontageStyle.COMIC -> R.string.call_capture_style_comic
    CallMontageStyle.HEART -> R.string.call_capture_style_heart
}
