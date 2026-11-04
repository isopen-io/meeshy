package me.meeshy.app.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import me.meeshy.sdk.model.sync.OutboxUiStatus
import me.meeshy.sdk.outbox.OfflineQueuePillProviding
import org.junit.After
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PendingBannersTest {
    private val items = MutableStateFlow<List<OutboxUiItem>>(emptyList())
    private val queue = object : OfflineQueuePillProviding {
        override val pendingUiItems: Flow<List<OutboxUiItem>> = items
        override suspend fun retryItem(outboxId: String): Boolean = true
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun story(id: String) =
        OutboxUiItem(id, OutboxUiKind.STORY, null, OutboxUiIcon.IMAGE, 0, OutboxNavigationSource.Unknown, OutboxUiStatus.PENDING, 0)

    private fun settings(id: String) =
        OutboxUiItem(id, OutboxUiKind.OTHER, null, OutboxUiIcon.NONE, 0, OutboxNavigationSource.Unknown, OutboxUiStatus.PENDING, 0, otherKey = "updateSettings")

    private fun TestScope.viewModel(): PendingBannersViewModel {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val vm = PendingBannersViewModel(queue)
        backgroundScope.launch { vm.uiState.collect { } }
        runCurrent()
        return vm
    }

    @Test
    fun `le bandeau compte les modifications en attente de l'outbox`() = runTest {
        val vm = viewModel()
        items.value = listOf(settings("a"), settings("b"), story("c"))
        runCurrent()
        assertThat(vm.uiState.value).isEqualTo(PendingBannersUiState(settingsCount = 2))
    }

    @Test
    fun `une story en attente n'allume jamais le bandeau du haut`() = runTest {
        val vm = viewModel()
        items.value = listOf(story("a"), story("b"))
        runCurrent()
        assertThat(vm.uiState.value.settingsCount).isEqualTo(0)
    }
}
