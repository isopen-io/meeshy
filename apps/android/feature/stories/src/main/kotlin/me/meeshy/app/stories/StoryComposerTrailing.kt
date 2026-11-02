package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectEditorRail
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerToolControl
import me.meeshy.sdk.model.composer.ComposerTrailingColumn
import me.meeshy.sdk.model.composer.TextEditTool

/** Les deux réglages du pinceau, tels que la colonne les range (iOS `DrawingEditTool`, réduit à ce qu'Android sert). */
enum class DrawingControl(val id: String) { COLOR("drawing.color"), WIDTH("drawing.width") }

/**
 * Les sections de l'éditeur d'un texte que ce meuble sert, dans l'ordre appris par les doigts (`TextEditTool.all`, puis
 * le temps, puis le plan). Chaque section a son réglage réel (loi 4) : cadre, bordure et langue sont des réducteurs du
 * texte ; le plan est la frise des pistes (iOS `Plan2DView`), qui ne double PAS l'empilement — celui-ci reste aux ACTIONS
 * de l'objet : un réglage, un seul chemin.
 */
internal val ServedTextSections: List<ComposerObjectEditorSection> = listOf(
    ComposerObjectEditorSection.Tool(TextEditTool.STYLE),
    ComposerObjectEditorSection.Tool(TextEditTool.EFFECT),
    ComposerObjectEditorSection.Tool(TextEditTool.COLOR),
    ComposerObjectEditorSection.Tool(TextEditTool.ALIGN),
    ComposerObjectEditorSection.Tool(TextEditTool.BACKGROUND),
    ComposerObjectEditorSection.Tool(TextEditTool.FRAME),
    ComposerObjectEditorSection.Tool(TextEditTool.BORDER),
    ComposerObjectEditorSection.Tool(TextEditTool.LANGUAGE),
    ComposerObjectEditorSection.Timing,
    ComposerObjectEditorSection.Plan,
)

/** Les sections d'un sticker : `ComposerObjectEditorRail.entries(STICKER)` — Temps puis Plan, valables pour les cinq familles. */
internal val ServedStickerSections: List<ComposerObjectEditorSection> = ComposerObjectEditorRail.entries(ComposerObjectKind.STICKER)

/** La section dont les options sont ouvertes : celle que l'auteur a touchée si elle est servie, sinon la première. */
internal val StoryComposerUiState.openTextSection: ComposerObjectEditorSection
    get() = openObjectSection?.takeIf { it in ServedTextSections } ?: ServedTextSections.first()

/** Idem pour le sticker sélectionné : une section de texte laissée ouverte ne déborde pas sur lui. */
internal val StoryComposerUiState.openStickerSection: ComposerObjectEditorSection
    get() = openObjectSection?.takeIf { it in ServedStickerSections } ?: ServedStickerSections.first()

private val StoryComposerUiState.servedSections: List<ComposerObjectEditorSection>
    get() {
        val media = selectedMedia
        return when {
            isEditingTextElement -> ServedTextSections
            selectedSticker != null -> ServedStickerSections
            media != null -> mediaSectionsFor(media)
            selectedSound != null -> servedSoundSections
            else -> emptyList()
        }
    }

/**
 * Sur quoi la colonne droite agit : le pinceau (un outil, ses contrôleurs), un objet sélectionné (ses sections quand
 * c'est un texte, puis ses actions) ou la scène seule. Même composition qu'iOS `ComposerTrailingColumn.focus`.
 */
internal val StoryComposerUiState.trailingFocus: ComposerTrailingColumn.Focus
    get() {
        val controls = if (isDrawingActive) {
            DrawingControl.entries.map { ComposerToolControl(it.id, isExpanded = it == openDrawingControl) }
        } else {
            null
        }
        val selection = selectedObjectControllers?.let { objectControllers ->
            ComposerTrailingColumn.Focus.Object(
                sections = servedSections,
                open = when {
                    isEditingTextElement -> openTextSection
                    selectedSticker != null -> openStickerSection
                    selectedMedia != null -> openMediaSection
                    selectedSound != null -> openSoundSection
                    else -> null
                },
                actions = objectControllers.actions,
            )
        }
        return ComposerTrailingColumn.focus(controls, selection, servedSceneEffects, sceneEffectCarousel)
    }

/** « Temps » ne paraît que pour une scène animée (iOS `onTimeButton: sceneIsAnimated ? … : nil`). */
internal val StoryComposerUiState.timeServed: Boolean get() = sceneIsAnimated

internal object StoryComposerTrailingReducer {
    fun sectionOpened(state: StoryComposerUiState, section: ComposerObjectEditorSection): StoryComposerUiState =
        if (section in state.servedSections) primed(state.copy(openObjectSection = section), section) else state

    /** Cadre et bordure s'ouvrent sur un retour visuel immédiat quand le texte n'a rien à montrer (iOS `onAppear`). */
    private fun primed(state: StoryComposerUiState, section: ComposerObjectEditorSection): StoryComposerUiState {
        val id = state.selectedTextElementId ?: return state
        val prime: ((StoryTextElement) -> StoryTextElement) = when (section) {
            ComposerObjectEditorSection.Tool(TextEditTool.FRAME) -> { text -> text.copy(frame = text.frame.primed(text.background)) }
            ComposerObjectEditorSection.Tool(TextEditTool.BORDER) -> { text -> text.copy(outline = text.outline.primed()) }
            else -> return state
        }
        return state.copy(deck = state.deck.updateTextElement(id, prime))
    }

    fun drawingControlOpened(state: StoryComposerUiState, control: DrawingControl): StoryComposerUiState =
        state.copy(openDrawingControl = control)
}
