package me.meeshy.ui.sticker.template

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.toArgb
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Les mesures d'un gabarit, déjà projetées en unités de rendu (dp) — miroir de `StickerTemplateMetrics` (iOS). Le gabarit
 * ne connaît ni la taille de la scène ni la densité de l'écran : son appelant a fait passer les constantes de design par
 * sa géométrie. C'est ce qui garde un gabarit identique dans la feuille, la bulle, la scène et le PNG exporté.
 * Les marges gardent les rapports de la pastille de lieu (22/42, 14/42, 10/42) : une seule famille de proportions.
 */
@Immutable
public data class StickerTemplateMetrics(
    val fontSize: Float,
    val horizontalPadding: Float,
    val verticalPadding: Float,
    val gap: Float,
) {
    /** Les mêmes mesures, toutes multipliées par [factor]. */
    public fun scaled(factor: Float): StickerTemplateMetrics =
        StickerTemplateMetrics(fontSize * factor, horizontalPadding * factor, verticalPadding * factor, gap * factor)

    public companion object {
        private const val LOCATION_BASE_FONT: Float = 42f
        private const val LOCATION_HORIZONTAL_PAD: Float = 22f
        private const val LOCATION_VERTICAL_PAD: Float = 14f
        private const val LOCATION_GAP: Float = 10f

        /** La part de la cellule que vaut le corps d'une vignette : un cartouche à deux lignes y tient. */
        public const val PREVIEW_BODY_FRACTION: Float = 0.30f

        private fun proportional(body: Float) = StickerTemplateMetrics(
            fontSize = body,
            horizontalPadding = body * (LOCATION_HORIZONTAL_PAD / LOCATION_BASE_FONT),
            verticalPadding = body * (LOCATION_VERTICAL_PAD / LOCATION_BASE_FONT),
            gap = body * (LOCATION_GAP / LOCATION_BASE_FONT),
        )

        /** Un sticker de SCÈNE : [body] est le corps de référence de la scène (la géométrie partagée par le canevas et l'export). */
        public fun sticker(body: Float): StickerTemplateMetrics = proportional(body)

        /** Une VIGNETTE de [side] dp : elle passe par le même moteur que la scène, seules les mesures changent. */
        public fun preview(side: Float): StickerTemplateMetrics = proportional(side * PREVIEW_BODY_FRACTION)

        /** Une décoration de LIEU à l'échelle [scale] (1 = la pastille d'origine, corps de 42). */
        public fun location(scale: Float): StickerTemplateMetrics = proportional(LOCATION_BASE_FONT * scale)
    }
}

/**
 * La palette des décorations — les tokens de marque (`MeeshyPalette`), jamais une couleur système. Les valeurs sont des
 * ARGB prêtes pour `android.graphics`.
 */
internal object StickerTemplatePalette {
    private fun alpha(argb: Int, fraction: Float): Int = (argb and 0x00FFFFFF) or ((fraction * 255).toInt() shl 24)

    val pin: Int = MeeshyPalette.Error.toArgb()
    val label: Int = MeeshyPalette.Indigo900.toArgb()
    val surface: Int = alpha(MeeshyPalette.Indigo50.toArgb(), 0.94f)
    val ink: Int = alpha(MeeshyPalette.Indigo900.toArgb(), 0.92f)
    val hairline: Int = MeeshyPalette.Indigo300.toArgb()
    val accent: Int = MeeshyPalette.Indigo500.toArgb()
    val loveWarm: Int = MeeshyPalette.Error.toArgb()
    val loveCool: Int = MeeshyPalette.Purple500.toArgb()
    val warmBulb: Int = MeeshyPalette.Warning.toArgb()
    val sky: Int = MeeshyPalette.Info.toArgb()
    val leaf: Int = MeeshyPalette.Success.toArgb()
    val night: Int = MeeshyPalette.Indigo900.toArgb()
    val lilac: Int = MeeshyPalette.Indigo400.toArgb()
    val indigoLight: Int = MeeshyPalette.Indigo300.toArgb()
    val neutral: Int = MeeshyPalette.Neutral500.toArgb()

    fun withAlpha(argb: Int, fraction: Float): Int = alpha(argb, fraction)
}
