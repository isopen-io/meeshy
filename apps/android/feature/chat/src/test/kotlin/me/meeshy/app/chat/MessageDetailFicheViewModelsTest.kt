package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.EditRevisionLedger
import me.meeshy.sdk.conversation.ParticipantCacheRepository
import me.meeshy.sdk.conversation.ReadStatusRepository
import me.meeshy.sdk.conversation.ReadStatusState
import me.meeshy.sdk.model.EditRevision
import me.meeshy.sdk.model.MessageViewsFilter
import me.meeshy.sdk.model.ReadByUser
import me.meeshy.sdk.model.ReadStatusData
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MessageDetailFicheViewModelsTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun noCachedRoster() = mockk<ParticipantCacheRepository> {
        every { observe(any()) } returns flowOf(null)
    }

    private fun data(readers: Int, received: Int) = ReadStatusData(
        messageId = "m1", totalMembers = 3, receivedCount = received, readCount = readers,
        readBy = List(readers) { ReadByUser("p$it", "P$it") },
    )

    @Test
    fun `the sheet opens on the most advanced tab with someone to show`() = runTest(dispatcher) {
        val flow = MutableStateFlow(ReadStatusState(isLoading = true))
        val repository = mockk<ReadStatusRepository> { every { observe("m1", "c1") } returns flow }
        val vm = MessageViewsViewModel(repository, noCachedRoster())

        vm.bind("m1", "c1")
        advanceUntilIdle()
        assertThat(vm.state.value.status.showsSpinner).isTrue()
        assertThat(vm.state.value.filter).isEqualTo(MessageViewsFilter.Sent)

        flow.value = ReadStatusState(data = data(readers = 1, received = 2))
        advanceUntilIdle()
        assertThat(vm.state.value.filter).isEqualTo(MessageViewsFilter.Read)
    }

    @Test
    fun `a chosen tab wins over the served counts and a revalidation keeps the data`() = runTest(dispatcher) {
        val flow = MutableStateFlow(ReadStatusState(data = data(1, 2)))
        val repository = mockk<ReadStatusRepository> { every { observe("m1", "c1") } returns flow }
        val vm = MessageViewsViewModel(repository, noCachedRoster())
        vm.bind("m1", "c1")
        advanceUntilIdle()

        vm.select(MessageViewsFilter.Delivered)
        flow.value = ReadStatusState(data = data(2, 3), isLoading = true)
        advanceUntilIdle()

        assertThat(vm.state.value.filter).isEqualTo(MessageViewsFilter.Delivered)
        assertThat(vm.state.value.status.showsSpinner).isFalse()
        assertThat(vm.state.value.status.data?.readCount).isEqualTo(2)
    }

    @Test
    fun `binding another message resets the chosen tab and retry targets the bound message`() = runTest(dispatcher) {
        val repository = mockk<ReadStatusRepository>(relaxed = true) {
            every { observe(any(), any()) } returns MutableStateFlow(ReadStatusState())
        }
        val vm = MessageViewsViewModel(repository, noCachedRoster())
        vm.bind("m1", "c1")
        vm.select(MessageViewsFilter.NotSeen)
        vm.bind("m2", "c1")
        advanceUntilIdle()
        assertThat(vm.state.value.chosen).isNull()

        vm.retry()
        advanceUntilIdle()
        coVerify { repository.retry("m2") }
    }

    @Test
    fun `the edit history is null until the first read then follows the ledger`() = runTest(dispatcher) {
        val flow = MutableStateFlow(listOf(EditRevision(1, "old", 10L)))
        val ledger = mockk<EditRevisionLedger> { every { observe("m1") } returns flow }
        val vm = MessageEditHistoryViewModel(ledger)

        assertThat(vm.revisions.value).isNull()
        vm.bind("m1")
        advanceUntilIdle()
        assertThat(vm.revisions.value).containsExactly(EditRevision(1, "old", 10L))
    }

    @Test
    fun `a closed sheet stops listening and reopening serves the last read before revalidating`() = runTest(dispatcher) {
        val flow = MutableStateFlow(ReadStatusState(data = data(1, 2)))
        val repository = mockk<ReadStatusRepository> { every { observe("m1", "c1") } returns flow }
        val vm = MessageViewsViewModel(repository, noCachedRoster())
        vm.bind("m1", "c1")
        advanceUntilIdle()
        vm.select(MessageViewsFilter.Delivered)

        vm.unbind()
        flow.value = ReadStatusState(data = data(2, 3))
        advanceUntilIdle()
        assertThat(flow.subscriptionCount.value).isEqualTo(0)
        assertThat(vm.state.value.status.data?.readCount).isEqualTo(1)

        vm.bind("m1", "c1")
        assertThat(vm.state.value.chosen).isEqualTo(MessageViewsFilter.Delivered)
        advanceUntilIdle()
        assertThat(vm.state.value.status.data?.readCount).isEqualTo(2)
    }

    @Test
    fun `whoever hides their read receipts is not offered who read`() {
        assertThat(hostedDetailEntries(showReadReceipts = true)).contains(MessageAction.Views)
        assertThat(hostedDetailEntries(showReadReceipts = false))
            .containsExactly(
                MessageAction.History, MessageAction.Sentiment, MessageAction.Map, MessageAction.Select, MessageAction.ExportCard,
            )
    }
}
