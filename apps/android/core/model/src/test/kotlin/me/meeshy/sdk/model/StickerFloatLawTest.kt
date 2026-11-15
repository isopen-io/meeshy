package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerFloatLawTest {

    @Test
    fun `constantes de la loi`() {
        assertThat(StickerFloatLaw.LIFT_DP).isEqualTo(4f)
        assertThat(StickerFloatLaw.HALF_PERIOD_SECONDS).isEqualTo(2.1)
        assertThat(StickerFloatLaw.SHADOW_ALPHA).isEqualTo(0.18f)
        assertThat(StickerFloatLaw.SHADOW_RADIUS_DP).isEqualTo(8f)
        assertThat(StickerFloatLaw.SHADOW_OFFSET_Y_DP).isEqualTo(6f)
    }

    @Test
    fun `leve de 4 dp en demi periode puis redescend`() {
        assertThat(StickerFloatLaw.offsetYDp(0.0, false)).isEqualTo(0f)
        assertThat(StickerFloatLaw.offsetYDp(2.1, false)).isWithin(1e-4f).of(-4f)
        assertThat(StickerFloatLaw.offsetYDp(4.2, false)).isWithin(1e-4f).of(0f)
        assertThat(StickerFloatLaw.offsetYDp(1.05, false)).isWithin(1e-4f).of(-2f)
    }

    @Test
    fun `l amplitude ne depasse jamais 4 dp`() {
        (0..500).map { StickerFloatLaw.offsetYDp(it * 0.037, false) }.forEach {
            assertThat(it).isAtMost(0f)
            assertThat(it).isAtLeast(-4f)
        }
    }

    @Test
    fun `reduire les animations fige le mouvement mais garde l ombre`() {
        assertThat(StickerFloatLaw.offsetYDp(2.1, true)).isEqualTo(0f)
        assertThat(StickerFloatLaw.offsetYDp(isLifted = true, reduceMotion = true)).isEqualTo(0f)
        assertThat(StickerFloatLaw.offsetYDp(isLifted = true, reduceMotion = false)).isEqualTo(-4f)
        assertThat(StickerFloatLaw.shadowAlpha(reduceMotion = true)).isEqualTo(0.18f)
    }
}
