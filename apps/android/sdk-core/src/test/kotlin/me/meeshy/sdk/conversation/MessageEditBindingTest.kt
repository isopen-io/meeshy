package me.meeshy.sdk.conversation

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MessageEditBindingTest {

    private val edited = MutableSharedFlow<ApiMessage>()
    private val socket: MessageSocketManager = mockk { every { messageEdited } returns edited }
    private val messages: MessageRepository = mockk(relaxed = true)

    private fun binding() = MessageEditBinding(socket, messages, UnconfinedTestDispatcher())

    private fun terminalCall() = ApiMessage(id = "m1", conversationId = "c1", content = "Appel audio manqué")

    @Test
    fun `a message edited frame reaches the cache with no conversation screen open`() = runTest {
        binding().attach()

        edited.emit(terminalCall())

        coVerify(exactly = 1) { messages.applyServerEdit(terminalCall()) }
    }

    @Test
    fun `a failing write does not stop the next frame from being applied`() = runTest {
        coEvery { messages.applyServerEdit(match { it.id == "boom" }) } throws IllegalStateException("disk")
        binding().attach()

        edited.emit(terminalCall().copy(id = "boom"))
        edited.emit(terminalCall())

        coVerify(exactly = 1) { messages.applyServerEdit(terminalCall()) }
    }

    @Test
    fun `nothing is applied once detached`() = runTest {
        val binding = binding()
        binding.attach()
        binding.detach()

        edited.emit(terminalCall())

        coVerify(exactly = 0) { messages.applyServerEdit(any()) }
    }
}
