package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw
import org.junit.Test

/** #16465 — miroir d'iOS #16463 : un déplié reste déplié pour la durée d'ouverture du fil, plusieurs peuvent l'être. */
class LongMessageExpansionStateTest {

    @Test
    fun `deplier deux messages les laisse deplies tous les deux`() {
        val first = LongMessageExpansionState().expanding("a")!!.state
        val both = first.expanding("b")!!.state

        assertThat(both.isExpanded("a")).isTrue()
        assertThat(both.isExpanded("b")).isTrue()
    }

    @Test
    fun `toucher a nouveau un deplie ne le replie pas`() {
        val expanded = LongMessageExpansionState().expanding("a")!!.state

        assertThat(expanded.expanding("a")).isNull()
        assertThat(expanded.isExpanded("a")).isTrue()
    }

    @Test
    fun `le depliage tient le bord haut`() {
        val expansion = LongMessageExpansionState().expanding("a")!!

        assertThat(expansion.anchor).isEqualTo(LongMessageExpansionLaw.Anchor.Top)
    }

    @Test
    fun `une nouvelle instance du fil part repliee`() {
        assertThat(LongMessageExpansionState().isExpanded("a")).isFalse()
    }

    @Test
    fun `la compensation du bord haut reste bornee par le viewport`() {
        val delta = ChatScrollGeometry.anchoredScrollDelta(
            edgeBefore = 800f,
            edgeAfter = 2_000f,
            orientation = ChatListOrientation.BottomUp,
            maxDelta = 900f,
        )

        assertThat(delta).isEqualTo(-900f)
    }
}
