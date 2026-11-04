package me.meeshy.ui.component.auth

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import me.meeshy.sdk.model.brand.BrandMarkGeometry

/**
 * La Signature de la marque, à plat et révélée en entier, d'une seule couleur (iOS `SignatureMark(style: .flat)`).
 * Décorative : TalkBack ne la lit pas, c'est l'hôte qui dit ce qu'elle signe.
 */
@Composable
public fun BrandMarkGlyph(color: Color, size: Dp, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.size(size).clearAndSetSemantics { }) {
        drawBrandDashes(
            color = color,
            lineWidthPx = this.size.minDimension * BrandMarkGeometry.LINE_WIDTH_RATIO,
            progress = { 1f },
        )
    }
}
