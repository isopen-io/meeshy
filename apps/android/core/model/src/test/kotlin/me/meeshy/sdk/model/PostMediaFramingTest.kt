package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostMediaFramingTest {
    @Test
    fun `dimensions absentes ou nulles retombent sur le plancher`() {
        assertThat(PostMediaFraming.heightRatio(null, 100)).isEqualTo(0.75)
        assertThat(PostMediaFraming.heightRatio(100, null)).isEqualTo(0.75)
        assertThat(PostMediaFraming.heightRatio(0, 100)).isEqualTo(0.75)
        assertThat(PostMediaFraming.heightRatio(100, 0)).isEqualTo(0.75)
        assertThat(PostMediaFraming.heightRatio(-4, 100)).isEqualTo(0.75)
    }

    @Test
    fun `un panorama est releve au plancher`() {
        assertThat(PostMediaFraming.heightRatio(2000, 500)).isEqualTo(0.75)
    }

    @Test
    fun `un clip vertical est plafonne`() {
        assertThat(PostMediaFraming.heightRatio(1080, 1920)).isEqualTo(1.4)
    }

    @Test
    fun `un ratio dans les bornes est conserve`() {
        assertThat(PostMediaFraming.heightRatio(1000, 1000)).isEqualTo(1.0)
        assertThat(PostMediaFraming.heightRatio(1200, 800)).isEqualTo(0.75)
        assertThat(PostMediaFraming.heightRatio(4, 5)).isEqualTo(1.25)
    }

    @Test
    fun `la hauteur est la largeur de carte multipliee par le ratio borne et arrondie`() {
        assertThat(PostMediaFraming.fittedMediaHeight(1000, 1000, cardWidth = 360f)).isEqualTo(360f)
        assertThat(PostMediaFraming.fittedMediaHeight(1080, 1920, cardWidth = 360f)).isEqualTo(504f)
        assertThat(PostMediaFraming.fittedMediaHeight(null, null, cardWidth = 361f)).isEqualTo(271f)
    }

    @Test
    fun `les bornes sont reglables`() {
        assertThat(PostMediaFraming.heightRatio(1080, 1920, maxTallRatio = 1.25)).isEqualTo(1.25)
    }
}
