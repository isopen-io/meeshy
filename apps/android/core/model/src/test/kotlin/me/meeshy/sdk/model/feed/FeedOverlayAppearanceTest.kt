package me.meeshy.sdk.model.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedOverlayAppearanceTest {

    @Test
    fun `le fond porte deux halos, indigo puis erreur, aux decalages et tailles iOS`() {
        val halos = FeedOverlayAppearance.halos(isDark = true)

        assertThat(halos.map { it.tone }).containsExactly(FeedHaloTone.INDIGO_400, FeedHaloTone.ERROR).inOrder()
        assertThat(halos.map { it.sizeDp }).containsExactly(300f, 250f).inOrder()
        assertThat(halos.map { it.offsetXDp to it.offsetYDp }).containsExactly(-80f to -100f, 100f to 200f).inOrder()
        assertThat(halos.map { it.blurDp }).containsExactly(80f, 70f).inOrder()
    }

    @Test
    fun `l'opacite est de 10 pour cent en sombre et 6 pour cent en clair`() {
        assertThat(FeedOverlayAppearance.halos(isDark = true).map { it.alpha }).containsExactly(0.10f, 0.10f)
        assertThat(FeedOverlayAppearance.halos(isDark = false).map { it.alpha }).containsExactly(0.06f, 0.06f)
    }

    @Test
    fun `les halos derivent lentement en sens oppose et restent immobiles sans animation`() {
        val moved = FeedOverlayAppearance.drift(index = 0, phase = 1f, reduceMotion = false)
        val opposite = FeedOverlayAppearance.drift(index = 1, phase = 1f, reduceMotion = false)

        assertThat(moved.first).isGreaterThan(0f)
        assertThat(opposite.first).isLessThan(0f)
        assertThat(FeedOverlayAppearance.drift(index = 0, phase = 0.5f, reduceMotion = false)).isEqualTo(0f to 0f)
        assertThat(FeedOverlayAppearance.drift(index = 0, phase = 1f, reduceMotion = true)).isEqualTo(0f to 0f)
        assertThat(FeedOverlayAppearance.DRIFT_PERIOD_MILLIS).isAtLeast(8_000)
    }

    @Test
    fun `le bas du fil degage les boutons flottants de cent dp`() {
        assertThat(FeedOverlayAppearance.BOTTOM_CLEARANCE_DP).isEqualTo(100)
    }

    @Test
    fun `l'entree vient du bas avec un fondu et la sortie descend en reduisant a 95 pour cent`() {
        val motion = FeedOverlayAppearance.motion(reduceMotion = false)

        assertThat(motion.entersFromBottom).isTrue()
        assertThat(motion.exitsToBottom).isTrue()
        assertThat(motion.exitScale).isEqualTo(0.95f)
        assertThat(motion.fades).isTrue()
    }

    @Test
    fun `reduire les animations ne laisse qu'un fondu`() {
        val motion = FeedOverlayAppearance.motion(reduceMotion = true)

        assertThat(motion.entersFromBottom).isFalse()
        assertThat(motion.exitsToBottom).isFalse()
        assertThat(motion.exitScale).isEqualTo(1f)
        assertThat(motion.fades).isTrue()
    }
}
