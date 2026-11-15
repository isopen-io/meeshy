package me.meeshy.app.chat

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Test

class ComposerTextIsolationTest {

    @Test
    fun `typing moves the text flow and never the screen state`() = runTest {
        val screen = MutableStateFlow(ChatUiState(conversationId = "c1"))
        val holder = ComposerTextHolder()

        screen.test {
            assertThat(awaitItem().conversationId).isEqualTo("c1")
            holder.typed("h")
            holder.typed("he")
            holder.typed("hello")
            expectNoEvents()
            assertThat(holder.text).isEqualTo("hello")
        }
    }

    @Test
    fun `typing keeps the revision and an outside replace bumps it`() {
        val holder = ComposerTextHolder("seed")

        holder.typed("seed more")
        assertThat(holder.state.revision).isEqualTo(0)

        holder.replace("from outside")
        assertThat(holder.state).isEqualTo(ComposerTextState(text = "from outside", revision = 1))

        holder.clear()
        assertThat(holder.state).isEqualTo(ComposerTextState(text = "", revision = 2))
    }

    @Test
    fun `the text flow emits per keystroke while the screen state stays equal`() = runTest {
        val holder = ComposerTextHolder()

        holder.flow.test {
            assertThat(awaitItem().text).isEmpty()
            holder.typed("a")
            assertThat(awaitItem().text).isEqualTo("a")
            holder.typed("ab")
            assertThat(awaitItem().text).isEqualTo("ab")
        }
    }

    @Test
    fun `a blank text is not sendable and a non blank one has a sentiment`() {
        assertThat(ComposerTextState(text = "   ").hasText).isFalse()
        assertThat(ComposerTextState(text = "   ").sentiment).isNull()
        assertThat(ComposerTextState(text = "bonjour").hasText).isTrue()
        assertThat(ComposerTextState(text = "bonjour").sentiment).isNotNull()
    }
}
