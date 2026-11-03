package me.meeshy.app.chat

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.animation.animateColorAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MessageEffectOption
import me.meeshy.sdk.model.MessageEffectSection
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsEditor
import me.meeshy.sdk.model.MessageEffectsPickerPresenter
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le petit panneau des effets du message, ancré au-dessus de la barre d'outils du composeur
 * (iOS `EffectsPickerView`, #7967) : deux rangées de capsules défilantes — Animation d'entrée,
 * Effet permanent — qu'un tap arme ou désarme, et « Tout effacer » qui ne retire que les
 * drapeaux du panneau. Les protections (éphémère, flou, vue unique) n'y figurent pas.
 */
@Composable
internal fun MessageEffectsPanel(
    effects: MessageEffects,
    accentColor: Color,
    onToggle: (Long) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
    sections: Set<MessageEffectSection> = MessageEffectSection.entries.toSet(),
) {
    val rows = MessageEffectsPickerPresenter.panel(effects).filter { it.section in sections }
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (MeeshyTheme.isDark) Color.Black.copy(alpha = 0.3f) else Color.White.copy(alpha = 0.9f))
            .border(1.dp, accentColor.copy(alpha = MeeshyOpacity.light), shape)
            .padding(vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        rows.forEachIndexed { index, row ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(sectionTitle(row.section)),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                if (index == 0) {
                    AnimatedVisibility(
                        visible = MessageEffectsEditor.hasPanelEffect(effects),
                        enter = fadeIn(),
                        exit = fadeOut(),
                    ) {
                        val haptics = rememberMeeshyHaptics()
                        Text(
                            text = stringResource(R.string.chat_effects_panel_clear_all),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MeeshyTheme.tokens.error.copy(alpha = MeeshyOpacity.intense),
                            modifier = Modifier
                                .heightIn(min = 48.dp)
                                .clickable(role = Role.Button) {
                                    haptics.light()
                                    onClear()
                                }
                                .padding(horizontal = MeeshySpacing.xs)
                                .semantics(mergeDescendants = true) {},
                        )
                    }
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                row.options.forEach { state ->
                    PanelEffectChip(
                        icon = panelEffectIcon(state.option),
                        label = stringResource(panelEffectLabel(state.option)),
                        isActive = state.isActive,
                        accentColor = accentColor,
                        onClick = { onToggle(state.option.flag) },
                    )
                }
            }
        }
    }
}

@Composable
private fun PanelEffectChip(
    icon: ImageVector,
    label: String,
    isActive: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val stateLabel = stringResource(if (isActive) R.string.chat_effects_active else R.string.chat_effects_inactive)
    val background by animateColorAsState(
        targetValue = if (isActive) accentColor else accentColor.copy(alpha = MeeshyOpacity.subtle),
        animationSpec = spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMedium),
        label = "effectChipBackground",
    )
    val content = if (isActive) Color.White else accentColor
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(background)
            .border(1.dp, accentColor.copy(alpha = MeeshyOpacity.medium), CircleShape)
            .clickable(role = Role.Button) {
                haptics.light()
                onClick()
            }
            .semantics(mergeDescendants = true) {
                selected = isActive
                contentDescription = "$label, $stateLabel"
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = content, modifier = Modifier.size(14.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = content,
        )
    }
}

private fun sectionTitle(section: MessageEffectSection): Int = when (section) {
    MessageEffectSection.PERMANENT -> R.string.chat_effects_panel_section_permanent
    else -> R.string.chat_effects_panel_section_entry
}

private fun panelEffectLabel(option: MessageEffectOption): Int = when (option) {
    MessageEffectOption.SHAKE -> R.string.chat_effects_panel_shake
    MessageEffectOption.ZOOM -> R.string.chat_effects_panel_zoom
    MessageEffectOption.EXPLODE -> R.string.chat_effects_panel_explode
    MessageEffectOption.CONFETTI -> R.string.chat_effects_panel_confetti
    MessageEffectOption.FIREWORKS -> R.string.chat_effects_panel_fireworks
    MessageEffectOption.WAOO -> R.string.chat_effects_panel_waoo
    MessageEffectOption.GLOW -> R.string.chat_effects_panel_glow
    MessageEffectOption.PULSE -> R.string.chat_effects_panel_pulse
    MessageEffectOption.RAINBOW -> R.string.chat_effects_panel_rainbow
    MessageEffectOption.SPARKLE -> R.string.chat_effects_panel_sparkle
    MessageEffectOption.EPHEMERAL -> R.string.chat_effect_ephemeral
    MessageEffectOption.BLURRED -> R.string.chat_effect_blurred
    MessageEffectOption.VIEW_ONCE -> R.string.chat_effect_view_once
}

private fun panelEffectIcon(option: MessageEffectOption): ImageVector = when (option) {
    MessageEffectOption.SHAKE -> MeeshyIcons.Vibration
    MessageEffectOption.ZOOM -> MeeshyIcons.ZoomOutMap
    MessageEffectOption.EXPLODE -> MeeshyIcons.Grain
    MessageEffectOption.CONFETTI -> MeeshyIcons.Celebration
    MessageEffectOption.FIREWORKS -> MeeshyIcons.Sparkles
    MessageEffectOption.WAOO -> MeeshyIcons.StarFilled
    MessageEffectOption.GLOW -> MeeshyIcons.WbSunny
    MessageEffectOption.PULSE -> MeeshyIcons.HeartFilled
    MessageEffectOption.RAINBOW -> MeeshyIcons.Gradient
    MessageEffectOption.SPARKLE -> MeeshyIcons.Bolt
    else -> MeeshyIcons.StarFilled
}

internal fun ephemeralDurationLabel(duration: EphemeralDuration): Int = when (duration) {
    EphemeralDuration.FIFTEEN_SECONDS -> R.string.chat_effect_duration_15s
    EphemeralDuration.THIRTY_SECONDS -> R.string.chat_effect_duration_30s
    EphemeralDuration.ONE_MINUTE -> R.string.chat_effect_duration_1m
    EphemeralDuration.FIVE_MINUTES -> R.string.chat_effect_duration_5m
    EphemeralDuration.ONE_HOUR -> R.string.chat_effect_duration_1h
    EphemeralDuration.TWENTY_FOUR_HOURS -> R.string.chat_effect_duration_24h
}
