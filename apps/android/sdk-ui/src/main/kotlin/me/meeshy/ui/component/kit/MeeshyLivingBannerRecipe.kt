package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les formes de la bannière : l'en-tête, le fond sans cadre, le voile transparent vers le bas, le remplissage d'une carte (une seule orbe). */
public enum class MeeshyLivingBannerMode { Banner, Ambient, Veil, Fill }

/** Ce qui bouge : le flottement et le capteur, le flottement seul, ou rien. */
public enum class MeeshyLivingBannerMotion { On, Reduced, Off }

/** Une orbe en valeurs : disque, flou, opacité, décalage de teinte et portée de la parallaxe. */
@Immutable
public data class MeeshyLivingBannerOrb(
    val diameter: Double,
    val blur: Double,
    val opacity: Double,
    val hueShift: Double,
    val parallaxReach: Double,
)

/** Ce que l'inclinaison décale : l'orbe proche et, à contresens, la lointaine. */
@Immutable
public data class MeeshyLivingBannerParallax(val near: Double, val far: Double)

@Immutable
public data class MeeshyLivingBannerValues(
    val stopShares: List<Double>,
    val near: MeeshyLivingBannerOrb,
    val far: MeeshyLivingBannerOrb,
    val height: Double,
    val fadeHeight: Double,
    val fadeOpacity: Double,
    val imageVeil: Double,
    val showsFade: Boolean,
    val isDesaturated: Boolean,
    val floats: Boolean,
    val usesSensor: Boolean,
)

/**
 * **La recette de K27 en valeurs** : les arrêts du dégradé, les deux orbes, le fondu, le voile de l'image, la hauteur courante
 * et la loi du capteur. Aucune couleur : la teinte entre, les parts d'opacité sortent. Jumeau iOS : `MeeshyLivingBannerRecipe`.
 */
public object MeeshyLivingBannerRecipe {
    public const val HEIGHT_BAR: Double = 96.0
    public const val HEIGHT_CARD: Double = 130.0
    public const val HEIGHT_HERO: Double = 318.0
    public const val GRADIENT_ANGLE: Double = 165.0
    public const val FADE_SHARE: Double = 0.38
    public const val IMAGE_VEIL_OPACITY: Double = 0.42
    public const val IMAGE_ORB_OPACITY: Double = 0.12
    public const val TILT_FULL_DEGREES: Double = 15.0
    public const val NEAR_REACH: Double = 12.0
    public const val FAR_REACH: Double = -6.0
    public const val FLOAT_PERIOD_SECONDS: Double = 9.0
    public const val FLOAT_DRIFT_X: Double = 18.0
    public const val FLOAT_DRIFT_Y: Double = 14.0
    public const val FLOAT_SCALE: Double = 1.12
    private const val NEAR_DIAMETER = 220.0
    private const val FAR_DIAMETER = 180.0
    private const val ORB_BLUR = 28.0
    private const val FAR_HUE_SHIFT = -30.0
    private val darkStops = listOf(0.72, 0.34, 0.0)
    private val lightStops = listOf(0.52, 0.20, 0.0)

    @Suppress("LongParameterList")
    public fun resolve(
        mode: MeeshyLivingBannerMode,
        isDark: Boolean,
        hasImage: Boolean,
        isMuted: Boolean,
        motion: MeeshyLivingBannerMotion,
        height: Double = HEIGHT_HERO,
        collapse: Double = 0.0,
        isVisible: Boolean = true,
        systemReduceMotion: Boolean = false,
    ): MeeshyLivingBannerValues {
        val progress = clampedCollapse(collapse)
        val reduced = motion == MeeshyLivingBannerMotion.Reduced || systemReduceMotion
        val animated = motion != MeeshyLivingBannerMotion.Off && !isMuted && isVisible
        val current = currentHeight(height, progress)
        val hasFade = mode == MeeshyLivingBannerMode.Banner || mode == MeeshyLivingBannerMode.Veil
        val isFill = mode == MeeshyLivingBannerMode.Fill
        return MeeshyLivingBannerValues(
            stopShares = if (isDark) darkStops else lightStops,
            near = MeeshyLivingBannerOrb(NEAR_DIAMETER, ORB_BLUR, orbOpacity(isDark, near = true, hasImage, mode), 0.0, NEAR_REACH),
            far = MeeshyLivingBannerOrb(
                diameter = if (isFill) 0.0 else FAR_DIAMETER,
                blur = ORB_BLUR,
                opacity = orbOpacity(isDark, near = false, hasImage, mode) * (1 - progress),
                hueShift = FAR_HUE_SHIFT,
                parallaxReach = FAR_REACH,
            ),
            height = current,
            fadeHeight = current * FADE_SHARE,
            fadeOpacity = if (hasFade) 1 - progress else 0.0,
            imageVeil = if (hasImage) IMAGE_VEIL_OPACITY else 0.0,
            showsFade = hasFade,
            isDesaturated = isMuted,
            floats = animated,
            usesSensor = animated && !reduced && !isFill,
        )
    }

    /** La loi du capteur : il ne tourne que si le mouvement est actif, la bannière visible, vive, et le mouvement non réduit. */
    public fun shouldRunSensor(motion: MeeshyLivingBannerMotion, isVisible: Boolean, isMuted: Boolean, reduceMotion: Boolean): Boolean =
        motion == MeeshyLivingBannerMotion.On && isVisible && !isMuted && !reduceMotion

    /** L'avancée du repli, bornée de 0 à 1 ; un non-nombre vaut 0. */
    public fun clampedCollapse(collapse: Double): Double = if (collapse.isFinite()) collapse.coerceIn(0.0, 1.0) else 0.0

    /** La hauteur courante : la hauteur donnée, ramenée à la barre quand elle se replie. */
    public fun currentHeight(height: Double, collapse: Double): Double =
        if (height <= HEIGHT_BAR) height else height + (HEIGHT_BAR - height) * clampedCollapse(collapse)

    /**
     * La parallaxe : ±15° donnent ±12 px à l'orbe proche et ±6 px, à contresens, à la lointaine ; au-delà, ça plafonne. À plat,
     * 0,0 et jamais −0,0 (la portée lointaine est négative, et l'égalité d'une `data class` Kotlin distingue les deux zéros).
     */
    public fun parallax(tiltDegrees: Double): MeeshyLivingBannerParallax {
        if (!tiltDegrees.isFinite()) return MeeshyLivingBannerParallax(0.0, 0.0)
        val share = (tiltDegrees / TILT_FULL_DEGREES).coerceIn(-1.0, 1.0)
        return MeeshyLivingBannerParallax(0.0 + share * NEAR_REACH, 0.0 + share * FAR_REACH)
    }

    private fun orbOpacity(isDark: Boolean, near: Boolean, hasImage: Boolean, mode: MeeshyLivingBannerMode): Double {
        if (hasImage) return IMAGE_ORB_OPACITY
        if (mode == MeeshyLivingBannerMode.Fill && !near) return 0.0
        return when {
            isDark && near -> 0.75
            isDark -> 0.70
            near -> 0.50
            else -> 0.40
        }
    }
}
