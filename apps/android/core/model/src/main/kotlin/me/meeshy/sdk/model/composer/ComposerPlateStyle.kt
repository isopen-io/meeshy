package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.chrome.GlassRendering
import me.meeshy.sdk.model.chrome.resolveGlassRendering

/**
 * Le style de la plaque de verre unique de la barre de composition. Flou du fond dès l'API 31,
 * couleur opaque du thème en dessous (ou en transparence réduite) : jamais de flou factice.
 */
public data class ComposerPlateStyle(
    val rendering: GlassRendering,
    val fillAlpha: Float,
    val cornerRadiusDp: Float,
    val borderWidthDp: Float,
) {
    public companion object {
        public const val FILL_ALPHA_DARK: Float = 0.60f
        public const val FILL_ALPHA_LIGHT: Float = 0.72f
        public const val CORNER_RADIUS_DP: Float = 28f
        public const val BORDER_WIDTH_DP: Float = 1f

        public fun resolve(
            sdkInt: Int,
            reduceTransparency: Boolean,
            hasBackdrop: Boolean,
            dark: Boolean,
        ): ComposerPlateStyle {
            val rendering = resolveGlassRendering(sdkInt, reduceTransparency, hasBackdrop)
            val fill = when {
                rendering == GlassRendering.Opaque -> 1f
                dark -> FILL_ALPHA_DARK
                else -> FILL_ALPHA_LIGHT
            }
            return ComposerPlateStyle(rendering, fill, CORNER_RADIUS_DP, BORDER_WIDTH_DP)
        }
    }
}
