package me.meeshy.app.stories

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.sdk.model.composer.TextEditTool
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les feuilles de l'élément sélectionné (#13836), ancrées en bas comme les autres (#13838) — la scène se réduit, entière,
 * au-dessus d'elles : le Modifier d'un média ou d'un son (ses sections, et faire le fond), son Temps (départ, durée, frise),
 * ou l'échange de l'emoji d'un sticker. Aucune n'existe sans l'élément : l'hôte ne la sert que s'il est encore sélectionné.
 */
@Composable
internal fun StorySelectionSheet(
    open: StoryComposerSheet,
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    comparison: LookComparison,
    onDone: () -> Unit,
) {
    when (open) {
        StoryComposerSheet.OBJECT_EDIT -> ComposerAnchoredSheet(fill = false) { ObjectEditSheet(state, viewModel, comparison, onDone) }
        StoryComposerSheet.OBJECT_TIME -> ComposerAnchoredSheet(fill = false) { ObjectTimeSheet(state, viewModel, onDone) }
        StoryComposerSheet.STICKER_SWAP -> ComposerAnchoredSheet(fill = true) {
            StickerPickerPanel(
                onPick = { emoji ->
                    state.selectedStickerId?.let { id -> viewModel.onSceneReduce { StoryComposerStickerReducer.swapped(it, id, emoji) } }
                    onDone()
                },
                onDismiss = onDone,
            )
        }
        StoryComposerSheet.STICKERS, StoryComposerSheet.SOUND, StoryComposerSheet.AUDIENCE,
        StoryComposerSheet.MENTION, StoryComposerSheet.HASHTAGS, StoryComposerSheet.PLACE -> Unit
    }
}

/** Une feuille de sélection est servie tant que son élément l'est : retiré ou désélectionné, elle se referme. */
internal fun StoryComposerUiState.serves(sheet: StoryComposerSheet): Boolean = when (sheet) {
    StoryComposerSheet.STICKER_SWAP -> selectedSticker != null
    StoryComposerSheet.OBJECT_EDIT -> selectedMedia != null || selectedSound != null
    StoryComposerSheet.OBJECT_TIME -> selectedTextElement != null || selectedSticker != null
    StoryComposerSheet.STICKERS, StoryComposerSheet.SOUND, StoryComposerSheet.AUDIENCE,
    StoryComposerSheet.MENTION, StoryComposerSheet.HASHTAGS, StoryComposerSheet.PLACE -> true
}

/** Le Modifier d'un média ou d'un son : ses sections en pastilles libellées, la section ouverte dessous — ce que la colonne droite portait. */
@Composable
private fun ObjectEditSheet(state: StoryComposerUiState, viewModel: StoryComposerViewModel, comparison: LookComparison, onDone: () -> Unit) {
    val media = state.selectedMedia
    val sound = state.selectedSound
    val sections = media?.let(state::mediaSectionsFor) ?: state.servedSoundSections
    val open = if (media != null) state.openMediaSection else state.openSoundSection
    SelectionSheetColumn(stringResource(R.string.story_canvas_action_edit), onDone) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            sections.forEach { section ->
                FilterChip(
                    selected = section == open,
                    onClick = { viewModel.onSceneReduce { StoryComposerTrailingReducer.sectionOpened(it, section) } },
                    label = { Text(stringResource(section.labelRes())) },
                    leadingIcon = { Icon(section.glyph(), contentDescription = null) },
                )
            }
            state.selectionBar?.let { bar -> bar.sheetActions.forEach { action -> BackgroundChip(bar.ref, action, viewModel) } }
        }
        when {
            media != null -> MediaSectionContent(state, media, viewModel, comparison)
            sound != null -> SoundSectionContent(state, sound, viewModel)
        }
    }
}

@Composable
private fun BackgroundChip(ref: SceneObjectRef, action: SceneObjectMenu.Action, viewModel: StoryComposerViewModel) {
    AssistChip(
        onClick = { viewModel.onObjectController(ref, action) },
        label = {
            Text(
                stringResource(
                    if (action == SceneObjectMenu.Action.REPLACE_BACKGROUND) R.string.composer_selection_replace_background
                    else R.string.composer_selection_set_background,
                ),
            )
        },
        leadingIcon = { Icon(MeeshyIcons.Wallpaper, contentDescription = null) },
    )
}

/** Le Temps d'un texte ou d'un sticker : son départ et sa durée, puis la frise du plan, où toucher une piste sélectionne son objet. */
@Composable
private fun ObjectTimeSheet(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    SelectionSheetColumn(stringResource(R.string.composer_scene_more_timing), onDone) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            state.selectedTextElement?.let { text ->
                TimingCycleButtons(text.timing, { viewModel.onTextElementCycleStart(text.id) }, { viewModel.onTextElementCycleDuration(text.id) })
            } ?: state.selectedSticker?.let { sticker ->
                TimingCycleButtons(
                    sticker.timing,
                    { viewModel.onSceneReduce { StoryComposerStickerReducer.startCycled(it, sticker.id) } },
                    { viewModel.onSceneReduce { StoryComposerStickerReducer.durationCycled(it, sticker.id) } },
                )
            }
        }
        Column(Modifier.heightIn(max = FRISE_MAX_HEIGHT).verticalScroll(rememberScrollState())) {
            StoryPlanFrise(state, viewModel)
        }
    }
}

/** Le corps d'une feuille de sélection : son titre et sa croix, puis ce qu'elle règle. */
@Composable
private fun SelectionSheetColumn(title: String, onDone: () -> Unit, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = onDone) {
                Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.composer_sheet_dismiss))
            }
        }
        content()
    }
}

private val FRISE_MAX_HEIGHT = 220.dp

internal fun ComposerObjectEditorSection.glyph(): ImageVector = when (this) {
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
        MediaEditTool.ADJUST -> MeeshyIcons.Tune
        MediaEditTool.EFFECTS -> MeeshyIcons.Sparkles
        MediaEditTool.ALT_TEXT -> MeeshyIcons.TextFields
        MediaEditTool.TRIM -> MeeshyIcons.Cut
        else -> MeeshyIcons.Layers
    }
    ComposerObjectEditorSection.Plan -> MeeshyIcons.Layers
}

internal fun ComposerObjectEditorSection.labelRes(): Int = when (this) {
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
        MediaEditTool.ADJUST -> R.string.composer_column_media_adjust
        MediaEditTool.EFFECTS -> R.string.stories_composer_band_effets
        MediaEditTool.ALT_TEXT -> R.string.composer_column_media_alt_text
        MediaEditTool.TRIM -> R.string.composer_column_media_trim
        else -> R.string.composer_column_text_plan
    }
}
