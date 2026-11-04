package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.SocketStoryDeletedData
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.FailedStoryPublish
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.LegacyDraftMediaSource
import me.meeshy.sdk.story.PendingStoryPublish
import me.meeshy.sdk.story.StoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftDiskStore
import me.meeshy.sdk.story.StoryDraftLibrary
import me.meeshy.sdk.story.StoryFailedRequest
import me.meeshy.sdk.story.StoryFailureResume
import me.meeshy.sdk.story.StoryPublishQueue
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

private class NoDeviceMedia : LegacyDraftMediaSource {
    override suspend fun copy(mediaId: String, directory: File): File? = null
}

internal fun testDraftStore(): StoryDraftDiskStore =
    StoryDraftDiskStore(
        Files.createTempDirectory("drafts").toFile(),
        Files.createTempDirectory("sess").toFile(),
        Json { ignoreUnknownKeys = true },
    )

internal fun testDraftLibrary(
    slot: StoryComposerDraftStore,
    io: CoroutineDispatcher,
    store: StoryDraftDiskStore = testDraftStore(),
): StoryDraftLibrary =
    StoryDraftLibrary(store, slot, NoDeviceMedia(), Files.createTempDirectory("stage").toFile(), io = io)

internal fun testFailureResume(
    request: StoryFailedRequest? = null,
    discarded: MutableList<String> = mutableListOf(),
    store: StoryDraftDiskStore = testDraftStore(),
): StoryFailureResume =
    StoryFailureResume(
        store = store,
        media = NoDeviceMedia(),
        staging = Files.createTempDirectory("resume").toFile(),
        readFailed = { request },
        discardFailed = { discarded += it },
    )

@OptIn(ExperimentalCoroutinesApi::class)
class MyStoriesQueueViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val deleted = MutableSharedFlow<SocketStoryDeletedData>(extraBufferCapacity = 8)

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val pending = PendingStoryPublish("pending_1", "salut", "PUBLIC", "fr", 1L, cmid = "c-live")
    private val failed = FailedStoryPublish("c-dead", "pending_2", "raté", "PUBLIC", "fr", 1L, 2L)

    private fun repository(queue: StoryPublishQueue) = mockk<StoryRepository>(relaxed = true).also {
        every { it.storiesStream(any(), any()) } returns flowOf(CacheResult.Fresh(emptyList(), 0L))
        every { it.publishQueue() } returns flowOf(queue)
        coEvery { it.cachedMyStories() } returns null
        coEvery { it.drainMyStories(any(), any()) } returns me.meeshy.sdk.net.NetworkResult.Success(emptyList())
    }

    private fun viewModel(
        repo: StoryRepository,
        request: StoryFailedRequest? = null,
        discarded: MutableList<String> = mutableListOf(),
        slot: StoryComposerDraftStore = InMemoryStoryComposerDraftStore(),
    ): MyStoriesViewModel {
        val drafts = testDraftStore()
        val session = mockk<SessionRepository>(relaxed = true).also { every { it.currentUserId } returns "me" }
        val socket = mockk<SocialSocketManager>(relaxed = true).also { every { it.storyDeleted } returns deleted }
        return MyStoriesViewModel(
            repo, mockk<PostRepository>(relaxed = true), session, socket, BlockCache(),
            testDraftLibrary(slot, dispatcher, drafts), testFailureResume(request, discarded, drafts), { 1_000L },
        )
    }

    @Test
    fun `la file porte les envois actifs puis les echecs`() = runTest(dispatcher) {
        val vm = viewModel(repository(StoryPublishQueue(listOf(pending), listOf(failed))))
        advanceUntilIdle()
        assertThat(vm.state.value.pendingUploads.single().cmid).isEqualTo("c-live")
        assertThat(vm.state.value.failed.single().cmid).isEqualTo("c-dead")
    }

    @Test
    fun `reessayer et annuler un envoi actif visent sa ligne d'outbox`() = runTest(dispatcher) {
        val repo = repository(StoryPublishQueue(listOf(pending), emptyList()))
        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.RetryPending("c-live"))
        vm.onEvent(MyStoriesUiEvent.CancelPending("c-live"))
        advanceUntilIdle()
        coVerify { repo.retryPublish("c-live") }
        coVerify { repo.discardPublish("c-live") }
    }

    @Test
    fun `abandonner un echec le retire de la file et le placeholder ne reste pas`() = runTest(dispatcher) {
        val repo = repository(StoryPublishQueue(emptyList(), listOf(failed)))
        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.RequestDiscardFailed("c-dead"))
        vm.onEvent(MyStoriesUiEvent.ConfirmDelete)
        advanceUntilIdle()
        coVerify { repo.discardPublish("c-dead") }
        assertThat(StoryOptimisticTray.pendingStories(emptyList(), StoryOptimisticTray.SelfIdentity("me", "me", null))).isEmpty()
    }

    @Test
    fun `reprendre un echec rend le brouillon pret au composeur et retire la ligne`() = runTest(dispatcher) {
        val discarded = mutableListOf<String>()
        val request = StoryFailedRequest("raté", emptyList(), "PUBLIC", emptyList(), null)
        val slot = InMemoryStoryComposerDraftStore()
        val vm = viewModel(repository(StoryPublishQueue(emptyList(), listOf(failed))), request, discarded, slot)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ResumeFailed("c-dead"))
        advanceUntilIdle()
        assertThat(discarded).containsExactly("c-dead")
        assertThat(vm.state.value.resumingCmid).isNull()
        val restored: StoryComposerDraftSnapshot? = slot.load()
        assertThat(restored!!.slides.single().text).isEqualTo("raté")
    }

    @Test
    fun `un echec de reprise laisse la ligne et ne touche pas l'emplacement`() = runTest(dispatcher) {
        val discarded = mutableListOf<String>()
        val slot = InMemoryStoryComposerDraftStore(
            StoryComposerDraftSnapshot(listOf(StoryDraftSlideSnapshot(id = "s", text = "x")), selectedId = "s"),
        )
        val vm = viewModel(repository(StoryPublishQueue(emptyList(), listOf(failed))), null, discarded, slot)
        advanceUntilIdle()
        vm.onEvent(MyStoriesUiEvent.ResumeFailed("c-dead"))
        advanceUntilIdle()
        assertThat(discarded).isEmpty()
        assertThat(slot.load()!!.slides.single().text).isEqualTo("x")
    }
}
