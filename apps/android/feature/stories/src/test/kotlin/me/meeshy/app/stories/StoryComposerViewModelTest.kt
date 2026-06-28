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
        assertThat(vm.state.value.pendingUpload?.cmid).isEqualTo("up-1")
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
        assertThat(vm.state.value.pendingUpload).isNull()
        assertThat(vm.state.value.errorMessage).isEqualTo("offline")
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `a multi-item offline pick is not durably chained and surfaces an error`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()

        vm.onMediaPicked(listOf(item("a.jpg"), item("b.jpg")))

        coVerify(exactly = 0) { uploadQueue.enqueue(any()) }
        assertThat(vm.state.value.pendingUpload).isNull()
        assertThat(vm.state.value.errorMessage).isEqualTo("offline")
    }

    @Test
    fun `a second offline pick is rejected while one upload is already pending`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item("first.jpg")))

        vm.onMediaPicked(listOf(item("second.jpg")))

        coVerify(exactly = 1) { uploadQueue.enqueue(any()) }
        assertThat(vm.state.value.pendingUpload?.cmid).isEqualTo("up-1")
        assertThat(vm.state.value.draft.mediaIds).containsExactly("up-1")
        assertThat(vm.state.value.errorMessage).isNotNull()
    }

    @Test
    fun `publish gates the story on the pending upload and carries its placeholder id`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))
        val request = slot<CreateStoryRequest>()
        val dependsOn = slot<String>()
        coEvery { repo.enqueuePublish(capture(request), capture(dependsOn)) } returns "story-cmid"

        vm.publish()

        coVerify(exactly = 1) { repo.enqueuePublish(any(), any()) }
        coVerify(exactly = 1) { workManager.enqueue(any<OneTimeWorkRequest>()) }
        assertThat(dependsOn.captured).isEqualTo("up-1")
        assertThat(request.captured.mediaIds).containsExactly("up-1")
        assertThat(request.captured.content).isNull()
    }

    @Test
    fun `removing the pending upload clears it and its placeholder media id`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))

        vm.onRemoveMedia("up-1")

        assertThat(vm.state.value.pendingUpload).isNull()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
        assertThat(vm.state.value.canPublish).isFalse()
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

        assertThat(vm.state.value.pendingUpload).isNull()
        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.isUploadingMedia).isFalse()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }

    @Test
    fun `publish clears the pending upload on success`() = runTest {
        val vm = viewModel()
        coEvery { media.upload(any()) } returns offline()
        coEvery { uploadQueue.enqueue(any()) } returns "up-1"
        vm.onMediaPicked(listOf(item()))
        coEvery { repo.enqueuePublish(any(), any()) } returns "story-cmid"

        vm.publish()

        assertThat(vm.state.value.pendingUpload).isNull()
        assertThat(vm.state.value.draft.mediaIds).isEmpty()
    }
}
