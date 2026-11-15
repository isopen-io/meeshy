package me.meeshy.ui.component.protection

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.ColorFilter
import me.meeshy.ui.icons.MeeshyIcons

/** Le repère de test de la flamme-œil. */
public const val FLAME_EYE_GLYPH_TAG: String = "flame-eye-glyph"

/**
 * Le pictogramme de la flamme-œil (#8303) — miroir de iOS `FlameEyeGlyph`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Conversation/FlameEyeGlyph.swift`) : une flamme
 * pleine dont l'œil est DÉCOUPÉ (`DstOut`), lisible sur tout fond. Décoratif : l'hôte porte
 * le libellé.
 */
@Composable
public fun FlameEyeGlyph(size: Dp, tint: Color, modifier: Modifier = Modifier) {
    val eye: Painter = rememberVectorPainter(MeeshyIcons.EyeFilled)
    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .testTag(FLAME_EYE_GLYPH_TAG),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = MeeshyIcons.FlameFilled, contentDescription = null, tint = tint, modifier = Modifier.size(size))
        Image(
            painter = eye,
            contentDescription = null,
            colorFilter = ColorFilter.tint(Color.Black),
            modifier = Modifier
                .size(size * 0.56f)
                .offset(y = size * 0.17f)
                .drawWithContent {
                    drawIntoCanvas { canvas ->
                        canvas.saveLayer(Rect(Offset.Zero, this.size), Paint().apply { blendMode = BlendMode.DstOut })
                        drawContent()
                        canvas.restore()
                    }
                },
        )
    }
}
