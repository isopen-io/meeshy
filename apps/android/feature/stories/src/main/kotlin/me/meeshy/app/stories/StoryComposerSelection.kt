package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.ComposerObjectEditorRail
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffects
import me.meeshy.sdk.model.scene.StoryElementTiming

/**
 * Les sections de l'éditeur d'un MÉDIA que ce meuble sert : `ComposerObjectEditorRail.entries(MEDIA)` restreint à celles
 * dont l'effet est câblé (loi 4 — aucun bouton inerte). Le filtre est celui de la scène (la slide rend un seul regard),
 * le texte alternatif celui du média, le plan la frise des pistes. Ajustements, effets, rognage et actions attendent
 * leur moteur ; un média n'a pas de fenêtre de temps propre.
 */
internal val ServedMediaSections: List<ComposerObjectEditorSection> = ComposerObjectEditorRail.entries(ComposerObjectKind.MEDIA)
    .filter { it in setOf(ComposerObjectEditorSection.Media(MediaEditTool.FILTER), ComposerObjectEditorSection.Media(MediaEditTool.ALT_TEXT), ComposerObjectEditorSection.Plan) }

/** Les sections d'un SON : son départ et sa durée, puis le plan. Le rognage d'une piste attend son éditeur. */
internal val ServedSoundSections: List<ComposerObjectEditorSection> = ComposerObjectEditorRail.entries(ComposerObjectKind.AUDIO)
    .filter { it != ComposerObjectEditorSection.Media(MediaEditTool.TRIM) }

/** Le média touché, s'il vit encore sur la slide sélectionnée (jamais un identifiant périmé). */
internal val StoryComposerUiState.selectedMedia: String?
    get() = selectedMediaId?.takeIf { it in deck.selectedSlide.mediaIds }

/** La piste touchée, si elle vit encore sur la slide sélectionnée. */
internal val StoryComposerUiState.selectedSound: StoryAudioPlayerObject?
    get() = selectedSoundId?.let { id -> deck.selectedSlide.audio.firstOrNull { it.id == id } }

internal val StoryComposerUiState.openMediaSection: ComposerObjectEditorSection
    get() = openObjectSection?.takeIf { it in ServedMediaSections } ?: ServedMediaSections.first()

internal val StoryComposerUiState.openSoundSection: ComposerObjectEditorSection
    get() = openObjectSection?.takeIf { it in ServedSoundSections } ?: ServedSoundSections.first()

/** Les effets de la scène servis par son fond (aucun fond média, aucun effet — loi 4). */
internal val StoryComposerUiState.servedSceneEffects: List<ComposerSceneEffect>
    get() = ComposerSceneEffects.served(selectedSlideSceneBackground)

/** L'effet dont le carrousel est ouvert : jamais avec un objet touché ni un outil ouvert. */
internal val StoryComposerUiState.sceneEffectCarousel: ComposerSceneEffect?
    get() = ComposerSceneEffects.carousel(
        open = openSceneEffect,
        served = servedSceneEffects,
        objectSelected = selectedSceneObject != null,
        toolIsOpen = isDrawingActive || band.activeTool != null,
    )

/** Le Cadre ne s'ouvre que pour un fond média, hors sélection et hors outil. */
internal val StoryComposerUiState.frameOpen: Boolean
    get() = isFrameOpen && selectedSlideSceneBackground != null && selectedSceneObject == null &&
        !isDrawingActive && band.activeTool == null

/** Réducteurs de la sélection d'un média ou d'un son, et des panneaux de scène du pied du plateau. */
internal object StoryComposerSelectionReducer {

    fun mediaSelected(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (id !in state.deck.selectedSlide.mediaIds) state
        else state.withoutObjectSelection().copy(selectedMediaId = id)

    fun soundSelected(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.audio.none { it.id == id }) state
        else state.withoutObjectSelection().copy(selectedSoundId = id)

    /** Le (x) d'une sélection : plus aucun objet n'est touché, les effets de la scène reviennent. */
    fun cleared(state: StoryComposerUiState): StoryComposerUiState = state.withoutObjectSelection()

    private fun StoryComposerUiState.withoutObjectSelection(): StoryComposerUiState =
        copy(selectedTextElementId = null, selectedStickerId = null, selectedMediaId = null, selectedSoundId = null)

    /** Toucher l'effet ouvert le referme, en toucher un autre bascule le carrousel ; il prend la place du panneau du bas. */
    fun sceneEffectToggled(state: StoryComposerUiState, effect: ComposerSceneEffect): StoryComposerUiState =
        if (effect !in state.servedSceneEffects) state
        else state.copy(
            openSceneEffect = ComposerSceneEffects.toggled(effect, state.sceneEffectCarousel),
            isFrameOpen = false,
            band = state.band.closeAnyPanel(),
        )

    fun sceneEffectClosed(state: StoryComposerUiState): StoryComposerUiState = state.copy(openSceneEffect = null)

    /** Le Cadre et le carrousel d'effets se partagent le pied : ouvrir l'un referme l'autre. */
    fun frameToggled(state: StoryComposerUiState): StoryComposerUiState =
        if (state.selectedSlideSceneBackground == null) state
        else state.copy(isFrameOpen = !state.frameOpen, openSceneEffect = null, band = state.band.closeAnyPanel())

    /** Le départ du son avance d'un cran, comme celui d'un texte ou d'un sticker ; la durée est intacte. */
    fun soundStartCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        state.withSoundTiming(id) { it.cycledStart() }

    fun soundDurationCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        state.withSoundTiming(id) { it.cycledDuration() }

    private fun StoryComposerUiState.withSoundTiming(id: String, cycle: (StoryElementTiming) -> StoryElementTiming): StoryComposerUiState {
        if (deck.selectedSlide.audio.none { it.id == id }) return this
        return copy(deck = deck.updateSelectedSound(id) { sound ->
            val next = cycle(sound.timing())
            sound.copy(
                startTime = next.startSeconds.takeIf { it > StoryElementTiming.NONE_SECONDS },
                duration = next.durationSeconds.takeIf { it > StoryElementTiming.NONE_SECONDS },
            )
        })
    }
}

/** La fenêtre d'une piste, lue comme celle d'un objet : l'absence de départ ou de durée est `0`. */
internal fun StoryAudioPlayerObject.timing(): StoryElementTiming =
    StoryElementTiming(startTime ?: StoryElementTiming.NONE_SECONDS, duration ?: StoryElementTiming.NONE_SECONDS)
