package me.meeshy.app.community

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.community.CommunityAppearance
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.community.InMemoryCommunityAppearanceStore
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityDetailViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val repository: CommunityRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val detail = MutableSharedFlow<CacheResult<ApiCommunity>>(replay = 1)
    private val channels = MutableSharedFlow<CacheResult<List<ApiConversation>>>(replay = 1)

    private fun community(createdBy: String = "owner", role: String? = null, isPrivate: Boolean = false) = ApiCommunity(
        id = "c1", name = "Club", createdBy = createdBy, isPrivate = isPrivate, memberCount = 4,
        members = listOfNotNull(role?.let { ApiCommunityMember(id = "m", userId = "me", role = it) }),
    )

    private fun viewModel(): CommunityDetailViewModel {
        every { session.currentUserId } returns "me"
        every { cache.detail("c1", any()) } returns detail
        every { cache.channels("c1", any()) } returns channels
        return CommunityDetailViewModel(SavedStateHandle(mapOf("communityId" to "c1")), cache, repository, session, InMemoryCommunityAppearanceStore())
    }

    @Test
    fun `the cached community paints at once with the reader's rights`() = runTest {
        val vm = viewModel()
        assertThat(vm.state.value.showSkeleton).isTrue()

        detail.emit(CacheResult.Stale(community(role = "admin"), 1))

        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.community?.name).isEqualTo("Club")
        assertThat(vm.state.value.access?.canAddChannel).isTrue()
        assertThat(vm.state.value.appearance).isNotNull()
    }

    @Test
    fun `channels load only for a member and keep their resolved title`() = runTest {
        val vm = viewModel()
        detail.emit(CacheResult.Fresh(community(role = "member"), 0))
        channels.emit(
            CacheResult.Fresh(listOf(ApiConversation(id = "g1", type = "group", title = "Général", description = "Tout", serverMemberCount = 9)), 0),
        )

        val row = vm.state.value.channels.single()
        assertThat(row.title).isEqualTo("Général")
        assertThat(row.memberCount).isEqualTo(9)
    }

    @Test
    fun `a non member never reads the channels`() = runTest {
        viewModel()
        detail.emit(CacheResult.Fresh(community(role = null), 0))

        io.mockk.verify(exactly = 0) { cache.channels(any(), any()) }
    }

    @Test
    fun `a cold failure is an error state and retry observes again`() = runTest {
        val onError = slot<(Throwable) -> Unit>()
        every { session.currentUserId } returns "me"
        every { cache.detail("c1", capture(onError)) } returns detail
        val vm = CommunityDetailViewModel(SavedStateHandle(mapOf("communityId" to "c1")), cache, repository, session, InMemoryCommunityAppearanceStore())

        onError.captured(RuntimeException("offline"))
        assertThat(vm.state.value.showError).isTrue()

        vm.retry()
        assertThat(vm.state.value.showError).isFalse()
        assertThat(vm.state.value.showSkeleton).isTrue()
    }

    @Test
    fun `joining is optimistic and confirmed by the server`() = runTest {
        val vm = viewModel()
        detail.emit(CacheResult.Fresh(community(role = null), 0))
        val gate = CompletableDeferred<NetworkResult<ApiCommunityMember>>()
        coEvery { repository.join("c1") } coAnswers { gate.await() }

        vm.join()

        assertThat(vm.state.value.access?.isMember).isTrue()
        assertThat(vm.state.value.community?.memberCount).isEqualTo(5)
        assertThat(vm.state.value.isJoining).isTrue()

        gate.complete(NetworkResult.Success(ApiCommunityMember(id = "m", userId = "me")))

        assertThat(vm.effects.first()).isEqualTo(CommunityDetailEffect.Joined)
        assertThat(vm.state.value.isJoining).isFalse()
        coVerify { cache.refreshDetail("c1") }
    }

    @Test
    fun `a refused join rolls the optimistic membership back`() = runTest {
        val vm = viewModel()
        detail.emit(CacheResult.Fresh(community(role = null), 0))
        coEvery { repository.join("c1") } returns NetworkResult.Failure(ApiError("403"))

        vm.join()

        assertThat(vm.state.value.access?.isMember).isFalse()
        assertThat(vm.state.value.community?.memberCount).isEqualTo(4)
        assertThat(vm.effects.first()).isEqualTo(CommunityDetailEffect.ActionFailed)
    }

    @Test
    fun `leaving forgets the community and closes the screen`() = runTest {
        val vm = viewModel()
        detail.emit(CacheResult.Fresh(community(role = "member"), 0))
        coEvery { repository.leave("c1") } returns NetworkResult.Success(Unit)

        vm.leave()

        assertThat(vm.effects.first()).isEqualTo(CommunityDetailEffect.Left)
        coVerify { cache.forget("c1") }
    }

    @Test
    fun `a refused leave keeps the screen and says so`() = runTest {
        val vm = viewModel()
        detail.emit(CacheResult.Fresh(community(role = "member"), 0))
        coEvery { repository.leave("c1") } returns NetworkResult.Failure(ApiError("403"))

        vm.leave()

        assertThat(vm.effects.first()).isEqualTo(CommunityDetailEffect.ActionFailed)
        coVerify(exactly = 0) { cache.forget(any()) }
        assertThat(vm.state.value.isLeaving).isFalse()
    }

    @Test
    fun `the creator cannot join`() = runTest {
        val vm = viewModel()
        detail.emit(CacheResult.Fresh(community(createdBy = "me"), 0))

        vm.join()

        coVerify(exactly = 0) { repository.join(any()) }
        assertThat(CommunityAppearance("6366F1", "")).isNotNull()
    }
}
