package me.meeshy.ui.component.game

import androidx.compose.ui.graphics.Path
import me.meeshy.sdk.model.game.GameSvgSegment
import me.meeshy.sdk.model.game.GameSvgSegments

/**
 * Le lecteur de chemins SVG du jeu : la même chaîne `d="…"` que la planche, lue par
 * [GameSvgSegments] (pure, prouvée en JVM) puis posée sur un `Path` Compose.
 */
public object GameSvgPath {

    public fun make(d: String): Path = toPath(GameSvgSegments.parse(d))

    internal fun toPath(segments: List<GameSvgSegment>): Path {
        val path = Path()
        segments.forEach { segment ->
            when (segment) {
                is GameSvgSegment.MoveTo -> path.moveTo(segment.x.toFloat(), segment.y.toFloat())
                is GameSvgSegment.LineTo -> path.lineTo(segment.x.toFloat(), segment.y.toFloat())
                is GameSvgSegment.QuadTo ->
                    path.quadraticBezierTo(segment.cx.toFloat(), segment.cy.toFloat(), segment.x.toFloat(), segment.y.toFloat())
                is GameSvgSegment.CubicTo -> path.cubicTo(
                    segment.c1x.toFloat(), segment.c1y.toFloat(),
                    segment.c2x.toFloat(), segment.c2y.toFloat(),
                    segment.x.toFloat(), segment.y.toFloat(),
                )
                GameSvgSegment.Close -> path.close()
            }
        }
        return path
    }
}
