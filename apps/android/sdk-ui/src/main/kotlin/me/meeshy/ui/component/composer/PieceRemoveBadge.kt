package me.meeshy.ui.component.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.icons.MeeshyIcons

/** Geometry of the remove badge of a pending piece (iOS `ComposerAttachmentRemoveBadge`, a disc riding the corner). */
public object PieceRemoveBadgeGeometry {
    /** The real touch target, laid out at its full size: a phone does not widen it when something lies behind. */
    public val Target: Dp = 44.dp

    /** How far the target reaches past the tile's end edge: the room a host leaves after each tile. */
    public val ReachEnd: Dp = 28.dp

    /** How far the target reaches past the tile's top edge: the room a host leaves above its tiles. */
    public val ReachTop: Dp = 20.dp

    /** The disc's centre sits this far inside the tile's top-end corner, on each axis: it rides the corner. */
    public val DiscInset: Dp = 2.dp

    public val DiscDefault: Dp = 20.dp
}

/**
 * The ✕ of a piece waiting in a composer's tray (#15229): a round disc riding the tile's top-end corner, and a 44 dp
 * target that grows OUTWARD from it — up and towards the end — and only covers the tile's corner strip, never its
 * centre: a tap on the tile edits it, only the corner removes it. Apply it with `Modifier.align(Alignment.TopEnd)`
 * inside the tile's box; the host leaves [PieceRemoveBadgeGeometry.ReachTop] above and
 * [PieceRemoveBadgeGeometry.ReachEnd] after each tile so the target stays on its own surface. TalkBack reads it as its
 * own button, [label].
 */
@Composable
public fun PieceRemoveBadge(
    label: String,
    onClick: () -> Unit,
    discColor: Color,
    modifier: Modifier = Modifier,
    discSize: Dp = PieceRemoveBadgeGeometry.DiscDefault,
    glyphSize: Dp = 12.dp,
    glyphColor: Color = Color.White,
) {
    val g = PieceRemoveBadgeGeometry
    val discCentreX = g.Target - g.ReachEnd - g.DiscInset
    val discCentreY = g.ReachTop + g.DiscInset
    Box(
        modifier = modifier
            .offset(x = g.ReachEnd, y = -g.ReachTop)
            .size(g.Target)
            .clickable(
                interactionSource = null,
                indication = ripple(bounded = false, radius = discSize),
                onClickLabel = label,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics {
                contentDescription = label
                role = Role.Button
            },
        contentAlignment = Alignment.TopStart,
    ) {
        Box(
            Modifier
                .offset(x = discCentreX - discSize / 2, y = discCentreY - discSize / 2)
                .size(discSize)
                .clip(CircleShape)
                .background(discColor),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Close, contentDescription = null, tint = glyphColor, modifier = Modifier.size(glyphSize))
        }
    }
}
