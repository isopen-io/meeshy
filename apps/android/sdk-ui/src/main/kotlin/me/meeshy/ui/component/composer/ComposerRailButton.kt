package me.meeshy.ui.component.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
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
) {
    Box(
        modifier = modifier
            .size(ComposerPlateauInk.HIT_TARGET_DP.dp)
            .clip(CircleShape)
            .background(if (active) ComposerPlateauInk.accent.copy(alpha = 0.22f) else Color.Transparent)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = label
                selected = active
                if (!enabled) disabled()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = when {
                !enabled -> ComposerPlateauInk.secondary.copy(alpha = 0.4f)
                active -> ComposerPlateauInk.accent
                else -> ComposerPlateauInk.primary
            },
        )
    }
}
