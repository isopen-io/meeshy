package me.meeshy.ui.brand

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.brand.RevealGeometry

/**
 * Masque « vague liquide » (iOS `LiquidRevealShape`) : un disque au bord ondulé qui naît à
 * ([centerX], [centerY]) (fractions 0..1 du cadre) et grandit jusqu'à couvrir tout le cadre
 * quand [progress] passe de 0 à 1. L'ondulation, enveloppée par sin(progress·π), est nulle aux
 * deux extrémités.
 */
public class LiquidRevealShape(
    private val centerX: Float,
    private val centerY: Float,
    private val progress: Float,
    private val baseRadiusPx: Float,
    private val amplitudePx: Float,
    private val frequency: Float = 9f,
    private val phase: Float = 0f,
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val clamped = progress.coerceIn(0f, 1f)
        val fx = size.width * centerX
        val fy = size.height * centerY
        val bare = RevealGeometry.liquidBareRadius(fx, fy, size.width, size.height, clamped, baseRadiusPx, amplitudePx)
        val wave = RevealGeometry.liquidWaveAmplitude(clamped, amplitudePx)
        val path = Path()
        for (i in 0..RevealGeometry.LIQUID_SEGMENTS) {
            val (x, y) = RevealGeometry.liquidPoint(i, fx, fy, bare, wave, frequency, phase)
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close()
        return Outline.Generic(path)
    }
}
