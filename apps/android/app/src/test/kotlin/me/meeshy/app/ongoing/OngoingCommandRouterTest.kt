package me.meeshy.app.ongoing

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ongoing.LiveActivityCommand
import org.junit.Test

class OngoingCommandRouterTest {

    @Test
    fun `a command with no handler is a no-op`() {
        assertThat(OngoingCommandRouter(emptySet()).dispatch(LiveActivityCommand.CallHangUp)).isFalse()
    }

    @Test
    fun `the first handler that takes the command wins`() {
        val seen = mutableListOf<String>()
        val first = OngoingCommandHandler { seen += "first"; false }
        val second = OngoingCommandHandler { seen += "second"; true }
        val third = OngoingCommandHandler { seen += "third"; true }
        val taken = OngoingCommandRouter(linkedSetOf(first, second, third)).dispatch(LiveActivityCommand.PlaybackToggle)
        assertThat(taken).isTrue()
        assertThat(seen).containsExactly("first", "second").inOrder()
    }
}
