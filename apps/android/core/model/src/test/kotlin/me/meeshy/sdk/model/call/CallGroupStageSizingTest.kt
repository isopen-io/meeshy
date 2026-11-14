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
}
