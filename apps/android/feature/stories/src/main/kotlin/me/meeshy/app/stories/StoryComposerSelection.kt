package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.ComposerObjectEditorRail
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffects
import me.meeshy.sdk.model.composer.sound.SoundTrimLaw
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.scene.StoryElementTiming

/**
 * Les sections de l'éditeur d'un MÉDIA que ce meuble sert : `ComposerObjectEditorRail.entries(MEDIA)` restreint à celles
 * dont l'effet est câblé (loi 4 — aucun bouton inerte). Le filtre est celui de la SCÈNE, servi au seul média de fond
 * ([mediaSectionsFor]), comme iOS ; le texte alternatif est celui du média, le plan la frise des pistes. Ajustements,
 * effets, rognage et actions attendent leur moteur ; un média n'a pas de fenêtre de temps propre.
 */
internal val ServedMediaSections: List<ComposerObjectEditorSection> = ComposerObjectEditorRail.entries(ComposerObjectKind.MEDIA)
    .filter { it in setOf(ComposerObjectEditorSection.Media(MediaEditTool.FILTER), ComposerObjectEditorSection.Media(MediaEditTool.ALT_TEXT), ComposerObjectEditorSection.Plan) }

/** Les sections d'un SON sans source rognable (aucune adresse ou durée inconnue) : son départ et sa durée, puis le plan. */
internal val ServedSoundSections: List<ComposerObjectEditorSection> =
    ComposerObjectEditorRail.entries(ComposerObjectKind.AUDIO, hasTrimmableSource = false)

/** Celles d'un son dont on connaît la source (#13601) : sa fenêtre propre d'abord, comme iOS. */
internal val ServedTrimmableSoundSections: List<ComposerObjectEditorSection> =
    ComposerObjectEditorRail.entries(ComposerObjectKind.AUDIO)

/** La durée de SOURCE de la piste touchée, `null` si elle n'est pas rognable. */
internal fun StoryComposerUiState.trimSourceOf(sound: StoryAudioPlayerObject): Double? =
    SoundTrimLaw.sourceSeconds(sound, deck.selectedSlide.soundSources[sound.id]).takeIf { SoundTrimLaw.isTrimmable(sound, deck.selectedSlide.soundSources[sound.id]) }

/** Les sections que la piste touchée sert : le rognage seulement si sa source est connue. */
internal val StoryComposerUiState.servedSoundSections: List<ComposerObjectEditorSection>
    get() = selectedSound?.let { if (trimSourceOf(it) != null) ServedTrimmableSoundSections else ServedSoundSections } ?: ServedSoundSections

/** Le média touché, s'il vit encore sur la slide sélectionnée (jamais un identifiant périmé). */
internal val StoryComposerUiState.selectedMedia: String?
    get() = selectedMediaId?.takeIf { it in deck.selectedSlide.mediaIds }

/** La piste touchée, si elle vit encore sur la slide sélectionnée. */
internal val StoryComposerUiState.selectedSound: StoryAudioPlayerObject?
    get() = selectedSoundId?.let { id -> deck.selectedSlide.audio.firstOrNull { it.id == id } }

/**
 * Les sections que le média [id] sert. iOS donne au média de FOND le filtre de la slide (`objectId: isBackground ? nil`) ;
 * ici le fond est celui que le plateau peint (le premier média) ou celui que la publication désigne. Un autre média n'est
 * ni peint ni publié comme objet tant qu'il n'est pas POSÉ sur la scène : un filtre sur lui serait perdu, il n'est pas proposé.
 * Un média posé (#13630) est un objet de la scène : il offre SON filtre (#13603), à côté de celui de la scène.
 */
internal fun StoryComposerUiState.mediaSectionsFor(id: String): List<ComposerObjectEditorSection> {
    val isSceneMedia = id == (deck.selectedSlideBackgroundMediaId ?: selectedSlideAttachments.firstOrNull()?.id) ||
        deck.selectedSlide.placedMedia.any { it.mediaId == id }
    return if (isSceneMedia) ServedMediaSections else ServedMediaSections - ComposerObjectEditorSection.Media(MediaEditTool.FILTER)
}

/** Le filtre PROPRE du média posé [id] ; `null` : pas posé, ou aucun filtre. Le fond n'en a pas : il porte celui de la scène. */
internal fun StoryComposerUiState.placedFilterOf(id: String): StoryFilter? =
    deck.selectedSlide.placedMedia.firstOrNull { it.mediaId == id }?.filter

internal val StoryComposerUiState.openMediaSection: ComposerObjectEditorSection
    get() {
        val served = selectedMedia?.let(::mediaSectionsFor) ?: ServedMediaSections
        return openObjectSection?.takeIf { it in served } ?: served.first()
    }

internal val StoryComposerUiState.openSoundSection: ComposerObjectEditorSection
    get() = servedSoundSections.let { served -> openObjectSection?.takeIf { it in served } ?: served.first() }

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

    /** Le Cadre et le carrousel d'effets se partagent le pied : ouvrir l'un referme l'autre ; l'ouvrir lâche l'objet touché, sinon le toucher ne ferait rien. */
    fun frameToggled(state: StoryComposerUiState): StoryComposerUiState {
        if (state.selectedSlideSceneBackground == null) return state
        val opening = !state.frameOpen
        val base = if (opening) state.withoutObjectSelection() else state
        return base.copy(isFrameOpen = opening, openSceneEffect = null, band = state.band.closeAnyPanel())
    }

    /** Le départ du son avance d'un cran, comme celui d'un texte ou d'un sticker ; la durée est intacte. */
    fun soundStartCycled(state: StoryComposerUiState, id: String): StoryComposerUiState =
        state.withSoundTiming(id) { it.cycledStart() }

    /**
     * La fenêtre propre du son [id] dans sa source (#13601) : bornes ramenées dans la source par la loi, durée occupée
     * recalculée, durée de source retenue pour que la bande reste juste une fois la fenêtre posée.
     */
    fun soundTrimmed(state: StoryComposerUiState, id: String, bounds: MediaTrimBounds): StoryComposerUiState {
        val sound = state.deck.selectedSlide.audio.firstOrNull { it.id == id } ?: return state
        val source = state.trimSourceOf(sound) ?: return state
        val deck = state.deck.withSelectedSoundSource(id, source.toFloat())
        return state.copy(deck = deck.updateSelectedSound(id) { SoundTrimLaw.trimmed(it, bounds, source) })
    }

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
