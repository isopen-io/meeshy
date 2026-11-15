package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.chrome.GlassRendering
import me.meeshy.ui.component.chrome.GlassSurfaceValues
import me.meeshy.ui.component.chrome.LiquidGlassRecipe

/**
 * La matière d'un verre. Elle se déduit de l'appareil et ne se passe jamais : [MeeshyGlassMaterial.resolve] est interne.
 *
 * Android n'a pas de Liquid Glass du système (il n'existe que sous iOS 26) : le verre est toujours DESSINÉ, et cède la
 * place au fond plein sous « réduire la transparence » (le texte à contraste élevé du système).
 */
public enum class MeeshyGlassMaterial {
    /** Le verre dessiné : flou du fond enregistré, remplissage du ton, reflet, liseré, ombre. */
    Drawn,

    /** Le fond plein de « réduire la transparence » : ni flou ni reflet. */
    Opaque,
    ;

    internal companion object {
        /**
         * Un verre de ton est plein quand l'utilisateur demande moins de transparence ; avant l'API 31 il reste dessiné
         * (seul le flou manque). Le ton [MeeshyGlassTone.Theme] garde la règle de `MeeshyGlassSurface` : plein quand le
         * rendu l'est.
         */
        fun resolve(tone: MeeshyGlassTone, rendering: GlassRendering, reduceTransparency: Boolean): MeeshyGlassMaterial = when {
            reduceTransparency -> Opaque
            tone == MeeshyGlassTone.Theme && rendering == GlassRendering.Opaque -> Opaque
            else -> Drawn
        }
    }
}

/** Ce qui remplit le verre au-dessus du flou. */
public enum class MeeshyGlassFill {
    Clear,
    Light,
    Dark,
    System,
}

/**
 * La recette d'un verre en VALEURS : un composable ne s'inspecte pas, sa recette si. Le ton [MeeshyGlassTone.Theme] redonne
 * à l'identique celle de `LiquidGlassRecipe` et de `MeeshyGlassSurface` ; les trois autres suivent la planche. Miroir de
 * `MeeshyGlassRecipe` (iOS), mêmes mesures (vecteurs de parité).
 */
@Immutable
public data class MeeshyGlassRecipe(
    val material: MeeshyGlassMaterial,
    val fill: MeeshyGlassFill,
    val fillOpacity: Float,
    val blurRadiusDp: Float,
    val saturation: Float,
    val tintWash: Float,
    val sheen: Float,
    val topLight: Float,
    val rimLit: Float,
    val rimShade: Float,
    val rimTail: Float,
    val shadowOpacity: Float,
    val shadowRadiusDp: Float,
    val shadowYDp: Float,
    val scale: Float,
) {
    public val blursBackdrop: Boolean get() = blurRadiusDp > 0f

    public companion object {
        /** Le fondu du remplissage quand le ton change (immédiat sous « réduire les animations »). */
        public const val TONE_FADE_MILLIS: Int = 200

        /**
         * [isNested] : la surface est posée DANS un verre dessiné du kit. Elle ne porte alors aucune seconde matière (ni
         * flou, ni fond, ni reflet, ni liseré, ni ombre) et garde sa teinte et sa réponse au toucher ; le ton `Theme`,
         * renvoi des sites existants, n'est pas concerné. [isHovered] : pointeur au-dessus, reflet intermédiaire sans
         * échelle.
         */
        public fun resolve(
            tone: MeeshyGlassTone,
            density: MeeshyGlassDensity,
            isTinted: Boolean,
            isInteractive: Boolean,
            isPressed: Boolean,
            material: MeeshyGlassMaterial,
            reduceMotion: Boolean,
            isDark: Boolean = false,
            isNested: Boolean = false,
            isHovered: Boolean = false,
        ): MeeshyGlassRecipe {
            val rest = restRecipe(tone, density, isTinted, material, isDark, isNested)
            if (!isInteractive) return rest
            if (isPressed) return rest.pressed(reduceMotion)
            return if (isHovered) rest.hovered() else rest
        }
    }
}

private object GlassMeasure {
    const val BLUR_RADIUS_DP = 24f
    const val SATURATION = 1.8f
    const val TOP_LIGHT = 0.38f
    const val PLAIN_FILL = 0.14f
    const val DEEP_FILL = 0.46f
    const val DENSE_FILL = 0.66f
    const val ON_LIGHT_FILL = 0.62f
    const val PLAIN_RIM = 0.24f
    const val RIM = 0.2f
    const val OPAQUE_RIM = 0.18f
    const val SHADOW_OPACITY = 0.28f
    const val SHADOW_RADIUS_DP = 14f
    const val SHADOW_Y_DP = 10f
    const val PRESS_SCALE = 1.04f
    const val PRESS_SHEEN_FACTOR = 2f
    const val HOVER_SHEEN_FACTOR = 1.5f
    const val RIM_TAIL_FACTOR = 0.5f
}

private fun restRecipe(
    tone: MeeshyGlassTone,
    density: MeeshyGlassDensity,
    isTinted: Boolean,
    material: MeeshyGlassMaterial,
    isDark: Boolean,
    isNested: Boolean,
): MeeshyGlassRecipe {
    val legacy = LiquidGlassRecipe.resolve(isDark = isDark, isTinted = isTinted)
    if (isNested && tone != MeeshyGlassTone.Theme) return nestedRecipe(material, legacy.tintWash)
    return when (material) {
        MeeshyGlassMaterial.Opaque -> opaqueRecipe(tone, legacy)
        MeeshyGlassMaterial.Drawn ->
            if (tone == MeeshyGlassTone.Theme) themeRecipe(legacy, isDark) else tonedRecipe(tone, density, legacy.tintWash)
    }
}

private fun themeRecipe(legacy: LiquidGlassRecipe, isDark: Boolean): MeeshyGlassRecipe = MeeshyGlassRecipe(
    material = MeeshyGlassMaterial.Drawn,
    fill = MeeshyGlassFill.System,
    fillOpacity = if (isDark) GlassSurfaceValues.FILL_ALPHA_DARK else GlassSurfaceValues.FILL_ALPHA_LIGHT,
    blurRadiusDp = GlassSurfaceValues.BLUR_RADIUS_DP,
    saturation = 1f,
    tintWash = legacy.tintWash,
    sheen = legacy.sheen,
    topLight = 0f,
    rimLit = legacy.rimLit,
    rimShade = legacy.rimShade,
    rimTail = legacy.rimLit * GlassMeasure.RIM_TAIL_FACTOR,
    shadowOpacity = GlassSurfaceValues.SHADOW_ALPHA,
    shadowRadiusDp = GlassSurfaceValues.SHADOW_RADIUS_DP,
    shadowYDp = GlassSurfaceValues.SHADOW_OFFSET_Y_DP,
    scale = 1f,
)

private fun tonedRecipe(tone: MeeshyGlassTone, density: MeeshyGlassDensity, tintWash: Float): MeeshyGlassRecipe {
    val rim = if (tone == MeeshyGlassTone.Plain) GlassMeasure.PLAIN_RIM else GlassMeasure.RIM
    return MeeshyGlassRecipe(
        material = MeeshyGlassMaterial.Drawn,
        fill = if (tone == MeeshyGlassTone.Plain) MeeshyGlassFill.Light else MeeshyGlassFill.Dark,
        fillOpacity = tonedFillOpacity(tone, density),
        blurRadiusDp = GlassMeasure.BLUR_RADIUS_DP,
        saturation = GlassMeasure.SATURATION,
        tintWash = tintWash,
        sheen = 0f,
        topLight = GlassMeasure.TOP_LIGHT,
        rimLit = rim,
        rimShade = rim,
        rimTail = rim,
        shadowOpacity = GlassMeasure.SHADOW_OPACITY,
        shadowRadiusDp = GlassMeasure.SHADOW_RADIUS_DP,
        shadowYDp = GlassMeasure.SHADOW_Y_DP,
        scale = 1f,
    )
}

private fun tonedFillOpacity(tone: MeeshyGlassTone, density: MeeshyGlassDensity): Float = when (tone) {
    MeeshyGlassTone.Plain -> GlassMeasure.PLAIN_FILL
    MeeshyGlassTone.Deep -> if (density == MeeshyGlassDensity.Dense) GlassMeasure.DENSE_FILL else GlassMeasure.DEEP_FILL
    MeeshyGlassTone.OnLight, MeeshyGlassTone.Theme -> GlassMeasure.ON_LIGHT_FILL
}

/**
 * Le fond plein. Le ton `Theme` garde ce que `MeeshyGlassSurface` fait en opaque : fond secondaire plein, voile indigo et
 * ombre conservés.
 */
private fun opaqueRecipe(tone: MeeshyGlassTone, legacy: LiquidGlassRecipe): MeeshyGlassRecipe {
    if (tone == MeeshyGlassTone.Theme) {
        return MeeshyGlassRecipe(
            material = MeeshyGlassMaterial.Opaque,
            fill = MeeshyGlassFill.System,
            fillOpacity = 1f,
            blurRadiusDp = 0f,
            saturation = 1f,
            tintWash = GlassSurfaceValues.OPAQUE_TINT_ALPHA,
            sheen = legacy.sheen,
            topLight = 0f,
            rimLit = legacy.rimLit,
            rimShade = legacy.rimShade,
            rimTail = legacy.rimLit * GlassMeasure.RIM_TAIL_FACTOR,
            shadowOpacity = GlassSurfaceValues.SHADOW_ALPHA,
            shadowRadiusDp = GlassSurfaceValues.SHADOW_RADIUS_DP,
            shadowYDp = GlassSurfaceValues.SHADOW_OFFSET_Y_DP,
            scale = 1f,
        )
    }
    return MeeshyGlassRecipe(
        material = MeeshyGlassMaterial.Opaque,
        fill = MeeshyGlassFill.Dark,
        fillOpacity = 1f,
        blurRadiusDp = 0f,
        saturation = 1f,
        tintWash = legacy.tintWash,
        sheen = 0f,
        topLight = 0f,
        rimLit = GlassMeasure.OPAQUE_RIM,
        rimShade = GlassMeasure.OPAQUE_RIM,
        rimTail = GlassMeasure.OPAQUE_RIM,
        shadowOpacity = 0f,
        shadowRadiusDp = 0f,
        shadowYDp = 0f,
        scale = 1f,
    )
}

/** Une surface posée dans un verre dessiné : la matière est celle de l'hôte, seules la teinte et la réponse au toucher restent. */
private fun nestedRecipe(material: MeeshyGlassMaterial, tintWash: Float): MeeshyGlassRecipe = MeeshyGlassRecipe(
    material = material,
    fill = MeeshyGlassFill.Clear,
    fillOpacity = 0f,
    blurRadiusDp = 0f,
    saturation = 1f,
    tintWash = tintWash,
    sheen = 0f,
    topLight = 0f,
    rimLit = 0f,
    rimShade = 0f,
    rimTail = 0f,
    shadowOpacity = 0f,
    shadowRadiusDp = 0f,
    shadowYDp = 0f,
    scale = 1f,
)

/** Le survol : le reflet s'éclaire à mi-chemin de l'appui, sans échelle. Rien en opaque. */
private fun MeeshyGlassRecipe.hovered(): MeeshyGlassRecipe {
    if (material != MeeshyGlassMaterial.Drawn) return this
    return copy(
        sheen = minOf(1f, sheen * GlassMeasure.HOVER_SHEEN_FACTOR),
        topLight = minOf(1f, topLight * GlassMeasure.HOVER_SHEEN_FACTOR),
        scale = 1f,
    )
}

/**
 * La réponse dessinée : la surface grandit, son reflet double. Sans flou ni reflet en opaque, seule l'échelle répond. Sous
 * « réduire les animations », l'échelle reste à 1 et le reflet répond encore.
 */
private fun MeeshyGlassRecipe.pressed(reduceMotion: Boolean): MeeshyGlassRecipe {
    val scale = if (reduceMotion) 1f else GlassMeasure.PRESS_SCALE
    if (material != MeeshyGlassMaterial.Drawn) return copy(scale = scale)
    return copy(
        sheen = minOf(1f, sheen * GlassMeasure.PRESS_SHEEN_FACTOR),
        topLight = minOf(1f, topLight * GlassMeasure.PRESS_SHEEN_FACTOR),
        scale = scale,
    )
}
