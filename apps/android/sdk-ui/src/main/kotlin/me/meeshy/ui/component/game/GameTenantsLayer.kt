package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.foundation.layout.absoluteOffset

/**
 * Mee et Meo de part et d'autre d'un objet de `viewBoxWidth` unités de large, posés dans les boîtes du dessin
 * ramenées à la place offerte. Figures fixes (un tenant n'est pas une scène) ; sous la taille du blason, ils se taisent.
 */
@Composable
public fun GameTenantsLayer(
    figures: GameFigures,
    viewBoxWidth: Float,
    mee: GameFigureSlot,
    meo: GameFigureSlot,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val placement = GameTenantsGeometry.place(maxWidth.value, widthPx, viewBoxWidth, mee, meo) ?: return@BoxWithConstraints
        @Composable
        fun Tenant(filmId: String, box: GameFigureBox, mirrored: Boolean) {
            val side = with(density) { box.side.toDp() }
            Box(Modifier.absoluteOffset { IntOffset((box.centerX - box.side / 2f).toInt(), (box.centerY - box.side / 2f).toInt()) }) {
                MeeFigure(filmId = filmId, side = side, animates = false, mirrored = mirrored)
            }
        }
        Tenant(figures.meeFilmId, placement.mee, mirrored = false)
        Tenant(figures.meoFilmId, placement.meo, mirrored = placement.meoMirrored)
    }
}
