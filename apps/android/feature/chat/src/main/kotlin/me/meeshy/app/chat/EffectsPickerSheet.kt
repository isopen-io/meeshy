package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BlurOn
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Celebration
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Gradient
import androidx.compose.material.icons.filled.Grain
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.LooksOne
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material.icons.filled.ZoomOutMap
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MessageEffectOption
import me.meeshy.sdk.model.MessageEffectSection
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsPickerPresenter
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Composer effects picker — the thin, coverage-exempt Compose glue over the pure
 * [MessageEffectsPickerPresenter]. Renders the three sections of effect chips, the
 * ephemeral-duration row (only when the presenter says so), and the active summary,
 * forwarding every tap to the ViewModel's [MessageEffectsEditor]-backed intents.
 * Parité iOS `EffectsPickerView` (chips capsule, accent-tinted when active).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun EffectsPickerSheet(
    effects: MessageEffects,
    accentColor: Color,
    onToggle: (Long) -> Unit,
    onSelectDuration: (EphemeralDuration) -> Unit,
    onClear: () -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val presentation = MessageEffectsPickerPresenter.build(effects)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 520.dp)
            .verticalScroll(rememberScrollState())
            .padding(bottom = MeeshySpacing.xl),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.chat_effects_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.chat_effects_done),
                style = MaterialTheme.typography.labelLarge,
                color = accentColor,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onDone).padding(MeeshySpacing.xs),
            )
        }

        presentation.sections.forEach { section ->
            Text(
                text = stringResource(effectSectionLabel(section.section)),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(
                    start = MeeshySpacing.lg,
                    end = MeeshySpacing.lg,
                    top = MeeshySpacing.md,
                    bottom = MeeshySpacing.xs,
                ),
            )
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                section.options.forEach { optionState ->
                    EffectChip(
                        icon = effectIcon(optionState.option),
                        label = stringResource(effectOptionLabel(optionState.option)),
                        isActive = optionState.isActive,
                        accentColor = accentColor,
                        onClick = { onToggle(optionState.option.flag) },
                    )
                }
            }
        }

        if (presentation.showEphemeralDuration) {
            Text(
                text = stringResource(R.string.chat_effects_ephemeral_duration),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(
                    start = MeeshySpacing.lg,
                    end = MeeshySpacing.lg,
                    top = MeeshySpacing.md,
                    bottom = MeeshySpacing.xs,
                ),
            )
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                presentation.ephemeralDurations.forEach { durationState ->
                    EffectChip(
                        icon = null,
                        label = stringResource(ephemeralDurationLabel(durationState.duration)),
                        isActive = durationState.isSelected,
                        accentColor = accentColor,
                        onClick = { onSelectDuration(durationState.duration) },
                    )
                }
            }
        }

        if (presentation.showSummary) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.chat_effects_active_count, presentation.activeCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(R.string.chat_effects_clear_all),
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.error,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable(onClick = onClear).padding(MeeshySpacing.xs),
                )
            }
        }
    }
}

@Composable
private fun EffectChip(
    icon: ImageVector?,
    label: String,
    isActive: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val activeLabel = stringResource(
        if (isActive) R.string.chat_effects_active else R.string.chat_effects_inactive,
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(CircleShape)
            .background(
                if (isActive) accentColor.copy(alpha = 0.2f)
                else MeeshyTheme.tokens.backgroundTertiary,
            )
            .border(
                width = 1.dp,
                color = if (isActive) accentColor.copy(alpha = 0.5f) else Color.Transparent,
                shape = CircleShape,
            )
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "$label, $activeLabel"
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isActive) accentColor else MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(16.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (isActive) accentColor else MeeshyTheme.tokens.textSecondary,
        )
    }
}

private fun effectSectionLabel(section: MessageEffectSection): Int = when (section) {
    MessageEffectSection.BEHAVIOR -> R.string.chat_effects_section_behavior
    MessageEffectSection.ENTRY -> R.string.chat_effects_section_entry
    MessageEffectSection.PERMANENT -> R.string.chat_effects_section_permanent
}

private fun effectOptionLabel(option: MessageEffectOption): Int = when (option) {
    MessageEffectOption.EPHEMERAL -> R.string.chat_effect_ephemeral
    MessageEffectOption.BLURRED -> R.string.chat_effect_blurred
    MessageEffectOption.VIEW_ONCE -> R.string.chat_effect_view_once
    MessageEffectOption.SHAKE -> R.string.chat_effect_shake
    MessageEffectOption.ZOOM -> R.string.chat_effect_zoom
    MessageEffectOption.EXPLODE -> R.string.chat_effect_explode
    MessageEffectOption.CONFETTI -> R.string.chat_effect_confetti
    MessageEffectOption.FIREWORKS -> R.string.chat_effect_fireworks
    MessageEffectOption.WAOO -> R.string.chat_effect_waoo
    MessageEffectOption.GLOW -> R.string.chat_effect_glow
    MessageEffectOption.PULSE -> R.string.chat_effect_pulse
    MessageEffectOption.RAINBOW -> R.string.chat_effect_rainbow
    MessageEffectOption.SPARKLE -> R.string.chat_effect_sparkle
}

private fun effectIcon(option: MessageEffectOption): ImageVector = when (option) {
    MessageEffectOption.EPHEMERAL -> Icons.Filled.HourglassEmpty
    MessageEffectOption.BLURRED -> Icons.Filled.BlurOn
    MessageEffectOption.VIEW_ONCE -> Icons.Filled.LooksOne
    MessageEffectOption.SHAKE -> Icons.Filled.Vibration
    MessageEffectOption.ZOOM -> Icons.Filled.ZoomOutMap
    MessageEffectOption.EXPLODE -> Icons.Filled.Grain
    MessageEffectOption.CONFETTI -> Icons.Filled.Celebration
    MessageEffectOption.FIREWORKS -> Icons.Filled.AutoAwesome
    MessageEffectOption.WAOO -> Icons.Filled.Star
    MessageEffectOption.GLOW -> Icons.Filled.WbSunny
    MessageEffectOption.PULSE -> Icons.Filled.Favorite
    MessageEffectOption.RAINBOW -> Icons.Filled.Gradient
    MessageEffectOption.SPARKLE -> Icons.Filled.Bolt
}

private fun ephemeralDurationLabel(duration: EphemeralDuration): Int = when (duration) {
    EphemeralDuration.THIRTY_SECONDS -> R.string.chat_effect_duration_30s
    EphemeralDuration.ONE_MINUTE -> R.string.chat_effect_duration_1m
    EphemeralDuration.FIVE_MINUTES -> R.string.chat_effect_duration_5m
    EphemeralDuration.ONE_HOUR -> R.string.chat_effect_duration_1h
    EphemeralDuration.TWENTY_FOUR_HOURS -> R.string.chat_effect_duration_24h
}
