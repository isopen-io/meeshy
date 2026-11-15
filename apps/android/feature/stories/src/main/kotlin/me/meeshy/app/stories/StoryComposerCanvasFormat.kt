package me.meeshy.app.stories

import me.meeshy.sdk.model.scene.CanvasFormat
import me.meeshy.sdk.model.scene.CanvasReprojector
import me.meeshy.sdk.model.scene.ReprojectedItem

/** Combien d'éléments le changement de forme a ramenés dans le cadre : la bannière discrète les compte. */
internal data class SlideReprojection(val slide: StorySlide, val repositionedCount: Int)

/**
 * La forme du cadre de la scène (iOS `StoryCanvasAspect` + `CanvasReprojector`) : 9:16 par défaut, 16:9 quand le fond
 * importé est plus large que haut. Le changement de forme reprojette les objets de la diapo (le centre est préservé, les
 * débordements sont ramenés dans `[0, 1]`) et compte ceux qui ont dû bouger.
 */
internal object StoryComposerCanvasFormat {

    /**
     * La forme que la diapo sélectionnée doit avoir : celle du fond peint (quart de tour compris), portrait sans fond,
     * et la forme courante tant que les dimensions du fond ne sont pas mesurées (jamais de bascule sur une donnée absente).
     */
    fun expected(state: StoryComposerUiState): CanvasFormat {
        val slide = state.deck.selectedSlide
        val id = state.selectedSlideBackdropMediaId ?: return CanvasFormat.PORTRAIT
        val (width, height) = state.placedSourceSizeOf(id) ?: return slide.canvasFormat
        val quarterTurn = (state.paintedBackgroundSetting.rotationDeg.toInt() % HALF_TURN) != 0
        return if (quarterTurn) CanvasFormat.fromSourceSize(height, width) else CanvasFormat.fromSourceSize(width, height)
    }

    /** Aligne la diapo sélectionnée sur sa forme attendue ; l'état inchangé quand elle l'est déjà. */
    fun conformed(state: StoryComposerUiState): StoryComposerUiState {
        val target = expected(state)
        val slide = state.deck.selectedSlide
        if (slide.canvasFormat == target) return state
        return applied(state, slide, reprojected(slide, slide.canvasFormat, target))
    }

    /** Un repost d'une scène de forme [source] : les objets des diapos rejoignent le cadre courant de chacune. */
    fun reposted(state: StoryComposerUiState, source: CanvasFormat): StoryComposerUiState {
        val moved = state.deck.slides.map { it to reprojected(it, source, it.canvasFormat) }
        val selectedId = state.deck.selectedId
        val deck = state.deck.copy(slides = moved.map { (_, result) -> result.slide })
        val count = moved.first { (slide, _) -> slide.id == selectedId }.second.repositionedCount
        return withCount(state.copy(deck = deck), selectedId, count)
    }

    fun reprojected(slide: StorySlide, from: CanvasFormat, to: CanvasFormat): SlideReprojection {
        if (from == to) return SlideReprojection(slide.copy(canvasFormat = to), 0)
        val reprojector = CanvasReprojector.between(from, to)
        var clamped = 0
        fun <T> ReprojectedItem<T>.counted(): T = value.also { if (warning != null) clamped += 1 }
        val moved = slide.copy(
            canvasFormat = to,
            elements = slide.elements.map { el ->
                reprojector.reprojectPosition(el.x.toDouble(), el.y.toDouble()).counted().let { el.copy(x = it.x.toFloat(), y = it.y.toFloat()) }
            },
            stickers = slide.stickers.map { st ->
                reprojector.reprojectPosition(st.x.toDouble(), st.y.toDouble()).counted().let { st.copy(x = it.x.toFloat(), y = it.y.toFloat()) }
            },
            placedMedia = slide.placedMedia.map { pm ->
                reprojector.reprojectPosition(pm.x.toDouble(), pm.y.toDouble()).counted().let { pm.copy(x = it.x.toFloat(), y = it.y.toFloat()) }
            },
            places = slide.places.map { pl ->
                reprojector.reprojectPosition(pl.x, pl.y).counted().let { pl.copy(x = it.x, y = it.y) }
            },
            strokes = slide.strokes.map { reprojector.reproject(it).counted() },
        )
        return SlideReprojection(moved, clamped)
    }

    fun bannerDismissed(state: StoryComposerUiState): StoryComposerUiState =
        if (state.repositionedCount == 0) state else state.copy(repositionedCount = 0)

    private fun applied(state: StoryComposerUiState, before: StorySlide, moved: SlideReprojection): StoryComposerUiState {
        val deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == before.id) moved.slide else it })
        return withCount(state.copy(deck = deck), before.id, moved.repositionedCount)
    }

    private fun withCount(state: StoryComposerUiState, slideId: String, count: Int): StoryComposerUiState {
        val selected = state.deck.selectedSlide
        val board = if (selected.id == slideId) state.drawingBoard.copy(strokes = selected.strokes, redoStack = emptyList()) else state.drawingBoard
        return state.copy(drawingBoard = board, repositionedCount = if (count > 0) count else state.repositionedCount)
    }

    private const val HALF_TURN = 180
}
