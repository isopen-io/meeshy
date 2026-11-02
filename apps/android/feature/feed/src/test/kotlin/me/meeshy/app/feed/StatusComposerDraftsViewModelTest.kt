package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.model.StatusComposerDraftSnapshot
import me.meeshy.sdk.post.InMemoryStatusComposerDraftStore
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StatusComposerDraftsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val mood = StatusComposerDraft(selectedEmoji = "🔥", visibility = StatusVisibility.FRIENDS).withText("on y va")

    @Test
    fun `a mood edited reaches the durable draft after the calm, and the sheet reopens on it`() = runTest(dispatcher) {
        val store = InMemoryStatusComposerDraftStore()
        val vm = StatusComposerDraftsViewModel(store)

        vm.persist(mood)
        advanceTimeBy(StatusComposerDraftsViewModel.SAVE_DEBOUNCE_MS + 1)
        advanceUntilIdle()

        val restored = vm.restorable()
        assertThat(restored?.selectedEmoji).isEqualTo("🔥")
        assertThat(restored?.text).isEqualTo("on y va")
        assertThat(restored?.visibility).isEqualTo(StatusVisibility.FRIENDS)
    }

    @Test
    fun `an emptied mood erases the draft instead of keeping a blank one`() = runTest(dispatcher) {
        val store = InMemoryStatusComposerDraftStore(StatusComposerDraftSnapshot(emoji = "🎉"))
        val vm = StatusComposerDraftsViewModel(store)

        vm.persist(StatusComposerDraft())
        advanceUntilIdle()

        assertThat(store.load()).isNull()
    }

    @Test
    fun `a republication is never kept as the author's draft`() = runTest(dispatcher) {
        val store = InMemoryStoreSpy()
        val vm = StatusComposerDraftsViewModel(store)

        vm.persist(mood.copy(repostOfId = "post-1", viaUsername = "ana"))
        advanceUntilIdle()

        assertThat(store.load()).isNull()
    }

    @Test
    fun `discard erases the draft and a write still pending cannot bring it back`() = runTest(dispatcher) {
        val store = InMemoryStatusComposerDraftStore()
        val vm = StatusComposerDraftsViewModel(store)
        vm.persist(mood)

        vm.discard()
        advanceUntilIdle()

        assertThat(store.load()).isNull()
        assertThat(vm.restorable()).isNull()
    }

    @Test
    fun `a stored draft with nothing in it is not offered`() = runTest(dispatcher) {
        val vm = StatusComposerDraftsViewModel(InMemoryStatusComposerDraftStore(StatusComposerDraftSnapshot(text = " ")))

        assertThat(vm.restorable()).isNull()
    }

    private fun InMemoryStoreSpy() = InMemoryStatusComposerDraftStore()
}
