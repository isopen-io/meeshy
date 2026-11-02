package me.meeshy.app.conversations

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.chat.ExplicitUnreadMarks
import me.meeshy.sdk.conversation.AppForegroundSignal
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.ListRefreshCoordinator
import me.meeshy.sdk.conversation.ListRefreshInvalidation
import me.meeshy.sdk.conversation.ListRefreshNeighbour
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.ConversationListLoadState
import me.meeshy.sdk.notification.ActiveConversationStore
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListLoaderTest {

    private class Harness(
        val scope: TestScope,
        val repository: ConversationRepository = mockk(relaxed = true),
        val foreground: AppForegroundSignal = AppForegroundSignal(),
        val marks: ExplicitUnreadMarks = ExplicitUnreadMarks(),
        val active: ActiveConversationStore = ActiveConversationStore(),
        val invalidated: MutableList<ListRefreshNeighbour> = mutableListOf(),
        var hasData: Boolean = false,
    ) {
        val network = MutableStateFlow(true)
        val socket = MutableStateFlow(false)

        private val invalidation = object : ListRefreshInvalidation {
            override val neighbour = ListRefreshNeighbour.MESSAGES
            override suspend fun invalidate() {
                invalidated += neighbour
            }
        }

        val loader = ConversationListLoader(
            scope = scope.backgroundScope,
            repository = repository,
            deps = ConversationListLoadingDeps(ListRefreshCoordinator(setOf(invalidation)), foreground, marks, active),
            hasData = { hasData },
        ).also { it.start(network, socket) }
    }

    private val rows = listOf(ApiConversation(id = "c1"))

    @Test
    fun `a stale cache paints without a spinner and its sync settles the list as loaded`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()

        h.loader.loadState.test {
            assertThat(awaitItem()).isEqualTo(ConversationListLoadState.Idle)
            h.loader.onStreamResult(CacheResult.Stale(rows, ageMillis = 60_000))
            assertThat(awaitItem()).isEqualTo(ConversationListLoadState.CachedStale)
            h.loader.onStreamResult(CacheResult.Fresh(rows, ageMillis = 0))
            assertThat(awaitItem()).isEqualTo(ConversationListLoadState.Loaded)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a fresh cache still triggers a silent sync`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()
        coEvery { h.repository.syncSilently() } returns true

        h.loader.onStreamResult(CacheResult.Fresh(rows, ageMillis = 0))
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.CachedFresh)
        runCurrent()

        coVerify(exactly = 1) { h.repository.syncSilently() }
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Loaded)
    }

    @Test
    fun `an expired but recoverable cache reads offline and a failed sync over it is no error`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()

        h.loader.onStreamResult(CacheResult.Syncing(rows))
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Offline)
        h.loader.onSyncFailed(IllegalStateException("offline"))

        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Offline)
    }

    @Test
    fun `a failed cold load repairs itself when the network comes back`() = runTest {
        val h = Harness(this)
        runCurrent()
        h.loader.onStreamResult(CacheResult.Empty)
        h.loader.onSyncFailed(IllegalStateException("Network unavailable"))
        runCurrent()
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Error("Network unavailable"))

        h.network.value = false
        runCurrent()
        coVerify(exactly = 0) { h.repository.refresh() }
        h.network.value = true
        runCurrent()

        coVerify(exactly = 1) { h.repository.refresh() }
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Loaded)
    }

    @Test
    fun `a socket reconnection also repairs a failed load`() = runTest {
        val h = Harness(this)
        runCurrent()
        h.loader.onStreamResult(CacheResult.Empty)
        h.loader.onSyncFailed(IllegalStateException("down"))
        runCurrent()

        h.socket.value = true
        runCurrent()

        coVerify(exactly = 1) { h.repository.refresh() }
    }

    @Test
    fun `a list that did not fail is never refreshed by a reconnection`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()
        h.loader.onStreamResult(CacheResult.Stale(rows, ageMillis = 60_000))
        runCurrent()

        h.network.value = false
        runCurrent()
        h.network.value = true
        h.socket.value = true
        runCurrent()

        coVerify(exactly = 0) { h.repository.refresh() }
    }

    @Test
    fun `a repair that fails again stays an error`() = runTest {
        val h = Harness(this)
        runCurrent()
        coEvery { h.repository.refresh() } throws IllegalStateException("still down")
        h.loader.onStreamResult(CacheResult.Empty)
        h.loader.onSyncFailed(IllegalStateException("down"))
        runCurrent()

        h.socket.value = true
        runCurrent()

        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Error("still down"))
    }

    @Test
    fun `the return to the foreground syncs silently`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()
        coEvery { h.repository.syncSilently() } returns true
        h.loader.onStreamResult(CacheResult.Stale(rows, ageMillis = 60_000))
        runCurrent()

        h.foreground.notifyEntered()
        runCurrent()

        coVerify(exactly = 1) { h.repository.syncSilently() }
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Loaded)
    }

    @Test
    fun `a successful pull invalidates the neighbours, emits the success event and reconciles unreads`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()
        h.active.setActive("open")
        h.marks.note("marked")
        h.loader.onStreamResult(CacheResult.Stale(rows, ageMillis = 60_000))

        h.loader.pullRefreshSucceeded.test {
            val failure = h.loader.pullToRefresh(listOf<suspend () -> Unit>({}))
            runCurrent()

            assertThat(failure).isNull()
            awaitItem()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(h.invalidated).containsExactly(ListRefreshNeighbour.MESSAGES)
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Loaded)
        coVerify { h.repository.reconcileUnreads("open", setOf("marked")) }
    }

    @Test
    fun `a pull whose side source fails keeps every neighbour cache`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()

        val failure = h.loader.pullToRefresh(listOf<suspend () -> Unit>({ throw IllegalStateException("stories offline") }))

        assertThat(failure).isNull()
        assertThat(h.invalidated).isEmpty()
    }

    @Test
    fun `a pull whose conversations fail returns the failure and never errors over data`() = runTest {
        val h = Harness(this, hasData = true)
        runCurrent()
        coEvery { h.repository.refresh() } throws IllegalStateException("offline")
        h.loader.onStreamResult(CacheResult.Stale(rows, ageMillis = 60_000))

        val failure = h.loader.pullToRefresh(emptyList())

        assertThat(failure).hasMessageThat().isEqualTo("offline")
        assertThat(h.loader.loadState.value).isEqualTo(ConversationListLoadState.Offline)
        assertThat(h.invalidated).isEmpty()
    }
}
