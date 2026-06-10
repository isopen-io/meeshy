package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The Meeshy brand mark — the rounded-square Indigo gradient with the "M"
 * glyph (charte graphique §13.1). The signature gradient is never re-hued.
 */
@Composable
public fun BrandLogo(
    modifier: Modifier = Modifier,
    size: Dp = 72.dp,
) {
    val textSize = with(LocalDensity.current) { (size * 0.5f).toSp() }
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.28f))
            .background(Brush.linearGradient(MeeshyPalette.BrandGradient))
            .semantics { contentDescription = "Meeshy" },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "M",
            color = MeeshyPalette.White,
            fontWeight = FontWeight.Bold,
            fontSize = textSize,
        )
    }
}
