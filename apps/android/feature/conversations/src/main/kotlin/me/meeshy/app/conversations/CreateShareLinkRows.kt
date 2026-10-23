package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val DISABLED_ROW_ALPHA = 0.4f
private const val BADGE_FILL_ALPHA = 0.15f

/** A titled form block (iOS `formSection`): header with icon, optional subtitle, rounded card of rows. */
@Composable
internal fun FormSection(
    title: String,
    icon: ImageVector,
    accent: Color,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    content: @Composable () -> Unit,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
            Text(
                text = title.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        subtitle?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.padding(horizontal = MeeshySpacing.md),
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.surfaceFill)
                .border(1.dp, MeeshyTheme.tokens.hairline, RoundedCornerShape(MeeshyRadius.md)),
        ) { content() }
    }
}

@Composable
internal fun FormDivider() {
    HorizontalDivider(color = MeeshyTheme.tokens.hairline)
}

/** The tinted square carrying a row's glyph (iOS `iconBadge`). Decorative: hidden from TalkBack. */
@Composable
internal fun IconBadge(icon: ImageVector, color: Color) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(MeeshyRadius.xs))
            .background(color.copy(alpha = BADGE_FILL_ALPHA))
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
    }
}

/**
 * A rule switch with a badge, a name and an explanatory subtitle (iOS `ruleToggle`).
 * The whole row toggles and is announced as one switch carrying name + subtitle.
 */
@Composable
internal fun RuleToggleRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    iconColor: Color,
    accent: Color,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else DISABLED_ROW_ALPHA)
            .heightIn(min = 56.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            )
            .semantics { contentDescription = "$title. $subtitle" }
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        IconBadge(icon, iconColor)
        RowTexts(title = title, subtitle = subtitle, subtitleColor = MeeshyTheme.tokens.textSecondary, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = accent),
        )
    }
}

@Composable
internal fun RowTexts(
    title: String,
    subtitle: String,
    subtitleColor: Color,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = subtitleColor)
    }
}

/** A tappable row opening a picker: used for the conversation chooser. */
@Composable
internal fun ChooserRow(
    onClickLabel: String,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clickable(onClickLabel = onClickLabel, role = Role.Button, onClick = onClick)
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) { content() }
}
