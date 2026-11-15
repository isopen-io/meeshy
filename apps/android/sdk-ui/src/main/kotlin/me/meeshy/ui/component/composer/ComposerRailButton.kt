package me.meeshy.ui.component.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.ComposerPlateauInk

/**
 * One door of a plateau rail: a 44 dp frame (the target) around a glyph, drawn in the plateau's DARK inks whatever
 * the app theme. [active] tints it with the accent when its tool is open or its value is set; a door that cannot act
 * is [enabled]=false and dims — it is never removed by the control itself (the plan decides what is offered).
 */
@Composable
public fun ComposerRailButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    active: Boolean = false,
    badge: ComposerRailBadge? = null,
) {
    ComposerRailButton(label = label, onClick = onClick, modifier = modifier, enabled = enabled, active = active, badge = badge) { ink ->
        Icon(imageVector = icon, contentDescription = null, tint = ink)
    }
}

/**
 * What a door ALREADY carries (iOS `ComposerRailDoorBadge`): a counter laid over the corner of its glyph, so the author
 * sees that the scene holds three texts without opening the door. [description] is what a screen reader says of it.
 */
public data class ComposerRailBadge(val count: Int, val description: String)

/** The same door with a glyph of its own (a language flag is text, not a vector); [glyph] receives the ink to use. */
@Composable
public fun ComposerRailButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    active: Boolean = false,
    badge: ComposerRailBadge? = null,
    glyph: @Composable (ink: Color) -> Unit,
) {
    val shown = badge?.takeIf { it.count > 0 }
    Box(modifier = modifier.size(ComposerPlateauInk.HIT_TARGET_DP.dp)) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(CircleShape)
                .background(if (active) ComposerPlateauInk.accent.copy(alpha = 0.22f) else Color.Transparent)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .semantics {
                    contentDescription = label
                    selected = active
                    shown?.let { stateDescription = it.description }
                    if (!enabled) disabled()
                },
            contentAlignment = Alignment.Center,
        ) {
            glyph(
                when {
                    !enabled -> ComposerPlateauInk.secondary.copy(alpha = 0.4f)
                    active -> ComposerPlateauInk.accent
                    else -> ComposerPlateauInk.primary
                },
            )
        }
        shown?.let { RailBadge(it.count, Modifier.align(Alignment.TopEnd)) }
    }
}

@Composable
private fun RailBadge(count: Int, modifier: Modifier) {
    Box(
        modifier = modifier
            .clearAndSetSemantics {}
            .defaultMinSize(minWidth = BADGE_HEIGHT_DP.dp, minHeight = BADGE_HEIGHT_DP.dp)
            .background(ComposerPlateauInk.accent, CircleShape)
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (count > BADGE_CEILING) "$BADGE_CEILING+" else count.toString(),
            color = ComposerPlateauInk.onAccent,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
    }
}

private const val BADGE_HEIGHT_DP = 16
private const val BADGE_CEILING = 99
