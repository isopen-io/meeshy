package me.meeshy.sdk.model.feed

/** La teinte d'un halo du Flux ; le thème la résout en couleur (indigo400 ou erreur, jamais un littéral). */
enum class FeedHaloTone { INDIGO_400, ERROR }

/** Le mouvement d'entrée et de sortie du Flux superposé à la liste (iOS `RootView`, transition asymétrique). */
data class FeedOverlayMotion(
    val entersFromBottom: Boolean,
    val exitsToBottom: Boolean,
    val exitScale: Float,
    val fades: Boolean,
)

/**
 * L'apparence du Flux comme surcouche (iOS `ThemedFeedOverlay` + `RootView`) : deux halos flottants sur le dégradé
 * du thème, leur dérive lente, le dégagement des boutons flottants, et la transition asymétrique. Pur : l'écran ne
 * fait que projeter ces valeurs.
 */
object FeedOverlayAppearance {

    data class Halo(
        val tone: FeedHaloTone,
        val alpha: Float,
        val sizeDp: Float,
        val offsetXDp: Float,
        val offsetYDp: Float,
        val blurDp: Float,
    )

    const val BOTTOM_CLEARANCE_DP: Int = 100
    const val DRIFT_PERIOD_MILLIS: Int = 14_000
    const val DRIFT_AMPLITUDE_DP: Float = 24f

    private const val DARK_ALPHA = 0.10f
    private const val LIGHT_ALPHA = 0.06f
    private const val EXIT_SCALE = 0.95f

    fun halos(isDark: Boolean): List<Halo> {
        val alpha = if (isDark) DARK_ALPHA else LIGHT_ALPHA
        return listOf(
            Halo(FeedHaloTone.INDIGO_400, alpha, sizeDp = 300f, offsetXDp = -80f, offsetYDp = -100f, blurDp = 80f),
            Halo(FeedHaloTone.ERROR, alpha, sizeDp = 250f, offsetXDp = 100f, offsetYDp = 200f, blurDp = 70f),
        )
    }

    /** Décalage (dp) du halo [index] à [phase] (0..1, va-et-vient) : le centre à 0,5, sens opposés, nul sans animation. */
    fun drift(index: Int, phase: Float, reduceMotion: Boolean): Pair<Float, Float> {
        if (reduceMotion) return 0f to 0f
        val centered = (phase.coerceIn(0f, 1f) - 0.5f) * 2f
        val sign = if (index % 2 == 0) 1f else -1f
        val amount = centered * DRIFT_AMPLITUDE_DP * sign
        return amount to amount / 2f
    }

    fun motion(reduceMotion: Boolean): FeedOverlayMotion = FeedOverlayMotion(
        entersFromBottom = !reduceMotion,
        exitsToBottom = !reduceMotion,
        exitScale = if (reduceMotion) 1f else EXIT_SCALE,
        fades = true,
    )
}
