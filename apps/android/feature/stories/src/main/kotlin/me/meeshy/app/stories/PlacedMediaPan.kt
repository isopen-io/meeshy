package me.meeshy.app.stories

import androidx.compose.ui.geometry.Offset
import kotlin.math.cos
import kotlin.math.sin

/**
 * Le glissé d'un geste posé DANS un calque mis à l'échelle et pivoté est mesuré dans l'espace de ce calque : doublé, le
 * média parcourt deux fois moins de pixels que le doigt, et tourné d'un quart, il part de côté. On le rapporte à celui du
 * canevas par la matrice du calque (échelle puis rotation horaire autour de son centre).
 */
internal object PlacedMediaPan {
    private const val HALF_TURN_DEGREES = 180.0

    fun toCanvas(pan: Offset, scale: Float, rotationDeg: Float): Offset {
        val radians = rotationDeg * Math.PI / HALF_TURN_DEGREES
        val cosine = cos(radians).toFloat()
        val sine = sin(radians).toFloat()
        val x = pan.x * scale
        val y = pan.y * scale
        return Offset(x * cosine - y * sine, x * sine + y * cosine)
    }
}
