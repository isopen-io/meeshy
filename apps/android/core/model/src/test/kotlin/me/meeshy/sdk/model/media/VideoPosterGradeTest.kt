package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoPosterGradeTest {
    @Test fun `les constantes alignent iOS`() {
        assertThat(VideoPosterGrade.BUBBLE_MAX_DIMENSION).isEqualTo(400)
        assertThat(VideoPosterGrade.FULLSCREEN_MIN_DIMENSION).isEqualTo(1_080)
        assertThat(VideoPosterGrade.EXTRACTION_MAX_DIMENSION).isEqualTo(1_920)
    }

    @Test fun `source connue grande exige 1080`() {
        assertThat(VideoPosterGrade.isFullscreenSharp(1_080, 3_840)).isTrue()
        assertThat(VideoPosterGrade.isFullscreenSharp(1_079, 3_840)).isFalse()
        assertThat(VideoPosterGrade.isFullscreenSharp(400, 3_840)).isFalse()
    }

    @Test fun `source connue petite se contente de la source`() {
        assertThat(VideoPosterGrade.isFullscreenSharp(854, 854)).isTrue()
        assertThat(VideoPosterGrade.isFullscreenSharp(640, 854)).isFalse()
    }

    @Test fun `source inconnue accepte tout ce qui depasse le grade bulle`() {
        assertThat(VideoPosterGrade.isFullscreenSharp(854, null)).isTrue()
        assertThat(VideoPosterGrade.isFullscreenSharp(400, null)).isFalse()
        assertThat(VideoPosterGrade.isFullscreenSharp(300, 0)).isFalse()
    }

    @Test fun `le thumbHash patiente le degrade n'est que le repli`() {
        assertThat(PendingPosterLayer.of("abc")).isEqualTo(PendingPosterLayer.THUMB_HASH)
        assertThat(PendingPosterLayer.of(null)).isEqualTo(PendingPosterLayer.GRADIENT)
        assertThat(PendingPosterLayer.of("")).isEqualTo(PendingPosterLayer.GRADIENT)
    }
}
