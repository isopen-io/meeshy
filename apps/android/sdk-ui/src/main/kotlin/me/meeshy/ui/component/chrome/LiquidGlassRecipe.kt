package me.meeshy.ui.component.chrome

/**
 * La recette du verre fait main (avant le Liquid Glass systeme), en valeurs simples :
 * lavis de teinte, reflet depuis le bord haut, liseré plus clair du cote eclaire, ombre douce.
 *
 * Pendant iOS : `LiquidGlassFallbackRecipe` (AdaptiveLiquidGlass.swift).
 */
public data class LiquidGlassRecipe(
    val tintWash: Float,
    val sheen: Float,
    val rimLit: Float,
    val rimShade: Float,
    val shadowOpacity: Float,
    val shadowRadiusDp: Float,
) {
    public companion object {
        public fun resolve(isDark: Boolean, isTinted: Boolean): LiquidGlassRecipe = LiquidGlassRecipe(
            tintWash = if (isTinted) (if (isDark) 0.22f else 0.16f) else 0f,
            sheen = if (isDark) 0.10f else 0.32f,
            rimLit = if (isDark) 0.32f else 0.75f,
            rimShade = if (isDark) 0.06f else 0.14f,
            shadowOpacity = if (isDark) 0.35f else 0.12f,
            shadowRadiusDp = 14f,
        )
    }
}
