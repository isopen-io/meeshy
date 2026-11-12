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

    private val bannerPlace = CallTopBannerStack.BANNER_HEIGHT_DP + CallTopBannerStack.GAP_DP

    @Test
    fun `sans bandeau, ma vignette ne descend pas`() {
        assertThat(CallTopBannerStack.selfTileClearanceDp(counted = emptySet(), heightsDp = emptyMap())).isEqualTo(0f)
    }

    @Test
    fun `mon partage, un enregistrement ou une capture prennent chacun leur place, vignette dessous (R1_5, R3_10)`() {
        for (banner in listOf(CallTopBanner.ScreenShare, CallTopBanner.Recording, CallTopBanner.Capture)) {
            assertThat(CallTopBannerStack.selfTileClearanceDp(setOf(banner), emptyMap())).isEqualTo(bannerPlace)
        }
    }

    @Test
    fun `la pile entiere pousse la vignette, chaque bandeau a sa hauteur mesuree et son ecart`() {
        val heights = mapOf(CallTopBanner.Recording to 112f)

        assertThat(
            CallTopBannerStack.selfTileClearanceDp(
                setOf(CallTopBanner.ScreenShare, CallTopBanner.Recording, CallTopBanner.Capture),
                heights,
            ),
        ).isEqualTo(bannerPlace + (112f + CallTopBannerStack.GAP_DP) + bannerPlace)
    }

    @Test
    fun `un bandeau mesure plus bas que le plancher compte le plancher`() {
        assertThat(CallTopBannerStack.selfTileClearanceDp(setOf(CallTopBanner.Capture), mapOf(CallTopBanner.Capture to 10f)))
            .isEqualTo(bannerPlace)
    }

    @Test
    fun `le cadre en direct ne repousse pas la vignette, un partage recu non plus (#17730)`() {
        assertThat(CallTopBannerStack.selfTileClearanceDp(setOf(CallTopBanner.LiveFrame), emptyMap())).isEqualTo(0f)
        assertThat(
            CallTopBannerStack.countedForSelfTile(isLocalScreenShareShown = false, isRecordingShown = false, isCaptureAlertShown = false),
        ).isEmpty()
    }

    @Test
    fun `les bandeaux comptes pour la vignette sont ceux qui sont montres`() {
        assertThat(CallTopBannerStack.countedForSelfTile(isLocalScreenShareShown = true, isRecordingShown = true, isCaptureAlertShown = true))
            .containsExactly(CallTopBanner.ScreenShare, CallTopBanner.Recording, CallTopBanner.Capture)
        assertThat(CallTopBannerStack.countedForSelfTile(isLocalScreenShareShown = false, isRecordingShown = true, isCaptureAlertShown = false))
            .containsExactly(CallTopBanner.Recording)
    }

    @Test
    fun `le bandeau repart vers le haut, sauf sous Reduire les animations ou il ne fait que se fondre`() {
        assertThat(CallTopBannerStack.leavesTowardTop(reduceMotion = false)).isTrue()
        assertThat(CallTopBannerStack.leavesTowardTop(reduceMotion = true)).isFalse()
    }

    @Test
    fun `#17845 L4_11 - la presence compte le partage recu et le cadre en direct, que ma vignette ignore`() {
        assertThat(
            CallTopBannerStack.present(isScreenShareShown = true, isRecordingShown = false, isCaptureAlertShown = false, isLiveFrameShown = true),
        ).containsExactly(CallTopBanner.ScreenShare, CallTopBanner.LiveFrame)
        assertThat(
            CallTopBannerStack.present(isScreenShareShown = false, isRecordingShown = false, isCaptureAlertShown = false, isLiveFrameShown = false),
        ).isEmpty()
    }

    @Test
    fun `#17845 L4_11 - la grille de groupe cede la place de la pile entiere, cadre en direct compris, a la meme loi que ma vignette`() {
        val heights = mapOf(CallTopBanner.Recording to 112f)
        val present = setOf(CallTopBanner.ScreenShare, CallTopBanner.Recording, CallTopBanner.LiveFrame)

        assertThat(CallTopBannerStack.groupGridClearanceDp(present, heights, isStageFullScreen = false))
            .isEqualTo(bannerPlace + (112f + CallTopBannerStack.GAP_DP) + bannerPlace)
        assertThat(CallTopBannerStack.groupGridClearanceDp(emptySet(), heights, isStageFullScreen = false)).isEqualTo(0f)
    }

    @Test
    fun `#17845 L4_11 - plein ecran, la pile est rangee et la grille reprend toute la place`() {
        assertThat(CallTopBannerStack.groupGridClearanceDp(setOf(CallTopBanner.Capture), emptyMap(), isStageFullScreen = true)).isEqualTo(0f)
    }

    @Test
    fun `#17845 L1_9 - un bandeau arrive et repart par sa seule translation, a la hauteur de sa propre mesure`() {
        assertThat(CallTopBannerStack.presenceTranslationFraction(progress = 1f, travels = true)).isEqualTo(0f)
        assertThat(CallTopBannerStack.presenceTranslationFraction(progress = 0f, travels = true)).isEqualTo(-1f)
        assertThat(CallTopBannerStack.presenceTranslationFraction(progress = 0.25f, travels = true)).isEqualTo(-0.75f)
        assertThat(CallTopBannerStack.presenceTranslationFraction(progress = 0f, travels = false)).isEqualTo(0f)
    }

    @Test
    fun `#17845 L1_9 - un bandeau qui change de place sans mesure repart de sa place d'avant, puis glisse`() {
        assertThat(CallTopBannerStack.placementShiftPx(previousTopPx = 200f, previousShiftPx = 0f, newTopPx = 120f)).isEqualTo(80f)
        assertThat(CallTopBannerStack.placementShiftPx(previousTopPx = 200f, previousShiftPx = 30f, newTopPx = 120f)).isEqualTo(110f)
        assertThat(CallTopBannerStack.placementShiftPx(previousTopPx = 120f, previousShiftPx = 0f, newTopPx = 120f)).isEqualTo(0f)
    }
}
