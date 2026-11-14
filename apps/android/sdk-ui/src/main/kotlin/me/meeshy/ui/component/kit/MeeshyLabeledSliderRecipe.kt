package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors

/** L'encre d'un curseur : blanche sur un média, un panneau ou un verre ; celle du thème sur une feuille claire (ton `theme`). */
public enum class MeeshyLabeledSliderInk { OnMedia, Theme }

/**
 * La recette en valeurs d'un curseur : toutes ses mesures propres, nulle part ailleurs. Miroir de
 * `MeeshyLabeledSliderRecipe` (iOS). Les mesures sont en dp (le pendant de points) et les opacités en fraction.
 */
public data class MeeshyLabeledSliderRecipe(
    public val thumbScale: Float,
    public val haloOpacity: Float,
    public val contentOpacity: Float,
    public val valueOpacity: Float,
    public val ink: MeeshyLabeledSliderInk,
    public val tint: Color?,
) {
    public fun inkColor(isDark: Boolean): Color = when (ink) {
        MeeshyLabeledSliderInk.OnMedia -> MeeshyMediaChromeColors.OnMedia
        MeeshyLabeledSliderInk.Theme -> MeeshyAdaptiveColors.textPrimary(isDark)
    }

    public fun valueColor(isDark: Boolean): Color = inkColor(isDark).copy(alpha = valueOpacity)

    public fun emptyTrackColor(isDark: Boolean): Color = inkColor(isDark).copy(alpha = EMPTY_TRACK_OPACITY)

    public fun fillColor(isDark: Boolean): Color = tint ?: inkColor(isDark)

    public fun haloColor(isDark: Boolean): Color = inkColor(isDark).copy(alpha = haloOpacity)

    public fun shadowColor(): Color = MeeshyLabeledSliderRecipe.shadowBase.copy(alpha = SHADOW_OPACITY)

    public companion object {
        public const val TRACK_HEIGHT_DP: Float = 4f
        public const val THUMB_DIAMETER_DP: Float = 20f

        /** Le centre du pouce va de [THUMB_INSET_DP] à largeur − [THUMB_INSET_DP] : il reste dans la piste. */
        public const val THUMB_INSET_DP: Float = THUMB_DIAMETER_DP / 2f
        public const val HALO_DIAMETER_DP: Float = 32f
        public const val PRESSED_HALO_OPACITY: Float = 0.22f
        public const val HOVERED_HALO_OPACITY: Float = PRESSED_HALO_OPACITY / 2f
        public const val PRESSED_SCALE: Float = 1.2f
        public const val DISABLED_OPACITY: Float = 0.4f
        public const val REST_VALUE_OPACITY: Float = 0.85f
        public const val EMPTY_TRACK_OPACITY: Float = 0.2f
        public const val SHADOW_RADIUS_DP: Float = 6f
        public const val SHADOW_OFFSET_Y_DP: Float = 2f
        public const val SHADOW_OPACITY: Float = 0.35f
        public const val FOCUS_RING_WIDTH_DP: Float = 2f

        /** Le glissé ne part qu'au-delà de ce seuil : un toucher bref reste un toucher. */
        public const val DRAG_THRESHOLD_DP: Float = 6f

        /** Valeur changée hors du doigt (remise, annulation, clavier) : le pouce glisse en 200 ms. */
        public const val SETTLE_MILLIS: Int = 200

        /** La cible tactile : 48 dp sur Android, la bande tient dans la rangée et déborde le dessin. */
        public val HIT_HEIGHT_DP: Float = MeeshyControlSize.minTouchTarget.value

        private val shadowBase: Color = MeeshyMediaChromeColors.MediaBackdrop

        public fun resolve(
            tone: MeeshyGlassTone,
            isEnabled: Boolean,
            isPressed: Boolean,
            isOffNeutral: Boolean,
            tint: Color?,
            reduceMotion: Boolean = false,
            isHovered: Boolean = false,
        ): MeeshyLabeledSliderRecipe {
            val held = isPressed && isEnabled
            val hovered = isHovered && isEnabled && !held
            return MeeshyLabeledSliderRecipe(
                thumbScale = if (held && !reduceMotion) PRESSED_SCALE else 1f,
                haloOpacity = when {
                    held -> PRESSED_HALO_OPACITY
                    hovered -> HOVERED_HALO_OPACITY
                    else -> 0f
                },
                contentOpacity = if (isEnabled) 1f else DISABLED_OPACITY,
                valueOpacity = if (isOffNeutral) 1f else REST_VALUE_OPACITY,
                ink = if (tone == MeeshyGlassTone.Theme) MeeshyLabeledSliderInk.Theme else MeeshyLabeledSliderInk.OnMedia,
                tint = tint,
            )
        }

        /** Le contraste du pouce contre le fond qu'il touche : le fond de l'app pour le ton `theme`, un média sombre sinon. */
        public fun thumbContrast(ink: MeeshyLabeledSliderInk, isDark: Boolean): Double {
            val inkColor = when (ink) {
                MeeshyLabeledSliderInk.OnMedia -> MeeshyMediaChromeColors.OnMedia
                MeeshyLabeledSliderInk.Theme -> MeeshyAdaptiveColors.textPrimary(isDark)
            }
            val ground = when (ink) {
                MeeshyLabeledSliderInk.OnMedia -> MeeshyMediaChromeColors.MediaBackdrop
                MeeshyLabeledSliderInk.Theme -> MeeshyAdaptiveColors.backgroundPrimary(isDark)
            }
            val lighter = maxOf(inkColor.luminance(), ground.luminance()).toDouble()
            val darker = minOf(inkColor.luminance(), ground.luminance()).toDouble()
            return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET)
        }

        private const val CONTRAST_OFFSET: Double = 0.05
    }
}
