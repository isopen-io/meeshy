package me.meeshy.app.chat.river

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import kotlin.math.abs

/** Une rangée de la pile paresseuse telle que `LazyListState` la rapporte : son rang, son haut, sa hauteur (px). */
internal data class RiverRowExtent(val rank: Int, val top: Float, val height: Float) {
    val bottom: Float get() = top + height
    val midY: Float get() = top + height / 2f
}

/**
 * Les cadres des bulles, DÉDUITS de la pile paresseuse plutôt que mesurés bulle par bulle : la
 * rangée du rang `r` porte exactement une bulle (la loi le garantit), et son cadre se lit dans les
 * cotes que la liste publie déjà. Aucun `onGloballyPositioned`, aucune recomposition par image de
 * défilement — la toile lit ces cotes À LA PHASE DE DESSIN.
 *
 * Le repère est celui du volet (fixe) : l'abscisse retranche le défilement horizontal.
 */
internal object RiverFraming {

    /** Le rang d'une rangée de la pile : la clé porte le rang, les cales haute et basse portent autre chose. */
    fun rankOfKey(key: Any): Int? = key as? Int

    /**
     * Le cadre de la bulle d'une rangée de rang [rank] : son couloir (abscisse), sous la couture du
     * haut. Un avis système n'a pas de couloir — il n'a pas de cadre, et reste « inconnu » pour la toile.
     */
    fun bubbleFrame(
        row: RiverRowExtent,
        laneIndex: Int,
        laneWidthPx: Float,
        gutterPx: Float,
        seamPx: Float,
        horizontalScrollPx: Float,
    ): Rect {
        val left = laneIndex * laneWidthPx + gutterPx - horizontalScrollPx
        return Rect(
            offset = Offset(left, row.top + seamPx),
            size = Size((laneWidthPx - 2f * gutterPx).coerceAtLeast(0f), (row.height - seamPx).coerceAtLeast(0f)),
        )
    }

    /**
     * La hauteur de lecture, en RANG : celui dont le milieu est le plus proche de la ligne de lecture
     * (la première rangée à égalité). Sans rangée mesurée (premier rendu), le curseur reprend son rôle.
     */
    fun focusRank(rows: List<RiverRowExtent>, readingLine: Float, fallbackRank: Int): Int {
        var best: RiverRowExtent? = null
        var bestDistance = Float.MAX_VALUE
        for (row in rows) {
            val distance = abs(row.midY - readingLine)
            if (distance < bestDistance) {
                best = row
                bestDistance = distance
            }
        }
        return best?.rank ?: fallbackRank
    }

    /**
     * La ligne de lecture : un tiers sous le haut de la surface RÉELLEMENT LUE (sous l'en-tête) — là
     * où l'œil se pose quand il descend une conversation (iOS `readingLineRatio`).
     */
    fun readingLine(paneHeightPx: Float, headerInsetPx: Float): Float =
        headerInsetPx + (paneHeightPx - headerInsetPx) * READING_LINE_RATIO

    const val READING_LINE_RATIO: Float = 0.34f
}
