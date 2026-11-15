package me.meeshy.ui.brand

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.brand.RevealGeometry

/**
 * Le reveal circulaire (iOS `RevealCircleShape`) : un disque centré dont le rayon est la
 * diagonale du cadre fois [progress] — 0 invisible, 1 plein écran.
 */
public class RevealCircleShape(private val progress: Float) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val radius = RevealGeometry.circleRadius(size.width, size.height, progress.coerceIn(0f, 1f))
        val center = Offset(size.width / 2f, size.height / 2f)
        return Outline.Generic(Path().apply { addOval(Rect(center, radius)) })
    }
}
