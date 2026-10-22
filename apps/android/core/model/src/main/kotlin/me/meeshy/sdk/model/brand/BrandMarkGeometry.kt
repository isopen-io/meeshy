package me.meeshy.sdk.model.brand

/**
 * LA GÉOMÉTRIE DU LOGO MEESHY — les trois traits de `MeeshyDashesShape` (iOS
 * `AnimatedLogoView`) en valeurs pures, dans l'espace de référence 1024 × 1024 de
 * `MeeshyBrandMark.referenceDashes`.
 *
 * Trois traits à bouts ronds, longueurs décroissantes, alignés à gauche. Ils se révèlent l'un
 * après l'autre (`trim` de 0 à 1, 0,25 s, retards 0 · 0,1 · 0,2 s) et, en mode continu,
 * respirent : 1,5 s dans chaque sens, 5 % plus grands, deux traits s'éclaircissant pendant
 * que le troisième s'estompe.
 *
 * Distincte de la géométrie du lanceur (`SplashLogoGeometry`), qui est celle de l'icône
 * adaptative et laisse sa zone de sécurité : ici, c'est le logo tel que l'écran d'accès le
 * dessine sur iOS.
 */
object BrandMarkGeometry {

    const val REFERENCE_SIDE: Float = 1024f

    /** Épaisseur d'un trait rapportée au côté du carré (112 / 1024, celle de l'icône). */
    const val LINE_WIDTH_RATIO: Float = 112f / 1024f

    const val REVEAL_DURATION_MILLIS: Int = 250
    const val BREATH_DURATION_MILLIS: Int = 1500
    const val BREATH_SCALE: Float = 1.05f

    data class Dash(
        val startX: Float,
        val endX: Float,
        val y: Float,
        val restingAlpha: Float,
        val breathingAlpha: Float,
        val revealDelayMillis: Int,
    ) {
        /** Opacité du trait à [phase] (0 au repos, 1 en pleine inspiration), bornée à 0..1. */
        fun alphaAt(phase: Float): Float {
            val t = phase.coerceIn(0f, 1f)
            return restingAlpha + (breathingAlpha - restingAlpha) * t
        }

        /** Abscisse atteinte par la pointe du trait quand il est révélé à [progress] (0..1). */
        fun endXAt(progress: Float): Float {
            val t = progress.coerceIn(0f, 1f)
            return startX + (endX - startX) * t
        }
    }

    val dashes: List<Dash> = listOf(
        Dash(startX = 262f, endX = 762f, y = 384f, restingAlpha = 0.7f, breathingAlpha = 1f, revealDelayMillis = 0),
        Dash(startX = 262f, endX = 662f, y = 512f, restingAlpha = 1f, breathingAlpha = 0.85f, revealDelayMillis = 100),
        Dash(startX = 262f, endX = 562f, y = 640f, restingAlpha = 0.75f, breathingAlpha = 1f, revealDelayMillis = 200),
    )
}
