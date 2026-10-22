package me.meeshy.app.onboarding

internal enum class OnboardingCardTransition { SLIDE_AND_FADE, FADE }

internal data class OnboardingFlightSpec(
    val startOffsetDp: Int,
    val endOffsetDp: Int,
    val startScale: Float,
    val endScale: Float,
    val delayMillis: Int,
    val durationMillis: Int,
    val clearAfterMillis: Long,
    val bounces: Boolean,
)

/** Les choix de mouvement du calque d'accueil (iOS `OnboardingOverlay`), purs et sans Compose. */
internal object OnboardingMotionPolicy {
    const val CARD_SPRING_RESPONSE: Float = 0.5f
    const val CARD_SPRING_DAMPING: Float = 0.86f

    /** Équivalent Android d'`accessibility2` (33 pt / 17 pt de corps sur iOS). */
    const val MAX_FONT_SCALE: Float = 1.9f

    /** Équivalent d'`xLarge` : l'illustration décorative ne grossit pas plus. */
    const val MAX_ILLUSTRATION_FONT_SCALE: Float = 1.15f

    fun cardTransition(reduceMotion: Boolean): OnboardingCardTransition =
        if (reduceMotion) OnboardingCardTransition.FADE else OnboardingCardTransition.SLIDE_AND_FADE

    fun flight(reduceMotion: Boolean): OnboardingFlightSpec =
        if (reduceMotion) {
            OnboardingFlightSpec(
                startOffsetDp = 44, endOffsetDp = 44, startScale = 1f, endScale = 1f,
                delayMillis = 600, durationMillis = 1200, clearAfterMillis = 1900L, bounces = false,
            )
        } else {
            OnboardingFlightSpec(
                startOffsetDp = 280, endOffsetDp = 0, startScale = 1.6f, endScale = 0.4f,
                delayMillis = 150, durationMillis = 700, clearAfterMillis = 850L, bounces = true,
            )
        }

    fun cappedFontScale(current: Float): Float = current.coerceAtMost(MAX_FONT_SCALE)

    fun cappedIllustrationFontScale(current: Float): Float = current.coerceAtMost(MAX_ILLUSTRATION_FONT_SCALE)
}
