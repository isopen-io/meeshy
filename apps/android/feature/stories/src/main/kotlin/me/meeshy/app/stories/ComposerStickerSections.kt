package me.meeshy.app.stories

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection

/**
 * Les options du STICKER sélectionné, sous la scène : la section ouverte dans la colonne droite — Temps (départ et
 * durée, les deux gestes d'un texte) ou Plan (la frise des pistes). Une section chasse l'autre en fondu.
 */
@Composable
internal fun StickerSectionContent(state: StoryComposerUiState, sticker: StoryStickerElement, viewModel: StoryComposerViewModel) {
    AnimatedContent(
        targetState = state.openStickerSection,
        transitionSpec = { fadeIn() togetherWith fadeOut() using SizeTransform(clip = false) },
        label = "sticker-section",
    ) { open ->
        when (open) {
            ComposerObjectEditorSection.Plan -> Column(Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState())) {
                StoryPlanFrise(state, viewModel)
            }
            else -> Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                TimingCycleButtons(
                    timing = sticker.timing,
                    onCycleStart = { viewModel.onSceneReduce { StoryComposerStickerReducer.startCycled(it, sticker.id) } },
                    onCycleDuration = { viewModel.onSceneReduce { StoryComposerStickerReducer.durationCycled(it, sticker.id) } },
                )
            }
        }
    }
}

/** Les options du texte édité : la rangée de la section ouverte (`open`), ou la rangée complète hors plateau. */
@Composable
internal fun TextSectionToolbar(
    editedText: StoryTextElement,
    open: ComposerObjectEditorSection?,
    viewModel: StoryComposerViewModel,
    onPlateau: Boolean,
) {
    TextStyleToolbar(
        element = editedText,
        onStyle = { style -> viewModel.onTextElementStyle(editedText.id, style) },
        onColor = { color -> viewModel.onTextElementColor(editedText.id, color) },
        onAlign = { align -> viewModel.onTextElementAlign(editedText.id, align) },
        onBackground = { bg -> viewModel.onTextElementBackground(editedText.id, bg) },
        onCycleSize = { viewModel.onTextElementCycleSize(editedText.id) },
        onCycleOutline = { viewModel.onTextElementCycleOutline(editedText.id) },
        onCycleFadeIn = { viewModel.onTextElementCycleFadeIn(editedText.id) },
        onCycleFadeOut = { viewModel.onTextElementCycleFadeOut(editedText.id) },
        onCycleStart = { viewModel.onTextElementCycleStart(editedText.id) },
        onCycleDuration = { viewModel.onTextElementCycleDuration(editedText.id) },
        onDuplicate = { viewModel.onDuplicateTextElement(editedText.id) },
        onReorder = { op -> viewModel.onReorderTextElement(editedText.id, op) },
        onDone = if (onPlateau) null else viewModel::onDeselectTextElement,
        section = open,
        intents = TextSectionIntents(
            onFrameShape = { viewModel.onTextElementFrameShape(editedText.id, it) },
            onFramePadding = { viewModel.onTextElementFramePadding(editedText.id, it) },
            onFrameBorder = { viewModel.onTextElementFrameBorder(editedText.id, it) },
            onFrameColor = { viewModel.onTextElementFrameColor(editedText.id, it) },
            onOutlineWidth = { viewModel.onTextElementOutlineWidth(editedText.id, it) },
            onOutlineColor = { viewModel.onTextElementOutlineColor(editedText.id, it) },
            onLanguage = { viewModel.onTextElementLanguage(editedText.id, it) },
            publishLanguage = viewModel.resolvePublishLanguage(),
        ),
    )
}
