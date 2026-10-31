package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerUploadProgressViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session: SessionRepository = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk(relaxed = true)
    private val blobs: MediaBlobStore = mockk(relaxed = true)

    private fun viewModel(store: InMemoryStoryComposerDraftStore = InMemoryStoryComposerDraftStore()): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, media, mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), store, blobs, mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private fun photo(name: String) = MediaUploadItem(byteArrayOf(1), name, "image/jpeg")

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id", "image/jpeg", 1, 1, 1, null, null)

    @Test
    fun `each picked media gets its own line that follows its own bytes until all are attached`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<Unit>()
        coEvery { media.upload(any(), any()) } coAnswers {
            val report = secondArg<(Int, Long, Long) -> Unit>()
            report(0, 50L, 100L)
            gate.await()
            NetworkResult.Success(listOf(uploaded("m1"), uploaded("m2")))
        }

        vm.onMediaPicked(listOf(photo("a.jpg"), photo("b.jpg")))

        assertThat(vm.state.value.isUploadingMedia).isTrue()
        assertThat(vm.state.value.uploadingMedia).containsExactly(
            MediaUploadProgress.Uploading(50L, 100L), MediaUploadProgress.Idle,
        ).inOrder()
        gate.complete(Unit)
        assertThat(vm.state.value.uploadingMedia).isEmpty()
        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("m1", "m2")
    }

    @Test
    fun `a failing upload leaves no stale line behind`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any(), any()) } throws IllegalStateException("boom")

        vm.onMediaPicked(listOf(photo("a.jpg")))

        assertThat(vm.state.value.uploadingMedia).isEmpty()
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.MEDIA_FAILED)
    }

    private fun storedDraft(savedAt: Instant, vararg mediaIds: String) = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut", mediaIds = mediaIds.toList())),
        selectedId = "s1",
        updatedAt = savedAt.toString(),
    )

    @Test
    fun `a draft picked up after a day drops the server media the gateway swept and says so`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore(storedDraft(Instant.now().minusSeconds(26 * 3600), "pm-old")))

        vm.onEnterComposer()

        assertThat(vm.state.value.deck.slides.single().mediaIds).isEmpty()
        assertThat(vm.state.value.deck.slides.single().text).isEqualTo("salut")
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.MEDIA_RESTORE_LOST)
    }

    @Test
    fun `a recent draft keeps its server media`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore(storedDraft(Instant.now().minusSeconds(3600), "pm-fresh")))

        vm.onEnterComposer()

        assertThat(vm.state.value.deck.slides.single().mediaIds).containsExactly("pm-fresh")
    }

    @Test
    fun `an old draft keeps a media still held on the device for the outbox`() = runTest {
        val held = OutboxIds.cmid()
        coEvery { blobs.has(held) } returns true
        val vm = viewModel(InMemoryStoryComposerDraftStore(storedDraft(Instant.now().minusSeconds(3 * 24 * 3600), held)))

        vm.onEnterComposer()

        assertThat(vm.state.value.deck.slides.single().mediaIds).containsExactly(held)
    }

    @Test
    fun `a media-only draft whose media were all swept is not rebuilt, and the loss is said rather than silent`() = runTest {
        val store = InMemoryStoryComposerDraftStore(
            StoryComposerDraftSnapshot(
                slides = listOf(StoryDraftSlideSnapshot(id = "s1", mediaIds = listOf("pm-old"))),
                selectedId = "s1",
                updatedAt = Instant.now().minusSeconds(30 * 3600).toString(),
            ),
        )
        val vm = viewModel(store)

        vm.onEnterComposer()

        assertThat(vm.state.value.deck.slides.flatMap { it.mediaIds }).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo(StoryComposerViewModel.MEDIA_RESTORE_LOST)
    }
}
