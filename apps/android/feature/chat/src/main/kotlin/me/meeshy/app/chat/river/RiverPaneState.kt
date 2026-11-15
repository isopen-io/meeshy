package me.meeshy.app.chat.river

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlin.math.roundToInt
import me.meeshy.sdk.model.reading.river.RiverColumnLayout
import me.meeshy.sdk.model.reading.river.RiverConversationMapping
import me.meeshy.sdk.model.reading.river.RiverCursor
import me.meeshy.sdk.model.reading.river.RiverGeometry
import me.meeshy.sdk.model.reading.river.RiverMetrics
import me.meeshy.sdk.model.reading.river.RiverNavigation
import me.meeshy.sdk.model.reading.river.RiverStepDirection

/** Où le cadrage pose la cellule visée : sa base sur le composeur (ouverture), ou sous la ligne de lecture. */
internal enum class RiverAnchor { BOTTOM, READING_LINE }

/** Un cadrage est une DEMANDE : elle tient jusqu'à ce que le volet, mesuré, l'ait honorée. */
internal data class RiverLandingRequest(
    val token: Int,
    val cursor: RiverCursor,
    val anchor: RiverAnchor,
    val animated: Boolean,
)

/** Les cotes du volet, en pixels, dites par l'écran qui les mesure. */
internal data class RiverPaneMetrics(
    val widthPx: Float,
    val heightPx: Float,
    val headerInsetPx: Float,
    val bottomInsetPx: Float,
    val laneHeaderPx: Float,
    val gutterPx: Float,
    val rowGapPx: Float,
)

/**
 * L'état de la Rivière d'UNE conversation, HISSÉ au-dessus de la surcouche : quitter le mode puis y
 * revenir retrouve le curseur, la largeur de couloir et les deux positions de défilement — rien ne
 * se perd à l'entrée ni à la sortie, et le fil, resté composé dessous, garde la sienne.
 */
@Stable
internal class RiverPaneState {
    val listState = LazyListState()
    val horizontal = ScrollState(0)

    var navigation by mutableStateOf(RiverNavigation(RiverCursor(0, 0)))
        private set
    var geometry: RiverGeometry by mutableStateOf(RiverRendering.Empty.geometry)
        private set
    var geometryKey: Any? = null
        private set

    /** Largeur d'un couloir : le pince élargit les couloirs, il ne grossit pas le texte. */
    var laneWidthDp by mutableFloatStateOf(RiverMetrics.Lane.WIDTH_REFERENCE.toFloat())
        private set
    private var laneWidthAtPinchStart = laneWidthDp

    var landing by mutableStateOf<RiverLandingRequest?>(null)
        private set
    private var landingTokens = 0

    /** Incrémenté à CHAQUE bord atteint : la peau y accroche son haptique. */
    val edgeBounceToken: Int get() = navigation.edgeBounceToken

    /** Une nouvelle géométrie : le curseur survit, ou se recale selon [RiverReconciler]. */
    fun accept(next: RiverGeometry, key: Any) {
        val verdict = RiverReconciler.reconcile(geometry, navigation, next)
        geometry = next
        geometryKey = key
        navigation = verdict.navigation
        if (verdict.reland) {
            request(verdict.navigation.cursor, RiverAnchor.BOTTOM, animated = false)
        }
    }

    fun step(direction: RiverStepDirection) {
        navigation = navigation.step(geometry, direction)
    }

    fun moveTo(cursor: RiverCursor) {
        navigation = navigation.moveTo(cursor)
    }

    /** Un tap sur une bulle ou une citation : le curseur se pose, le volet cadre sous la ligne de lecture. */
    fun landOn(cursor: RiverCursor, animated: Boolean) {
        moveTo(cursor)
        request(cursor, RiverAnchor.READING_LINE, animated)
    }

    fun landOnMessage(messageId: String, animated: Boolean): Boolean {
        val cursor = RiverConversationMapping.cursorForMessage(messageId, geometry) ?: return false
        landOn(cursor, animated)
        return true
    }

    fun request(cursor: RiverCursor, anchor: RiverAnchor, animated: Boolean) {
        landing = RiverLandingRequest(++landingTokens, cursor, anchor, animated)
    }

    fun consume(request: RiverLandingRequest) {
        if (landing?.token == request.token) landing = null
    }

    fun pinchBegan() {
        laneWidthAtPinchStart = laneWidthDp
    }

    fun pinch(scale: Float) {
        laneWidthDp = (laneWidthAtPinchStart * scale)
            .coerceIn(RiverMetrics.Lane.WIDTH_MIN.toFloat(), RiverMetrics.Lane.WIDTH_MAX.toFloat())
    }

    /**
     * **Deux axes, deux gestes.** Le TEMPS se cadre par le défilement de la pile (la rangée visée est
     * son index) ; les VOIX par un décalage explicite (`RiverColumnLayout.horizontalOffset`, le rail
     * du couloir au centre du volet). Animée, la glissade horizontale SUIT la verticale plutôt que de
     * la couper. La rangée n'a pas besoin d'être composée : la pile la connaît par son index.
     */
    suspend fun frame(request: RiverLandingRequest, metrics: RiverPaneMetrics, laneWidthPx: Float) {
        val itemIndex = request.cursor.rank + ITEM_OFFSET
        val spec = tween<Float>(LANDING_MS, easing = FastOutSlowInEasing)
        val alreadyOnScreen = listState.layoutInfo.visibleItemsInfo.any { it.index == itemIndex }
        if (!request.animated || !alreadyOnScreen) listState.scrollToItem(itemIndex)
        val info = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == itemIndex }
        if (info != null) {
            val delta = verticalDelta(request.anchor, info.offset.toFloat(), info.size.toFloat(), metrics)
            if (request.animated) listState.animateScrollBy(delta, spec) else listState.scrollBy(delta)
        }
        val columns = RiverColumnLayout(laneWidthPx.toDouble(), metrics.gutterPx.toDouble(), geometry.laneCount.coerceAtLeast(1))
        val x = columns.horizontalOffset(request.cursor.laneIndex, metrics.widthPx.toDouble()).roundToInt()
        if (request.animated) {
            horizontal.animateScrollTo(x, tween(LANDING_MS, easing = FastOutSlowInEasing))
        } else {
            horizontal.scrollTo(x)
        }
    }

    companion object {
        /** La cale haute (en-tête + bande des couloirs) est l'item 0 de la pile. */
        const val ITEM_OFFSET: Int = 1
        const val LANDING_MS: Int = (RiverMetrics.Motion.LANDING_DURATION_SECONDS * 1000).toInt()

        /**
         * De combien défiler (px, positif = le contenu monte) pour que la cellule [top]/[size] se
         * pose à son ancre : la base sur le composeur, ou son tiers sous la ligne de lecture.
         */
        fun verticalDelta(anchor: RiverAnchor, top: Float, size: Float, metrics: RiverPaneMetrics): Float =
            when (anchor) {
                RiverAnchor.BOTTOM -> top + size - (metrics.heightPx - metrics.bottomInsetPx)
                RiverAnchor.READING_LINE ->
                    top - (RiverFraming.readingLine(metrics.heightPx, metrics.headerInsetPx) - RiverFraming.READING_LINE_RATIO * size)
            }
    }
}
