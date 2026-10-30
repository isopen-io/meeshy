package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection

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
