package me.meeshy.app.stories

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.invisibleToUser
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.composer.look.ComposerAdjustReading
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le panneau du sous-outil RÉGLER / EFFETS du média sélectionné — UN réglage à la fois, comme iOS
 * (`ComposerMediaAdjustPanel`, #9495) : au-dessus, quand le média porte un rendu, « Comparer » (appui maintenu) et
 * « Réinitialiser » ; puis UN curseur pour le réglage choisi, sa valeur lue de −100 à +100 ; enfin la rangée défilante des
 * réglages (glyphe et intitulé, un point quand le réglage s'écarte de l'original). Sa hauteur ne dépend plus du nombre de
 * réglages, donc la scène reste visible pendant le geste. Il écrit les [ImageAdjustments] de l'objet, et le même rendu
 * (`SceneLookChain` / `SceneLookBaker`) sert l'aperçu, la couverture et l'export. [family] (Réglages ou Effets) ne montre
 * que ses curseurs, et « Réinitialiser » ne remet que lui au neutre. Une vidéo ne montre que les réglages qu'elle peint
 * ([AdjustmentKind.isServedForVideo]). L'accent est un PARAMÈTRE (couleur de contexte). Toucher deux fois la valeur remet le
 * réglage choisi au neutre. [onCompare] `null` : la surface ne sait pas montrer l'original, le contrôle ne se peint pas.
 */
@Composable
internal fun ComposerImageAdjustmentsPanel(
    adjustments: ImageAdjustments,
    isVideo: Boolean,
    family: AdjustmentFamily,
    accent: Color,
    carriesLook: Boolean,
    onAdjust: (AdjustmentKind, Float) -> Unit,
    onReset: () -> Unit,
    onCompare: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    var chosenName by rememberSaveable(family) { mutableStateOf<String?>(null) }
    val kinds = ComposerAdjustReading.kinds(family, isVideo)
    val shown = ComposerAdjustReading.shown(AdjustmentKind.entries.firstOrNull { it.wireName == chosenName }, kinds)
    val canReset = adjustments.activeCount(family) > 0
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (carriesLook && (onCompare != null || canReset)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (onCompare != null) CompareControl(isVideo, accent, onCompare)
                if (canReset) {
                    ActionCapsule(
                        label = stringResource(R.string.composer_object_editor_adjust_reset),
                        icon = MeeshyIcons.Undo,
                        highlighted = false,
                        accent = accent,
                        modifier = Modifier.testTag("adjust-reset").clickable(onClick = onReset),
                    )
                }
            }
        }
        shown?.let { kind ->
            AdjustmentSlider(kind = kind, value = adjustments[kind], accent = accent, onChange = { onAdjust(kind, it) })
        }
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            kinds.forEach { kind ->
                KindChip(
                    kind = kind,
                    value = adjustments[kind],
                    chosen = kind == shown,
                    adjusted = adjustments.isActive(kind),
                    accent = accent,
                    onClick = { chosenName = kind.wireName },
                )
            }
        }
    }
}

/** « Comparer » : tant que l'on maintient, la scène montre l'ORIGINAL ; VoiceOver / TalkBack ne maintiennent pas, l'action bascule. */
@Composable
private fun CompareControl(isVideo: Boolean, accent: Color, onCompare: (Boolean) -> Unit) {
    val label = stringResource(R.string.composer_object_editor_adjust_compare)
    val hint = stringResource(if (isVideo) R.string.composer_object_editor_adjust_compare_hint_video else R.string.composer_object_editor_adjust_compare_hint)
    val original = stringResource(if (isVideo) R.string.composer_object_editor_adjust_original_video else R.string.composer_object_editor_adjust_original)
    val view = LocalView.current
    val current by rememberUpdatedState(onCompare)
    var comparing by remember { mutableStateOf(false) }
    val hold = {
        if (!comparing) {
            comparing = true
            current(true)
            view.announceForAccessibility(original)
        }
    }
    val release = {
        if (comparing) {
            comparing = false
            current(false)
        }
    }
    DisposableEffect(Unit) { onDispose { if (comparing) current(false) } }
    ActionCapsule(
        label = label,
        icon = MeeshyIcons.VerticalSplit,
        highlighted = comparing,
        accent = accent,
        modifier = Modifier
            .testTag("adjust-compare")
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    hold()
                    waitForUpOrCancellation()
                    release()
                }
            }
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
                selected = comparing
                onClick(label = hint) {
                    if (comparing) release() else hold()
                    true
                }
            },
    )
}

@Composable
private fun ActionCapsule(label: String, icon: ImageVector, highlighted: Boolean, accent: Color, modifier: Modifier = Modifier) {
    val tint = if (highlighted) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = modifier
            .defaultMinSize(minHeight = 48.dp)
            .background(if (highlighted) accent else MaterialTheme.colorScheme.surfaceContainerHighest, CircleShape)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        Text(text = label, style = MaterialTheme.typography.labelLarge, color = tint, maxLines = 1)
    }
}

/** Le curseur du réglage choisi et sa valeur lue ; toucher deux fois la valeur (ou l'action d'accessibilité) le remet au neutre. */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
private fun AdjustmentSlider(kind: AdjustmentKind, value: Float, accent: Color, onChange: (Float) -> Unit) {
    val label = stringResource(kind.labelRes())
    val reset = stringResource(R.string.composer_object_editor_adjust_reset)
    val read = ComposerAdjustReading.displayValue(kind, value)
    val text = ComposerAdjustReading.signed(read)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = kind.range,
            colors = SliderDefaults.colors(thumbColor = accent, activeTrackColor = accent),
            modifier = Modifier
                .weight(1f)
                .defaultMinSize(minHeight = 48.dp)
                .testTag("adjust-slider")
                .semantics {
                    contentDescription = label
                    stateDescription = text
                    customActions = listOf(CustomAccessibilityAction(reset) { onChange(kind.neutral); true })
                },
        )
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = if (read == 0) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            modifier = Modifier
                .testTag("adjust-value")
                .semantics { invisibleToUser() }
                .defaultMinSize(minWidth = 40.dp, minHeight = 48.dp)
                .pointerInput(kind) { detectTapGestures(onDoubleTap = { onChange(kind.neutral) }) },
        )
    }
}

@Composable
private fun KindChip(kind: AdjustmentKind, value: Float, chosen: Boolean, adjusted: Boolean, accent: Color, onClick: () -> Unit) {
    val label = stringResource(kind.labelRes())
    val read = ComposerAdjustReading.signed(ComposerAdjustReading.displayValue(kind, value))
    val tint = if (chosen) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier = Modifier
            .testTag("adjust-kind-${kind.wireName}")
            .defaultMinSize(minWidth = 56.dp, minHeight = 56.dp)
            .background(
                if (chosen) accent else MaterialTheme.colorScheme.surfaceContainerHigh,
                RoundedCornerShape(12.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                selected = chosen
                contentDescription = label
                stateDescription = read
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Box {
            Icon(imageVector = kind.glyph(), contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            if (adjusted) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .size(5.dp)
                        .background(tint, CircleShape),
                )
            }
        }
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = tint, maxLines = 1)
    }
}

/** Le glyphe d'un réglage (iOS `AdjustmentKind.icon`), pris parmi les rôles de [MeeshyIcons]. */
private fun AdjustmentKind.glyph(): ImageVector = when (this) {
    AdjustmentKind.EXPOSURE -> MeeshyIcons.Brightness
    AdjustmentKind.BRIGHTNESS -> MeeshyIcons.BrightnessFilled
    AdjustmentKind.CONTRAST -> MeeshyIcons.Layers
    AdjustmentKind.SATURATION -> MeeshyIcons.Palette
    AdjustmentKind.VIBRANCE -> MeeshyIcons.Sparkles
    AdjustmentKind.TEMPERATURE -> MeeshyIcons.Flame
    AdjustmentKind.SHARPNESS -> MeeshyIcons.MagicWand
    AdjustmentKind.BLUR -> MeeshyIcons.Cloud
    AdjustmentKind.VIGNETTE -> MeeshyIcons.PhotoFilter
    AdjustmentKind.BLOOM -> MeeshyIcons.Bolt
    AdjustmentKind.GRAIN -> MeeshyIcons.GridView
}

@StringRes
internal fun AdjustmentKind.labelRes(): Int = when (this) {
    AdjustmentKind.EXPOSURE -> R.string.composer_object_editor_adjust_exposure
    AdjustmentKind.BRIGHTNESS -> R.string.composer_object_editor_adjust_brightness
    AdjustmentKind.CONTRAST -> R.string.composer_object_editor_adjust_contrast
    AdjustmentKind.SATURATION -> R.string.composer_object_editor_adjust_saturation
    AdjustmentKind.VIBRANCE -> R.string.composer_object_editor_adjust_vibrance
    AdjustmentKind.TEMPERATURE -> R.string.composer_object_editor_adjust_temperature
    AdjustmentKind.SHARPNESS -> R.string.composer_object_editor_adjust_sharpness
    AdjustmentKind.BLUR -> R.string.composer_object_editor_adjust_blur
    AdjustmentKind.VIGNETTE -> R.string.composer_object_editor_adjust_vignette
    AdjustmentKind.BLOOM -> R.string.composer_object_editor_effects_bloom
    AdjustmentKind.GRAIN -> R.string.composer_object_editor_effects_grain
}
