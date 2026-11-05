package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPanelLaw
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.VideoFilterSlider
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import kotlin.math.roundToInt

/**
 * Le panneau « Filtres vidéo » en verre sombre au-dessus des contrôles d'appel (iOS `VideoFiltersPanel`) :
 * en-tête + « Réinitialiser », puces de préréglages (la courante en accent), flou d'arrière-plan et son rayon,
 * teint naturel avec son indice, lissage de la peau, puis les cinq curseurs de colorimétrie. Pur : l'état est
 * [config], chaque geste rend une nouvelle configuration par [onConfigChange] ; [isAutoDegraded] affiche
 * l'indicateur « Performance réduite » quand l'appareil se protège.
 */
@Composable
internal fun VideoFiltersPanel(
    config: VideoFilterConfig,
    isAutoDegraded: Boolean,
    onConfigChange: (VideoFilterConfig) -> Unit,
    modifier: Modifier = Modifier,
) {
    MeeshyGlassSurface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(MeeshyRadius.lg), tint = CallPalette.Deep) {
        Column(Modifier.padding(MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            PanelHeader(showsReset = VideoFilterPanelLaw.showsReset(config)) {
                onConfigChange(VideoFilterPanelLaw.resetLook(config))
            }
            PresetChips(config, onConfigChange)
            AdvancedToggles(config, onConfigChange)
            ColorSliders(config, onConfigChange)
            if (isAutoDegraded) PerformanceIndicator()
        }
    }
}

@Composable
private fun PanelHeader(showsReset: Boolean, onReset: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Icon(MeeshyIcons.Tune, contentDescription = null, tint = CallPalette.Brand, modifier = Modifier.size(18.dp))
        Text(
            stringResource(R.string.video_filter_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            modifier = Modifier.weight(1f),
        )
        if (showsReset) {
            Text(
                stringResource(R.string.video_filter_reset),
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyPalette.Error,
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClick = onReset)
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
            )
        }
    }
}

@Composable
private fun PresetChips(config: VideoFilterConfig, onChange: (VideoFilterConfig) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        VideoFilterPreset.entries.forEach { preset ->
            val isActive = VideoFilterPanelLaw.isSelected(config, preset) && config.isEnabled
            val shape = CircleShape
            Text(
                stringResource(presetName(preset)),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = if (isActive) MeeshyPalette.Indigo300 else CallPalette.InkSecondary,
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .clip(shape)
                    .background(if (isActive) MeeshyPalette.Indigo500.copy(alpha = 0.25f) else CallPalette.Ink.copy(alpha = 0.08f))
                    .border(1.dp, if (isActive) MeeshyPalette.Indigo500.copy(alpha = 0.6f) else androidx.compose.ui.graphics.Color.Transparent, shape)
                    .clickable(role = Role.Tab) { onChange(config.applyingPreset(preset)) }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md)
                    .semantics { selected = isActive },
            )
        }
    }
}

@Composable
private fun AdvancedToggles(config: VideoFilterConfig, onChange: (VideoFilterConfig) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        ToggleRow(
            icon = MeeshyIcons.PersonBackgroundDotted,
            title = stringResource(R.string.video_filter_backgroundBlur),
            hint = null,
            checked = config.backgroundBlurEnabled,
            onCheckedChange = { onChange(config.copy(backgroundBlurEnabled = it)) },
        )
        if (config.backgroundBlurEnabled) {
            val radius = config.backgroundBlurRadius.roundToInt()
            PanelSlider(
                label = stringResource(R.string.video_filter_radius),
                value = config.backgroundBlurRadius.toFloat(),
                range = VideoFilterPanelLaw.BLUR_RADIUS_MIN..VideoFilterPanelLaw.BLUR_RADIUS_MAX,
                valueText = radius.toString(),
                onChange = { onChange(VideoFilterPanelLaw.withBlurRadius(config, it)) },
                modifier = Modifier.padding(start = MeeshySpacing.xl),
            )
        }
        ToggleRow(
            icon = MeeshyIcons.Sparkles,
            title = stringResource(R.string.video_filter_naturalComplexion),
            hint = stringResource(R.string.video_filter_naturalComplexion_hint),
            checked = config.naturalComplexionEnabled,
            onCheckedChange = { onChange(config.copy(naturalComplexionEnabled = it)) },
        )
    }
}

@Composable
private fun ToggleRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, hint: String?, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = CallPalette.Brand, modifier = Modifier.size(18.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = CallPalette.Ink)
            if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = CallPalette.InkSecondary)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(checkedTrackColor = MeeshyPalette.Indigo500),
            modifier = Modifier.semantics {
                contentDescription = title
                hint?.let { stateDescription = it }
            },
        )
    }
}

@Composable
private fun ColorSliders(config: VideoFilterConfig, onChange: (VideoFilterConfig) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        VideoFilterSlider.entries.forEach { slider ->
            PanelSlider(
                label = stringResource(sliderName(slider)),
                value = slider.valueOf(config),
                range = slider.range,
                valueText = slider.displayOf(config),
                onChange = { onChange(slider.applying(config, it)) },
            )
        }
    }
}

@Composable
private fun PanelSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    valueText: String,
    onChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = CallPalette.InkSecondary, modifier = Modifier.width(88.dp))
        Slider(
            value = value.coerceIn(range.start, range.endInclusive),
            onValueChange = onChange,
            valueRange = range,
            colors = SliderDefaults.colors(thumbColor = MeeshyPalette.Indigo500, activeTrackColor = MeeshyPalette.Indigo500),
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .semantics {
                    contentDescription = label
                    stateDescription = valueText
                },
        )
        Text(
            valueText,
            style = MaterialTheme.typography.labelSmall,
            color = CallPalette.InkSecondary,
            modifier = Modifier.width(40.dp),
        )
    }
}

@Composable
private fun PerformanceIndicator() {
    Row(
        Modifier
            .clip(CircleShape)
            .background(MeeshyPalette.Warning.copy(alpha = 0.12f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(12.dp))
        Text(
            stringResource(R.string.video_filter_performanceDegraded),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyPalette.Warning,
        )
    }
}

private fun presetName(preset: VideoFilterPreset): Int = when (preset) {
    VideoFilterPreset.Natural -> R.string.video_filter_preset_natural
    VideoFilterPreset.Warm -> R.string.video_filter_preset_warm
    VideoFilterPreset.Cool -> R.string.video_filter_preset_cool
    VideoFilterPreset.Vivid -> R.string.video_filter_preset_vivid
    VideoFilterPreset.Muted -> R.string.video_filter_preset_muted
}

private fun sliderName(slider: VideoFilterSlider): Int = when (slider) {
    VideoFilterSlider.Temperature -> R.string.video_filter_temperature
    VideoFilterSlider.Brightness -> R.string.video_filter_brightness
    VideoFilterSlider.Contrast -> R.string.video_filter_contrast
    VideoFilterSlider.Saturation -> R.string.video_filter_saturation
    VideoFilterSlider.Exposure -> R.string.video_filter_exposure
}
