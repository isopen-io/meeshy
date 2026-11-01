package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.StoryLimits
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import me.meeshy.sdk.model.scene.StoryTextLanguage
import me.meeshy.sdk.model.scene.StoryTextOutlineCycle

/**
 * Pure state-to-state reducers behind the composer's text-element intents. Each function
 * takes the current [StoryComposerUiState] (plus the freshly minted id when one is needed,
 * so the reducer stays deterministic) and returns the next one; the ViewModel only wires
 * them into its `_state.update` — no coroutine, no I/O.
 */
internal object StoryComposerTextReducer {

    /** Offset given to a duplicated element so the copy is visibly clear of its source. */
    const val DUPLICATE_ELEMENT_OFFSET: Float = 0.04f

    private fun exceedsLimit(text: String): Boolean = text.codePointCount(0, text.length) > StoryLimits.TEXT_LENGTH

    /**
     * Routes the text field: while a text element is selected the keystrokes rewrite that
     * element; otherwise they rewrite the selected slide's caption.
     */
    fun typed(state: StoryComposerUiState, text: String): StoryComposerUiState {
        val editingId = state.selectedTextElement?.id
        if (editingId != null) {
            val previous = state.selectedTextElement?.text.orEmpty()
            val tooLong = exceedsLimit(text)
            // Un texte restauré déjà trop long est GARDÉ tel quel : le couper à la première frappe détruirait ce que
            // l'auteur a écrit. La saisie qui FRANCHIT le plafond est coupée, avec son message.
            val kept = if (tooLong && !exceedsLimit(previous)) StoryLimits.clampText(text) else text
            return state.copy(
                deck = state.deck.updateTextElement(editingId) { element -> element.copy(text = kept) },
                errorMessage = if (tooLong) StoryComposerViewModel.TEXT_LENGTH_LIMIT else null,
            )
        }
        return state.copy(
            draft = state.draft.withText(text),
            deck = state.deck.updateSelectedText(text),
            errorMessage = null,
        )
    }

    /** Adds an empty element ([id]) to the selected slide and selects it; warns at the cap. */
    fun added(state: StoryComposerUiState, id: String): StoryComposerUiState {
        if (!state.deck.selectedCanAddTextElement) {
            return state.copy(errorMessage = StoryComposerViewModel.TEXT_ELEMENT_LIMIT)
        }
        val at = state.deck.nextObjectPosition()
        return state.copy(
            deck = state.deck.addTextElementToSelected(StoryTextElement(id = id, x = at.x.toFloat(), y = at.y.toFloat())),
            selectedTextElementId = id,
            selectedStickerId = null,
            selectedMediaId = null, selectedSoundId = null, selectedPlaceId = null,
            errorMessage = null,
        )
    }

    /** Begins editing [id], brought to the front of the scene ([SceneFrontPromotion], #13917); inert when it is not on the selected slide. */
    fun selected(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.elements.none { it.id == id }) state
        else SceneFrontPromotion.promoted(state, SceneObjectRef(ComposerObjectKind.TEXT, id))
            .copy(selectedTextElementId = id, framedTextElementId = null, selectedStickerId = null, selectedMediaId = null, selectedSoundId = null, selectedPlaceId = null)

    /**
     * A text touched on the scene (#13836): framed — selected, its action bar served, no keyboard. Touching it again once
     * framed writes it, as its Edit does; a text already being written keeps its writing.
     */
    fun tapped(state: StoryComposerUiState, id: String): StoryComposerUiState = when {
        state.deck.selectedSlide.elements.none { it.id == id } -> state
        state.selectedTextElementId != id -> selected(state, id).copy(framedTextElementId = id)
        state.framedTextElementId == id -> selected(state, id)
        else -> state
    }

    /** Stops editing the active element — the field returns to the slide caption. */
    fun deselected(state: StoryComposerUiState): StoryComposerUiState =
        if (state.selectedTextElementId == null) state else state.copy(selectedTextElementId = null, framedTextElementId = null)

    /**
     * Un texte resté vide quand on le quitte est un fantôme (#13910, iOS `exitTextEditingMode`) : invisible, il compterait
     * au plafond, partirait au brouillon et à la publication. Quoi que fasse [after] — OK, la scène touchée à vide, un autre
     * objet ou un autre texte choisi, une autre diapo —, le texte que [before] tenait s'en va s'il n'est plus tenu et ne
     * porte rien ; son menu ouvert ou son cadre le tiennent encore.
     */
    fun blankLeftBehind(before: StoryComposerUiState, after: StoryComposerUiState): StoryComposerUiState {
        val left = before.selectedTextElementId ?: return after
        if (after.selectedTextElementId == left) return after
        val element = after.deck.slides.firstNotNullOfOrNull { slide -> slide.elements.firstOrNull { it.id == left } } ?: return after
        if (element.text.isNotBlank()) return after
        return after.copy(
            deck = after.deck.removeTextElement(left),
            framedTextElementId = after.framedTextElementId.takeIf { it != left },
            elementMenuId = after.elementMenuId.takeIf { it != left },
        )
    }

    /** Opens the long-press menu on [id], selecting it (inert when it is not on the selected slide). */
    fun menuOpened(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.elements.none { it.id == id }) state
        else SceneFrontPromotion.promoted(state, SceneObjectRef(ComposerObjectKind.TEXT, id)).copy(elementMenuId = id, stickerMenuId = null, selectedTextElementId = id, framedTextElementId = id, selectedStickerId = null, selectedMediaId = null, selectedSoundId = null, selectedPlaceId = null)

    /** Dismisses the element context menu without touching the deck or the selection. */
    fun menuDismissed(state: StoryComposerUiState): StoryComposerUiState =
        if (state.elementMenuId == null) state else state.copy(elementMenuId = null)

    /**
     * Drags [id] by the normalised deltas with magnetic snapping through [StorySnapResolver];
     * the guides and safe-zone verdict ride as transient [SnapFeedback].
     */
    fun moved(state: StoryComposerUiState, id: String, dx: Float, dy: Float): StoryComposerUiState {
        val element = state.deck.selectedSlide.elements.firstOrNull { it.id == id } ?: return state
        val snap = StorySnapResolver.resolve(element.x + dx, element.y + dy)
        return state.copy(
            deck = state.deck.moveTextElement(id, snap.x - element.x, snap.y - element.y),
            snapFeedback = SnapFeedback(snap.verticalGuide, snap.horizontalGuide, snap.withinSafeZone),
        )
    }

    /** Ends a drag: drops the transient [SnapFeedback]. */
    fun dragEnded(state: StoryComposerUiState): StoryComposerUiState =
        if (state.snapFeedback == null) state else state.copy(snapFeedback = null)

    /** Removes [id] from whichever slide holds it, clearing the editing selection if it was the one. */
    fun removed(state: StoryComposerUiState, id: String): StoryComposerUiState {
        val selected = if (state.selectedTextElementId == id) null else state.selectedTextElementId
        return state.copy(deck = state.deck.removeTextElement(id), selectedTextElementId = selected)
    }

    private fun edit(
        state: StoryComposerUiState,
        id: String,
        change: (StoryTextElement) -> StoryTextElement,
    ): StoryComposerUiState = state.copy(deck = state.deck.updateTextElement(id, change))

    fun styled(state: StoryComposerUiState, id: String, style: StoryTextStyle): StoryComposerUiState =
        edit(state, id) { it.copy(style = style) }

    fun colored(state: StoryComposerUiState, id: String, color: String): StoryComposerUiState =
        edit(state, id) { it.copy(color = color) }

    fun aligned(state: StoryComposerUiState, id: String, align: StoryTextAlign): StoryComposerUiState =
        edit(state, id) { it.copy(align = align) }

    fun backed(
        state: StoryComposerUiState,
        id: String,
        background: me.meeshy.sdk.model.scene.StoryTextBackground,
    ): StoryComposerUiState = edit(state, id) { it.copy(background = background) }

    /** Next larger font step, wrapping to the smallest ([StoryTextSizeCycle.next]). */
    fun sizeCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        edit(state, id) { it.copy(size = StoryTextSizeCycle.next(it.size)) }

    /** Next outline thickness, wrapping to none ([me.meeshy.sdk.model.scene.StoryTextOutlineCycle.advance]). */
    fun outlineCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        edit(state, id) { it.copy(outline = me.meeshy.sdk.model.scene.StoryTextOutlineCycle.advance(it.outline)) }

    /** Cadre : la forme (un texte neutre reçoit un liseré discret pour qu'elle se voie). */
    fun frameShaped(state: StoryComposerUiState, id: String, shape: StoryTextFrameShape): StoryComposerUiState =
        edit(state, id) { it.copy(frame = it.frame.shaped(shape, it.background)) }

    fun framePadded(state: StoryComposerUiState, id: String, scale: Float): StoryComposerUiState =
        edit(state, id) { it.copy(frame = it.frame.padded(scale)) }

    fun frameBordered(state: StoryComposerUiState, id: String, width: Float): StoryComposerUiState =
        edit(state, id) { it.copy(frame = it.frame.bordered(width)) }

    fun frameColored(state: StoryComposerUiState, id: String, hex: String): StoryComposerUiState =
        edit(state, id) { it.copy(frame = it.frame.colored(hex)) }

    /** Bordure : le contour des glyphes, curseur continu 0…12. */
    fun outlineWidened(state: StoryComposerUiState, id: String, width: Float): StoryComposerUiState =
        edit(state, id) { it.copy(outline = it.outline.widened(width)) }

    fun outlineColored(state: StoryComposerUiState, id: String, hex: String): StoryComposerUiState =
        edit(state, id) { it.copy(outline = it.outline.colored(hex)) }

    /** Langue : celle dans laquelle l'auteur ÉCRIT, normalisée (`pt-BR` → `pt`) ; rien d'exploitable la retire. */
    fun languaged(state: StoryComposerUiState, id: String, code: String?): StoryComposerUiState =
        edit(state, id) { it.copy(sourceLanguage = StoryTextLanguage.normalised(code)) }

    fun fadeInCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        edit(state, id) { it.copy(fade = it.fade.cycledIn()) }

    fun fadeOutCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        edit(state, id) { it.copy(fade = it.fade.cycledOut()) }

    fun startCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        edit(state, id) { it.copy(timing = it.timing.cycledStart()) }

    fun durationCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        edit(state, id) { it.copy(timing = it.timing.cycledDuration()) }

    /** Pinch-scales / rotates [id] by the incremental deltas (clamped by the pure element law). */
    fun transformed(state: StoryComposerUiState, id: String, scaleBy: Float, rotateByDeg: Float): StoryComposerUiState =
        state.copy(deck = state.deck.transformTextElement(id, scaleBy, rotateByDeg))

    /** Clones [id] as [newId], offset and selected; inert off-slide, warns at the cap. */
    fun duplicated(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        if (state.deck.selectedSlide.elements.none { it.id == id }) return state
        if (!state.deck.selectedCanAddTextElement) {
            return state.copy(errorMessage = StoryComposerViewModel.TEXT_ELEMENT_LIMIT)
        }
        return state.copy(
            deck = state.deck.duplicateTextElement(id, newId, DUPLICATE_ELEMENT_OFFSET, DUPLICATE_ELEMENT_OFFSET),
            selectedTextElementId = newId,
            framedTextElementId = if (state.framedTextElementId == id) newId else state.framedTextElementId,
            errorMessage = null,
        )
    }
}
