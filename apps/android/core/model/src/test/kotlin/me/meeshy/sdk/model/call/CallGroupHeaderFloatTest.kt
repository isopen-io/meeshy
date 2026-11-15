package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * P11.1 (#18220) — l'en-tête du groupe flotte sur la grille. Miroir de iOS `CallGroupHeaderFloatTests` (#18395), mêmes vecteurs :
 * la grille part de la zone sûre ; sous l'en-tête en hauteur compacte, à la une, ou dès qu'une pile est là ; plein écran = la
 * zone sûre et l'écart d'une vignette.
 */
class CallGroupHeaderFloatTest {

    @Test
    fun `P11_1 the header floats over the grid only, and not in compact height`() {
        assertThat(CallTopBannerStack.headerFloatsOverGroupStage(isGrid = true, isCompactHeight = false)).isTrue()
        assertThat(CallTopBannerStack.headerFloatsOverGroupStage(isGrid = true, isCompactHeight = true)).isFalse()
        assertThat(CallTopBannerStack.headerFloatsOverGroupStage(isGrid = false, isCompactHeight = false)).isFalse()
        assertThat(CallTopBannerStack.headerFloatsOverGroupStage(isGrid = false, isCompactHeight = true)).isFalse()
    }

    @Test
    fun `P11_1 a floating header lets the grid start at the safe area`() {
        assertThat(CallTopBannerStack.groupStageTopDp(headerFloats = true, stackDp = 0f, isStageFullScreen = false)).isEqualTo(0f)
    }

    @Test
    fun `L4_2 P14_1 a stage kept under the header starts below its row`() {
        assertThat(CallTopBannerStack.groupStageTopDp(headerFloats = false, stackDp = 0f, isStageFullScreen = false)).isEqualTo(52f)
    }

    @Test
    fun `L4_11 a banner stack sends the grid under the header row, then under the stack, floating or not`() {
        assertThat(CallTopBannerStack.groupStageTopDp(headerFloats = true, stackDp = 60f, isStageFullScreen = false)).isEqualTo(112f)
        assertThat(CallTopBannerStack.groupStageTopDp(headerFloats = false, stackDp = 60f, isStageFullScreen = false)).isEqualTo(112f)
    }

    @Test
    fun `U2 full screen takes the safe area and the spacing of one tile`() {
        assertThat(CallTopBannerStack.groupStageTopDp(headerFloats = true, stackDp = 0f, isStageFullScreen = true)).isEqualTo(8f)
        assertThat(CallTopBannerStack.groupStageTopDp(headerFloats = false, stackDp = 0f, isStageFullScreen = true)).isEqualTo(8f)
    }

    @Test
    fun `the band under the header is where the grid started before P11_1`() {
        assertThat(CallTopBannerStack.GROUP_STAGE_UNDER_HEADER_DP).isEqualTo(52f)
        assertThat(CallTopBannerStack.GROUP_STAGE_SPACING_DP).isEqualTo(CallTopBannerStack.GAP_DP)
    }
}
