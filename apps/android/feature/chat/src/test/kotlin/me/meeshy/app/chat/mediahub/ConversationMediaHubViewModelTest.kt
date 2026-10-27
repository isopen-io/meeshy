package me.meeshy.app.chat.mediahub

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.mediahub.ConversationMediaHubRepository
import me.meeshy.sdk.mediahub.MediaHubPage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.MediaHubPhase
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationMediaHubViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun photo(id: String, minute: Int) = ApiMessage(
        id = id,
        conversationId = "c1",
        createdAt = "2026-10-01T10:%02d:00.000Z".format(minute),
        attachments = listOf(ApiMessageAttachment(id = "a$id", mimeType = "image/png", fileUrl = "https://cdn/$id")),
    )

    private fun sut(repository: ConversationMediaHubRepository, index: ConversationMediaHubIndex = ConversationMediaHubIndex()): ConversationMediaHubViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(null)
        return ConversationMediaHubViewModel(repository, index, session, MeeshyConfig())
    }

    @Test
    fun `l index vu se peint sans attendre le reseau`() = runTest(dispatcher) {
        val index = ConversationMediaHubIndex().apply { merge("c1", ConversationMediaKind.VISUAL, listOf(photo("m1", 1)), complete = true) }
        val repository = mockk<ConversationMediaHubRepository>()
        val vm = sut(repository, index)

        vm.start("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.items.map { it.messageId }).containsExactly("m1")
        assertThat(vm.state.value.phase).isEqualTo(MediaHubPhase.LOADED)
        coVerify(exactly = 0) { repository.page(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `la premiere page remplit le segment et alimente l index`() = runTest(dispatcher) {
        val repository = mockk<ConversationMediaHubRepository>()
        coEvery { repository.page("c1", ConversationMediaKind.VISUAL, null, null, any(), any()) } returns
            NetworkResult.Success(MediaHubPage(listOf(photo("m2", 2), photo("m1", 1)), nextCursor = "m1", hasMore = true))
        val index = ConversationMediaHubIndex()
        val vm = sut(repository, index)

        vm.start("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.items.map { it.messageId }).containsExactly("m2", "m1").inOrder()
        assertThat(vm.state.value.canLoadMore).isTrue()
        assertThat(index.read("c1", ConversationMediaKind.VISUAL)?.carriers).hasSize(2)
    }

    @Test
    fun `la suite ne part jamais deux fois et reprend au curseur`() = runTest(dispatcher) {
        val repository = mockk<ConversationMediaHubRepository>()
        coEvery { repository.page("c1", ConversationMediaKind.VISUAL, null, null, any(), any()) } returns
            NetworkResult.Success(MediaHubPage(listOf(photo("m2", 2)), nextCursor = "m2", hasMore = true))
        coEvery { repository.page("c1", ConversationMediaKind.VISUAL, null, "m2", any(), any()) } returns
            NetworkResult.Success(MediaHubPage(listOf(photo("m1", 1)), nextCursor = null, hasMore = false))
        val vm = sut(repository)
        vm.start("c1")
        advanceUntilIdle()

        vm.loadMore()
        vm.loadMore()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.page("c1", ConversationMediaKind.VISUAL, null, "m2", any(), any()) }
        assertThat(vm.state.value.items).hasSize(2)
        assertThat(vm.state.value.canLoadMore).isFalse()
    }

    @Test
    fun `hors ligne sans rien de connu le segment le dit et reessayer relance`() = runTest(dispatcher) {
        val repository = mockk<ConversationMediaHubRepository>()
        coEvery { repository.page(any(), any(), any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError(message = "io"))
        val vm = sut(repository)

        vm.start("c1")
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(MediaHubPhase.OFFLINE)

        coEvery { repository.page(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(MediaHubPage(listOf(photo("m1", 1)), null, false))
        vm.retry()
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(MediaHubPhase.LOADED)
        assertThat(vm.state.value.items).hasSize(1)
    }

    @Test
    fun `la recherche repond d abord avec ce qui est connu puis complete par le serveur`() = runTest(dispatcher) {
        val repository = mockk<ConversationMediaHubRepository>()
        val named = photo("m1", 1).copy(content = "plage")
        coEvery { repository.page("c1", ConversationMediaKind.VISUAL, null, null, any(), any()) } returns
            NetworkResult.Success(MediaHubPage(listOf(named, photo("m2", 2)), null, false))
        coEvery { repository.page("c1", ConversationMediaKind.VISUAL, "plage", null, any(), any()) } returns
            NetworkResult.Success(MediaHubPage(listOf(named), null, false))
        val vm = sut(repository)
        vm.start("c1")
        advanceUntilIdle()

        vm.updateQuery("plage")
        advanceTimeBy(400)
        advanceUntilIdle()

        assertThat(vm.state.value.activeQuery).isEqualTo("plage")
        assertThat(vm.state.value.items.map { it.messageId }).containsExactly("m1")

        vm.updateQuery("p")
        assertThat(vm.state.value.activeQuery).isNull()
        assertThat(vm.state.value.items).hasSize(2)
    }
}
