package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** Ce que le panneau édite : le trait sélectionné quand il y en a un, le pinceau actif sinon (iOS `selectedStroke ?? brush`). */
internal data class DrawingEditTarget(val colorHex: String, val width: Double, val smoothing: StrokeSmoothing, val editsStroke: Boolean) {
    companion object {
        fun of(state: StoryComposerUiState): DrawingEditTarget {
            val stroke = state.drawingBoard.selectedStrokeId?.let { id -> state.drawingBoard.strokes.firstOrNull { it.id == id } }
            return DrawingEditTarget(
                colorHex = stroke?.colorHex ?: state.drawColorHex,
                width = stroke?.width ?: state.drawWidthDesign,
                smoothing = stroke?.smoothing ?: state.drawSmoothing,
                editsStroke = stroke != null,
            )
        }
    }
}

/** Le panneau d'options de l'outil déplié : pinceau, neuf couleurs, épaisseur 1 à 30, lissage. */
@Composable
internal fun ComposerDrawingOptionPanel(
    tool: DrawingEditTool,
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    haptics: MeeshyHaptics,
    modifier: Modifier = Modifier,
) {
    val target = DrawingEditTarget.of(state)
    Box(modifier.fillMaxWidth()) {
        when (tool) {
            DrawingEditTool.TOOL -> BrushOptions(state.drawTool) { haptics.light(); viewModel.onDrawBrushSelected(it) }
            DrawingEditTool.COLOR -> ColorOptions(target.colorHex) { haptics.light(); viewModel.onDrawColorSelected(it) }
            DrawingEditTool.THICKNESS -> ThicknessOptions(target.width, viewModel::onDrawWidthSelected)
            DrawingEditTool.SMOOTHING -> SmoothingOptions(target.smoothing) { haptics.light(); viewModel.onDrawSmoothingSelected(it) }
        }
    }
}

@Composable
private fun BrushOptions(active: StrokeTool, onPick: (StrokeTool) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        StrokeTool.entries.forEach { tool ->
            OptionChip(tool.icon(), tool.label(), active == tool, { onPick(tool) }, Modifier.weight(1f))
        }
    }
}

@Composable
private fun SmoothingOptions(active: StrokeSmoothing, onPick: (StrokeSmoothing) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        StrokeSmoothing.entries.forEach { smoothing ->
            OptionChip(MeeshyIcons.Scribble, smoothing.label(), active == smoothing, { onPick(smoothing) }, Modifier.weight(1f))
        }
    }
}

@Composable
internal fun StrokeSmoothing.label(): String = stringResource(
    when (this) {
        StrokeSmoothing.RAW -> R.string.story_drawEdit_smoothing_raw
        StrokeSmoothing.CURVE -> R.string.story_drawEdit_smoothing_curve
        StrokeSmoothing.LINE -> R.string.story_drawEdit_smoothing_line
    },
)

@Composable
private fun OptionChip(icon: ImageVector, label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val ink = if (selected) Color.White else MeeshyTheme.tokens.textPrimary
    Row(
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.18f))
            .clickable(onClick = onClick)
            .semantics { role = Role.RadioButton; this.selected = selected; contentDescription = label },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(18.dp))
        Text(label, color = ink, modifier = Modifier.padding(start = MeeshySpacing.xsPlus), maxLines = 1)
    }
}

@Composable
private fun ColorOptions(activeHex: String, onPick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(MeeshySpacing.xs), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        StoryDrawingPalette.colors.forEach { hex ->
            val selected = hex.equals(activeHex, ignoreCase = true)
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable { onPick(hex) }
                    .semantics { role = Role.RadioButton; this.selected = selected; contentDescription = hex },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .size(if (selected) 36.dp else 32.dp)
                        .background(hexColor(hex), CircleShape)
                        .border(if (selected) 3.dp else 0.5.dp, if (selected) Color.White else Color.Black.copy(alpha = 0.15f), CircleShape),
                )
            }
        }
    }
}

@Composable
private fun ThicknessOptions(width: Double, onChange: (Double) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Icon(MeeshyIcons.Remove, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
        Slider(
            value = width.toFloat(),
            onValueChange = { onChange(it.toDouble()) },
            valueRange = StoryDrawingPalette.MIN_WIDTH.toFloat()..StoryDrawingPalette.MAX_WIDTH.toFloat(),
            steps = (StoryDrawingPalette.MAX_WIDTH - StoryDrawingPalette.MIN_WIDTH).toInt() - 1,
            colors = SliderDefaults.colors(thumbColor = MeeshyPalette.Indigo500, activeTrackColor = MeeshyPalette.Indigo500),
            modifier = Modifier.weight(1f).semantics { contentDescription = "${width.toInt()}" },
        )
        Icon(MeeshyIcons.Add, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(16.dp))
        Text("${width.toInt()}", color = MeeshyTheme.tokens.textSecondary, modifier = Modifier.width(30.dp))
    }
}
