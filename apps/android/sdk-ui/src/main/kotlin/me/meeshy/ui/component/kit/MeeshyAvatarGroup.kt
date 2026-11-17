package me.meeshy.ui.component.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val HALO_BREATH_MILLIS = 2400
private const val HALO_SCALE = 1.12f
private const val RAIL_GAP_DP = 8
private const val GRID_GAP_DP = 8

/**
 * **Le groupe d'avatars** (K48) : un groupe, une disposition, une phrase. Il range des visages sans savoir qui ils sont —
 * l'hôte pose son avatar (avec présence et anneau) dans [cell], trie, et écrit [label], le résumé dit à la voix (« Léa, Marc
 * et 3 autres »). Il ne compte que ce qui déborde. Sans [selection], le groupe est UN élément ; avec elle, chaque visage est
 * un élément à part (radio ou case) et porte un anneau et une coche, jamais la couleur seule.
 *
 * Pile de 2 à 5 visages recouverts, duo qui respire (immobile en mouvement réduit), rail de tous les visages, ou grille de
 * deux rangées dont la dernière case est le compte. Jumeau iOS : `MeeshyAvatarGroup`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyAvatarGroup(
    count: Int,
    label: String,
    modifier: Modifier = Modifier,
    layout: MeeshyAvatarGroupLayout = MeeshyAvatarGroupLayout.Stack,
    size: MeeshyAvatarGroupSize = MeeshyAvatarGroupSize.S40,
    max: Int = MeeshyAvatarGroupRecipe.DEFAULT_MAX,
    tint: Color = MeeshyPalette.Indigo500,
    surface: Color = MeeshyTheme.tokens.backgroundPrimary,
    selection: MeeshyAvatarGroupSelection? = null,
    onSelect: ((Int) -> Unit)? = null,
    onPress: (() -> Unit)? = null,
    cell: @Composable (index: Int) -> Unit,
) {
    val reduce = LocalReduceMotion.current
    val values = MeeshyAvatarGroupRecipe.resolve(layout, size, count, max, reduce)
    if (!values.isRenderable) return
    val selectable = selection != null && onSelect != null
    val tap = if (onPress != null && !selectable) Modifier.clickable(role = Role.Button, onClick = onPress) else Modifier
    val said = if (selectable) Modifier else Modifier.semantics(mergeDescendants = true) { contentDescription = label }
    val slot: @Composable (Int) -> Unit = { index ->
        AvatarSlot(index, values, surface, tint, selection, onSelect, cell)
    }
    Box(modifier.then(said).then(tap)) {
        when (layout) {
            MeeshyAvatarGroupLayout.Stack -> Row(horizontalArrangement = Arrangement.spacedBy((-values.overlapDp).dp), verticalAlignment = Alignment.CenterVertically) {
                repeat(values.visible) { slot(it) }
                values.overflowLabel?.let { OverflowChip(it, values, surface) }
            }
            MeeshyAvatarGroupLayout.Duo -> DuoGroup(values, tint, reduce, slot)
            MeeshyAvatarGroupLayout.Rail -> Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(RAIL_GAP_DP.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) { repeat(values.visible) { slot(it) } }
            is MeeshyAvatarGroupLayout.Grid -> GridGroup(values, surface, slot)
        }
    }
}

@Composable
@Suppress("LongParameterList")
private fun AvatarSlot(
    index: Int,
    values: MeeshyAvatarGroupValues,
    surface: Color,
    tint: Color,
    selection: MeeshyAvatarGroupSelection?,
    onSelect: ((Int) -> Unit)?,
    cell: @Composable (Int) -> Unit,
) {
    val isSelected = selection?.contains(index) == true
    val selectable = selection != null && onSelect != null
    val ringColor = if (isSelected) tint else surface
    val ring = if (isSelected) MeeshyAvatarGroupRecipe.SELECTION_RING_DP else values.ringDp
    val action = if (selectable && onSelect != null) {
        Modifier.clickable(role = if (selection is MeeshyAvatarGroupSelection.Multiple) Role.Checkbox else Role.RadioButton) { onSelect(index) }
            .semantics(mergeDescendants = true) {
                selected = isSelected
                role = if (selection is MeeshyAvatarGroupSelection.Multiple) Role.Checkbox else Role.RadioButton
            }
            .meeshyTapTarget(MeeshyAvatarGroupRecipe.TAP_DP.dp)
    } else {
        Modifier
    }
    Box(action, contentAlignment = Alignment.BottomEnd) {
        Box(Modifier.size(values.size.dp.dp).clip(CircleShape).border(ring.dp, ringColor, CircleShape), contentAlignment = Alignment.Center) { cell(index) }
        if (isSelected && selection is MeeshyAvatarGroupSelection.Multiple) {
            Box(Modifier.size(MeeshyAvatarGroupRecipe.CHECK_DP.dp / 2).background(tint, CircleShape).decorative(), contentAlignment = Alignment.Center) {
                Icon(MeeshyIcons.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(9.dp))
            }
        }
    }
}

@Composable
private fun OverflowChip(text: String, values: MeeshyAvatarGroupValues, surface: Color) {
    val tokens = MeeshyTheme.tokens
    Box(
        Modifier
            .size(values.size.dp.dp)
            .background(tokens.controlFill, CircleShape)
            .border(values.ringDp.dp, surface, CircleShape)
            .decorative(),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = tokens.textPrimary, fontSize = (values.size.dp * OVERFLOW_TEXT_SHARE).sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
    }
}

private const val OVERFLOW_TEXT_SHARE = 0.3f

@Composable
private fun DuoGroup(values: MeeshyAvatarGroupValues, tint: Color, reduce: Boolean, slot: @Composable (Int) -> Unit) {
    val breath = if (values.breathes && !reduce) {
        rememberInfiniteTransition(label = "duo-breath").animateFloat(
            initialValue = 1f,
            targetValue = HALO_SCALE,
            animationSpec = infiniteRepeatable(tween(HALO_BREATH_MILLIS, easing = LinearEasing), RepeatMode.Reverse),
            label = "duo-breath-scale",
        )
    } else {
        null
    }
    Box(contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .wrapContentSize(unbounded = true)
                .requiredSize((values.size.dp * 2 - values.overlapDp).dp)
                .graphicsLayer {
                    val scale = breath?.value ?: 1f
                    scaleX = scale
                    scaleY = scale
                }
                .background(tint.copy(alpha = values.haloOpacity * 0.5f), CircleShape)
                .decorative(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy((-values.overlapDp).dp)) {
            slot(0)
            slot(1)
        }
    }
}

@Composable
private fun GridGroup(values: MeeshyAvatarGroupValues, surface: Color, slot: @Composable (Int) -> Unit) {
    val columns = values.columns ?: return
    val cells = remember(values.visible, values.overflowLabel) { values.visible + if (values.overflowLabel != null) 1 else 0 }
    Column(verticalArrangement = Arrangement.spacedBy(GRID_GAP_DP.dp)) {
        (0 until cells).chunked(columns).forEach { rowIndices ->
            Row(horizontalArrangement = Arrangement.spacedBy(GRID_GAP_DP.dp)) {
                rowIndices.forEach { index ->
                    if (index < values.visible) {
                        slot(index)
                    } else {
                        values.overflowLabel?.let { OverflowChip(it, values, surface) }
                    }
                }
            }
        }
    }
}
