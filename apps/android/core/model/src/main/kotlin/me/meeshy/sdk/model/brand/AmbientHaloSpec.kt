package me.meeshy.sdk.model.brand

/** La teinte d'un halo, nommée par son jeton indigo ; le thème la résout en couleur. */
enum class AmbientHaloTone {
    INDIGO_500,
    INDIGO_700,
    INDIGO_400,
    INDIGO_300,
}

/**
 * Les halos ambiants des écrans d'accès — iOS `ThemePalette.ambientOrbs` pour la table, le
 * `glowPulse` de `LoginView` pour le mouvement.
 *
 * Quatre disques de la famille indigo, deux fois plus présents en sombre qu'en clair. Ils
 * respirent entre deux échelles, plus étroitement à mesure que le rang monte, sur deux
 * secondes en va-et-vient (`easeInOut`). Décor pur : sous « Réduire les animations » ils
 * restent à leur échelle de repos (phase 0) au lieu de pulser.
 */
object AmbientHaloSpec {

    const val PULSE_DURATION_MILLIS: Int = 2000

    private const val REST_SCALE = 0.8f
    private const val SWOLLEN_SCALE = 1.3f
    private const val RANK_STEP = 0.05f

    data class Halo(
        val tone: AmbientHaloTone,
        val alpha: Float,
        val sizeDp: Float,
        val offsetXDp: Float,
        val offsetYDp: Float,
    )

    fun halos(isDark: Boolean): List<Halo> = if (isDark) DARK else LIGHT

    /** Échelle du halo de rang [index] à [phase] (0 = repos, 1 = gonflé), bornée à 0..1. */
    fun scale(index: Int, phase: Float): Float {
        val t = phase.coerceIn(0f, 1f)
        val rest = REST_SCALE + RANK_STEP * index
        val swollen = SWOLLEN_SCALE - RANK_STEP * index
        return rest + (swollen - rest) * t
    }

    private fun halo(tone: AmbientHaloTone, alpha: Float, size: Float, x: Float, y: Float) =
        Halo(tone = tone, alpha = alpha, sizeDp = size, offsetXDp = x, offsetYDp = y)

    private val LIGHT: List<Halo> = listOf(
        halo(AmbientHaloTone.INDIGO_500, 0.05f, 300f, -100f, -200f),
        halo(AmbientHaloTone.INDIGO_700, 0.05f, 350f, 150f, 300f),
        halo(AmbientHaloTone.INDIGO_400, 0.04f, 250f, 100f, -100f),
        halo(AmbientHaloTone.INDIGO_300, 0.03f, 200f, -150f, 200f),
    )

    private val DARK: List<Halo> = listOf(
        halo(AmbientHaloTone.INDIGO_500, 0.10f, 300f, -100f, -200f),
        halo(AmbientHaloTone.INDIGO_700, 0.10f, 350f, 150f, 300f),
        halo(AmbientHaloTone.INDIGO_400, 0.08f, 250f, 100f, -100f),
        halo(AmbientHaloTone.INDIGO_300, 0.06f, 200f, -150f, 200f),
    )
}
