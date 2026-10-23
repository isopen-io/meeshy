package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.TopChromeBarMotion.Exit
import org.junit.Test

class TopChromeBarMotionTest {
    @Test fun `la derniere barre remonte de sa hauteur plus l encart`() {
        assertThat(TopChromeBarMotion.exit(isLastBar = true, reduceMotion = false, safeAreaTopDp = 47f))
            .isEqualTo(Exit.SlideUp(47f))
    }

    @Test fun `une barre qui se range ne remonte pas de l encart`() {
        assertThat(TopChromeBarMotion.exit(isLastBar = false, reduceMotion = false, safeAreaTopDp = 47f))
            .isEqualTo(Exit.SlideUp(0f))
    }

    @Test fun `sous reduction de mouvement la sortie est un fondu`() {
        assertThat(TopChromeBarMotion.exit(true, true, 47f)).isEqualTo(Exit.Fade)
        assertThat(TopChromeBarMotion.exit(false, true, 47f)).isEqualTo(Exit.Fade)
    }

    @Test fun `ordre des couches 2 puis 0,6 puis 0,5 sous la bande a 1`() {
        assertThat(TopChromeBarMotion.layer(isLastBar = true, isCall = false)).isEqualTo(2f)
        assertThat(TopChromeBarMotion.layer(isLastBar = false, isCall = true)).isEqualTo(0.6f)
        assertThat(TopChromeBarMotion.layer(isLastBar = false, isCall = false)).isEqualTo(0.5f)
        assertThat(TopChromeBarMotion.BAND_LAYER).isEqualTo(1f)
    }

    @Test fun `la hauteur agregee est le max des barres`() {
        assertThat(TopChromeBarMotion.aggregateHeightDp(listOf(44f, 60f, 32f))).isEqualTo(60f)
        assertThat(TopChromeBarMotion.aggregateHeightDp(emptyList())).isEqualTo(0f)
    }
}
