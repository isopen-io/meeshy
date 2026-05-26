package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

/**
 * The primary call-to-action — the Indigo brand gradient (charte graphique
 * §13.1). Disabled or [loading] it flattens to a muted Indigo and ignores taps.
 */
@Composable
public fun MeeshyPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val active = enabled && !loading
    Box(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(
                if (active) {
                    Brush.linearGradient(MeeshyPalette.BrandGradient)
                } else {
                    SolidColor(MeeshyPalette.Indigo200)
                },
            )
            .clickable(enabled = active, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = MeeshyPalette.White,
            )
        } else {
            Text(text = text, color = MeeshyPalette.White, fontWeight = FontWeight.SemiBold)
        }
    }
}
