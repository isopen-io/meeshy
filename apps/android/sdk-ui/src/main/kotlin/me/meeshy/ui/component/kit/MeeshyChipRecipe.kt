package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import me.meeshy.sdk.model.theme.CanvasChromeScheme
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette

/** Le fond de la capsule : le voile de l'encre claire, l'encre du thème, ou la teinte de l'hôte (la courante teintée). */
public enum class MeeshyChipFill {
    OnMedia,
    ThemeInk,
    Tint,
}

/** L'encre du titre et des glyphes. */
public enum class MeeshyChipInk {
    OnMedia,
    Indigo950,
    ThemeInk,
    ThemeInverse,
}

/**
 * **La recette d'une puce en VALEURS** : un composable ne s'inspecte pas, sa recette si. Toute valeur chiffrée de la puce
 * vit ici, nulle part ailleurs. K04 ne pose aucune matière : un voile plat, jamais de verre ni de liseré. Miroir de
 * `MeeshyChipRecipe` (iOS), mêmes vecteurs de parité.
 */
@Immutable
public data class MeeshyChipRecipe(
    val fill: MeeshyChipFill,
    /** L'opacité du fond, appui et survol compris. */
    val fillOpacity: Float,
    val ink: MeeshyChipInk,
    /** Désactivée : tout le contenu à 40 %. */
    val opacity: Float,
    val isActionEnabled: Boolean,
) {
    public val respondsToTouch: Boolean get() = isActionEnabled

    public val playsHaptic: Boolean get() = isActionEnabled

    public companion object {
        public const val DISABLED_OPACITY: Float = 0.4f
        public const val REST_FILL_OPACITY: Float = MeeshyOpacity.subtle
        public const val PRESSED_FILL_OPACITY: Float = MeeshyOpacity.light
        public const val SELECTED_FILL_OPACITY: Float = 1f
        public const val SELECTED_PRESSED_FILL_OPACITY: Float = MeeshyOpacity.intense
        public const val TONE_FADE_MILLIS: Int = 200
        public const val EDGE_FADE_MILLIS: Int = 150
        public const val REVEAL_MILLIS: Int = 250

        /** L'estompe de bord : la largeur d'une cible tactile iOS (44), sur les deux plateformes. */
        public val EDGE_FADE_DP: Float = MeeshyControlSize.tapTarget.value

        public fun resolve(
            surface: MeeshyChipRowSurface,
            isSelected: Boolean,
            isPressed: Boolean = false,
            isHovered: Boolean = false,
            isEnabled: Boolean = true,
            isTinted: Boolean = false,
        ): MeeshyChipRecipe {
            val responding = (isPressed || isHovered) && isEnabled
            val tinted = isSelected && isTinted
            return MeeshyChipRecipe(
                fill = if (tinted) MeeshyChipFill.Tint else if (surface == MeeshyChipRowSurface.Theme) MeeshyChipFill.ThemeInk else MeeshyChipFill.OnMedia,
                fillOpacity = fillOpacity(isSelected, responding),
                ink = ink(surface, isSelected, tinted),
                opacity = if (isEnabled) 1f else DISABLED_OPACITY,
                isActionEnabled = isEnabled,
            )
        }

        private fun fillOpacity(isSelected: Boolean, responding: Boolean): Float = when {
            isSelected && responding -> SELECTED_PRESSED_FILL_OPACITY
            isSelected -> SELECTED_FILL_OPACITY
            responding -> PRESSED_FILL_OPACITY
            else -> REST_FILL_OPACITY
        }

        private fun ink(surface: MeeshyChipRowSurface, isSelected: Boolean, isTinted: Boolean): MeeshyChipInk = when {
            isTinted -> MeeshyChipInk.OnMedia
            surface == MeeshyChipRowSurface.OnMedia -> if (isSelected) MeeshyChipInk.Indigo950 else MeeshyChipInk.OnMedia
            else -> if (isSelected) MeeshyChipInk.ThemeInverse else MeeshyChipInk.ThemeInk
        }
    }
}

// region Jetons

/** La couleur du voile, avant son opacité. [themeInk] : l'encre du thème ; [tint] : la teinte de la puce. */
public fun MeeshyChipRecipe.fillColor(themeInk: Color, tint: Color?): Color = when (fill) {
    MeeshyChipFill.OnMedia -> MeeshyMediaChromeColors.OnMedia
    MeeshyChipFill.ThemeInk -> themeInk
    MeeshyChipFill.Tint -> tint ?: MeeshyMediaChromeColors.OnMedia
}

/** L'encre du titre et des glyphes. [themeInk] et [themeInverse] : l'encre du thème et son inverse. */
public fun MeeshyChipRecipe.inkColor(themeInk: Color, themeInverse: Color): Color = when (ink) {
    MeeshyChipInk.OnMedia -> MeeshyMediaChromeColors.OnMedia
    MeeshyChipInk.Indigo950 -> MeeshyPalette.Indigo950
    MeeshyChipInk.ThemeInk -> themeInk
    MeeshyChipInk.ThemeInverse -> themeInverse
}

/**
 * L'encre contre le fond de la feuille, une fois le voile posé dessus (composition en luminance linéaire, comme
 * `CanvasChromeScheme`). Le contraste est celui de la RECETTE, pas d'une valeur recopiée.
 */
public fun MeeshyChipRecipe.contrast(
    backdrop: Color,
    themeInk: Color,
    themeInverse: Color,
    tint: Color? = null,
): Double {
    val veil = fillColor(themeInk, tint)
    val covered = backdrop.luminance() * (1f - fillOpacity) + veil.luminance() * fillOpacity
    return CanvasChromeScheme.contrastRatio(inkColor(themeInk, themeInverse).luminance().toDouble(), covered.toDouble())
}

// endregion
