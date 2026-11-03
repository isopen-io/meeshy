package me.meeshy.app.stories

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Les quatre réglages de la rangée de bulles du dessin, dans l'ordre d'affichage (iOS `DrawingEditTool`). */
enum class DrawingEditTool { TOOL, COLOR, THICKNESS, SMOOTHING }

/** Hauteur de bulle : la cible tactile de 44 dp d'iOS (`MeeshyControlSize.regular`). */
internal val DRAWING_BUBBLE_SIZE = 44.dp

/**
 * Le mode dessin sous la scène : la rangée de bulles flottantes (sans fond de bandeau), le panneau d'options déplié au-dessus
 * d'elle et la liste des traits. Choisir un pinceau rend le doigt au tracé ; toucher un trait de la liste règle LE TRAIT.
 */
@Composable
internal fun ComposerDrawingPanel(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    zoom: ComposerViewportZoom?,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    Column(modifier.fillMaxWidth().animateContentSize(MeeshyMotion.springDefault()), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        state.drawingExpandedTool?.takeIf { state.drawingBoard.selectedStrokeId == null }?.let { tool ->
            DrawingGlassIsland {
                ComposerDrawingOptionPanel(tool = tool, state = state, viewModel = viewModel, haptics = haptics)
            }
        }
        DrawingBubbleRow(
            expanded = state.drawingExpandedTool?.takeIf { state.drawingBoard.selectedStrokeId == null },
            canUndo = state.drawingBoard.canUndo,
            canRedo = state.drawingBoard.canRedo,
            onSelectTool = { haptics.light(); viewModel.onDrawToolToggled(it) },
            onUndo = { haptics.light(); viewModel.onDrawUndo() },
            onRedo = { haptics.light(); viewModel.onDrawRedo() },
            onFinish = {
                haptics.medium()
                viewModel.onExitDrawingMode()
                zoom?.reset()
            },
        )
        if (!state.drawingBoard.isEmpty) {
            DrawingGlassIsland {
                ComposerDrawingStrokeList(state = state, viewModel = viewModel, haptics = haptics)
            }
        }
    }
}

@Composable
internal fun DrawingGlassIsland(content: @Composable () -> Unit) {
    MeeshyGlassSurface(modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().padding(MeeshySpacing.md)) { content() }
    }
}

/** Pinceau · Couleur · Épaisseur · Lissage, puis Annuler · Rétablir (grisés à 40 %) et le Terminer rouge. */
@Composable
internal fun DrawingBubbleRow(
    expanded: DrawingEditTool?,
    canUndo: Boolean,
    canRedo: Boolean,
    onSelectTool: (DrawingEditTool) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onFinish: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        DrawingEditTool.entries.forEach { tool ->
            DrawingBubble(
                icon = tool.icon(),
                label = tool.label(),
                tint = if (expanded == tool) MeeshyPalette.Indigo500 else null,
                onClick = { onSelectTool(tool) },
                selected = expanded == tool,
            )
        }
        Spacer(Modifier.weight(1f))
        val unavailable = stringResource(R.string.story_drawEdit_unavailable)
        DrawingBubble(MeeshyIcons.Undo, stringResource(R.string.story_drawEdit_undo), null, onUndo, enabled = canUndo, unavailable = unavailable)
        DrawingBubble(MeeshyIcons.Redo, stringResource(R.string.story_drawEdit_redo), null, onRedo, enabled = canRedo, unavailable = unavailable)
        DrawingBubble(
            icon = MeeshyIcons.Close,
            label = stringResource(R.string.story_drawEdit_finish),
            tint = MeeshyPalette.Error,
            onClick = onFinish,
            hint = stringResource(R.string.story_drawEdit_finish_hint),
        )
    }
}

/** Une bulle de verre de 44 dp ; l'état actif et le Terminer la teintent, l'indisponible la grise à 40 % sans la rendre muette pour TalkBack. */
@Composable
private fun DrawingBubble(
    icon: ImageVector,
    label: String,
    tint: Color?,
    onClick: () -> Unit,
    enabled: Boolean = true,
    selected: Boolean = false,
    unavailable: String? = null,
    hint: String? = null,
) {
    val scale = animateFloatAsState(if (selected) 1.08f else 1f, MeeshyMotion.springFast(), label = "drawingBubble").value
    Box(
        modifier = Modifier
            .size(DRAWING_BUBBLE_SIZE)
            .scale(scale)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = label
                this.selected = selected
                val description = if (!enabled) unavailable else hint
                if (description != null) stateDescription = description
                if (!enabled) disabled()
            },
        contentAlignment = Alignment.Center,
    ) {
        MeeshyGlassSurface(modifier = Modifier.size(DRAWING_BUBBLE_SIZE), shape = CircleShape, tint = tint) {}
        Icon(icon, contentDescription = null, tint = if (tint != null) Color.White else MeeshyPalette.White)
    }
}

@Composable
internal fun DrawingEditTool.icon(): ImageVector = when (this) {
    DrawingEditTool.TOOL -> MeeshyIcons.Edit
    DrawingEditTool.COLOR -> MeeshyIcons.Palette
    DrawingEditTool.THICKNESS -> MeeshyIcons.Tune
    DrawingEditTool.SMOOTHING -> MeeshyIcons.Scribble
}

@Composable
internal fun DrawingEditTool.label(): String = stringResource(
    when (this) {
        DrawingEditTool.TOOL -> R.string.story_drawEdit_tool_tool
        DrawingEditTool.COLOR -> R.string.story_drawEdit_tool_color
        DrawingEditTool.THICKNESS -> R.string.story_drawEdit_tool_thickness
        DrawingEditTool.SMOOTHING -> R.string.story_drawEdit_tool_smoothing
    },
)

internal fun StrokeTool.icon(): ImageVector = when (this) {
    StrokeTool.PEN -> MeeshyIcons.Edit
    StrokeTool.MARKER -> MeeshyIcons.EditFilled
    StrokeTool.ERASER -> MeeshyIcons.DeleteSweep
}

@Composable
internal fun StrokeTool.label(): String = stringResource(
    when (this) {
        StrokeTool.PEN -> R.string.story_drawEdit_strokeTool_pen
        StrokeTool.MARKER -> R.string.story_drawEdit_strokeTool_marker
        StrokeTool.ERASER -> R.string.story_drawEdit_strokeTool_eraser
    },
)
