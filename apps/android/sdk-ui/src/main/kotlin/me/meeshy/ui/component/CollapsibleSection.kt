package me.meeshy.ui.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * A collapsible list section (parity plan §4.4) — the port of the iOS conversation-list
 * groups (Épingles / dossiers / Mes conversations). The header shows a coloured rounded
 * icon chip, the title, a count pill, and a chevron that rotates as the section opens;
 * the body reveals its child rows with a size animation.
 *
 * SDK-pure: the icon and the rows are opaque slots, the accent is a plain [Color], and
 * the component owns only its own expand/collapse UI state. The product decision of what
 * a section contains stays app-side.
 */
@Composable
public fun CollapsibleSection(
    title: String,
    modifier: Modifier = Modifier,
    iconContainerColor: Color = MeeshyPalette.Indigo500,
    count: Int = 0,
    initiallyExpanded: Boolean = true,
    icon: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    var expanded by rememberSaveable { mutableStateOf(initiallyExpanded) }
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 0f else -90f,
        label = "collapsible-chevron",
    )
    val tokens = MeeshyTheme.tokens

    Column(modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .clickable { expanded = !expanded }
                .padding(vertical = MeeshySpacing.sm, horizontal = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(MeeshyRadius.sm))
                        .background(iconContainerColor),
                    contentAlignment = Alignment.Center,
                    content = { icon() },
                )
                Spacer(Modifier.width(MeeshySpacing.md))
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            if (count > 0) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(tokens.backgroundTertiary)
                        .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                ) {
                    Text(
                        text = count.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                    )
                }
                Spacer(Modifier.width(MeeshySpacing.sm))
            }
            Icon(
                imageVector = Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
                tint = tokens.textMuted,
                modifier = Modifier.rotate(chevronRotation),
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(content = content)
        }
    }
}
