package me.meeshy.app.stories

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.scene.StoryDrawingCanvasSpace
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.story.canvas.drawing.StrokeRibbonRenderer

/** La hauteur maximale de la liste des traits (iOS `maxListHeight = 230`). */
internal val STROKE_LIST_MAX_HEIGHT = 230.dp

/**
 * « N trait(s) » puis la liste bornée : miniature 30x48, couleur, style, épaisseur, corbeille. La ligne sélectionnée prend
 * un fond indigo à 18 %, un liseré à 60 %, et déplie le panneau d'options sous elle — qui règle LE TRAIT.
 */
@Composable
internal fun ComposerDrawingStrokeList(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    haptics: MeeshyHaptics,
    modifier: Modifier = Modifier,
) {
    val strokes = state.drawingBoard.strokes
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        Text(
            stringResource(R.string.story_drawEdit_strokeList_count, strokes.size),
            color = MeeshyTheme.tokens.textSecondary,
            fontSize = 11.sp,
        )
        LazyColumn(Modifier.heightIn(max = STROKE_LIST_MAX_HEIGHT), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
            items(strokes, key = { it.id }, contentType = { "stroke" }) { stroke ->
                val selected = state.drawingBoard.selectedStrokeId == stroke.id
                StrokeRow(
                    stroke = stroke,
                    selected = selected,
                    expanded = state.drawingExpandedTool.takeIf { selected },
                    state = state,
                    viewModel = viewModel,
                    haptics = haptics,
                )
            }
        }
    }
}

@Composable
private fun StrokeRow(
    stroke: StoryDrawingStroke,
    selected: Boolean,
    expanded: DrawingEditTool?,
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    haptics: MeeshyHaptics,
) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .animateContentSize(MeeshyMotion.springDefault())
            .clip(shape)
            .background(if (selected) MeeshyPalette.Indigo400.copy(alpha = 0.18f) else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.10f))
            .border(1.dp, if (selected) MeeshyPalette.Indigo400.copy(alpha = 0.6f) else Color.Transparent, shape)
            .padding(10.dp)
            .semantics(mergeDescendants = false) { this.selected = selected },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            StrokeMiniature(stroke)
            val toggle = { tool: DrawingEditTool -> haptics.light(); viewModel.onStrokeToolToggled(stroke.id, tool) }
            StrokeColorButton(stroke.colorHex, expanded == DrawingEditTool.COLOR) { toggle(DrawingEditTool.COLOR) }
            StrokeToolButton(MeeshyIcons.Scribble, stringResource(R.string.story_drawEdit_strokeList_style), expanded == DrawingEditTool.SMOOTHING) { toggle(DrawingEditTool.SMOOTHING) }
            StrokeToolButton(MeeshyIcons.Tune, stringResource(R.string.story_drawEdit_tool_thickness), expanded == DrawingEditTool.THICKNESS) { toggle(DrawingEditTool.THICKNESS) }
            Spacer(Modifier.weight(1f))
            StrokeTrash { haptics.medium(); viewModel.onStrokeDeleted(stroke.id) }
        }
        if (expanded != null) {
            ComposerDrawingOptionPanel(tool = expanded, state = state, viewModel = viewModel, haptics = haptics)
        }
    }
}

/** La miniature d'un trait : le même rendu à largeur variable que la scène, dans une case de 30x48 dp. */
@Composable
private fun StrokeMiniature(stroke: StoryDrawingStroke) {
    val ops = remember(stroke) { StrokeRibbonRenderer.plan(listOf(stroke)) }
    Canvas(
        Modifier
            .size(width = 30.dp, height = 48.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(Color.Black.copy(alpha = 0.06f))
            .border(0.5.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(6.dp))
            .semantics { contentDescription = "" },
    ) {
        drawIntoCanvas { canvas ->
            val native = canvas.nativeCanvas
            native.save()
            native.scale(size.width / StoryDrawingCanvasSpace.DESIGN_WIDTH, size.height / StoryDrawingCanvasSpace.DESIGN_HEIGHT)
            StrokeRibbonRenderer.draw(native, ops)
            native.restore()
        }
    }
}

@Composable
private fun StrokeColorButton(colorHex: String, active: Boolean, onClick: () -> Unit) {
    val label = stringResource(R.string.story_drawEdit_tool_color)
    Box(
        Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onClick).semantics { role = Role.Button; contentDescription = label; selected = active },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(if (active) 29.dp else 26.dp)
                .background(hexColor(colorHex), CircleShape)
                .border(1.5.dp, Color.White.copy(alpha = 0.7f), CircleShape),
        )
    }
}

@Composable
private fun StrokeToolButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onClick).semantics { role = Role.Button; contentDescription = label; selected = active },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(30.dp).background(if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.18f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = if (active) Color.White else MeeshyTheme.tokens.textPrimary, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun StrokeTrash(onClick: () -> Unit) {
    val label = stringResource(R.string.story_drawEdit_strokeList_delete)
    Box(
        Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onClick).semantics { role = Role.Button; contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(30.dp).background(MeeshyPalette.Error.copy(alpha = 0.12f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(MeeshyIcons.Delete, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(16.dp))
        }
    }
}
