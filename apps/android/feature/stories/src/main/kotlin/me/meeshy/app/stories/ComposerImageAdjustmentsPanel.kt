package me.meeshy.app.stories

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments

/**
 * Le panneau de curseurs du média sélectionné : il écrit les [ImageAdjustments] de l'objet, et le
 * même rendu (`SceneLookChain` / `SceneLookBaker`) sert l'aperçu, la couverture et l'export. Une
 * vidéo ne montre que les réglages qu'elle peint ([AdjustmentKind.isServedForVideo]). L'accent est
 * un PARAMÈTRE (couleur de contexte), jamais une couleur écrite ici. Toucher le libellé d'un réglage
 * actif le remet au neutre.
 */
@Composable
internal fun ComposerImageAdjustmentsPanel(
    adjustments: ImageAdjustments,
    isVideo: Boolean,
    accent: Color,
    onAdjust: (AdjustmentKind, Float) -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val kinds = AdjustmentKind.entries.filter { !isVideo || it.isServedForVideo }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onReset, enabled = !adjustments.isNeutral) {
                Text(stringResource(R.string.composer_object_editor_adjust_reset))
            }
        }
        kinds.forEach { kind ->
            AdjustmentSliderRow(
                kind = kind,
                value = adjustments[kind],
                active = adjustments.isActive(kind),
                accent = accent,
                onChange = { onAdjust(kind, it) },
            )
        }
    }
}

@Composable
private fun AdjustmentSliderRow(
    kind: AdjustmentKind,
    value: Float,
    active: Boolean,
    accent: Color,
    onChange: (Float) -> Unit,
) {
    val label = stringResource(kind.labelRes())
    val shown = "%.2f".format(value)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { stateDescription = "$label $shown" },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = if (active) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp)
                    .clickable(enabled = active) { onChange(kind.neutral) }
                    .padding(vertical = 12.dp),
            )
            Text(text = shown, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = kind.range,
            colors = SliderDefaults.colors(thumbColor = accent, activeTrackColor = accent),
        )
    }
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
