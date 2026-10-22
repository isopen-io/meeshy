package me.meeshy.app.widget.kit

import androidx.compose.ui.graphics.Color
import androidx.glance.color.ColorProvider
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Thème jour/nuit des widgets Glance. Aucune couleur n'est codée en dur dans un
 * widget : tout passe par ces fournisseurs, dérivés de [MeeshyPalette]
 * (indigo 6366F1 → 4338CA, sémantiques 34D399 / FBBF24 / 9CA3AF).
 */
internal object WidgetTheme {
    val background = ColorProvider(day = Color.White, night = MeeshyPalette.SurfaceDarkDeep)
    val brandSurface = ColorProvider(day = MeeshyPalette.Indigo500, night = MeeshyPalette.Indigo700)
    val onBrand = ColorProvider(day = Color.White, night = Color.White)
    val title = ColorProvider(day = MeeshyPalette.Indigo700, night = MeeshyPalette.Indigo400)
    val textPrimary = ColorProvider(day = MeeshyPalette.Indigo950, night = Color.White)
    val textSecondary = ColorProvider(day = MeeshyPalette.Neutral500, night = MeeshyPalette.Neutral400)
    val chipBackground = ColorProvider(day = MeeshyPalette.Indigo50, night = MeeshyPalette.Indigo900)
    val chipText = ColorProvider(day = MeeshyPalette.Indigo700, night = MeeshyPalette.Indigo400)
    val unreadBadge = ColorProvider(day = MeeshyPalette.Indigo500, night = MeeshyPalette.Indigo400)

    /** Bordure de la pastille de présence : la couleur du fond du widget. */
    fun dotBorder(night: Boolean): Color = if (night) MeeshyPalette.SurfaceDarkDeep else Color.White
}
