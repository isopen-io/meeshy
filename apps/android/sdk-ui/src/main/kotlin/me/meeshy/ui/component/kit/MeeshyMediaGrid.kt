package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.theme.MeeshyTheme

/** Une tuile de la grille : l'image, son chargement et son cache sont à l'hôte (`tile`) ; ici, le type et le rapport. */
public data class MeeshyMediaTile(
    val id: String,
    val label: String,
    val kind: MeeshyMediaTileKind = MeeshyMediaTileKind.Media,
    val aspect: Float? = null,
)

/**
 * **La grille de médias** (K49) : elle montre, elle ne range rien pour toi — aucune coche, aucun « + », aucune poignée. L'ordre
 * est celui que l'hôte donne, et une tuile touchée s'ouvre ([onOpen]). Trois mises en page : régulière (2 ou 3 colonnes), rangée
 * qui défile, et maçonnerie (chaque tuile dans la colonne la plus courte). Une tuile fantôme ou squelette ne se touche pas.
 *
 * Chaque tuile touchable est UN élément nommé par son [MeeshyMediaTile.label]. Jumeau iOS : `MeeshyMediaGrid`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyMediaGrid(
    tiles: List<MeeshyMediaTile>,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
    layout: MeeshyMediaGridLayout = MeeshyMediaGridLayout.Regular,
    shape: MeeshyMediaTileShape = MeeshyMediaTileShape.Tall,
    columns: Int? = null,
    spacing: MeeshyMediaGridSpacing = MeeshyMediaGridSpacing.Regular,
    tile: @Composable (MeeshyMediaTile) -> Unit,
) {
    val grid = MeeshyMediaGridRecipe.resolve(layout, shape, columns, spacing)
    val gap = grid.gapDp.dp
    val cell: @Composable (MeeshyMediaTile, Modifier) -> Unit = { item, cellModifier ->
        MediaTile(item, layout, shape, columns, spacing, onOpen, cellModifier, tile)
    }
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val width = maxWidth
        when (layout) {
            MeeshyMediaGridLayout.Regular -> Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                tiles.chunked(grid.columns).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                        row.forEach { item -> cell(item, Modifier.weight(1f)) }
                        repeat(grid.columns - row.size) { Box(Modifier.weight(1f)) }
                    }
                }
            }
            MeeshyMediaGridLayout.Row -> {
                val side = (width - gap * (grid.columns - 1)) / grid.columns
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(gap)) {
                    tiles.forEach { item -> cell(item, Modifier.width(side)) }
                }
            }
            MeeshyMediaGridLayout.Masonry -> {
                val placement = remember(tiles, grid.columns, grid.gapDp, width) {
                    MeeshyMediaGridRecipe.placement(tiles.map { it.aspect }, grid.columns, grid.gapDp, width.value)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    placement.columns.forEach { lane ->
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(gap)) {
                            lane.forEach { index -> cell(tiles[index], Modifier) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
@Suppress("LongParameterList", "LongMethod")
private fun MediaTile(
    item: MeeshyMediaTile,
    layout: MeeshyMediaGridLayout,
    shape: MeeshyMediaTileShape,
    columns: Int?,
    spacing: MeeshyMediaGridSpacing,
    onOpen: (String) -> Unit,
    modifier: Modifier,
    tile: @Composable (MeeshyMediaTile) -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val reduce = LocalReduceMotion.current
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val v = MeeshyMediaGridRecipe.resolve(layout, shape, columns, spacing, item.kind, isPressed, reduceMotion = reduce)
    val scale by animateFloatAsState(v.scale, label = "media-press")
    val clip = RoundedCornerShape(v.radiusDp.dp)
    val ratio = v.aspect ?: item.aspect?.takeIf { it.isFinite() && it > 0f } ?: 1f
    val tap = if (v.isInteractive) {
        Modifier.clickable(interactionSource = source, indication = null, role = Role.Button) { onOpen(item.id) }
            .semantics(mergeDescendants = true) { contentDescription = item.label }
    } else {
        Modifier.decorative()
    }
    Box(
        modifier
            .aspectRatio(ratio)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(v.elevationDp.dp, clip)
            .clip(clip)
            .background(if (item.kind == MeeshyMediaTileKind.Ghost) Color.Transparent else tokens.controlFill)
            .then(tap)
            .drawBehind {
                if (item.kind == MeeshyMediaTileKind.Ghost) {
                    drawRoundRect(
                        tokens.textMuted,
                        cornerRadius = CornerRadius(v.radiusDp.dp.toPx()),
                        style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
                    )
                }
            },
    ) {
        if (item.kind == MeeshyMediaTileKind.Media || item.kind == MeeshyMediaTileKind.Text) tile(item)
        if (v.veil > 0f) Box(Modifier.matchParentSize().background(tokens.textPrimary.copy(alpha = v.veil)))
    }
}
