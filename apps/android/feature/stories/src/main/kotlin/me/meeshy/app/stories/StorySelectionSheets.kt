package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
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
        StoryComposerSheet.PLACE_REPOINT -> StoryReferenceSheet(open, state, viewModel, onDone)
        StoryComposerSheet.STICKERS, StoryComposerSheet.SOUND, StoryComposerSheet.AUDIENCE, StoryComposerSheet.MENTION,
        StoryComposerSheet.HASHTAGS, StoryComposerSheet.PLACE, StoryComposerSheet.BACKGROUND_SOURCE,
        StoryComposerSheet.BACKGROUND_DESCRIPTION -> Unit
    }
}

/**
 * Une feuille de sélection est servie tant que son élément l'est : retiré ou désélectionné, elle se referme. Les portes du
 * rail et du socle (stickers, son, audience, références) ne servent aucun élément : elles le sont toujours (#13910).
 */
internal fun StoryComposerUiState.serves(sheet: StoryComposerSheet): Boolean = when (sheet) {
    StoryComposerSheet.STICKER_SWAP -> selectedSticker != null
    StoryComposerSheet.OBJECT_TIME -> selectedObjectTiming != null
    StoryComposerSheet.PLACE_REPOINT -> selectedPlace != null
    StoryComposerSheet.BACKGROUND_SOURCE -> selectionSubject == ComposerSelectionSubject.BACKGROUND
    StoryComposerSheet.BACKGROUND_DESCRIPTION -> describedMediaFile != null
    StoryComposerSheet.STICKERS, StoryComposerSheet.SOUND, StoryComposerSheet.AUDIENCE, StoryComposerSheet.MENTION,
    StoryComposerSheet.HASHTAGS, StoryComposerSheet.PLACE -> true
}

/**
 * Le Temps de l'objet posé (#13902, #13904) — texte, sticker, média, lieu ou pastille de son : sa famille, sa fenêtre en
 * début et fin (iOS `ComposerObjectTimingControls`), puis la frise du plan, où sa piste est surlignée et où toucher une
 * autre piste sélectionne son objet. Une pastille de son dont la source est connue s'y rogne aussi (#13903) : iOS sert
 * ROGNER au côté de la fenêtre pour l'audio (`ComposerObjectEditorRail.entries(.audio)`), le Modifier le garde aussi.
 */
@Composable
private fun ObjectTimeSheet(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    SelectionSheetColumn(stringResource(R.string.composer_scene_more_timing), onDone) {
        // La frise D'ABORD (#14255) : la feuille plafonne à 55 % de l'écran, et sous les glissières la règle et la barre
        // tombaient hors champ — une scène sans média ne montrait plus ni sa durée ni son objet. Le reste défile dessous.
        StoryPlanFrise(state, viewModel)
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            val ref = state.selectedSceneObject
            val window = state.selectedObjectWindow
            val family = state.selectedObjectFamily
            if (ref != null && window != null && family != null) {
                ObjectTimeControls(window, family, state.selectedSlideDurationSeconds) { next ->
                    viewModel.onSceneReduce { StoryComposerObjectTimeReducer.windowed(it, ref, next) }
                }
            }
            state.selectedSound?.takeIf { state.trimSourceOf(it) != null }?.let { sound ->
                Text(stringResource(R.string.composer_column_media_trim), style = MaterialTheme.typography.labelLarge)
                SoundTrimSection(state, sound, viewModel)
            }
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
        MediaEditTool.LOOK -> MeeshyIcons.Wallpaper
        MediaEditTool.FILTER -> MeeshyIcons.PhotoFilter
        MediaEditTool.ADJUST -> MeeshyIcons.Tune
        MediaEditTool.EFFECTS -> MeeshyIcons.Sparkles
        MediaEditTool.ALT_TEXT -> MeeshyIcons.TextFields
        MediaEditTool.TRIM -> MeeshyIcons.Cut
        MediaEditTool.CROP -> MeeshyIcons.Crop
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
        MediaEditTool.LOOK -> R.string.composer_column_media_look
        MediaEditTool.FILTER -> R.string.composer_column_media_filter
        MediaEditTool.ADJUST -> R.string.composer_column_media_adjust
        MediaEditTool.EFFECTS -> R.string.stories_composer_band_effets
        MediaEditTool.ALT_TEXT -> R.string.composer_column_media_alt_text
        MediaEditTool.TRIM -> R.string.composer_column_media_trim
        MediaEditTool.CROP -> R.string.composer_column_media_crop
        else -> R.string.composer_column_text_plan
    }
}
