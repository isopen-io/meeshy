package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** P16.4 à P16.8 (`docs/product/appels-vue-finale.md`) et iOS `CallTopBannerStack` : la pile de bandeaux sous l'en-tête. */
class CallTopBannerStackTest {

    @Test
    fun `l'ordre est fixe, quel que soit l'ordre d'arrivee`() {
        val arrived = setOf(CallTopBanner.LiveFrame, CallTopBanner.Capture, CallTopBanner.Recording, CallTopBanner.ScreenShare)

        assertThat(CallTopBannerStack.ordered(arrived))
            .containsExactly(CallTopBanner.ScreenShare, CallTopBanner.Recording, CallTopBanner.Capture, CallTopBanner.LiveFrame)
            .inOrder()
    }

    @Test
    fun `un bandeau absent ne laisse pas de trou`() {
        assertThat(CallTopBannerStack.ordered(setOf(CallTopBanner.LiveFrame, CallTopBanner.ScreenShare)))
            .containsExactly(CallTopBanner.ScreenShare, CallTopBanner.LiveFrame)
            .inOrder()
        assertThat(CallTopBannerStack.ordered(emptySet())).isEmpty()
    }

    @Test
    fun `la priorite d'un overlay decroit dans l'ordre de la pile, le partage d'abord`() {
        val priorities = CallTopBanner.entries.map(CallTopBannerStack::priority)

        assertThat(priorities).isEqualTo(priorities.sortedDescending())
        assertThat(priorities.toSet()).hasSize(CallTopBanner.entries.size)
        assertThat(CallTopBannerStack.priority(CallTopBanner.ScreenShare)).isGreaterThan(CallTopBannerStack.priority(CallTopBanner.Recording))
    }

    @Test
    fun `la pile se pose sous la rangee de l'en-tete, presque pleine largeur`() {
        assertThat(CallTopBannerStack.HEADER_ROW_CLEARANCE_DP).isAtLeast(48f)
        assertThat(CallTopBannerStack.HORIZONTAL_MARGIN_DP).isEqualTo(12f)
    }

    @Test
    fun `le bandeau tient une cible de 48 dp`() {
        assertThat(CallTopBannerStack.BANNER_HEIGHT_DP).isAtLeast(48f)
    }

    @Test
    fun `ma vignette ne descend que pour mon propre partage`() {
        assertThat(CallTopBannerStack.selfTileClearanceDp(isLocalScreenShareShown = false)).isEqualTo(0f)
        assertThat(CallTopBannerStack.selfTileClearanceDp(isLocalScreenShareShown = true))
            .isEqualTo(CallTopBannerStack.BANNER_HEIGHT_DP + CallTopBannerStack.GAP_DP)
    }

    @Test
    fun `le bandeau repart vers le haut, sauf sous Reduire les animations ou il ne fait que se fondre`() {
        assertThat(CallTopBannerStack.leavesTowardTop(reduceMotion = false)).isTrue()
        assertThat(CallTopBannerStack.leavesTowardTop(reduceMotion = true)).isFalse()
    }
}
