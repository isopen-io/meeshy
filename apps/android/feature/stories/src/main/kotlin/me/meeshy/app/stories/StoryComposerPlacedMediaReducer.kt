package me.meeshy.app.stories

import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule
import me.meeshy.sdk.model.scene.StoryElementTiming

/**
 * Réducteurs purs des médias posés sur la scène (miroir du sticker) : poser au centre, déplacer, pivoter / agrandir,
 * reprendre. La pose vit dans la slide, donc l'historique du composeur l'annule et la rétablit avec le reste.
 */
internal object StoryComposerPlacedMediaReducer {

    /** Pose [mediaId] sur la scène de la slide choisie ; inerte si le média n'y est pas, est déjà posé ou est le fond. */
    fun placed(state: StoryComposerUiState, mediaId: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        if (mediaId !in slide.mediaIds || mediaId == slide.backgroundMediaId) return state
        if (slide.placedMedia.any { it.mediaId == mediaId }) return state
        val at = state.deck.nextObjectPosition()
        val placed = StoryPlacedMedia(mediaId = mediaId, x = at.x.toFloat(), y = at.y.toFloat(), zIndex = StorySceneStack.nextZ(slide))
        return state.copy(deck = state.deck.updatePlacedMedia(slide.id) { it + placed.normalised() })
    }

    /** Le geste de la vignette : poser un média qui ne l'est pas, reprendre la pose de celui qui l'est. */
    fun toggled(state: StoryComposerUiState, mediaId: String): StoryComposerUiState =
        if (state.deck.selectedSlide.placedMedia.any { it.mediaId == mediaId }) unplaced(state, mediaId) else placed(state, mediaId)

    /** Reprend la pose : le média reste attaché à la slide, il quitte la scène. */
    fun unplaced(state: StoryComposerUiState, mediaId: String): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.mediaId == mediaId } }) return state
        return state.copy(deck = state.deck.updatePlacedMediaWhere({ s -> s.placedMedia.any { it.mediaId == mediaId } }) { list -> list.filterNot { it.mediaId == mediaId } })
    }

    /**
     * Retire l'OBJET posé [id], et lui seul : sa source ou sa copie (#13902), qui nomment le même fichier, restent posées,
     * et le fichier reste attaché à la slide. Sa sélection tombe avec lui ; inerte s'il n'est pas posé.
     */
    fun objectRemoved(state: StoryComposerUiState, id: String): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.id == id } }) return state
        return state.copy(
            deck = state.deck.updatePlacedMediaWhere({ s -> s.placedMedia.any { it.id == id } }) { list -> list.filterNot { it.id == id } },
            selectedMediaId = state.selectedMediaId?.takeIf { it != id },
        )
    }

    /** Réécrit la fenêtre d'apparition de l'objet posé [id] (#13902) ; inerte s'il n'est pas posé. */
    fun windowed(state: StoryComposerUiState, id: String, change: (StoryElementTiming) -> StoryElementTiming): StoryComposerUiState =
        rewritten(state, id) { it.copy(timing = change(it.timing)) }

    fun moved(state: StoryComposerUiState, mediaId: String, dx: Float, dy: Float): StoryComposerUiState =
        rewritten(state, mediaId) { it.nudged(dx, dy) }

    fun transformed(state: StoryComposerUiState, mediaId: String, scaleBy: Float, rotateByDeg: Float): StoryComposerUiState =
        rewritten(state, mediaId) { it.transformed(scaleBy, rotateByDeg) }

    /** Règle le filtre propre de CE média posé, et de lui seul : la scène garde le sien ; inerte si le média n'est pas posé ou le filtre inchangé. */
    fun filtered(state: StoryComposerUiState, mediaId: String, filter: StoryFilter?): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.id == mediaId && it.filter != filter } }) return state
        return rewritten(state, mediaId) { it.copy(filter = filter) }
    }

    /**
     * Règle UN curseur de CE média posé (réglage ou effet), et de lui seul : la valeur est bornée à son curseur, le neutre
     * retire la clé, un sac redevenu neutre s'efface (`null`). Inerte si le média n'est pas posé ou la valeur inchangée.
     */
    fun adjusted(state: StoryComposerUiState, mediaId: String, kind: AdjustmentKind, value: Float): StoryComposerUiState =
        adjustments(state, mediaId) { it.with(kind, value) }

    /** Remet au neutre un sous-outil (Réglages ou Effets) de CE média posé ; l'autre garde ses valeurs. */
    fun adjustmentsReset(state: StoryComposerUiState, mediaId: String, family: AdjustmentFamily): StoryComposerUiState =
        adjustments(state, mediaId) { it.resetting(family) }

    /**
     * Rogne la VIDÉO posée [mediaId] à [bounds] (iOS `setSourceTrim`) : bornes ramenées dans la source et au plancher de
     * durée, la source entière n'écrit aucune borne. Inerte si le média n'est pas posé, n'est pas une vidéo de durée connue,
     * ou si la fenêtre ne change rien. Les autres médias, la scène et les sons ne bougent pas.
     */
    fun trimmed(state: StoryComposerUiState, mediaId: String, bounds: MediaTrimBounds): StoryComposerUiState {
        val current = state.deck.slides.firstNotNullOfOrNull { s -> s.placedMedia.firstOrNull { it.id == mediaId } } ?: return state
        val source = state.placedTrimSourceOf(mediaId) ?: return state
        val fields = MediaTrimRule.fields(MediaTrimRule.resolved(bounds.start, bounds.end, source), source)
        if (fields.start == current.sourceStart && fields.end == current.sourceEnd) return state
        return rewritten(state, mediaId) { it.copy(sourceStart = fields.start, sourceEnd = fields.end) }
    }

    /**
     * Recadre l'IMAGE posée [mediaId] à [crop] (iOS `StoryMediaObject.crop`, #13849) : bornes ramenées dans la source et au
     * plancher, la source entière n'écrit aucun recadrage. Rien n'est réécrit dans le fichier. Inerte si le média n'est pas
     * posé ou si le cadre ne change rien.
     */
    fun cropped(state: StoryComposerUiState, mediaId: String, crop: StoryMediaCrop?): StoryComposerUiState {
        val current = state.deck.slides.firstNotNullOfOrNull { s -> s.placedMedia.firstOrNull { it.id == mediaId } } ?: return state
        val next = crop?.let { StoryMediaCrop.fromPayloadBounds(it.x, it.y, it.width, it.height) }
        if (next == current.crop) return state
        return rewritten(state, mediaId) { it.copy(crop = next) }
    }

    /** Les proportions [preset] : le plus grand cadre centré dans la source mesurée ; « Original » rend la source entière. */
    fun preset(state: StoryComposerUiState, mediaId: String, preset: ComposerCropPreset): StoryComposerUiState {
        if (preset == ComposerCropPreset.ORIGINAL) return cropped(state, mediaId, null)
        val (width, height) = state.placedSourceSizeOf(mediaId) ?: return state
        val framed = ComposerCropPreset.centeredCrop(preset.aspect(width, height), width, height)
        return cropped(state, mediaId, StoryMediaCrop.ofNormalized(framed))
    }

    private fun adjustments(state: StoryComposerUiState, mediaId: String, change: (ImageAdjustments) -> ImageAdjustments): StoryComposerUiState {
        val current = state.deck.slides.firstNotNullOfOrNull { s -> s.placedMedia.firstOrNull { it.id == mediaId } } ?: return state
        val next = change(current.adjustments ?: ImageAdjustments.NEUTRAL).takeUnless { it.isNeutral }
        if (next == current.adjustments) return state
        return rewritten(state, mediaId) { it.copy(adjustments = next) }
    }

    private fun rewritten(state: StoryComposerUiState, mediaId: String, change: (StoryPlacedMedia) -> StoryPlacedMedia): StoryComposerUiState {
        if (state.deck.slides.none { s -> s.placedMedia.any { it.id == mediaId } }) return state
        return state.copy(
            deck = state.deck.updatePlacedMediaWhere({ s -> s.placedMedia.any { it.id == mediaId } }) { list ->
                list.map { if (it.id == mediaId) change(it).normalised() else it }
            },
        )
    }
}
