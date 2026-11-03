package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationBannerSwipeTest {

    @Test
    fun `une translation vers le haut au-dela du seuil ferme la banniere`() {
        assertThat(NotificationBannerSwipe.outcome(translation = -31f, predictedEnd = -31f))
            .isEqualTo(NotificationBannerSwipe.Outcome.Dismiss)
    }

    @Test
    fun `une translation exactement au seuil de fermeture ne ferme pas`() {
        assertThat(NotificationBannerSwipe.outcome(translation = -30f, predictedEnd = -30f))
            .isEqualTo(NotificationBannerSwipe.Outcome.None)
    }

    @Test
    fun `un jet rapide vers le haut ferme meme sur une courte translation`() {
        assertThat(NotificationBannerSwipe.outcome(translation = -10f, predictedEnd = -81f))
            .isEqualTo(NotificationBannerSwipe.Outcome.Dismiss)
    }

    @Test
    fun `un tirage vers le bas au-dela du seuil ouvre l'apercu`() {
        assertThat(NotificationBannerSwipe.outcome(translation = 37f, predictedEnd = 40f))
            .isEqualTo(NotificationBannerSwipe.Outcome.Preview)
    }

    @Test
    fun `un tirage vers le bas en deca du seuil ne fait rien et revient`() {
        assertThat(NotificationBannerSwipe.outcome(translation = 36f, predictedEnd = 60f))
            .isEqualTo(NotificationBannerSwipe.Outcome.None)
    }

    @Test
    fun `le haut gagne sur le bas quand la fin predite remonte`() {
        assertThat(NotificationBannerSwipe.outcome(translation = 40f, predictedEnd = -100f))
            .isEqualTo(NotificationBannerSwipe.Outcome.Dismiss)
    }

    @Test
    fun `la carte ne descend jamais sous sa position de repos`() {
        assertThat(NotificationBannerSwipe.lift(translation = 50f)).isEqualTo(0f)
        assertThat(NotificationBannerSwipe.lift(translation = -42f)).isEqualTo(-42f)
    }

    @Test
    fun `la fin predite prolonge la translation par la velocite`() {
        assertThat(NotificationBannerSwipe.predictedEnd(translation = -10f, velocityPerSecond = -400f))
            .isWithin(0.001f).of(-110f)
    }

    @Test
    fun `un tap est supprime pendant la fenetre qui suit une presentation modale`() {
        assertThat(NotificationBannerSwipe.isTapSuppressed(nowMillis = 1_500L, lastModalPresentedAtMillis = 1_000L)).isTrue()
        assertThat(NotificationBannerSwipe.isTapSuppressed(nowMillis = 1_600L, lastModalPresentedAtMillis = 1_000L)).isFalse()
        assertThat(NotificationBannerSwipe.isTapSuppressed(nowMillis = 1_000L, lastModalPresentedAtMillis = null)).isFalse()
    }
}
