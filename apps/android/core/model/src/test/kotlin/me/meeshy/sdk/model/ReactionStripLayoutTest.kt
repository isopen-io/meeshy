package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReactionStripLayoutTest {
    private fun layout(count: Int, out: Boolean = false, last: Boolean = false) =
        ReactionStripLayout.of(count, isOutgoing = out, isLastReceivedMessage = last)

    @Test
    fun `zero reaction sur un message ordinaire ne monte rien`() {
        assertThat(layout(0).isMounted).isFalse()
    }

    @Test
    fun `trois reactions montrent trois pastilles sans plus`() {
        val l = layout(3)
        assertThat(l.visibleCount).isEqualTo(3)
        assertThat(l.overflowCount).isEqualTo(0)
    }

    @Test
    fun `quatre reactions tiennent sans pastille plus`() {
        val l = layout(4)
        assertThat(l.visibleCount).isEqualTo(4)
        assertThat(l.overflowCount).isEqualTo(0)
    }

    @Test
    fun `cinq reactions donnent quatre pastilles et plus un`() {
        val l = layout(5)
        assertThat(l.visibleCount).isEqualTo(4)
        assertThat(l.overflowCount).isEqualTo(1)
    }

    @Test
    fun `neuf reactions donnent plus cinq`() {
        assertThat(layout(9).overflowCount).isEqualTo(5)
    }

    @Test
    fun `le bouton d'ajout n'existe que sur le dernier message recu`() {
        assertThat(layout(0, last = true).showsAddButton).isTrue()
        assertThat(layout(0, last = true).isMounted).isTrue()
        assertThat(layout(2, last = false).showsAddButton).isFalse()
        assertThat(layout(2, out = true, last = true).showsAddButton).isFalse()
    }
}
