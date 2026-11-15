package me.meeshy.app.onboarding

/** Les sept illustrations des cartes d'accueil (iOS `OnboardingIllustrations`). */
internal enum class OnboardingIllustration { PRISM, GLOBE, STORY_RING, FRIENDS, ENVELOPE, BELL, TROPHY }

/** Un ressort à l'iOS : `response` en secondes, `damping` en ratio, départ différé de [delayMillis]. */
internal data class IllustrationSpring(val response: Float, val damping: Float, val delayMillis: Int = 0)

internal enum class PrismLayout { FLIPPING, STACKED }

/**
 * Les choix de mouvement des illustrations, purs et sans Compose. Sous animations réduites,
 * chaque illustration est POSÉE dans son état le plus parlant : aucune boucle, aucun ressort.
 */
internal object OnboardingIllustrationMotion {
    const val PRISM_FLIP_INTERVAL_MILLIS: Long = 1800L
    val prismFlip = IllustrationSpring(response = 0.7f, damping = 0.75f)

    const val GLOBAL_START_SCALE: Float = 0.92f
    val globalAppear = IllustrationSpring(response = 0.6f, damping = 0.7f)

    const val STORY_RING_MILLIS: Int = 1600
    const val STORY_RING_DELAY_MILLIS: Int = 200

    const val BELL_SHAKE_DEGREES: Float = 12f
    val bellShake = IllustrationSpring(response = 0.25f, damping = 0.25f, delayMillis = 300)
    val bellRelease = IllustrationSpring(response = 0.4f, damping = 0.5f, delayMillis = 700)

    const val TROPHY_START_SCALE: Float = 0.6f
    val trophyAppear = IllustrationSpring(response = 0.55f, damping = 0.55f)

    fun animates(illustration: OnboardingIllustration, reduceMotion: Boolean): Boolean {
        if (reduceMotion) return false
        return when (illustration) {
            OnboardingIllustration.PRISM,
            OnboardingIllustration.GLOBE,
            OnboardingIllustration.STORY_RING,
            OnboardingIllustration.BELL,
            OnboardingIllustration.TROPHY,
            -> true
            OnboardingIllustration.FRIENDS,
            OnboardingIllustration.ENVELOPE,
            -> false
        }
    }

    /** La valeur d'arrivée de l'animation pilote : celle que montre l'état statique. */
    fun restingProgress(illustration: OnboardingIllustration): Float = when (illustration) {
        OnboardingIllustration.BELL -> 0f
        else -> 1f
    }

    fun prismLayout(reduceMotion: Boolean): PrismLayout =
        if (reduceMotion) PrismLayout.STACKED else PrismLayout.FLIPPING

    /** L'original est un TEXTE verbatim, jamais une clé : traduit, il deviendrait sa propre traduction. */
    fun prismOriginalLanguage(interfaceLanguage: String): String =
        if (interfaceLanguage == "es") "en" else "es"

    fun prismOriginalText(originalLanguage: String): String =
        if (originalLanguage == "es") "Hola, ¿qué tal?" else "Hi, how are you?"
}

/** La jauge du premier niveau (iOS `OnboardingLevelGauge`). */
internal object OnboardingGaugeMath {
    fun fraction(points: Int, threshold: Int): Float {
        if (threshold <= 0) return 1f
        return (points.toFloat() / threshold).coerceIn(0f, 1f)
    }

    fun fillAlpha(points: Int): Float = if (points == 0) 0.35f else 1f
}
