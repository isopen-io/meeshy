package me.meeshy.ui.component.composer

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Geometry of the slide rail (iOS `ComposerSlideRail`): a 9:16 tile, 44 dp high — shared by the story, the post and the reel. */
public object SlideRailGeometry {
    public const val TILE_HEIGHT_DP: Int = 44
    public const val SCENE_ASPECT: Float = 9f / 16f
    public const val DELETE_TARGET_DP: Int = 28
    public const val DELETE_GLYPH_DP: Int = 16
    public val TileWidth: Dp = (TILE_HEIGHT_DP * SCENE_ASPECT).dp
    public val TileHeight: Dp = TILE_HEIGHT_DP.dp
    public val RingCurrent: Dp = 1.5.dp
    public val RingIdle: Dp = 0.5.dp
}

/**
 * The one tile of every slide rail. The host owns the DATA (what a tile shows, what the gestures mean); the tile owns what
 * must read the same everywhere: the geometry, the ring that eases between the current tile and the others, the bin on the
 * current tile (a 28 dp target around a 16 dp glyph), the haptics (a tick when a tile becomes current, a light tap on the
 * bin) and the TalkBack node ("Scene i of n", selected, the host's custom actions).
 *
 * [tileModifier] lands BEFORE the click, so a host can carry a drag gesture (the story's long press) without losing the tap.
 * [actions] is the complete list of TalkBack actions — the bin is a separate target and is not added for the host.
 * [content] fills the 9:16 frame (a thumbnail, a placeholder, a menu anchored on the tile).
 */
@Composable
public fun SlideRailTile(
    position: String,
    deleteLabel: String,
    isCurrent: Boolean,
    navigates: Boolean,
    showsBin: Boolean,
    onSelect: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    tileModifier: Modifier = Modifier,
    actions: List<CustomAccessibilityAction> = emptyList(),
    content: @Composable BoxScope.() -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val select by rememberUpdatedState(onSelect)
    val delete by rememberUpdatedState(onDelete)
    val ringColor by animateColorAsState(
        if (isCurrent) MaterialTheme.colorScheme.primary else LocalContentColor.current.copy(alpha = 0.25f),
        label = "slideRailRing",
    )
    val ringWidth by animateDpAsState(if (isCurrent) SlideRailGeometry.RingCurrent else SlideRailGeometry.RingIdle, label = "slideRailRingWidth")
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(width = SlideRailGeometry.TileWidth, height = SlideRailGeometry.TileHeight)
                .clip(RoundedCornerShape(MeeshyRadius.xxs))
                .border(ringWidth, ringColor, RoundedCornerShape(MeeshyRadius.xxs))
                .then(tileModifier)
                .clickable(enabled = navigates, role = Role.Button) {
                    if (!isCurrent) haptics.selection()
                    select()
                }
                .clearAndSetSemantics {
                    contentDescription = position
                    selected = isCurrent
                    if (navigates) role = Role.Button
                    customActions = actions
                },
            content = content,
        )
        if (showsBin) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = MeeshySpacing.xs, y = -MeeshySpacing.xs)
                    .size(SlideRailGeometry.DELETE_TARGET_DP.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) { haptics.light(); delete() }
                    .clearAndSetSemantics { contentDescription = deleteLabel; role = Role.Button },
                contentAlignment = Alignment.TopEnd,
            ) {
                Box(
                    Modifier.size(SlideRailGeometry.DELETE_GLYPH_DP.dp).clip(CircleShape).background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = null, tint = ComposerPlateauInk.primary, modifier = Modifier.size(10.dp))
                }
            }
        }
    }
}
