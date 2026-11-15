package me.meeshy.app.onboarding

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OnboardingMotionPolicyTest {

    @Test
    fun `une carte glisse de droite a gauche quand les animations sont permises`() {
        assertThat(OnboardingMotionPolicy.cardTransition(reduceMotion = false))
            .isEqualTo(OnboardingCardTransition.SLIDE_AND_FADE)
    }

    @Test
    fun `sous animations reduites la carte ne fait que fondre`() {
        assertThat(OnboardingMotionPolicy.cardTransition(reduceMotion = true))
            .isEqualTo(OnboardingCardTransition.FADE)
    }

    @Test
    fun `le ressort de la carte est celui d'iOS 0,5 et 0,86`() {
        assertThat(OnboardingMotionPolicy.CARD_SPRING_RESPONSE).isEqualTo(0.5f)
        assertThat(OnboardingMotionPolicy.CARD_SPRING_DAMPING).isEqualTo(0.86f)
    }

    @Test
    fun `le gain vole du bas vers la pastille en rapetissant`() {
        val flight = OnboardingMotionPolicy.flight(reduceMotion = false)
        assertThat(flight.startOffsetDp).isEqualTo(280)
        assertThat(flight.endOffsetDp).isEqualTo(0)
        assertThat(flight.startScale).isEqualTo(1.6f)
        assertThat(flight.endScale).isEqualTo(0.4f)
        assertThat(flight.bounces).isTrue()
    }

    @Test
    fun `sous animations reduites le gain reste pres de la pastille sans echelle ni rebond`() {
        val flight = OnboardingMotionPolicy.flight(reduceMotion = true)
        assertThat(flight.startOffsetDp).isEqualTo(44)
        assertThat(flight.startScale).isEqualTo(1f)
        assertThat(flight.endScale).isEqualTo(1f)
        assertThat(flight.bounces).isFalse()
    }

    @Test
    fun `le vol est retire apres sa duree et plus tard sous animations reduites`() {
        assertThat(OnboardingMotionPolicy.flight(false).clearAfterMillis).isEqualTo(850L)
        assertThat(OnboardingMotionPolicy.flight(true).clearAfterMillis).isEqualTo(1900L)
        assertThat(OnboardingMotionPolicy.flight(true).delayMillis).isGreaterThan(OnboardingMotionPolicy.flight(false).delayMillis)
    }

    @Test
    fun `la taille de police est plafonnee a l'equivalent d'accessibility2`() {
        assertThat(OnboardingMotionPolicy.cappedFontScale(1f)).isEqualTo(1f)
        assertThat(OnboardingMotionPolicy.cappedFontScale(3f)).isEqualTo(OnboardingMotionPolicy.MAX_FONT_SCALE)
    }

    @Test
    fun `l'illustration plafonne sa police plus bas que la carte`() {
        assertThat(OnboardingMotionPolicy.cappedIllustrationFontScale(2f)).isEqualTo(OnboardingMotionPolicy.MAX_ILLUSTRATION_FONT_SCALE)
        assertThat(OnboardingMotionPolicy.cappedIllustrationFontScale(1f)).isEqualTo(1f)
    }
}
