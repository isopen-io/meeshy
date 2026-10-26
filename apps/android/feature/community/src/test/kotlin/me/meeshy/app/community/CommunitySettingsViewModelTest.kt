package me.meeshy.app.community

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.community.CommunityAppearance
import me.meeshy.sdk.community.CommunityAppearanceStore
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.media.CompressedImage
import me.meeshy.sdk.media.ImageCompressor
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunitySettingsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val repository: CommunityRepository = mockk(relaxed = true)
    private val appearance: CommunityAppearanceStore = mockk(relaxed = true)
    private val media: MediaRepository = mockk(relaxed = true)
    private val compressor: ImageCompressor = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun viewModel(): CommunitySettingsViewModel {
        every { session.currentUserId } returns "me"
        every { cache.detail("c1", any()) } returns flowOf(
            CacheResult.Fresh(ApiCommunity(id = "c1", name = "Club", description = "Desc", createdBy = "me", isPrivate = true), 0),
        )
        every { appearance.observe("c1", "Club") } returns flowOf(CommunityAppearance("6366F1", "🚀"))
        return CommunitySettingsViewModel(SavedStateHandle(mapOf("communityId" to "c1")), cache, repository, appearance, media, compressor, session)
    }

    @Test
    fun `the draft starts from the cached community and its local appearance`() = runTest {
        val vm = viewModel()

        val fields = vm.state.value.draft!!.current
        assertThat(fields.name).isEqualTo("Club")
        assertThat(fields.color).isEqualTo("6366F1")
        assertThat(fields.emoji).isEqualTo("🚀")
        assertThat(vm.state.value.canSave).isFalse()
        assertThat(vm.isCreator).isTrue()
    }

    @Test
    fun `saving sends only what changed and refreshes the caches`() = runTest {
        coEvery { repository.update("c1", "Nouveau", null, null, null, null, null) } returns NetworkResult.Success(ApiCommunity(id = "c1"))
        val vm = viewModel()
        vm.onName("Nouveau")

        vm.save()

        assertThat(vm.effects.first()).isEqualTo(CommunitySettingsEffect.Saved)
        coVerify { cache.refreshDetail("c1") }
        coVerify { cache.refreshList() }
    }

    @Test
    fun `a local-only change saves without any request`() = runTest {
        val vm = viewModel()
        vm.onColor("FF2E63")
        vm.onEmoji("🔥")

        vm.save()

        assertThat(vm.effects.first()).isEqualTo(CommunitySettingsEffect.Saved)
        coVerify(exactly = 0) { repository.update(any(), any(), any(), any(), any(), any(), any()) }
        coVerify { appearance.setColor("c1", "FF2E63") }
        coVerify { appearance.setEmoji("c1", "🔥") }
    }

    @Test
    fun `a refused save keeps the screen and shows the server message`() = runTest {
        coEvery { repository.update(any(), any(), any(), any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("Nom pris"))
        val vm = viewModel()
        vm.onName("X")

        vm.save()

        assertThat(vm.state.value.errorMessage).isEqualTo("Nom pris")
        assertThat(vm.state.value.isSaving).isFalse()
        coVerify(exactly = 0) { appearance.setColor(any(), any()) }
    }

    @Test
    fun `an emoji field keeps at most two Unicode scalars`() = runTest {
        val vm = viewModel()
        vm.onEmoji("ab😀c")
        assertThat(vm.state.value.draft!!.current.emoji).isEqualTo("ab")
        vm.onEmoji("😀")
        assertThat(vm.state.value.draft!!.current.emoji).isEqualTo("😀")
    }

    @Test
    fun `an uploaded banner is compressed, uploaded and linked to the draft without saving`() = runTest {
        coEvery { compressor.compress(any(), any(), any()) } returns CompressedImage(byteArrayOf(1), "image/jpeg", "jpg", true)
        coEvery { media.upload(any()) } returns NetworkResult.Success(
            listOf(UploadedMedia("a1", "https://cdn/b.jpg", "image/jpeg", 1, null, null, null, null)),
        )
        val vm = viewModel()

        vm.upload(ImageUploadTarget.BANNER, MediaUploadItem(byteArrayOf(9, 9), "p.png", "image/png"))

        assertThat(vm.effects.first()).isEqualTo(CommunitySettingsEffect.UploadResult(ImageUploadTarget.BANNER, true))
        assertThat(vm.state.value.draft!!.current.bannerUrl).isEqualTo("https://cdn/b.jpg")
        assertThat(vm.state.value.uploading).isNull()
        coVerify(exactly = 0) { repository.update(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a failed upload leaves the draft untouched and says so`() = runTest {
        coEvery { compressor.compress(any(), any(), any()) } returns CompressedImage(byteArrayOf(1), "image/jpeg", "jpg", true)
        coEvery { media.upload(any()) } returns NetworkResult.Failure(ApiError("413"))
        val vm = viewModel()

        vm.upload(ImageUploadTarget.AVATAR, MediaUploadItem(byteArrayOf(9), "p.png", "image/png"))

        assertThat(vm.effects.first()).isEqualTo(CommunitySettingsEffect.UploadResult(ImageUploadTarget.AVATAR, false))
        assertThat(vm.state.value.draft!!.current.avatarUrl).isEmpty()
    }

    @Test
    fun `deleting forgets the community and closes`() = runTest {
        coEvery { repository.delete("c1") } returns NetworkResult.Success(Unit)
        val vm = viewModel()

        vm.delete()

        assertThat(vm.effects.first()).isEqualTo(CommunitySettingsEffect.Deleted)
        coVerify { cache.forget("c1") }
    }

    @Test
    fun `a refused delete shows the message and keeps the community`() = runTest {
        coEvery { repository.delete("c1") } returns NetworkResult.Failure(ApiError("Forbidden"))
        val vm = viewModel()

        vm.delete()

        assertThat(vm.state.value.errorMessage).isEqualTo("Forbidden")
        coVerify(exactly = 0) { cache.forget(any()) }
    }
}
