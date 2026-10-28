package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerRailGeometry
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Entry
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Foot
import me.meeshy.sdk.model.composer.ComposerTrailingColumn
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
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
    val (exits, options) = ComposerTrailingColumn.options(focus).partition { it.isExit }
    TrailingColumnFrame(
        footFollowsOptions = ComposerTrailingColumn.footFollowsOptions(focus),
        options = if (options.isEmpty()) null else ({ options.forEach { entry -> TrailingEntry(entry, state, viewModel) } }),
        exit = { exits.forEach { entry -> TrailingEntry(entry, state, viewModel) } },
        foot = { TrailingFoot(focus, state, viewModel) },
    )
}

/**
 * La géométrie de la colonne (iOS `ComposerTrailingRail.tiles`, `ViewThatFits`) : les options défilent quand elles
 * dépassent la hauteur du couloir — un texte et ses actions dépassent un téléphone clavier levé —, le (x) et le pied, eux,
 * ne défilent JAMAIS : la sortie reste visible quand on en a le plus besoin, et la place de « défaire » ne dépend pas du
 * nombre d'options. Le défilement des options garde son reste : il ne tire jamais le plateau vers le bas.
 */
@Composable
internal fun ColumnScope.TrailingColumnFrame(
    footFollowsOptions: Boolean,
    options: (@Composable ColumnScope.() -> Unit)?,
    exit: @Composable ColumnScope.() -> Unit,
    foot: @Composable ColumnScope.() -> Unit,
) {
    if (options == null) {
        Spacer(Modifier.weight(1f))
        foot()
        return
    }
    val spacing = Arrangement.spacedBy(ComposerRailGeometry.FLOATING_ENTRY_SPACING.dp)
    Column(
        modifier = Modifier.weight(1f, fill = !footFollowsOptions),
        verticalArrangement = spacing,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .weight(1f, fill = false)
                .nestedScroll(KeepsItsScroll)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = spacing,
            horizontalAlignment = Alignment.CenterHorizontally,
            content = options,
        )
        exit()
    }
    foot()
}

/** Le reste d'un défilement des options s'arrête à la colonne : tirer au bout des options ne ferme pas le plateau. */
private val KeepsItsScroll = object : NestedScrollConnection {
    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset = available

    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity = available
}

@Composable
private fun TrailingFoot(focus: ComposerTrailingColumn.Focus, state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
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
        is Entry.SceneEffect -> ComposerRailButton(
            icon = if (entry.effect == ComposerSceneEffect.OPENING) MeeshyIcons.Sparkles else MeeshyIcons.PhotoFilter,
            label = stringResource(entry.effect.labelRes()),
            onClick = { viewModel.onSceneReduce { StoryComposerSelectionReducer.sceneEffectToggled(it, entry.effect) } },
            active = entry.isOpen,
        )
        Entry.ExitTool -> ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.composer_column_exit_tool), viewModel::onExitDrawingMode)
        Entry.ExitObject -> ComposerRailButton(
            MeeshyIcons.Close,
            stringResource(R.string.composer_rail_object_exit),
            { viewModel.onSceneReduce(StoryComposerSelectionReducer::cleared) },
        )
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
        TextEditTool.FRAME -> MeeshyIcons.TextBubble
        TextEditTool.BORDER -> MeeshyIcons.CheckBoxBlank
        TextEditTool.LANGUAGE -> MeeshyIcons.Globe
    }
    ComposerObjectEditorSection.Timing -> MeeshyIcons.ScheduleFilled
    is ComposerObjectEditorSection.Media -> when (tool) {
        MediaEditTool.FILTER -> MeeshyIcons.PhotoFilter
        MediaEditTool.ALT_TEXT -> MeeshyIcons.TextFields
        else -> MeeshyIcons.Layers
    }
    ComposerObjectEditorSection.Plan -> MeeshyIcons.Layers
}

private fun ComposerSceneEffect.labelRes(): Int = when (this) {
    ComposerSceneEffect.OPENING -> R.string.stories_scene_effect_opening
    ComposerSceneEffect.VISUAL -> R.string.stories_scene_effect_visual
}

private fun ComposerObjectEditorSection.labelRes(): Int = when (this) {
    is ComposerObjectEditorSection.Tool -> when (tool) {
        TextEditTool.STYLE -> R.string.composer_column_text_style
        TextEditTool.EFFECT -> R.string.composer_column_text_effect
        TextEditTool.COLOR -> R.string.composer_column_text_color
        TextEditTool.ALIGN -> R.string.composer_column_text_align
        TextEditTool.BACKGROUND -> R.string.composer_column_text_background
        TextEditTool.FRAME -> R.string.composer_column_text_frame
        TextEditTool.BORDER -> R.string.stories_composer_outline
        TextEditTool.LANGUAGE -> R.string.composer_column_text_language
    }
    ComposerObjectEditorSection.Timing -> R.string.composer_column_text_timing
    ComposerObjectEditorSection.Plan -> R.string.composer_column_text_plan
    is ComposerObjectEditorSection.Media -> when (tool) {
        MediaEditTool.FILTER -> R.string.composer_column_media_filter
        MediaEditTool.ALT_TEXT -> R.string.composer_column_media_alt_text
        else -> R.string.composer_column_text_plan
    }
}
