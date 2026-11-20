package me.meeshy.app.community

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityJoinRequestedBinding
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityJoinRequest
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.CommunityJoinRequestDecision
import me.meeshy.sdk.model.CommunityJoinRequestedEvent
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Les intendants lisent et tranchent les demandes d'entrée depuis l'écran Membres (#19878, iso iOS #19877). */
@OptIn(ExperimentalCoroutinesApi::class)
class CommunityMembersJoinRequestsTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val repository: CommunityRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val requested = MutableSharedFlow<CommunityJoinRequestedEvent>(extraBufferCapacity = 8)
    private val binding: CommunityJoinRequestedBinding = mockk { every { requested } returns this@CommunityMembersJoinRequestsTest.requested }
    private val members = MutableStateFlow<CacheResult<List<ApiCommunityMember>>>(CacheResult.Fresh(listOf(member("me", "admin")), 0))

    private fun member(user: String, role: String = "member") = ApiCommunityMember(id = "m-$user", userId = user, role = role)

    private fun request(id: String, user: String = "u-$id") =
        ApiCommunityJoinRequest(id = id, userId = user, createdAt = "2026-11-20T10:00:00.000Z", user = ApiCommunityJoinRequest.Requester(username = user, displayName = "Nom $user"))

    private fun page(vararg rows: ApiCommunityJoinRequest, next: String? = null) =
        NetworkResult.Success(PagedResult(rows.toList(), Pagination(hasMore = next != null, nextCursor = next)))

    private fun viewModel(role: String? = "admin", createdBy: String = "owner"): CommunityMembersViewModel {
        every { session.currentUserId } returns "me"
        every { cache.detail("c1", any()) } returns flowOf(CacheResult.Fresh(ApiCommunity(id = "c1", createdBy = createdBy, currentUserRole = role), 0))
        every { cache.members("c1", any()) } returns members
        return CommunityMembersViewModel(SavedStateHandle(mapOf("communityId" to "c1")), cache, repository, session, binding)
    }

    @Test
    fun `un intendant lit les demandes en attente en tete de l ecran`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returns page(request("r1"), request("r2"), next = "r2")

        val vm = viewModel(role = "moderator")

        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r1", "r2").inOrder()
        assertThat(vm.state.value.hasMoreJoinRequests).isTrue()
    }

    @Test
    fun `un membre ordinaire ne demande jamais la liste`() = runTest {
        val vm = viewModel(role = "member")

        assertThat(vm.state.value.joinRequests).isEmpty()
        coVerify(exactly = 0) { repository.joinRequests(any(), any(), any()) }
    }

    @Test
    fun `le createur tranche meme sans role servi`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returns page(request("r1"))

        val vm = viewModel(role = null, createdBy = "me")

        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r1")
    }

    @Test
    fun `la page suivante s ajoute sans doublon`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returns page(request("r1"), next = "r1")
        coEvery { repository.joinRequests("c1", "r1", any()) } returns page(request("r1"), request("r2"))
        val vm = viewModel()

        vm.loadMoreJoinRequests()

        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r1", "r2").inOrder()
        assertThat(vm.state.value.hasMoreJoinRequests).isFalse()
    }

    @Test
    fun `accepter retire la ligne au geste, fait entrer le membre servi et relit les compteurs`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returns page(request("r1", "u1"))
        val gate = CompletableDeferred<NetworkResult<ApiCommunityMember?>>()
        coEvery { repository.decideJoinRequest("c1", "r1", CommunityJoinRequestDecision.ACCEPT) } coAnswers { gate.await() }
        val vm = viewModel()

        vm.decide(vm.state.value.joinRequests.single(), CommunityJoinRequestDecision.ACCEPT)
        assertThat(vm.state.value.joinRequests).isEmpty()
        assertThat(vm.state.value.decidingJoinRequestId).isEqualTo("r1")

        gate.complete(NetworkResult.Success(member("u1")))

        assertThat(vm.state.value.sections.flatMap { it.rows }.map { it.member.userId }).contains("u1")
        assertThat(vm.state.value.joinRequestNotice).isEqualTo(CommunityJoinRequestNotice.Accepted("Nom u1"))
        assertThat(vm.state.value.decidingJoinRequestId).isNull()
        coVerify { cache.refreshMembers("c1") }
        coVerify { cache.refreshDetail("c1") }
        coVerify { cache.refreshList() }
    }

    @Test
    fun `refuser retire la ligne et ne fait entrer personne`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returns page(request("r1", "u1"))
        coEvery { repository.decideJoinRequest("c1", "r1", CommunityJoinRequestDecision.REJECT) } returns NetworkResult.Success(null)
        val vm = viewModel()

        vm.decide(vm.state.value.joinRequests.single(), CommunityJoinRequestDecision.REJECT)

        assertThat(vm.state.value.joinRequests).isEmpty()
        assertThat(vm.state.value.sections.flatMap { it.rows }.map { it.member.userId }).doesNotContain("u1")
        assertThat(vm.state.value.joinRequestNotice).isNull()
    }

    @Test
    fun `un echec rend la liste exactement telle qu elle etait`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returns page(request("r1"), request("r2"))
        coEvery { repository.decideJoinRequest(any(), any(), any()) } returns NetworkResult.Failure(ApiError("boom", httpStatus = 500))
        val vm = viewModel()

        vm.decide(vm.state.value.joinRequests.first(), CommunityJoinRequestDecision.ACCEPT)

        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r1", "r2").inOrder()
        assertThat(vm.state.value.joinRequestNotice).isEqualTo(CommunityJoinRequestNotice.Failed)
    }

    @Test
    fun `une demande deja tranchee ailleurs reste partie et tout se relit`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returnsMany listOf(page(request("r1"), request("r2")), page(request("r2")))
        coEvery { repository.decideJoinRequest(any(), any(), any()) } returns NetworkResult.Failure(ApiError("gone", httpStatus = 404))
        val vm = viewModel()

        vm.decide(vm.state.value.joinRequests.first(), CommunityJoinRequestDecision.REJECT)

        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r2")
        assertThat(vm.state.value.joinRequestNotice).isEqualTo(CommunityJoinRequestNotice.Gone)
        coVerify { cache.refreshMembers("c1") }
    }

    @Test
    fun `une seule decision a la fois`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returns page(request("r1"), request("r2"))
        val gate = CompletableDeferred<NetworkResult<ApiCommunityMember?>>()
        coEvery { repository.decideJoinRequest("c1", "r1", any()) } coAnswers { gate.await() }
        val vm = viewModel()
        val (first, second) = vm.state.value.joinRequests

        vm.decide(first, CommunityJoinRequestDecision.REJECT)
        vm.decide(second, CommunityJoinRequestDecision.REJECT)

        coVerify(exactly = 0) { repository.decideJoinRequest("c1", "r2", any()) }
        gate.complete(NetworkResult.Success(null))
    }

    @Test
    fun `une demande annoncee dans cette communaute relit la liste, pas celle d une autre`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returnsMany listOf(page(request("r1")), page(request("r9"), request("r1")))
        val vm = viewModel()

        requested.emit(CommunityJoinRequestedEvent(communityId = "c2"))
        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r1")

        requested.emit(CommunityJoinRequestedEvent(communityId = "c1", requestId = "r9"))
        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r9", "r1").inOrder()
    }

    @Test
    fun `l annonce n est pas lue par qui ne tranche pas`() = runTest {
        viewModel(role = "member")

        requested.emit(CommunityJoinRequestedEvent(communityId = "c1"))

        coVerify(exactly = 0) { repository.joinRequests(any(), any(), any()) }
    }

    @Test
    fun `un demandeur entre par une autre porte quitte la liste et la liste se relit`() = runTest {
        coEvery { repository.joinRequests("c1", null, any()) } returnsMany listOf(page(request("r1", "u1"), request("r2", "u2")), page(request("r2", "u2")))
        val vm = viewModel()

        members.value = CacheResult.Fresh(listOf(member("me", "admin"), member("u1")), 1)

        assertThat(vm.state.value.joinRequests.map { it.id }).containsExactly("r2")
        coVerify(exactly = 2) { repository.joinRequests("c1", null, any()) }
    }
}
