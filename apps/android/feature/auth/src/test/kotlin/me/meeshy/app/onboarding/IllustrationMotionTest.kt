package me.meeshy.app.onboarding

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class IllustrationMotionTest {

    @Test
    fun `la cloche secoue en ressort 0,25 et 0,25 apres 0,3 s puis revient`() {
        val shake = OnboardingIllustrationMotion.bellShake
        assertThat(shake.response).isEqualTo(0.25f)
        assertThat(shake.damping).isEqualTo(0.25f)
        assertThat(shake.delayMillis).isEqualTo(300)
        assertThat(OnboardingIllustrationMotion.bellRelease.delayMillis).isEqualTo(700)
        assertThat(OnboardingIllustrationMotion.BELL_SHAKE_DEGREES).isEqualTo(12f)
    }

    @Test
    fun `le trophee apparait en ressort 0,55 et 0,55 depuis 0,6`() {
        val appear = OnboardingIllustrationMotion.trophyAppear
        assertThat(appear.response).isEqualTo(0.55f)
        assertThat(appear.damping).isEqualTo(0.55f)
        assertThat(OnboardingIllustrationMotion.TROPHY_START_SCALE).isEqualTo(0.6f)
    }

    @Test
    fun `l'anneau de story se remplit en 1,6 s apres 0,2 s`() {
        assertThat(OnboardingIllustrationMotion.STORY_RING_MILLIS).isEqualTo(1600)
        assertThat(OnboardingIllustrationMotion.STORY_RING_DELAY_MILLIS).isEqualTo(200)
    }

    @Test
    fun `le salon Global apparait en ressort 0,6 et 0,7 depuis 0,92`() {
        val appear = OnboardingIllustrationMotion.globalAppear
        assertThat(appear.response).isEqualTo(0.6f)
        assertThat(appear.damping).isEqualTo(0.7f)
        assertThat(OnboardingIllustrationMotion.GLOBAL_START_SCALE).isEqualTo(0.92f)
    }

    @Test
    fun `le prisme se retourne toutes les 1,8 s en ressort 0,7 et 0,75`() {
        assertThat(OnboardingIllustrationMotion.PRISM_FLIP_INTERVAL_MILLIS).isEqualTo(1800L)
        assertThat(OnboardingIllustrationMotion.prismFlip.response).isEqualTo(0.7f)
        assertThat(OnboardingIllustrationMotion.prismFlip.damping).isEqualTo(0.75f)
    }

    @Test
    fun `sous animations reduites aucune illustration ne bouge`() {
        OnboardingIllustration.entries.forEach {
            assertThat(OnboardingIllustrationMotion.animates(it, reduceMotion = true)).isFalse()
        }
    }

    @Test
    fun `animations permises seules les illustrations vivantes bougent`() {
        val moving = OnboardingIllustration.entries.filter { OnboardingIllustrationMotion.animates(it, reduceMotion = false) }
        assertThat(moving).containsExactly(
            OnboardingIllustration.PRISM,
            OnboardingIllustration.GLOBE,
            OnboardingIllustration.STORY_RING,
            OnboardingIllustration.BELL,
            OnboardingIllustration.TROPHY,
        )
    }

    @Test
    fun `l'etat final statique est le plus parlant`() {
        assertThat(OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.STORY_RING)).isEqualTo(1f)
        assertThat(OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.GLOBE)).isEqualTo(1f)
        assertThat(OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.TROPHY)).isEqualTo(1f)
        assertThat(OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.BELL)).isEqualTo(0f)
    }

    @Test
    fun `le prisme reduit empile l'original et sa traduction`() {
        assertThat(OnboardingIllustrationMotion.prismLayout(reduceMotion = true)).isEqualTo(PrismLayout.STACKED)
        assertThat(OnboardingIllustrationMotion.prismLayout(reduceMotion = false)).isEqualTo(PrismLayout.FLIPPING)
    }

    @Test
    fun `l'original du prisme est espagnol sauf quand l'interface l'est`() {
        assertThat(OnboardingIllustrationMotion.prismOriginalLanguage("fr")).isEqualTo("es")
        assertThat(OnboardingIllustrationMotion.prismOriginalLanguage("es")).isEqualTo("en")
        assertThat(OnboardingIllustrationMotion.prismOriginalText("es")).isEqualTo("Hola, ¿qué tal?")
        assertThat(OnboardingIllustrationMotion.prismOriginalText("en")).isEqualTo("Hi, how are you?")
    }

    @Test
    fun `la jauge se remplit au prorata, jamais au dela, et pleine sans seuil`() {
        assertThat(OnboardingGaugeMath.fraction(points = 3, threshold = 10)).isWithin(1e-6f).of(0.3f)
        assertThat(OnboardingGaugeMath.fraction(points = 30, threshold = 10)).isEqualTo(1f)
        assertThat(OnboardingGaugeMath.fraction(points = 0, threshold = 10)).isEqualTo(0f)
        assertThat(OnboardingGaugeMath.fraction(points = 5, threshold = 0)).isEqualTo(1f)
        assertThat(OnboardingGaugeMath.fraction(points = -4, threshold = 10)).isEqualTo(0f)
    }

    @Test
    fun `la jauge a 0 point reste visible mais estompee`() {
        assertThat(OnboardingGaugeMath.fillAlpha(points = 0)).isEqualTo(0.35f)
        assertThat(OnboardingGaugeMath.fillAlpha(points = 1)).isEqualTo(1f)
    }
}
