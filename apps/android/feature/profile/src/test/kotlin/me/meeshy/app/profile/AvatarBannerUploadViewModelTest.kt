package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [AvatarBannerUploadViewModel] — the pick → upload → link
 * orchestration for a profile avatar/banner (feature-parity §K). Drives intents and
 * asserts the public `state` + the repository/session collaborators: an invalid pick
 * never touches the network, a valid one uploads then confirms the right endpoint,
 * the returned URL paints optimistically before the confirm and rolls back on
 * failure, and a second pick mid-flight is dropped.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AvatarBannerUploadViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private fun user(id: String = "u1", avatar: String? = "old-avatar", banner: String? = "old-banner") =
        MeeshyUser(id = id, username = "alice", avatar = avatar, banner = banner)

    private fun item(bytes: ByteArray = ByteArray(1_000), mime: String = "image/jpeg") =
        MediaUploadItem(bytes = bytes, fileName = "pic.jpg", mimeType = mime)

    private fun uploaded(url: String) = UploadedMedia(
        id = "m1",
        url = url,
        mimeType = "image/jpeg",
        fileSize = 1L,
        width = null,
        height = null,
        durationMs = null,
        thumbnailUrl = null,
    )

    private fun failure() = NetworkResult.Failure(ApiError(message = "boom", code = "NETWORK"))

    private class SessionFixture(initial: MeeshyUser?) {
        val flow = MutableStateFlow(initial)
        val adopts = mutableListOf<MeeshyUser>()
        val repository: SessionRepository = mockk(relaxed = true)

        init {
            every { repository.currentUser } returns flow
            val slot = slot<MeeshyUser>()
            every { repository.adopt(capture(slot)) } answers {
                adopts += slot.captured
                flow.value = slot.captured
            }
        }
    }

    private fun vm(
        media: MediaRepository,
        userRepo: UserRepository,
        session: SessionRepository,
    ) = AvatarBannerUploadViewModel(media, userRepo, session)

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun pickingAnEmptyFile_setsEmptyError_andNeverUploads() = runTest(dispatcher) {
        val media = mockk<MediaRepository>(relaxed = true)
        val vm = vm(media, mockk(relaxed = true), SessionFixture(user()).repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item(bytes = ByteArray(0)))
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.EMPTY)
        assertThat(vm.state.value.uploading).isNull()
        coVerify(exactly = 0) { media.upload(any()) }
    }

    @Test
    fun pickingAVideo_setsUnsupportedTypeError_andNeverUploads() = runTest(dispatcher) {
        val media = mockk<MediaRepository>(relaxed = true)
        val vm = vm(media, mockk(relaxed = true), SessionFixture(user()).repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item(mime = "video/mp4"))
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.UNSUPPORTED_TYPE)
        coVerify(exactly = 0) { media.upload(any()) }
    }

    @Test
    fun pickingAnOversizeAvatar_setsTooLargeError_andNeverUploads() = runTest(dispatcher) {
        val media = mockk<MediaRepository>(relaxed = true)
        val vm = vm(media, mockk(relaxed = true), SessionFixture(user()).repository)
        val overCeiling = ByteArray((ImageUploadTarget.AVATAR.maxBytes + 1).toInt())

        vm.onImagePicked(ImageUploadTarget.AVATAR, item(bytes = overCeiling))
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.TOO_LARGE)
        coVerify(exactly = 0) { media.upload(any()) }
    }

    @Test
    fun pickingAValidAvatar_uploadsThenConfirmsAvatar_andAdoptsTheServerUser() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/a.jpg")))
        val userRepo = mockk<UserRepository>(relaxed = true)
        val serverUser = user(avatar = "https://cdn/a.jpg")
        coEvery { userRepo.updateAvatar(any()) } returns NetworkResult.Success(serverUser)
        val session = SessionFixture(user())
        val vm = vm(media, userRepo, session.repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        coVerify(exactly = 1) { media.upload(any()) }
        coVerify(exactly = 1) { userRepo.updateAvatar("https://cdn/a.jpg") }
        coVerify(exactly = 0) { userRepo.updateBanner(any()) }
        assertThat(vm.state.value.uploading).isNull()
        assertThat(vm.state.value.error).isNull()
        assertThat(session.flow.value).isEqualTo(serverUser)
    }

    @Test
    fun pickingAValidBanner_routesToUpdateBanner() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/b.jpg")))
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.updateBanner(any()) } returns NetworkResult.Success(user(banner = "https://cdn/b.jpg"))
        val vm = vm(media, userRepo, SessionFixture(user()).repository)

        vm.onImagePicked(ImageUploadTarget.BANNER, item())
        advanceUntilIdle()

        coVerify(exactly = 1) { userRepo.updateBanner("https://cdn/b.jpg") }
        coVerify(exactly = 0) { userRepo.updateAvatar(any()) }
    }

    @Test
    fun theUploadedUrlPaintsOptimistically_beforeTheConfirmedServerUser() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/up.jpg")))
        val userRepo = mockk<UserRepository>(relaxed = true)
        val serverUser = user(avatar = "https://cdn/server.jpg")
        coEvery { userRepo.updateAvatar(any()) } returns NetworkResult.Success(serverUser)
        val session = SessionFixture(user(avatar = "old-avatar"))
        val vm = vm(media, userRepo, session.repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        // First adopt is the optimistic paint (upload URL), second is the confirmed server user.
        assertThat(session.adopts).hasSize(2)
        assertThat(session.adopts[0].avatar).isEqualTo("https://cdn/up.jpg")
        assertThat(session.adopts[1]).isEqualTo(serverUser)
    }

    @Test
    fun uploadFailure_setsUploadFailed_andNeverConfirms_andNeverPaints() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns failure()
        val userRepo = mockk<UserRepository>(relaxed = true)
        val session = SessionFixture(user())
        val vm = vm(media, userRepo, session.repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.UPLOAD_FAILED)
        assertThat(vm.state.value.uploading).isNull()
        coVerify(exactly = 0) { userRepo.updateAvatar(any()) }
        assertThat(session.adopts).isEmpty()
    }

    @Test
    fun uploadReturningNoUsableUrl_setsUploadFailed_andNeverConfirms() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("   ")))
        val userRepo = mockk<UserRepository>(relaxed = true)
        val vm = vm(media, userRepo, SessionFixture(user()).repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.UPLOAD_FAILED)
        coVerify(exactly = 0) { userRepo.updateAvatar(any()) }
    }

    @Test
    fun confirmFailure_rollsBackToTheSnapshot_andSetsUpdateFailed() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/up.jpg")))
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.updateAvatar(any()) } returns failure()
        val snapshot = user(avatar = "old-avatar")
        val session = SessionFixture(snapshot)
        val vm = vm(media, userRepo, session.repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.UPDATE_FAILED)
        assertThat(vm.state.value.uploading).isNull()
        // Painted optimistically, then rolled back to the snapshot.
        assertThat(session.adopts.last()).isEqualTo(snapshot)
        assertThat(session.flow.value?.avatar).isEqualTo("old-avatar")
    }

    @Test
    fun confirmThrowing_rollsBackToTheSnapshot_andSetsUpdateFailed() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/up.jpg")))
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.updateAvatar(any()) } throws RuntimeException("socket reset")
        val snapshot = user(avatar = "old-avatar")
        val session = SessionFixture(snapshot)
        val vm = vm(media, userRepo, session.repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.UPDATE_FAILED)
        assertThat(session.flow.value?.avatar).isEqualTo("old-avatar")
    }

    @Test
    fun aSecondPickWhileUploading_isDropped() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/a.jpg")))
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.updateAvatar(any()) } returns NetworkResult.Success(user())
        val vm = vm(media, userRepo, SessionFixture(user()).repository)

        // The first pick sets `uploading` synchronously before its coroutine runs;
        // the second must be ignored while the first is still in flight.
        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        vm.onImagePicked(ImageUploadTarget.BANNER, item())
        advanceUntilIdle()

        coVerify(exactly = 1) { media.upload(any()) }
        coVerify(exactly = 0) { userRepo.updateBanner(any()) }
    }

    @Test
    fun dismissError_clearsTheError() = runTest(dispatcher) {
        val vm = vm(mockk(relaxed = true), mockk(relaxed = true), SessionFixture(user()).repository)
        vm.onImagePicked(ImageUploadTarget.AVATAR, item(bytes = ByteArray(0)))
        advanceUntilIdle()
        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.EMPTY)

        vm.dismissError()

        assertThat(vm.state.value.error).isNull()
    }

    @Test
    fun withNoSession_uploadsAndConfirms_withoutOptimisticPaint() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/a.jpg")))
        val userRepo = mockk<UserRepository>(relaxed = true)
        val serverUser = user(avatar = "https://cdn/a.jpg")
        coEvery { userRepo.updateAvatar(any()) } returns NetworkResult.Success(serverUser)
        val session = SessionFixture(initial = null)
        val vm = vm(media, userRepo, session.repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        // No snapshot → no optimistic paint; only the confirmed server user is adopted.
        assertThat(session.adopts).containsExactly(serverUser)
        assertThat(vm.state.value.error).isNull()
    }

    @Test
    fun withNoSession_confirmFailure_setsUpdateFailed_withoutRollback() = runTest(dispatcher) {
        val media = mockk<MediaRepository>()
        coEvery { media.upload(any()) } returns NetworkResult.Success(listOf(uploaded("https://cdn/a.jpg")))
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.updateAvatar(any()) } returns failure()
        val session = SessionFixture(initial = null)
        val vm = vm(media, userRepo, session.repository)

        vm.onImagePicked(ImageUploadTarget.AVATAR, item())
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(ImageUploadError.UPDATE_FAILED)
        assertThat(session.adopts).isEmpty()
    }
}
