package me.meeshy.app.calls

import app.cash.turbine.test
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class IncomingCallViewModelTest {

    @Test
    fun `an incoming offer from the socket reaches the root navigation`() = runTest {
        val offers = MutableSharedFlow<WaitingCall>(extraBufferCapacity = 4)
        val signals = mockk<CallSignalManager> { every { incomingOffers } returns offers }
        val viewModel = IncomingCallViewModel(signals)
        val offer = WaitingCall(callId = "c1", callerId = "u1", callerName = "Alice", isVideo = true)

        viewModel.incomingOffers.test {
            offers.emit(offer)
            org.junit.Assert.assertEquals(offer, awaitItem())
        }
    }
}
