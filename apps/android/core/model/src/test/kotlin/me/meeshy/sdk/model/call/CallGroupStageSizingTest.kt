package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallGroupStageSizingTest {
    private val families = listOf(
        CallActionFamilyRow(CallActionFamily.MyImage, listOf(CallAction.Camera)),
        CallActionFamilyRow(CallActionFamily.TheCall, listOf(CallAction.Captions, CallAction.Journal)),
    )

    @Test
    fun `compact height is below 500 and positive`() {
        assertThat(CallGroupStageSizing.isCompactHeight(499f)).isTrue()
        assertThat(CallGroupStageSizing.isCompactHeight(500f)).isFalse()
        assertThat(CallGroupStageSizing.isCompactHeight(0f)).isFalse()
    }

    @Test
    fun `regular height keeps the titled rows`() {
        val rows = CallGroupStageSizing.rows(families, isCompactHeight = false)
        assertThat(rows.map { it.family }).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
    }

    @Test
    fun `compact height folds into one untitled line`() {
        val rows = CallGroupStageSizing.rows(families, isCompactHeight = true)
        assertThat(rows).hasSize(1)
        assertThat(rows.single().family).isNull()
        assertThat(rows.single().id).isEqualTo("folded")
        assertThat(rows.single().actions).containsExactly(CallAction.Camera, CallAction.Captions, CallAction.Journal).inOrder()
        assertThat(CallGroupStageSizing.rows(emptyList(), isCompactHeight = true)).isEmpty()
    }

    @Test
    fun `the rows keep their 340 dp ceiling while the grid keeps its 140 dp floor (P12_7)`() {
        assertThat(CallGroupStageSizing.rowsCeilingDp(stageHeightDp = 900f, reservedDp = 240f)).isEqualTo(340f)
        assertThat(CallGroupStageSizing.rowsCeilingDp(stageHeightDp = 600f, reservedDp = 240f)).isEqualTo(600f - 240f - 140f)
    }

    @Test
    fun `the rows yield to the grid down to one line, never to nothing`() {
        assertThat(CallGroupStageSizing.rowsCeilingDp(stageHeightDp = 300f, reservedDp = 240f)).isEqualTo(96f)
        assertThat(CallGroupStageSizing.rowsCeilingDp(stageHeightDp = 0f, reservedDp = 240f)).isEqualTo(96f)
    }

    /** P11.1 — en portrait, la grille prend l'écran : elle commence au haut de la zone sûre et l'en-tête flotte sur sa première rangée. */
    @Test
    fun `P11_1 the grid starts at the top of the safe area and the header floats over its first row`() {
        assertThat(CallGroupStageSizing.gridTopBaseDp(isCompactHeight = false)).isEqualTo(8f)
        assertThat(CallGroupStageSizing.headerOverlapDp(isCompactHeight = false, bannerClearanceDp = 0f)).isEqualTo(44f)
    }

    /** L4.2 — en hauteur compacte, la grille reste ENTRE l'en-tête et la pilule : aucune plaque sous l'en-tête. */
    @Test
    fun `L4_2 in compact height the grid keeps the band of the header above it`() {
        assertThat(CallGroupStageSizing.gridTopBaseDp(isCompactHeight = true)).isEqualTo(CallGroupStageSizing.HEADER_BAND_DP)
        assertThat(CallGroupStageSizing.HEADER_BAND_DP).isEqualTo(52f)
        assertThat(CallGroupStageSizing.headerOverlapDp(isCompactHeight = true, bannerClearanceDp = 0f)).isEqualTo(0f)
    }

    /** L4.11 — la pile des bandeaux se pose SOUS l'en-tête : une grille qui flottait redescend d'abord sous sa rangée. */
    @Test
    fun `L4_11 a banner stack sends the floating grid back under the header row, then below the stack`() {
        assertThat(CallGroupStageSizing.gridBannerClearanceDp(isCompactHeight = false, stackDp = 0f)).isEqualTo(0f)
        assertThat(CallGroupStageSizing.gridBannerClearanceDp(isCompactHeight = false, stackDp = 60f)).isEqualTo(104f)
        assertThat(CallGroupStageSizing.gridBannerClearanceDp(isCompactHeight = true, stackDp = 60f)).isEqualTo(60f)
        listOf(false, true).forEach { compact ->
            val top = CallGroupStageSizing.gridTopBaseDp(compact) + CallGroupStageSizing.gridBannerClearanceDp(compact, stackDp = 60f)
            assertThat(top).isEqualTo(CallGroupStageSizing.HEADER_BAND_DP + 60f)
        }
    }

    /** P14 · U1 — ce que la scène pose à son haut (capsule de la une, puce d'écran) se tient sous l'en-tête, et le suit en glissant. */
    @Test
    fun `the header overlap shrinks as the grid glides down under the banners, and never goes negative`() {
        assertThat(CallGroupStageSizing.headerOverlapDp(isCompactHeight = false, bannerClearanceDp = 20f)).isEqualTo(24f)
        assertThat(CallGroupStageSizing.headerOverlapDp(isCompactHeight = false, bannerClearanceDp = 104f)).isEqualTo(0f)
    }
}
