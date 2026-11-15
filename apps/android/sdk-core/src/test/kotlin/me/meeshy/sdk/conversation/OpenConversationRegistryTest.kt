package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import me.meeshy.sdk.socket.ConversationRoomRegistry
import org.junit.Test

class OpenConversationRegistryTest {
    @Test
    fun `la source unique expose l'active, les ouvertes et leur ordre, et pousse la priorite aux salles`() {
        val rooms = mockk<ConversationRoomRegistry>(relaxed = true)
        val registry = OpenConversationRegistry(rooms)
        assertThat(registry.open("a")).isTrue()
        assertThat(registry.open("b")).isTrue()
        assertThat(registry.open("a")).isFalse()
        assertThat(registry.activeConversationId).isEqualTo("a")
        assertThat(registry.openConversationIds).containsExactly("a", "b")
        assertThat(registry.ledger.value.openOrder).containsExactly("b", "a").inOrder()
        verify { rooms.notePriority("a", setOf("a", "b")) }
        verify(exactly = 1) { rooms.join("a") }
        assertThat(registry.close("a")).isFalse()
        assertThat(registry.close("a")).isTrue()
        verify(exactly = 1) { rooms.leave("a") }
        assertThat(registry.activeConversationId).isEqualTo("b")
    }
}
