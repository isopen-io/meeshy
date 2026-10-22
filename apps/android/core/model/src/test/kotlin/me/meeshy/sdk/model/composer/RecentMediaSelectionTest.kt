package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecentMediaSelectionTest {

    @Test
    fun `toggle is ignored until the selection is active`() {
        assertThat(RecentMediaSelection().toggle("A").ids).isEmpty()
    }

    @Test
    fun `begin activates and keeps pick order with one based position`() {
        val s = RecentMediaSelection().begin("A").toggle("B").toggle("C")
        assertThat(s.isActive).isTrue()
        assertThat(s.ids).containsExactly("A", "B", "C").inOrder()
        assertThat(s.position("B")).isEqualTo(2)
        assertThat(s.position("Z")).isNull()
    }

    @Test
    fun `toggling a selected id removes it and renumbers the others`() {
        val s = RecentMediaSelection().begin("A").toggle("B").toggle("C").toggle("A")
        assertThat(s.position("C")).isEqualTo(2)
    }

    @Test
    fun `activate enters selection without picking`() {
        val s = RecentMediaSelection().activate()
        assertThat(s.isActive).isTrue()
        assertThat(s.isEmpty).isTrue()
    }

    @Test
    fun `discard drops assets that joined the attachment zone but stays active`() {
        val s = RecentMediaSelection().begin("A").toggle("B").discard(setOf("A"))
        assertThat(s.ids).containsExactly("B")
        assertThat(s.isActive).isTrue()
    }

    @Test
    fun `clear leaves selection mode`() {
        val s = RecentMediaSelection().begin("A").clear()
        assertThat(s.isActive).isFalse()
        assertThat(s.ids).isEmpty()
    }
}
