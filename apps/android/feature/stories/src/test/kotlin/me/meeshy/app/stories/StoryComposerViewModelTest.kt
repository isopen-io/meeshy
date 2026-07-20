package me.meeshy.app.stories

import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)
    private val media: MediaRepository = mockk(relaxed = true)
    private val uploadQueue: MediaUploadQueue = mockk(relaxed = true)

    private fun viewModel(
        user: MeeshyUser? = MeeshyUser(id = "me", username = "me", systemLanguage = "en"),
    ): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(user)
        return StoryComposerViewModel(repo, session, media, uploadQueue, workManager)
    }

    private fun offline(status: Int? = null): NetworkResult<List<UploadedMedia>> =
        NetworkResult.Failure(ApiError("offline", httpStatus = status))

    private fun item(name: String = "pic.jpg"): MediaUploadItem =
        MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = name, mimeType = "image/jpeg")

    private fun uploaded(id: String): UploadedMedia = UploadedMedia(
        id = id,
        url = "https://cdn/$id.jpg",
        mimeType = "image/jpeg",
        fileSize = 123,
        width = 100,
        height = 100,
        durationMs = null,
        thumbnailUrl = null,
    )

    @Test
    fun `onTextChange updates the draft text and can publish`() = runTest {
        val vm = viewModel()

        vm.onTextChange("hello world")

        assertThat(vm.state.value.draft.text).isEqualTo("hello world")
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `onVisibilityChange updates the draft visibility`() = runTest {
        val vm = viewModel()

        vm.onVisibilityChange(StoryVisibility.FRIENDS)

        assertThat(vm.state.value.draft.visibility).isEqualTo(StoryVisibility.FRIENDS)
    }

    @Test
    fun `blank draft cannot publish`() = runTest {
        val vm = viewModel()
        vm.onTextChange("   ")
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `publish enqueues one story, kicks the drain worker and emits published`() = runTest {
        val vm = viewModel()
        vm.onTextChange("  bonjour  ")
        vm.onVisibilityChange(StoryVisibility.FRIENDS)
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid-1"

        vm.published.test {
            vm.publish()
            awaitItem()
            cancelAndIgnoreRemainingEvents()
        }

        coVerify(exactly = 1) { repo.enqueuePublish(any(), any()) }
        coVerify(exactly = 1) { workManager.enqueue(any<OneTimeWorkRequest>()) }
        assertThat(request.captured.type).isEqualTo("STORY")
        assertThat(request.captured.content).isEqualTo("bonjour")
        assertThat(request.captured.visibility).isEqualTo("FRIENDS")
    }

    @Test
    fun `publish resolves the original language from the session user`() = runTest {
        val vm = viewModel(MeeshyUser(id = "me", username = "me", systemLanguage = "es"))
        vm.onTextChange("hola")
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"

        vm.publish()

        assertThat(request.captured.originalLanguage).isEqualTo("es")
    }

    @Test
    fun `publish falls back to fr when there is no signed-in user`() = runTest {
        val vm = viewModel(user = null)
        vm.onTextChange("hi")
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"

        vm.publish()

        assertThat(request.captured.originalLanguage).isEqualTo("fr")
    }

    @Test
    fun `publish clears the draft and the publishing flag on success`() = runTest {
        val vm = viewModel()
        vm.onTextChange("hi")
        coEvery { repo.enqueuePublish(any(), any()) } returns "cmid"

        vm.publish()

        assertThat(vm.state.value.draft.text).isEmpty()
        assertThat(vm.state.value.isPublishing).isFalse()
    }

    @Test
    fun `publish on a blank draft does nothing`() = runTest {
        val vm = viewModel()
        vm.onTextChange("   ")

        vm.publish()

        coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
        coVerify(exactly = 0) { workManager.enqueue(any<OneTimeWorkRequest>()) }
    }

    @Test
    fun `publish is re-entrancy guarded while a publish is in flight`() = runTest {
        val vm = viewModel()
        vm.onTextChange("hi")
        val gate = CompletableDeferred<String?>()
        coEvery { repo.enqueuePublish(any(), any()) } coAnswers { gate.await() }

        vm.publish()
        vm.publish()
        gate.complete("cmid")

        coVerify(exactly = 1) { repo.enqueuePublish(any(), any()) }
    }

    @Test
    fun `publish surfaces an error and preserves the draft when the queue throws`() = runTest {
        val vm = viewModel()
        vm.onTextChange("hi")
        coEvery { repo.enqueuePublish(any(), any()) } throws IllegalStateException("disk full")

        vm.publish()

        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.isPublishing).isFalse()
        assertThat(vm.state.value.draft.text).isEqualTo("hi")
    }

    @Test
    fun `onMediaPicked with no items does nothing`() = runTest {
        val vm = viewModel()

        vm.onMediaPicked(emptyList())

        coVerify(exactly = 0) { media.upload(any()) }
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.attachments).isEmpty()
    }

    @Test
    fun `onMediaPicked uploads and stores the returned media ids on the draft`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))

        vm.onMediaPicked(listOf(item()))

        coVerify(exactly = 1) { media.upload(any()) }
        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("m1")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("m1")
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `onMediaPicked appends to media already attached`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))
        vm.onMediaPicked(listOf(item()))
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m2")))

        vm.onMediaPicked(listOf(item("two.jpg")))

        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("m1", "m2").inOrder()
        assertThat(vm.state.value.draft.mediaIds).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `onMediaPicked marks uploading in flight and blocks publish until it resolves`() = runTest {
        val vm = viewModel()
        vm.onTextChange("hi")
        val gate = CompletableDeferred<NetworkResult<List<UploadedMedia>>>()
        coEvery { media.upload(any()) } coAnswers { gate.await() }

        vm.onMediaPicked(listOf(item()))

        assertThat(vm.state.value.isUploadingMedia).isTrue()
        assertThat(vm.state.value.canPublish).isFalse()

        gate.complete(NetworkResult.Success(listOf(uploaded("m1"))))
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `onMediaPicked is re-entrancy guarded while an upload is in flight`() = runTest {
        val vm = viewModel()
        val gate = CompletableDeferred<NetworkResult<List<UploadedMedia>>>()
        coEvery { media.upload(any()) } coAnswers { gate.await() }

        vm.onMediaPicked(listOf(item()))
        vm.onMediaPicked(listOf(item("two.jpg")))
        gate.complete(NetworkResult.Success(listOf(uploaded("m1"))))

        coVerify(exactly = 1) { media.upload(any()) }
    }

    @Test
    fun `onMediaPicked surfaces an error and keeps the draft empty of media on a failure response`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Failure(ApiError("too large", httpStatus = 413))

        vm.onMediaPicked(listOf(item()))

        assertThat(vm.state.value.errorMessage).isEqualTo("too large")
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `onMediaPicked surfaces an error when the upload throws`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } throws IllegalStateException("no network")

        vm.onMediaPicked(listOf(item()))

        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `onMediaPicked surfaces an error when every uploaded row was unusable`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(emptyList())

        vm.onMediaPicked(listOf(item()))

        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `onRemoveMedia drops the attachment and its id from the draft`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1"), uploaded("m2")))
        vm.onMediaPicked(listOf(item()))

        vm.onRemoveMedia("m1")

        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("m2")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("m2")
    }

    @Test
    fun `a media-only draft publishes and carries the media ids into the request`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))
        vm.onMediaPicked(listOf(item()))
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"

        vm.publish()

        coVerify(exactly = 1) { repo.enqueuePublish(any(), any()) }
        assertThat(request.captured.mediaIds).containsExactly("m1")
        assertThat(request.captured.content).isNull()
    }

    @Test
    fun `onMediaPicked is inert and warns once the draft is at the media cap`() = runTest {
        val vm = viewModel()
        val full = (1..StoryComposerDraft.MAX_MEDIA).map { uploaded("m$it") }
        coEvery { media.upload(any()) } returns NetworkResult.Success(full)
        vm.onMediaPicked(List(StoryComposerDraft.MAX_MEDIA) { item("p$it.jpg") })

        vm.onMediaPicked(listOf(item("over.jpg")))

        coVerify(exactly = 1) { media.upload(any()) }
        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.attachments).hasSize(StoryComposerDraft.MAX_MEDIA)
    }

    @Test
    fun `onMediaPicked only uploads as many items as there are free media slots`() = runTest {
        val vm = viewModel()
        val seedCount = StoryComposerDraft.MAX_MEDIA - 1
        coEvery { media.upload(any()) } returns
            NetworkResult.Success((1..seedCount).map { uploaded("m$it") })
        vm.onMediaPicked(List(seedCount) { item("seed$it.jpg") })

        val captured = slot<List<MediaUploadItem>>()
        coEvery { media.upload(capture(captured)) } returns NetworkResult.Success(listOf(uploaded("last")))
        vm.onMediaPicked(listOf(item("a.jpg"), item("b.jpg"), item("c.jpg")))

        assertThat(captured.captured).hasSize(1)
        assertThat(vm.state.value.attachments).hasSize(StoryComposerDraft.MAX_MEDIA)
    }

    @Test
    fun `publish clears attached media on success`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))
        vm.onMediaPicked(listOf(item()))
        coEvery { repo.enqueuePublish(any(), any()) } returns "cmid"

        vm.publish()

        assertThat(vm.state.value.attachments).isEmpty()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `a single offline pick is durably queued and staged as a pending attachment`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"

        vm.onMediaPicked(listOf(item()))

        coVerify(exactly = 1) { uploadQueue.enqueue(any()) }
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("up-1")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("up-1")
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `a permanent upload failure surfaces an error and is never queued`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline(status = 413)

        vm.onMediaPicked(listOf(item()))

        coVerify(exactly = 0) { uploadQueue.enqueue(any()) }
        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo("offline")
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `a multi-item offline pick durably queues every item as its own pending upload`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returnsMany listOf("up-1", "up-2")

        vm.onMediaPicked(listOf(item("a.jpg"), item("b.jpg")))

        coVerify(exactly = 2) { uploadQueue.enqueue(any()) }
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("up-1", "up-2").inOrder()
        assertThat(vm.state.value.draft.mediaIds).containsExactly("up-1", "up-2").inOrder()
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `a second offline pick is appended as a second pending upload`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returnsMany listOf("up-1", "up-2")
        vm.onMediaPicked(listOf(item("first.jpg")))

        vm.onMediaPicked(listOf(item("second.jpg")))

        coVerify(exactly = 2) { uploadQueue.enqueue(any()) }
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("up-1", "up-2").inOrder()
        assertThat(vm.state.value.draft.mediaIds).containsExactly("up-1", "up-2").inOrder()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `an offline pick is truncated to the free slots before being durably queued`() = runTest {
        val vm = viewModel()
        val seedCount = StoryComposerDraft.MAX_MEDIA - 1
        coEvery { media.upload(any()) } returns
            NetworkResult.Success((1..seedCount).map { uploaded("m$it") })
        vm.onMediaPicked(List(seedCount) { item("seed$it.jpg") })
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returnsMany listOf("up-1", "up-2")

        vm.onMediaPicked(listOf(item("a.jpg"), item("b.jpg")))

        coVerify(exactly = 1) { uploadQueue.enqueue(any()) }
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("up-1")
        assertThat(vm.state.value.draft.mediaIds).hasSize(StoryComposerDraft.MAX_MEDIA)
    }

    @Test
    fun `publish gates the story on the pending upload and carries its placeholder id`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))
        val request = slot<CreateStoryRequest>()
        val dependsOn = slot<List<String>>()
        coEvery { repo.enqueuePublish(capture(request), capture(dependsOn)) } returns "story-cmid"

        vm.publish()

        coVerify(exactly = 1) { repo.enqueuePublish(any(), any()) }
        coVerify(exactly = 1) { workManager.enqueue(any<OneTimeWorkRequest>()) }
        assertThat(dependsOn.captured).containsExactly("up-1")
        assertThat(request.captured.mediaIds).containsExactly("up-1")
        assertThat(request.captured.content).isNull()
    }

    @Test
    fun `publish gates the story on every pending upload and carries all placeholder ids`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returnsMany listOf("up-1", "up-2")
        vm.onMediaPicked(listOf(item("a.jpg"), item("b.jpg")))
        val request = slot<CreateStoryRequest>()
        val dependsOn = slot<List<String>>()
        coEvery { repo.enqueuePublish(capture(request), capture(dependsOn)) } returns "story-cmid"

        vm.publish()

        assertThat(dependsOn.captured).containsExactly("up-1", "up-2").inOrder()
        assertThat(request.captured.mediaIds).containsExactly("up-1", "up-2").inOrder()
        assertThat(request.captured.content).isNull()
    }

    @Test
    fun `publish with no offline-queued media gates on no prerequisites`() = runTest {
        val vm = viewModel()
        vm.onTextChange("plain text story")
        val dependsOn = slot<List<String>>()
        coEvery { repo.enqueuePublish(any(), capture(dependsOn)) } returns "story-cmid"

        vm.publish()

        assertThat(dependsOn.captured).isEmpty()
    }

    @Test
    fun `removing the pending upload clears it and its placeholder media id`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))

        vm.onRemoveMedia("up-1")

        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `removing the pending upload cancels its durable upload row and blob`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))

        vm.onRemoveMedia("up-1")

        coVerify(exactly = 1) { uploadQueue.cancel("up-1") }
    }

    @Test
    fun `removing one of several pending uploads keeps the rest and cancels only that durable row`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returnsMany listOf("up-1", "up-2")
        vm.onMediaPicked(listOf(item("a.jpg"), item("b.jpg")))

        vm.onRemoveMedia("up-1")

        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("up-2")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("up-2")
        coVerify(exactly = 1) { uploadQueue.cancel("up-1") }
        coVerify(exactly = 0) { uploadQueue.cancel("up-2") }
    }

    @Test
    fun `removing an uploaded attachment never cancels a durable upload`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))
        vm.onMediaPicked(listOf(item()))

        vm.onRemoveMedia("m1")

        coVerify(exactly = 0) { uploadQueue.cancel(any()) }
    }

    @Test
    fun `removing a non-pending id while an upload is pending does not cancel it`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))

        vm.onRemoveMedia("not-the-pending-id")

        coVerify(exactly = 0) { uploadQueue.cancel(any()) }
        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("up-1")
    }

    @Test
    fun `removing the pending upload clears state even when the durable cancel fails`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        coEvery { uploadQueue.cancel(any()) } throws IllegalStateException("disk busy")
        vm.onMediaPicked(listOf(item()))

        vm.onRemoveMedia("up-1")

        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `a pending upload keeps an already-uploaded media id alongside its placeholder`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))
        vm.onMediaPicked(listOf(item("online.jpg")))
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"

        vm.onMediaPicked(listOf(item("offline.jpg")))

        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("m1")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("m1", "up-1").inOrder()
    }

    @Test
    fun `the pending upload counts toward the media cap`() = runTest {
        val vm = viewModel()
        val seedCount = StoryComposerDraft.MAX_MEDIA - 1
        coEvery { media.upload(any()) } returns
            NetworkResult.Success((1..seedCount).map { uploaded("m$it") })
        vm.onMediaPicked(List(seedCount) { item("seed$it.jpg") })
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-last"
        vm.onMediaPicked(listOf(item("offline.jpg")))

        assertThat(vm.state.value.draft.mediaIds).hasSize(StoryComposerDraft.MAX_MEDIA)
        assertThat(vm.state.value.draft.isMediaFull).isTrue()
    }

    @Test
    fun `a failure while durably queuing surfaces an error and stages nothing`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } throws IllegalStateException("disk full")

        vm.onMediaPicked(listOf(item()))

        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `the first staged item survives when a later durable enqueue fails mid-batch`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1" andThenThrows IllegalStateException("disk full")

        vm.onMediaPicked(listOf(item("a.jpg"), item("b.jpg")))

        assertThat(vm.state.value.pendingUploads.map { it.cmid }).containsExactly("up-1")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("up-1")
        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.isUploadingMedia).isFalse()
    }

    @Test
    fun `publish clears the pending upload on success`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))
        coEvery { repo.enqueuePublish(any(), any()) } returns "story-cmid"

        vm.publish()

        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    // --- multi-slide deck ---

    @Test
    fun `the composer starts with a single empty selected slide`() = runTest {
        val vm = viewModel()

        assertThat(vm.state.value.deck.size).isEqualTo(1)
        assertThat(vm.state.value.deck.selectedSlide.text).isEmpty()
    }

    @Test
    fun `onTextChange writes the text into the selected slide and mirrors the editor`() = runTest {
        val vm = viewModel()

        vm.onTextChange("hello")

        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("hello")
        assertThat(vm.state.value.draft.text).isEqualTo("hello")
    }

    @Test
    fun `onAddSlide appends a new empty selected slide and clears the editor`() = runTest {
        val vm = viewModel()
        vm.onTextChange("first")

        vm.onAddSlide()

        val deck = vm.state.value.deck
        assertThat(deck.size).isEqualTo(2)
        assertThat(deck.selectedSlide.text).isEmpty()
        assertThat(deck.slides.first().text).isEqualTo("first")
        assertThat(vm.state.value.draft.text).isEmpty()
    }

    @Test
    fun `each slide keeps its own text as the selection moves`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onTextChange("two")
        val firstId = vm.state.value.deck.slides.first().id

        vm.onSelectSlide(firstId)

        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("one")
        assertThat(vm.state.value.draft.text).isEqualTo("one")
    }

    @Test
    fun `onAddSlide is inert at the slide cap`() = runTest {
        val vm = viewModel()

        repeat(StorySlideDeck.MAX_SLIDES + 3) { vm.onAddSlide() }

        assertThat(vm.state.value.deck.size).isEqualTo(StorySlideDeck.MAX_SLIDES)
    }

    @Test
    fun `onDuplicateSelectedSlide clones the selected slide's text and selects the clone`() = runTest {
        val vm = viewModel()
        vm.onTextChange("dup me")

        vm.onDuplicateSelectedSlide()

        val deck = vm.state.value.deck
        assertThat(deck.size).isEqualTo(2)
        assertThat(deck.slides.map { it.text }).containsExactly("dup me", "dup me")
        assertThat(deck.selectedIndex).isEqualTo(1)
        assertThat(vm.state.value.draft.text).isEqualTo("dup me")
    }

    @Test
    fun `onRemoveSlide drops the slide and refreshes the editor from the new selection`() = runTest {
        val vm = viewModel()
        vm.onTextChange("keep")
        vm.onAddSlide()
        vm.onTextChange("remove")
        val secondId = vm.state.value.deck.slides[1].id

        vm.onRemoveSlide(secondId)

        assertThat(vm.state.value.deck.size).isEqualTo(1)
        assertThat(vm.state.value.draft.text).isEqualTo("keep")
    }

    @Test
    fun `onRemoveSlide is inert on the last remaining slide`() = runTest {
        val vm = viewModel()
        vm.onTextChange("solo")
        val id = vm.state.value.deck.slides.first().id

        vm.onRemoveSlide(id)

        assertThat(vm.state.value.deck.size).isEqualTo(1)
        assertThat(vm.state.value.draft.text).isEqualTo("solo")
    }

    @Test
    fun `onMoveSlide reorders slides and preserves the selection by id`() = runTest {
        val vm = viewModel()
        vm.onTextChange("a")
        vm.onAddSlide()
        vm.onTextChange("b")
        val firstId = vm.state.value.deck.slides.first().id

        vm.onMoveSlide(firstId, toIndex = 1)

        assertThat(vm.state.value.deck.slides.map { it.text }).containsExactly("b", "a").inOrder()
        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("b")
    }

    @Test
    fun `onCanvasTransform applies the pinch-pan gesture to the selected slide's transform`() = runTest {
        val vm = viewModel()

        vm.onCanvasTransform(panX = 40f, panY = 60f, zoom = 2f, canvasWidth = 1000f, canvasHeight = 2000f)

        val transform = vm.state.value.deck.selectedSlide.transform
        assertThat(transform.scale).isEqualTo(2f)
        assertThat(transform.offsetX).isEqualTo(40f)
        assertThat(transform.offsetY).isEqualTo(60f)
    }

    @Test
    fun `onCanvasTransform clamps the gesture to the canvas bounds`() = runTest {
        val vm = viewModel()

        // Zoom to 2x (limit on a 1000px axis = 500), then pan far past the edge.
        vm.onCanvasTransform(panX = 9999f, panY = -9999f, zoom = 2f, canvasWidth = 1000f, canvasHeight = 1000f)

        val transform = vm.state.value.deck.selectedSlide.transform
        assertThat(transform.scale).isEqualTo(2f)
        assertThat(transform.offsetX).isEqualTo(500f)
        assertThat(transform.offsetY).isEqualTo(-500f)
    }

    @Test
    fun `onCanvasTransform edits only the selected slide and leaves the editor text intact`() = runTest {
        val vm = viewModel()
        vm.onTextChange("a")
        vm.onAddSlide()
        vm.onTextChange("b")
        val firstId = vm.state.value.deck.slides.first().id

        vm.onCanvasTransform(panX = 0f, panY = 0f, zoom = 3f, canvasWidth = 1000f, canvasHeight = 1000f)

        assertThat(vm.state.value.deck.selectedSlide.transform.scale).isEqualTo(3f)
        assertThat(vm.state.value.deck.slides.first { it.id == firstId }.transform)
            .isEqualTo(StoryCanvasTransform.IDENTITY)
        // The caption editor still mirrors the selected slide's text.
        assertThat(vm.state.value.draft.text).isEqualTo("b")
        assertThat(vm.state.value.selectedSlideTransform.scale).isEqualTo(3f)
    }

    @Test
    fun `onSelectSlide of an unknown id is inert`() = runTest {
        val vm = viewModel()
        vm.onTextChange("x")

        vm.onSelectSlide("nope")

        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("x")
        assertThat(vm.state.value.draft.text).isEqualTo("x")
    }

    @Test
    fun `canPublish is false when a non-selected slide exceeds the character limit`() = runTest {
        val vm = viewModel()
        vm.onTextChange("ok")
        vm.onAddSlide()
        vm.onTextChange("x".repeat(StoryComposerDraft.MAX_CHARS + 1))
        val firstId = vm.state.value.deck.slides.first().id

        vm.onSelectSlide(firstId)

        assertThat(vm.state.value.draft.isWithinLimit).isTrue()
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `publish enqueues one story per non-blank slide in order`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onTextChange("two")
        val requests = mutableListOf<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(requests), any()) } returns "cmid"

        vm.publish()

        coVerify(exactly = 2) { repo.enqueuePublish(any(), any()) }
        coVerify(exactly = 1) { workManager.enqueue(any<OneTimeWorkRequest>()) }
        assertThat(requests.map { it.content }).containsExactly("one", "two").inOrder()
    }

    @Test
    fun `publish skips a blank slide between content slides`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onAddSlide()
        vm.onTextChange("three")
        val requests = mutableListOf<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(requests), any()) } returns "cmid"

        vm.publish()

        assertThat(requests.map { it.content }).containsExactly("one", "three").inOrder()
    }

    @Test
    fun `multi-slide publish carries media and prerequisites only on the first story`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onTextChange("two")
        val requests = mutableListOf<CreateStoryRequest>()
        val deps = mutableListOf<List<String>>()
        coEvery { repo.enqueuePublish(capture(requests), capture(deps)) } returns "cmid"

        vm.publish()

        assertThat(requests).hasSize(2)
        assertThat(requests[0].mediaIds).containsExactly("up-1")
        assertThat(requests[1].mediaIds).isNull()
        assertThat(deps[0]).containsExactly("up-1")
        assertThat(deps[1]).isEmpty()
    }

    @Test
    fun `publish resets to a single empty slide on success`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onTextChange("two")
        coEvery { repo.enqueuePublish(any(), any()) } returns "cmid"

        vm.publish()

        assertThat(vm.state.value.deck.size).isEqualTo(1)
        assertThat(vm.state.value.deck.selectedSlide.text).isEmpty()
        assertThat(vm.state.value.draft.text).isEmpty()
    }

    // --- per-slide media ---

    @Test
    fun `picked media attaches to the selected slide, not the whole story`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onTextChange("two")
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m2")))

        vm.onMediaPicked(listOf(item()))

        val deck = vm.state.value.deck
        assertThat(deck.slides.first().mediaIds).isEmpty()
        assertThat(deck.slides[1].mediaIds).containsExactly("m2")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("m2")
    }

    @Test
    fun `each published story carries only its own slide's media`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onTextChange("two")
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m2")))
        vm.onMediaPicked(listOf(item()))
        val requests = mutableListOf<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(requests), any()) } returns "cmid"

        vm.publish()

        assertThat(requests.map { it.content }).containsExactly("one", "two").inOrder()
        assertThat(requests[0].mediaIds).isNull()
        assertThat(requests[1].mediaIds).containsExactly("m2")
    }

    @Test
    fun `an offline upload on a later slide gates only that slide's story`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        vm.onTextChange("two")
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-2"
        vm.onMediaPicked(listOf(item()))
        val requests = mutableListOf<CreateStoryRequest>()
        val deps = mutableListOf<List<String>>()
        coEvery { repo.enqueuePublish(capture(requests), capture(deps)) } returns "cmid"

        vm.publish()

        assertThat(deps[0]).isEmpty()
        assertThat(deps[1]).containsExactly("up-2")
        assertThat(requests[1].mediaIds).containsExactly("up-2")
    }

    @Test
    fun `a media-only middle slide publishes its media between two text slides`() = runTest {
        val vm = viewModel()
        vm.onTextChange("one")
        vm.onAddSlide()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m2")))
        vm.onMediaPicked(listOf(item()))
        vm.onAddSlide()
        vm.onTextChange("three")
        val requests = mutableListOf<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(requests), any()) } returns "cmid"

        vm.publish()

        assertThat(requests).hasSize(3)
        assertThat(requests.map { it.content }).containsExactly("one", null, "three").inOrder()
        assertThat(requests[1].mediaIds).containsExactly("m2")
    }

    @Test
    fun `the preview shows only the selected slide's media`() = runTest {
        val vm = viewModel()
        vm.onAddSlide()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m2")))
        vm.onMediaPicked(listOf(item()))
        assertThat(vm.state.value.selectedSlideAttachments.map { it.id }).containsExactly("m2")
        val firstSlideId = vm.state.value.deck.slides.first().id

        vm.onSelectSlide(firstSlideId)

        assertThat(vm.state.value.selectedSlideAttachments).isEmpty()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `media on a non-selected slide still lets the deck publish`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))
        vm.onMediaPicked(listOf(item()))

        vm.onAddSlide()

        assertThat(vm.state.value.draft.hasMedia).isFalse()
        assertThat(vm.state.value.deck.hasMedia).isTrue()
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `the media cap is per-slide so a fresh slide can attach its own ten`() = runTest {
        val vm = viewModel()
        val full = (1..StorySlideDeck.MAX_MEDIA_PER_SLIDE).map { uploaded("a$it") }
        coEvery { media.upload(any()) } returns NetworkResult.Success(full)
        vm.onMediaPicked(List(StorySlideDeck.MAX_MEDIA_PER_SLIDE) { item("a$it.jpg") })
        assertThat(vm.state.value.draft.isMediaFull).isTrue()

        vm.onAddSlide()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("b1")))
        vm.onMediaPicked(listOf(item("b.jpg")))

        assertThat(vm.state.value.deck.slides[1].mediaIds).containsExactly("b1")
        assertThat(vm.state.value.attachments).hasSize(StorySlideDeck.MAX_MEDIA_PER_SLIDE + 1)
    }

    @Test
    fun `removing a slide drops its uploaded media from the preview pool`() = runTest {
        val vm = viewModel()
        vm.onTextChange("keep")
        vm.onAddSlide()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m2")))
        vm.onMediaPicked(listOf(item()))
        val secondSlideId = vm.state.value.deck.slides[1].id

        vm.onRemoveSlide(secondSlideId)

        assertThat(vm.state.value.deck.size).isEqualTo(1)
        assertThat(vm.state.value.attachments).isEmpty()
        coVerify(exactly = 0) { uploadQueue.cancel(any()) }
    }

    @Test
    fun `removing a slide cancels the durable uploads it carried`() = runTest {
        val vm = viewModel()
        vm.onTextChange("keep")
        vm.onAddSlide()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))
        val secondSlideId = vm.state.value.deck.slides[1].id

        vm.onRemoveSlide(secondSlideId)

        assertThat(vm.state.value.pendingUploads).isEmpty()
        assertThat(vm.state.value.deck.size).isEqualTo(1)
        coVerify(exactly = 1) { uploadQueue.cancel("up-1") }
    }

    @Test
    fun `removing the last slide is inert and keeps its media`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("m1")))
        vm.onMediaPicked(listOf(item()))
        val onlyId = vm.state.value.deck.slides.first().id

        vm.onRemoveSlide(onlyId)

        assertThat(vm.state.value.deck.size).isEqualTo(1)
        assertThat(vm.state.value.attachments.map { it.id }).containsExactly("m1")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("m1")
    }

    // --- on-canvas text elements ---

    @Test
    fun `onAddTextElement adds an empty element to the selected slide and edits it`() = runTest {
        val vm = viewModel()

        vm.onAddTextElement()

        val state = vm.state.value
        assertThat(state.selectedSlideTextElements).hasSize(1)
        assertThat(state.isEditingTextElement).isTrue()
        assertThat(state.selectedTextElement?.text).isEqualTo("")
        assertThat(state.editorText).isEqualTo("")
    }

    @Test
    fun `while editing an element onTextChange rewrites the element not the caption`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()

        vm.onTextChange("Salut")

        val state = vm.state.value
        assertThat(state.selectedTextElement?.text).isEqualTo("Salut")
        assertThat(state.editorText).isEqualTo("Salut")
        assertThat(state.draft.text).isEqualTo("")
        assertThat(state.deck.selectedSlide.text).isEqualTo("")
        assertThat(state.canPublish).isTrue()
    }

    @Test
    fun `an added but still-blank element does not make the story publishable`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `onDeselectTextElement returns the field to caption editing`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("element text")

        vm.onDeselectTextElement()
        vm.onTextChange("caption text")

        val state = vm.state.value
        assertThat(state.isEditingTextElement).isFalse()
        assertThat(state.draft.text).isEqualTo("caption text")
        assertThat(state.selectedSlideTextElements.single().text).isEqualTo("element text")
    }

    @Test
    fun `onSelectTextElement on an unknown id is inert`() = runTest {
        val vm = viewModel()
        vm.onSelectTextElement("ghost")
        assertThat(vm.state.value.selectedTextElementId).isNull()
    }

    @Test
    fun `onAddTextElement at the per-slide cap surfaces a warning and adds nothing`() = runTest {
        val vm = viewModel()
        repeat(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE) { vm.onAddTextElement() }
        assertThat(vm.state.value.selectedSlideTextElements).hasSize(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE)

        vm.onAddTextElement()

        assertThat(vm.state.value.selectedSlideTextElements).hasSize(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE)
        assertThat(vm.state.value.errorMessage).isNotNull()
    }

    @Test
    fun `onTextElementMoved drags the element clamped to the canvas`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementMoved(id, dx = 0.9f, dy = -0.9f)

        val moved = vm.state.value.selectedSlideTextElements.single()
        assertThat(moved.x).isEqualTo(1f)
        assertThat(moved.y).isEqualTo(0f)
    }

    @Test
    fun `onTextElementMoved snaps a small drag onto the centre guide and reports it`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementMoved(id, dx = 0.015f, dy = 0f)

        val element = vm.state.value.selectedSlideTextElements.single()
        // Without snapping the centre would drift to 0.515; the magnet holds it at 0.5.
        assertThat(element.x).isEqualTo(StoryTextElement.CENTER)
        val feedback = vm.state.value.snapFeedback!!
        assertThat(feedback.verticalGuide).isEqualTo(0.5f)
        assertThat(feedback.horizontalGuide).isEqualTo(0.5f)
        assertThat(feedback.withinSafeZone).isTrue()
    }

    @Test
    fun `onTextElementMoved past the threshold drags free with no guide lines`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementMoved(id, dx = 0.2f, dy = 0.2f)

        val element = vm.state.value.selectedSlideTextElements.single()
        assertThat(element.x).isWithin(1e-4f).of(0.7f)
        assertThat(element.y).isWithin(1e-4f).of(0.7f)
        val feedback = vm.state.value.snapFeedback!!
        assertThat(feedback.verticalGuide).isNull()
        assertThat(feedback.horizontalGuide).isNull()
    }

    @Test
    fun `onTextElementMoved toward the edge reports out of the safe zone`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementMoved(id, dx = 0.49f, dy = 0f)

        assertThat(vm.state.value.snapFeedback!!.withinSafeZone).isFalse()
    }

    @Test
    fun `onTextElementMoved on an unknown id leaves the element and shows no feedback`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val before = vm.state.value.selectedSlideTextElements.single()

        vm.onTextElementMoved("ghost", dx = 0.1f, dy = 0.1f)

        assertThat(vm.state.value.selectedSlideTextElements.single()).isEqualTo(before)
        assertThat(vm.state.value.snapFeedback).isNull()
    }

    @Test
    fun `onTextElementDragEnd clears the snap feedback but keeps the element placed`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id
        vm.onTextElementMoved(id, dx = 0.015f, dy = 0f)
        assertThat(vm.state.value.snapFeedback).isNotNull()

        vm.onTextElementDragEnd()

        assertThat(vm.state.value.snapFeedback).isNull()
        assertThat(vm.state.value.selectedSlideTextElements.single().x).isEqualTo(StoryTextElement.CENTER)
    }

    @Test
    fun `onTextElementDragEnd is inert when no drag feedback is showing`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val before = vm.state.value

        vm.onTextElementDragEnd()

        assertThat(vm.state.value).isSameInstanceAs(before)
    }

    @Test
    fun `onRemoveTextElement removes the element and ends its editing`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("bye")
        val id = vm.state.value.selectedTextElement!!.id

        vm.onRemoveTextElement(id)

        val state = vm.state.value
        assertThat(state.selectedSlideTextElements).isEmpty()
        assertThat(state.isEditingTextElement).isFalse()
    }

    @Test
    fun `onDuplicateTextElement clones the edited element, offsets it, and selects the copy`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("Salut")
        val original = vm.state.value.selectedTextElement!!

        vm.onDuplicateTextElement(original.id)

        val state = vm.state.value
        assertThat(state.selectedSlideTextElements).hasSize(2)
        val copy = state.selectedTextElement!!
        assertThat(copy.id).isNotEqualTo(original.id)
        assertThat(copy.text).isEqualTo("Salut")
        assertThat(copy.x).isGreaterThan(original.x)
        assertThat(copy.y).isGreaterThan(original.y)
        assertThat(state.isEditingTextElement).isTrue()
    }

    @Test
    fun `onDuplicateTextElement carries the source style onto the copy`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("Hola")
        val original = vm.state.value.selectedTextElement!!
        vm.onTextElementStyle(original.id, StoryTextStyle.NEON)

        vm.onDuplicateTextElement(original.id)

        val copy = vm.state.value.selectedTextElement!!
        assertThat(copy.style).isEqualTo(StoryTextStyle.NEON)
        assertThat(copy.text).isEqualTo("Hola")
    }

    @Test
    fun `onDuplicateTextElement at the per-slide cap surfaces a warning and adds nothing`() = runTest {
        val vm = viewModel()
        repeat(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE) { vm.onAddTextElement() }
        val id = vm.state.value.selectedTextElement!!.id

        vm.onDuplicateTextElement(id)

        assertThat(vm.state.value.selectedSlideTextElements).hasSize(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE)
        assertThat(vm.state.value.errorMessage).isNotNull()
    }

    @Test
    fun `onDuplicateTextElement on an unknown id is inert and selects nothing new`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onDeselectTextElement()

        vm.onDuplicateTextElement("ghost")

        assertThat(vm.state.value.selectedSlideTextElements).hasSize(1)
        assertThat(vm.state.value.selectedTextElementId).isNull()
    }

    @Test
    fun `onReorderTextElement sends the edited element to the back and keeps it selected`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val first = vm.state.value.selectedTextElement!!.id
        vm.onAddTextElement()
        val second = vm.state.value.selectedTextElement!!.id

        vm.onReorderTextElement(second, StoryZOrder.TO_BACK)

        assertThat(vm.state.value.selectedSlideTextElements.map { it.id })
            .containsExactly(second, first).inOrder()
        assertThat(vm.state.value.selectedTextElementId).isEqualTo(second)
        assertThat(vm.state.value.isEditingTextElement).isTrue()
    }

    @Test
    fun `onReorderTextElement brings the edited element to the front`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val first = vm.state.value.selectedTextElement!!.id
        vm.onAddTextElement()
        val second = vm.state.value.selectedTextElement!!.id

        vm.onReorderTextElement(first, StoryZOrder.TO_FRONT)

        assertThat(vm.state.value.selectedSlideTextElements.map { it.id })
            .containsExactly(second, first).inOrder()
    }

    @Test
    fun `onReorderTextElement on an unknown id leaves the state unchanged`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onAddTextElement()
        val before = vm.state.value

        vm.onReorderTextElement("ghost", StoryZOrder.TO_FRONT)

        assertThat(vm.state.value).isSameInstanceAs(before)
    }

    @Test
    fun `switching slides ends element editing and the field follows the new caption`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("on slide one")

        vm.onAddSlide()

        val state = vm.state.value
        assertThat(state.isEditingTextElement).isFalse()
        assertThat(state.editorText).isEqualTo("")
        assertThat(state.deck.slides.first().elements.single().text).isEqualTo("on slide one")
    }

    @Test
    fun `onTextElementStyle restyles the edited element and leaves text and position`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("Salut")
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementStyle(id, StoryTextStyle.NEON)

        val element = vm.state.value.selectedSlideTextElements.single()
        assertThat(element.style).isEqualTo(StoryTextStyle.NEON)
        assertThat(element.text).isEqualTo("Salut")
        assertThat(element.x).isEqualTo(StoryTextElement.CENTER)
        assertThat(element.y).isEqualTo(StoryTextElement.CENTER)
        assertThat(vm.state.value.isEditingTextElement).isTrue()
    }

    @Test
    fun `onTextElementStyle on an unknown id is inert`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val before = vm.state.value.selectedSlideTextElements.single()

        vm.onTextElementStyle("ghost", StoryTextStyle.HANDWRITING)

        assertThat(vm.state.value.selectedSlideTextElements.single()).isEqualTo(before)
    }

    @Test
    fun `onTextElementColor recolours only the edited element`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementColor(id, "FF0000")

        val element = vm.state.value.selectedSlideTextElements.single()
        assertThat(element.color).isEqualTo("FF0000")
        assertThat(element.style).isEqualTo(StoryTextStyle.BOLD)
    }

    @Test
    fun `onTextElementColor on an unknown id is inert`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()

        vm.onTextElementColor("ghost", "FF0000")

        assertThat(vm.state.value.selectedSlideTextElements.single().color)
            .isEqualTo(StoryTextElement.DEFAULT_COLOR)
    }

    @Test
    fun `onTextElementAlign realigns only the edited element`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementAlign(id, StoryTextAlign.LEFT)

        val element = vm.state.value.selectedSlideTextElements.single()
        assertThat(element.align).isEqualTo(StoryTextAlign.LEFT)
        assertThat(element.style).isEqualTo(StoryTextStyle.BOLD)
    }

    @Test
    fun `onTextElementAlign on an unknown id is inert`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()

        vm.onTextElementAlign("ghost", StoryTextAlign.RIGHT)

        assertThat(vm.state.value.selectedSlideTextElements.single().align)
            .isEqualTo(StoryTextAlign.CENTER)
    }

    @Test
    fun `onTextElementTransform pinch-scales and rotates the edited element`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        vm.onTextChange("Salut")
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementTransform(id, scaleBy = 2f, rotateByDeg = 30f)

        val element = vm.state.value.selectedSlideTextElements.single()
        assertThat(element.scale).isWithin(1e-6f).of(2f)
        assertThat(element.rotationDeg).isWithin(1e-4f).of(30f)
        assertThat(element.text).isEqualTo("Salut")
        assertThat(vm.state.value.isEditingTextElement).isTrue()
    }

    @Test
    fun `onTextElementTransform accumulates across successive gestures and clamps`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val id = vm.state.value.selectedTextElement!!.id

        vm.onTextElementTransform(id, scaleBy = 2f, rotateByDeg = 0f)
        vm.onTextElementTransform(id, scaleBy = 10f, rotateByDeg = 0f)

        assertThat(vm.state.value.selectedSlideTextElements.single().scale)
            .isEqualTo(StoryTextElement.MAX_SCALE)
    }

    @Test
    fun `onTextElementTransform on an unknown id is inert`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val before = vm.state.value.selectedSlideTextElements.single()

        vm.onTextElementTransform("ghost", scaleBy = 2f, rotateByDeg = 45f)

        assertThat(vm.state.value.selectedSlideTextElements.single()).isEqualTo(before)
    }

    @Test
    fun `styling one element of several leaves the others untouched`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val first = vm.state.value.selectedTextElement!!.id
        vm.onAddTextElement()
        val second = vm.state.value.selectedTextElement!!.id

        vm.onTextElementStyle(first, StoryTextStyle.CLASSIC)

        val elements = vm.state.value.selectedSlideTextElements.associateBy { it.id }
        assertThat(elements.getValue(first).style).isEqualTo(StoryTextStyle.CLASSIC)
        assertThat(elements.getValue(second).style).isEqualTo(StoryTextStyle.BOLD)
    }

    @Test
    fun `a restyled element carries its style into the published text object`() = runTest {
        val vm = viewModel(user = MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        vm.onAddTextElement()
        vm.onTextChange("Bonjour")
        val id = vm.state.value.selectedTextElement!!.id
        vm.onTextElementStyle(id, StoryTextStyle.NEON)
        vm.onTextElementColor(id, "00FF00")
        vm.onTextElementAlign(id, StoryTextAlign.LEFT)
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"

        vm.publish()

        val obj = request.captured.storyEffects?.textObjects.orEmpty().single()
        assertThat(obj.textStyle).isEqualTo(StoryTextStyle.NEON.wire)
        assertThat(obj.textColor).isEqualTo("00FF00")
        assertThat(obj.textAlign).isEqualTo(StoryTextAlign.LEFT.wire)
    }

    @Test
    fun `publish carries the text elements into storyEffects textObjects`() = runTest {
        val vm = viewModel(user = MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        vm.onAddTextElement()
        vm.onTextChange("Bonjour")
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"

        vm.publish()

        val objects = request.captured.storyEffects?.textObjects.orEmpty()
        assertThat(objects.map { it.text }).containsExactly("Bonjour")
        assertThat(objects.single().sourceLanguage).isEqualTo("fr")
        assertThat(request.captured.content).isNull()
    }

    // --- Bottom-band toolbar (Contenu / Effets) -----------------------------

    @Test
    fun `the band starts hidden`() = runTest {
        val vm = viewModel()
        assertThat(vm.state.value.band).isEqualTo(ComposerBandState.Hidden)
    }

    @Test
    fun `tapping a band FAB opens that category`() = runTest {
        val vm = viewModel()

        vm.onBandFabTap(BandCategory.CONTENU)

        assertThat(vm.state.value.band).isEqualTo(ComposerBandState.Tiles(BandCategory.CONTENU))
    }

    @Test
    fun `tapping the open category FAB again closes the band`() = runTest {
        val vm = viewModel()
        vm.onBandFabTap(BandCategory.EFFETS)

        vm.onBandFabTap(BandCategory.EFFETS)

        assertThat(vm.state.value.band).isEqualTo(ComposerBandState.Hidden)
    }

    @Test
    fun `tapping the other FAB switches the open category`() = runTest {
        val vm = viewModel()
        vm.onBandFabTap(BandCategory.CONTENU)

        vm.onBandFabTap(BandCategory.EFFETS)

        assertThat(vm.state.value.band).isEqualTo(ComposerBandState.Tiles(BandCategory.EFFETS))
    }

    @Test
    fun `dismissing the band hides it`() = runTest {
        val vm = viewModel()
        vm.onBandFabTap(BandCategory.CONTENU)

        vm.onBandDismiss()

        assertThat(vm.state.value.band).isEqualTo(ComposerBandState.Hidden)
    }

    @Test
    fun `swapping the band category flips contenu to effets`() = runTest {
        val vm = viewModel()
        vm.onBandFabTap(BandCategory.CONTENU)

        vm.onBandSwapCategory()

        assertThat(vm.state.value.band).isEqualTo(ComposerBandState.Tiles(BandCategory.EFFETS))
    }

    @Test
    fun `swapping the band category is inert while hidden`() = runTest {
        val vm = viewModel()

        vm.onBandSwapCategory()

        assertThat(vm.state.value.band).isEqualTo(ComposerBandState.Hidden)
    }

    @Test
    fun `selecting a filter applies it to the selected slide`() = runTest {
        val vm = viewModel()

        vm.onSelectFilter(StoryFilter.VINTAGE)

        assertThat(vm.state.value.selectedSlideFilter).isEqualTo(StoryFilter.VINTAGE)
        assertThat(vm.state.value.selectedSlideFilterMatrix)
            .isEqualTo(StoryFilterMatrix.baseMatrix(StoryFilter.VINTAGE))
    }

    @Test
    fun `clearing a filter returns the canvas to the identity matrix`() = runTest {
        val vm = viewModel()
        vm.onSelectFilter(StoryFilter.BW)

        vm.onSelectFilter(null)

        assertThat(vm.state.value.selectedSlideFilter).isNull()
        assertThat(vm.state.value.selectedSlideFilterMatrix).isEqualTo(StoryColorMatrix.IDENTITY)
    }

    @Test
    fun `changing the filter intensity clamps and blends toward identity`() = runTest {
        val vm = viewModel()
        vm.onSelectFilter(StoryFilter.DRAMATIC)

        vm.onFilterIntensityChange(0.5f)

        assertThat(vm.state.value.selectedSlideFilterIntensity).isEqualTo(0.5f)
        assertThat(vm.state.value.selectedSlideFilterMatrix)
            .isEqualTo(StoryColorMatrix.IDENTITY.blend(StoryFilterMatrix.baseMatrix(StoryFilter.DRAMATIC), 0.5f))
    }

    @Test
    fun `the filter intensity is clamped above one`() = runTest {
        val vm = viewModel()
        vm.onSelectFilter(StoryFilter.COOL)

        vm.onFilterIntensityChange(9f)

        assertThat(vm.state.value.selectedSlideFilterIntensity).isEqualTo(1f)
    }

    @Test
    fun `a filter stays on its own slide when the selection moves`() = runTest {
        val vm = viewModel()
        val firstSlideId = vm.state.value.deck.selectedId
        vm.onSelectFilter(StoryFilter.WARM)
        vm.onAddSlide()

        assertThat(vm.state.value.selectedSlideFilter).isNull()

        vm.onSelectSlide(firstSlideId)
        assertThat(vm.state.value.selectedSlideFilter).isEqualTo(StoryFilter.WARM)
    }

    @Test
    fun `selecting a filter keeps an in-progress text element edit`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        val elementId = vm.state.value.selectedTextElement?.id

        vm.onSelectFilter(StoryFilter.FADE)

        assertThat(vm.state.value.selectedTextElement?.id).isEqualTo(elementId)
        assertThat(vm.state.value.selectedSlideFilter).isEqualTo(StoryFilter.FADE)
    }

    // --- stickers ---

    @Test
    fun `onAddSticker adds the emoji to the selected slide and selects it`() = runTest {
        val vm = viewModel()

        vm.onAddSticker("😀")

        val state = vm.state.value
        assertThat(state.selectedSlideStickers).hasSize(1)
        assertThat(state.selectedSticker?.emoji).isEqualTo("😀")
        assertThat(state.canPublish).isTrue()
    }

    @Test
    fun `onAddSticker ignores a blank emoji`() = runTest {
        val vm = viewModel()

        vm.onAddSticker("  ")

        assertThat(vm.state.value.selectedSlideStickers).isEmpty()
        assertThat(vm.state.value.selectedStickerId).isNull()
    }

    @Test
    fun `adding a sticker clears an in-progress text element edit`() = runTest {
        val vm = viewModel()
        vm.onAddTextElement()
        assertThat(vm.state.value.isEditingTextElement).isTrue()

        vm.onAddSticker("🎉")

        assertThat(vm.state.value.isEditingTextElement).isFalse()
        assertThat(vm.state.value.selectedSticker?.emoji).isEqualTo("🎉")
    }

    @Test
    fun `selecting a text element clears a selected sticker`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("😀")
        vm.onAddTextElement()
        val elementId = vm.state.value.selectedTextElement!!.id

        // de-select then re-select the text element to exercise onSelectTextElement
        vm.onSelectSticker(vm.state.value.selectedSlideStickers.single().id)
        assertThat(vm.state.value.selectedTextElementId).isNull()
        vm.onSelectTextElement(elementId)

        assertThat(vm.state.value.selectedStickerId).isNull()
        assertThat(vm.state.value.selectedTextElementId).isEqualTo(elementId)
    }

    @Test
    fun `onAddSticker at the per-slide cap surfaces a warning and adds nothing`() = runTest {
        val vm = viewModel()
        repeat(StorySlideDeck.MAX_STICKERS_PER_SLIDE) { vm.onAddSticker("😀") }
        assertThat(vm.state.value.selectedSlideStickers).hasSize(StorySlideDeck.MAX_STICKERS_PER_SLIDE)

        vm.onAddSticker("🎉")

        assertThat(vm.state.value.selectedSlideStickers).hasSize(StorySlideDeck.MAX_STICKERS_PER_SLIDE)
        assertThat(vm.state.value.errorMessage).isNotNull()
    }

    @Test
    fun `onSelectSticker on an unknown id is inert`() = runTest {
        val vm = viewModel()
        vm.onSelectSticker("ghost")
        assertThat(vm.state.value.selectedStickerId).isNull()
    }

    @Test
    fun `onStickerMoved drags the sticker clamped to the canvas`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("😀")
        val id = vm.state.value.selectedSlideStickers.single().id

        vm.onStickerMoved(id, dx = 0.6f, dy = -0.9f)

        val moved = vm.state.value.selectedSlideStickers.single()
        assertThat(moved.x).isEqualTo(1f)
        assertThat(moved.y).isEqualTo(0f)
    }

    @Test
    fun `onStickerTransform scales and rotates the sticker and accumulates`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("😀")
        val id = vm.state.value.selectedSlideStickers.single().id

        vm.onStickerTransform(id, scaleBy = 2f, rotateByDeg = 20f)
        vm.onStickerTransform(id, scaleBy = 1.5f, rotateByDeg = 10f)

        val t = vm.state.value.selectedSlideStickers.single()
        assertThat(t.scale).isEqualTo(3f)
        assertThat(t.rotationDeg).isEqualTo(30f)
    }

    @Test
    fun `onStickerTransform on an unknown id leaves the deck unchanged`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("😀")
        val before = vm.state.value.deck

        vm.onStickerTransform("ghost", scaleBy = 2f, rotateByDeg = 0f)

        assertThat(vm.state.value.deck).isEqualTo(before)
    }

    @Test
    fun `onRemoveSticker removes it and clears the selection when it was selected`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("😀")
        val id = vm.state.value.selectedSlideStickers.single().id

        vm.onRemoveSticker(id)

        assertThat(vm.state.value.selectedSlideStickers).isEmpty()
        assertThat(vm.state.value.selectedStickerId).isNull()
    }

    @Test
    fun `onDeselectSticker drops the selection`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("😀")
        assertThat(vm.state.value.selectedStickerId).isNotNull()

        vm.onDeselectSticker()

        assertThat(vm.state.value.selectedStickerId).isNull()
        assertThat(vm.state.value.selectedSlideStickers).hasSize(1)
    }

    @Test
    fun `switching slides clears a stale sticker selection`() = runTest {
        val vm = viewModel()
        vm.onAddSticker("😀")
        val firstSlide = vm.state.value.deck.selectedId
        assertThat(vm.state.value.selectedStickerId).isNotNull()

        vm.onAddSlide()

        assertThat(vm.state.value.deck.selectedId).isNotEqualTo(firstSlide)
        assertThat(vm.state.value.selectedSticker).isNull()
    }

    @Test
    fun `publish carries the slide's stickers into the wire request`() = runTest {
        val vm = viewModel()
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"
        vm.onAddSticker("🎉")

        vm.publish()

        coVerify(exactly = 1) { repo.enqueuePublish(any(), any()) }
        assertThat(request.captured.storyEffects?.stickerObjects?.map { it.emoji }).containsExactly("🎉")
        assertThat(request.captured.content).isNull()
    }
}
