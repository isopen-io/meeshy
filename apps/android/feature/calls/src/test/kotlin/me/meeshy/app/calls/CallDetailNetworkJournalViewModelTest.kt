package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.call.CallNetworkEvent
import me.meeshy.sdk.model.call.CallNetworkEventKind
import me.meeshy.sdk.model.call.CallNetworkJournal
import org.junit.After
import org.junit.Before
import org.junit.Test

/** The call detail shows the network journal this device recorded, at its place, and nothing otherwise (#13676). */
@OptIn(ExperimentalCoroutinesApi::class)
class CallDetailNetworkJournalViewModelTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val journals = mapOf(
        "call-1" to CallNetworkJournal("call-1", 0L, listOf(CallNetworkEvent(0L, CallNetworkEventKind.Reconnecting(1)))),
        "missed" to CallNetworkJournal("missed", 0L, listOf(CallNetworkEvent(0L, CallNetworkEventKind.Ended("missed")))),
    )

    private fun viewModel() = CallDetailNetworkJournalViewModel { callId -> journals[callId] }

    @Test
    fun `a recorded journal is shown for its call only`() = runTest {
        val viewModel = viewModel()

        viewModel.load("call-1")

        assertThat(viewModel.state.value.shownFor("call-1")?.timeline).hasSize(1)
        assertThat(viewModel.state.value.shownFor("call-2")).isNull()
    }

    @Test
    fun `a call never recorded here, or whose only event is its end, shows no section`() = runTest {
        val viewModel = viewModel()

        viewModel.load("unknown")
        assertThat(viewModel.state.value.shownFor("unknown")).isNull()

        viewModel.load("missed")
        assertThat(viewModel.state.value.shownFor("missed")).isNull()
    }
}
