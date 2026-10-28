package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerToolControl
import me.meeshy.sdk.model.composer.ComposerTrailingColumn
import me.meeshy.sdk.model.composer.TextEditTool

/** Les deux réglages du pinceau, tels que la colonne les range (iOS `DrawingEditTool`, réduit à ce qu'Android sert). */
enum class DrawingControl(val id: String) { COLOR("drawing.color"), WIDTH("drawing.width") }

/**
 * Les sections de l'éditeur d'un texte que ce meuble sert, dans l'ordre appris par les doigts (`TextEditTool.all`, puis
 * le temps). Cadre, bordure et langue n'ont aucun réglage ici : servir un bouton inerte serait mentir (loi 4). Le plan
 * (empilement) est servi par les ACTIONS de l'objet, pas par une section : un réglage, un seul chemin.
 */
internal val ServedTextSections: List<ComposerObjectEditorSection> = listOf(
    ComposerObjectEditorSection.Tool(TextEditTool.STYLE),
    ComposerObjectEditorSection.Tool(TextEditTool.EFFECT),
    ComposerObjectEditorSection.Tool(TextEditTool.COLOR),
    ComposerObjectEditorSection.Tool(TextEditTool.ALIGN),
    ComposerObjectEditorSection.Tool(TextEditTool.BACKGROUND),
    ComposerObjectEditorSection.Timing,
)

/** La section dont les options sont ouvertes : celle que l'auteur a touchée si elle est servie, sinon la première. */
internal val StoryComposerUiState.openTextSection: ComposerObjectEditorSection
    get() = openObjectSection?.takeIf { it in ServedTextSections } ?: ServedTextSections.first()

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
            val editsText = isEditingTextElement
            ComposerTrailingColumn.Focus.Object(
                sections = if (editsText) ServedTextSections else emptyList(),
                open = if (editsText) openTextSection else null,
                actions = objectControllers.actions,
            )
        }
        return ComposerTrailingColumn.focus(controls, selection)
    }

/** « Temps » ne paraît que pour une scène animée (iOS `onTimeButton: sceneIsAnimated ? … : nil`). */
internal val StoryComposerUiState.timeServed: Boolean get() = sceneIsAnimated

internal object StoryComposerTrailingReducer {
    fun sectionOpened(state: StoryComposerUiState, section: ComposerObjectEditorSection): StoryComposerUiState =
        if (section in ServedTextSections) state.copy(openObjectSection = section) else state

    fun drawingControlOpened(state: StoryComposerUiState, control: DrawingControl): StoryComposerUiState =
        state.copy(openDrawingControl = control)
}
