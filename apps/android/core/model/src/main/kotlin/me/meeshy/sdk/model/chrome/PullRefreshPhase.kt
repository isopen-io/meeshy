package me.meeshy.sdk.model.chrome

/**
 * Phase logique d'un tirer-pour-rafraichir (iOS `MeeshyPullPhase`). Le contrôleur possède la
 * phase ; l'indicateur ne fait que la projeter.
 */
public sealed interface PullRefreshPhase {
    public data object Idle : PullRefreshPhase

    /** [progress] : 0..1, progression vers le seuil. */
    public data class Pulling(val progress: Float) : PullRefreshPhase

    public data object Armed : PullRefreshPhase
    public data object Refreshing : PullRefreshPhase
    public data object Completing : PullRefreshPhase
}

/**
 * Loi de phase du pull (iOS `MeeshyPullPhaseLaw`), pure. [next] rend `null` quand rien ne
 * change : l'appelant n'écrit alors pas son état, donc aucune recomposition pour un tick immobile.
 */
public object PullRefreshLaw {
    /** Seuil de tirage (dp) au-delà duquel le geste est armé. */
    public const val THRESHOLD_DP: Float = 90f

    /** Fenêtre où l'on voit que c'est fini avant que l'indicateur se replie. */
    public const val COMPLETION_BREATH_MILLIS: Long = 400L

    /**
     * - `Refreshing` / `Completing` : la séquence a la main, le défilement ne la perturbe jamais.
     * - distance <= 0 : retour à `Idle` (si on n'y est pas déjà).
     * - distance >= seuil : `Armed` (une seule fois).
     * - sinon : `Pulling(distance / seuil)`.
     */
    public fun next(
        phase: PullRefreshPhase,
        pullDistance: Float,
        threshold: Float = THRESHOLD_DP,
    ): PullRefreshPhase? {
        if (phase is PullRefreshPhase.Refreshing || phase is PullRefreshPhase.Completing) return null
        val target = target(pullDistance, threshold)
        return target.takeIf { it != phase }
    }

    /** Vrai quand la transition [from] -> [to] franchit le seuil : c'est là que l'haptique part. */
    public fun crossesThreshold(from: PullRefreshPhase, to: PullRefreshPhase): Boolean =
        to is PullRefreshPhase.Armed && from !is PullRefreshPhase.Armed

    private fun target(pullDistance: Float, threshold: Float): PullRefreshPhase = when {
        pullDistance <= 0f -> PullRefreshPhase.Idle
        threshold <= 0f -> PullRefreshPhase.Armed
        pullDistance >= threshold -> PullRefreshPhase.Armed
        else -> PullRefreshPhase.Pulling(pullDistance / threshold)
    }
}

/** Géométrie de l'indicateur (iOS `MeeshyPullIndicator`), pure : tout est fonction de la phase. */
public object PullIndicatorGeometry {
    public const val MAX_HEIGHT_DP: Float = 90f
    public const val LOGO_SIZE_DP: Float = 40f
    public const val RING_SIZE_DP: Float = 54f
    public const val ARMED_ROTATION_DEGREES: Float = 180f
    public const val RING_ROTATION_MILLIS: Int = 1200

    private fun unit(progress: Float): Float = progress.coerceIn(0f, 1f)

    /** Hauteur 0 au repos, croît avec le tirage, pleine ensuite. */
    public fun visibleHeightDp(phase: PullRefreshPhase): Float = when (phase) {
        PullRefreshPhase.Idle -> 0f
        is PullRefreshPhase.Pulling -> MAX_HEIGHT_DP * unit(phase.progress)
        PullRefreshPhase.Armed, PullRefreshPhase.Refreshing, PullRefreshPhase.Completing -> MAX_HEIGHT_DP
    }

    public fun logoOpacity(phase: PullRefreshPhase): Float = when (phase) {
        PullRefreshPhase.Idle -> 0f
        is PullRefreshPhase.Pulling -> unit(phase.progress)
        else -> 1f
    }

    public fun logoScale(phase: PullRefreshPhase): Float = when (phase) {
        PullRefreshPhase.Idle -> 0.6f
        is PullRefreshPhase.Pulling -> 0.6f + 0.4f * unit(phase.progress)
        PullRefreshPhase.Armed -> 1.04f
        PullRefreshPhase.Refreshing, PullRefreshPhase.Completing -> 1f
    }

    /** Rotation proportionnelle au tirage jusqu'à 180° au seuil ; le logo ne tourne pas ensuite. */
    public fun logoRotationDegrees(phase: PullRefreshPhase): Float = when (phase) {
        PullRefreshPhase.Idle -> 0f
        is PullRefreshPhase.Pulling -> unit(phase.progress) * ARMED_ROTATION_DEGREES
        PullRefreshPhase.Armed -> ARMED_ROTATION_DEGREES
        PullRefreshPhase.Refreshing, PullRefreshPhase.Completing -> 0f
    }

    /** Mélange 0 (indigo300 atténué) -> 1 (indigo500) de la couleur du logo. */
    public fun logoColorMix(phase: PullRefreshPhase): Float = when (phase) {
        PullRefreshPhase.Idle -> 0f
        is PullRefreshPhase.Pulling -> unit(phase.progress)
        else -> 1f
    }

    public fun showsRing(phase: PullRefreshPhase): Boolean = phase is PullRefreshPhase.Refreshing

    public fun isContinuous(phase: PullRefreshPhase): Boolean = phase is PullRefreshPhase.Refreshing
}
