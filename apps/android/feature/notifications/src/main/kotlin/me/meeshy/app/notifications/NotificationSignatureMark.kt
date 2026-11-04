package me.meeshy.app.notifications

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.auth.BrandMarkGlyph
import me.meeshy.ui.theme.MeeshyTheme

/** Le médaillon à la Signature Meeshy : sécurité, système et jeu sans acteur — la ligne dit « Meeshy » avant qu'on la lise. */
@Composable
internal fun NotificationSignatureMedallion(accent: Color, modifier: Modifier = Modifier) {
    NotificationMedallion(accent, modifier) {
        BrandMarkGlyph(color = if (MeeshyTheme.isDark) Color.White else accent, size = 26.dp)
    }
}
