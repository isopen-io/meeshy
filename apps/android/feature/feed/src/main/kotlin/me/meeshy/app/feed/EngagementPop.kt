package me.meeshy.app.feed

/**
 * Quand l'icône d'un engagement (cœur, repost, favori) « saute » — iOS `FeedPostActionsBar`
 * (`likeAnimating`, ressort 0.25/0.5) : seulement quand l'état PASSE à actif sous les yeux du
 * lecteur. Une carte qui se compose déjà aimée, ou un retrait, ne saute jamais.
 */
internal object EngagementPop {
    fun shouldPop(wasActive: Boolean?, isActive: Boolean): Boolean = wasActive == false && isActive

    /** Échelle au sommet du saut (iOS `scaleEffect(1.3)`). */
    const val PEAK_SCALE: Float = 1.3f

    /** Rotation du cœur au sommet du saut, en degrés (iOS `rotationEffect(-15)`). */
    const val HEART_TILT_DEGREES: Float = -15f

    /** Amortissement du ressort (iOS `dampingFraction: 0.5`). */
    const val SPRING_DAMPING: Float = 0.5f

    /** Temps de réponse du ressort, en secondes (iOS `response: 0.25`). */
    const val SPRING_RESPONSE_SECONDS: Float = 0.25f

    /** Raideur Compose équivalente à une réponse SwiftUI : (2π / réponse)². */
    fun stiffnessFor(responseSeconds: Float): Float {
        val omega = (2.0 * Math.PI / responseSeconds).toFloat()
        return omega * omega
    }

    /** Le glyphe tient son sommet avant de redescendre (iOS `asyncAfter(0.3)`). */
    const val HOLD_MILLIS: Long = 300L

    /** Durée de l'anneau qui s'élargit derrière le cœur (iOS `easeOut(0.4)`). */
    const val BURST_MILLIS: Int = 400
}
