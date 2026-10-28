package me.meeshy.app.stories

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Entry
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Foot
import me.meeshy.sdk.model.composer.ComposerTrailingColumn
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.TextEditTool
import me.meeshy.ui.component.composer.ComposerRailButton
import me.meeshy.ui.icons.MeeshyIcons

/**
 * La colonne DROITE du plateau de la story (iOS `ComposerTrailingColumn`) : les options du moment de HAUT en bas — les
 * contrôleurs du pinceau, ou les sections du texte puis les actions de l'objet — le (x) en dernier ; au pied, l'historique,
 * sous « Temps » quand la scène est animée et que rien n'est ouvert. Chaque réglage n'a qu'un chemin : celui d'ici.
 */
@Composable
internal fun ColumnScope.StoryTrailingColumn(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    val focus = state.trailingFocus
    ComposerTrailingColumn.options(focus).forEach { entry -> TrailingEntry(entry, state, viewModel) }
    if (!ComposerTrailingColumn.footFollowsOptions(focus)) Spacer(Modifier.weight(1f))
    ComposerTrailingColumn.foot(focus, state.timeServed).forEach { foot ->
        when (foot) {
            Foot.TIME -> ComposerRailButton(
                icon = MeeshyIcons.ScheduleFilled,
                label = stringResource(R.string.story_tool_timeline),
                onClick = { viewModel.onBandToolTap(StoryToolMode.TIMELINE) },
                active = state.band.activeTool == StoryToolMode.TIMELINE,
            )
            Foot.UNDO -> ComposerRailButton(MeeshyIcons.Undo, stringResource(R.string.story_composer_undo), viewModel::onUndo, enabled = state.canUndo)
            Foot.REDO -> ComposerRailButton(MeeshyIcons.Redo, stringResource(R.string.story_composer_redo), viewModel::onRedo, enabled = state.canRedo)
        }
    }
}

@Composable
private fun TrailingEntry(entry: Entry, state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    when (entry) {
        is Entry.ToolControl -> {
            val control = DrawingControl.entries.first { it.id == entry.control.id }
            ComposerRailButton(
                icon = control.glyph(),
                label = stringResource(control.labelRes()),
                onClick = { viewModel.onSceneReduce { StoryComposerTrailingReducer.drawingControlOpened(it, control) } },
                active = entry.control.isExpanded,
            )
        }
        is Entry.EditorSection -> ComposerRailButton(
            icon = entry.section.glyph(),
            label = stringResource(entry.section.labelRes()),
            onClick = { viewModel.onSceneReduce { StoryComposerTrailingReducer.sectionOpened(it, entry.section) } },
            active = entry.isOpen,
        )
        is Entry.ObjectAction -> state.selectedObjectControllers?.let { controllers ->
            ComposerRailButton(
                icon = entry.action.icon(),
                label = stringResource(entry.action.labelRes()),
                onClick = { viewModel.onObjectController(controllers.ref, entry.action) },
            )
        }
        Entry.ExitTool -> ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.composer_column_exit_tool), viewModel::onExitDrawingMode)
        Entry.ExitObject -> ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.composer_rail_object_exit), {
            viewModel.onDeselectTextElement()
            viewModel.onDeselectSticker()
        })
    }
}

private fun DrawingControl.glyph(): ImageVector = when (this) {
    DrawingControl.COLOR -> MeeshyIcons.Palette
    DrawingControl.WIDTH -> MeeshyIcons.Tune
}

private fun DrawingControl.labelRes(): Int = when (this) {
    DrawingControl.COLOR -> R.string.composer_column_draw_color
    DrawingControl.WIDTH -> R.string.composer_column_draw_width
}

private fun ComposerObjectEditorSection.glyph(): ImageVector = when (this) {
    is ComposerObjectEditorSection.Tool -> when (tool) {
        TextEditTool.STYLE -> MeeshyIcons.TextFields
        TextEditTool.EFFECT -> MeeshyIcons.Sparkles
        TextEditTool.COLOR -> MeeshyIcons.Palette
        TextEditTool.ALIGN -> MeeshyIcons.AlignLeft
        TextEditTool.BACKGROUND -> MeeshyIcons.Wallpaper
        TextEditTool.FRAME, TextEditTool.BORDER, TextEditTool.LANGUAGE -> MeeshyIcons.TextFields
    }
    ComposerObjectEditorSection.Timing -> MeeshyIcons.ScheduleFilled
    is ComposerObjectEditorSection.Media, ComposerObjectEditorSection.Plan -> MeeshyIcons.Layers
}

private fun ComposerObjectEditorSection.labelRes(): Int = when (this) {
    is ComposerObjectEditorSection.Tool -> when (tool) {
        TextEditTool.STYLE -> R.string.composer_column_text_style
        TextEditTool.EFFECT -> R.string.composer_column_text_effect
        TextEditTool.COLOR -> R.string.composer_column_text_color
        TextEditTool.ALIGN -> R.string.composer_column_text_align
        TextEditTool.BACKGROUND -> R.string.composer_column_text_background
        TextEditTool.FRAME, TextEditTool.BORDER, TextEditTool.LANGUAGE -> R.string.composer_column_text_style
    }
    ComposerObjectEditorSection.Timing -> R.string.composer_column_text_timing
    is ComposerObjectEditorSection.Media, ComposerObjectEditorSection.Plan -> R.string.composer_column_text_timing
}
