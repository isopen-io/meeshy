package me.meeshy.app.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.component.auth.AnimatedBrandLogo
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val LOGO_SIZE = 100.dp
private val LOGO_LINE_WIDTH = 10.dp
private const val TITLE_SIZE_SP = 40
private const val BRAND_NAME = "Meeshy"

/** Le dégradé du titre et des liens de marque (iOS `purple700 → purple600 → purple500`). */
internal fun loginTitleBrush(): Brush =
    Brush.horizontalGradient(listOf(MeeshyPalette.Purple700, MeeshyPalette.Purple600, MeeshyPalette.Purple500))

/**
 * L'en-tête de la connexion (iOS `LoginView`) : le logo animé de 100 dp (tracé une fois, sans souffle
 * continu) puis « Meeshy » en dégradé violet avec son ombre. Le logo est décor ; le titre est un en-tête
 * pour le lecteur d'écran.
 */
@Composable
internal fun LoginBrandHeader(reduceMotion: Boolean, modifier: Modifier = Modifier) {
    val isDark = MeeshyTheme.isDark
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        AnimatedBrandLogo(
            modifier = Modifier.size(LOGO_SIZE),
            color = if (isDark) MeeshyPalette.White else MeeshyPalette.Indigo950,
            lineWidth = LOGO_LINE_WIDTH,
            continuous = false,
            reduceMotion = reduceMotion,
        )
        BasicText(
            text = BRAND_NAME,
            style = MaterialTheme.typography.displaySmall.merge(
                TextStyle(
                    brush = loginTitleBrush(),
                    fontSize = TITLE_SIZE_SP.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.SansSerif,
                    shadow = Shadow(
                        color = MeeshyPalette.Purple700.copy(alpha = if (isDark) 0.5f else 0.25f),
                        offset = Offset(0f, 4f),
                        blurRadius = 12f,
                    ),
                ),
            ),
            modifier = Modifier
                .padding(top = MeeshySpacing.xxl, bottom = MeeshySpacing.xxxl)
                .semantics { heading() },
        )
    }
}
