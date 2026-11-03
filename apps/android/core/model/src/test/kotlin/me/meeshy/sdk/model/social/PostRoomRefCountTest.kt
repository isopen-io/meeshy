package me.meeshy.sdk.model.social

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostRoomRefCountTest {

    @Test
    fun `la premiere prise emet et la seconde non`() {
        val first = PostRoomRefCount().join("p1")
        val second = first.next.join("p1")
        assertThat(first.emit).isTrue()
        assertThat(second.emit).isFalse()
        assertThat(second.next.holdersOf("p1")).isEqualTo(2)
    }

    @Test
    fun `la salle n'est quittee qu'a la derniere sortie`() {
        val held = PostRoomRefCount().join("p1").next.join("p1").next
        val firstLeave = held.leave("p1")
        val lastLeave = firstLeave.next.leave("p1")
        assertThat(firstLeave.emit).isFalse()
        assertThat(lastLeave.emit).isTrue()
        assertThat(lastLeave.next.toRejoin()).isEmpty()
    }

    @Test
    fun `une sortie sans prise est inerte`() {
        val step = PostRoomRefCount().leave("ghost")
        assertThat(step.emit).isFalse()
        assertThat(step.next.toRejoin()).isEmpty()
    }

    @Test
    fun `toutes les salles tenues sont rejouees triees a la reconnexion`() {
        val state = PostRoomRefCount().join("b").next.join("a").next.join("a").next.join("c").next.leave("c").next
        assertThat(state.toRejoin()).containsExactly("a", "b").inOrder()
    }
}
