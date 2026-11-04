package me.meeshy.ui.component.focal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le bloc de verre de l'élu (iOS `FocalGlassBlock`, rayon 18) : sans teinte, liseré liquide, ombre
 * douce. Il remplit l'espace que son hôte lui donne : l'hôte le dimensionne sur la colonne du
 * message (et sur ses marges pour un long message déplié), le bloc n'a aucune taille propre.
 */
@Composable
internal fun FocalGlassBlock(modifier: Modifier = Modifier) {
    val dark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(ElectedMetrics.cardRadius)
    val fill = MeeshyTheme.tokens.backgroundSecondary.copy(alpha = if (dark) 0.78f else 0.86f)
    Box(
        modifier
            .shadow(elevation = 6.dp, shape = shape, clip = false, ambientColor = Color.Black.copy(alpha = 0.2f), spotColor = Color.Black.copy(alpha = 0.2f))
            .clip(shape)
            .background(fill, shape)
            .border(1.dp, MeeshyGradients.liquidGlassRim(dark, false), shape),
    )
}
