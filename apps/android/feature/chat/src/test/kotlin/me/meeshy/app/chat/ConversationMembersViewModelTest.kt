package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.MemberRoleAction
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantRoleUpdatedEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.model.MeeshyUser
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationMembersViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun member(
        id: String,
        userId: String = id,
        role: String = "member",
        name: String = "Name $id",
    ) = PaginatedParticipant(
        id = id,
        userId = userId,
        displayName = name,
        conversationRole = role,
    )

    private fun page(
        members: List<PaginatedParticipant>,
        nextCursor: String? = null,
        hasMore: Boolean = false,
        totalCount: Int? = null,
    ) = MemberRosterPage(members, nextCursor, hasMore, totalCount)

    private fun conversation(viewerRole: String = "creator") = ApiConversation(
        id = "c1",
        participants = listOf(ApiParticipant(id = "pMe", userId = "me", role = viewerRole)),
    )

    private fun repo(
        firstPage: NetworkResult<MemberRosterPage> = NetworkResult.Success(page(listOf(member("p1")))),
        viewerRole: String = "creator",
    ): ConversationRepository {
        val repository = mockk<ConversationRepository>(relaxed = true)
        coEvery { repository.participants(any(), any(), any(), any()) } returns firstPage
        every { repository.conversationStream(any()) } returns flowOf(conversation(viewerRole))
        return repository
    }

    private fun session(userId: String? = "me"): SessionRepository {
        val repository = mockk<SessionRepository>(relaxed = true)
        every { repository.currentUser } returns
            MutableStateFlow(userId?.let { MeeshyUser(id = it, username = it) })
        return repository
    }

    private fun socket(
        roleUpdated: MutableSharedFlow<ParticipantRoleUpdatedEvent> = MutableSharedFlow(),
        left: MutableSharedFlow<ParticipantLeftEvent> = MutableSharedFlow(),
        banned: MutableSharedFlow<ParticipantBannedEvent> = MutableSharedFlow(),
    ): MessageSocketManager = mockk<MessageSocketManager>(relaxed = true).also {
        every { it.participantRoleUpdated } returns roleUpdated
        every { it.participantLeft } returns left
        every { it.participantBanned } returns banned
    }

    private fun viewModel(
        repository: ConversationRepository = repo(),
        sessionRepository: SessionRepository = session(),
        socketManager: MessageSocketManager = socket(),
    ) = ConversationMembersViewModel(repository, sessionRepository, socketManager)

    // MARK: loading

    @Test
    fun `load serves the first page and marks the roster loaded`() = runTest {
        val vm = viewModel(repo(NetworkResult.Success(page(listOf(member("p1"), member("p2")), totalCount = 7))))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(vm.state.value.memberCount).isEqualTo(7)
        assertThat(vm.state.value.status).isEqualTo(MembersLoadStatus.Loaded)
    }

    @Test
    fun `a failed first page surfaces an error rather than an empty roster`() = runTest {
        val vm = viewModel(repo(NetworkResult.Failure(ApiError("offline"))))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.hasError).isTrue()
        assertThat(vm.state.value.isEmpty).isFalse()
    }

    @Test
    fun `an empty roster is only reported empty once the load actually completed`() = runTest {
        val vm = viewModel(repo(NetworkResult.Success(page(emptyList()))))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.isEmpty).isTrue()
    }

    @Test
    fun `reopening the sheet on the same conversation does not refetch`() = runTest {
        val repository = repo()
        val vm = viewModel(repository)

        vm.load("c1")
        advanceUntilIdle()
        vm.load("c1")
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.participants("c1", any(), any(), any()) }
    }

    @Test
    fun `the viewer's own conversation role drives the moderation affordances`() = runTest {
        val vm = viewModel(repo(viewerRole = "moderator"))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.viewerRole).isEqualTo(MemberRole.MODERATOR)
        assertThat(vm.state.value.roleActions(member("p1"))).isEmpty()
        assertThat(vm.state.value.canRemove(member("p1"))).isTrue()
    }

    @Test
    fun `the viewer is never offered moderation on their own row`() = runTest {
        val vm = viewModel(repo(NetworkResult.Success(page(listOf(member(id = "pMe", userId = "me"))))))

        vm.load("c1")
        advanceUntilIdle()

        val self = vm.state.value.members.single()
        assertThat(vm.state.value.isSelf(self)).isTrue()
        assertThat(vm.state.value.canRemove(self)).isFalse()
        assertThat(vm.state.value.roleActions(self)).isEmpty()
    }

    // MARK: pagination

    @Test
    fun `loadMore appends the next cursor page`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1")), nextCursor = "p1", hasMore = true)))
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        coEvery { repository.participants("c1", any(), "p1", any()) } returns
            NetworkResult.Success(page(listOf(member("p2"))))
        vm.loadMore()
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(vm.state.value.canLoadMore).isFalse()
    }

    @Test
    fun `loadMore is inert once the server said there is nothing left`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1")), hasMore = false)))
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.loadMore()
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.participants("c1", any(), any(), any()) }
    }

    @Test
    fun `a failed next page leaves the loaded members untouched`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1")), nextCursor = "p1", hasMore = true)))
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        coEvery { repository.participants("c1", any(), "p1", any()) } returns
            NetworkResult.Failure(ApiError("offline"))
        vm.loadMore()
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p1")
        assertThat(vm.state.value.isLoadingMore).isFalse()
    }

    // MARK: search

    @Test
    fun `a search term refetches the first page after the debounce`() = runTest {
        val repository = repo()
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.onSearchQueryChange("ada")
        advanceTimeBy(100)
        coVerify(exactly = 0) { repository.participants("c1", "ada", any(), any()) }

        advanceUntilIdle()
        coVerify(exactly = 1) { repository.participants("c1", "ada", any(), any()) }
    }

    @Test
    fun `the query is reflected in state immediately, before any fetch`() = runTest {
        val vm = viewModel()
        vm.load("c1")
        advanceUntilIdle()

        vm.onSearchQueryChange("ada")

        assertThat(vm.state.value.searchQuery).isEqualTo("ada")
    }

    // MARK: moderation

    @Test
    fun `promoting a member updates the row instantly and sends the new role`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1")))))
        coEvery { repository.updateParticipantRole(any(), any(), any()) } returns NetworkResult.Success(Unit)
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.changeRole(vm.state.value.members.single(), MemberRoleAction.PROMOTE_ADMIN)

        assertThat(vm.state.value.members.single().conversationRole).isEqualTo("admin")
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.updateParticipantRole("c1", "u1", MemberRole.ADMIN) }
    }

    @Test
    fun `a refused promotion rolls the row back and reports the failure`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1")))))
        coEvery { repository.updateParticipantRole(any(), any(), any()) } returns
            NetworkResult.Failure(ApiError("forbidden"))
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.changeRole(vm.state.value.members.single(), MemberRoleAction.PROMOTE_ADMIN)
        advanceUntilIdle()

        assertThat(vm.state.value.members.single().conversationRole).isEqualTo("member")
        assertThat(vm.state.value.actionFailed).isTrue()
    }

    @Test
    fun `removing a member drops the row instantly and sends the removal`() = runTest {
        val repository = repo(
            NetworkResult.Success(page(listOf(member("p1", userId = "u1"), member("p2", userId = "u2")), totalCount = 2)),
        )
        coEvery { repository.removeParticipant(any(), any()) } returns NetworkResult.Success(Unit)
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.removeMember(vm.state.value.members.first())

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p2")
        assertThat(vm.state.value.memberCount).isEqualTo(1)
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.removeParticipant("c1", "u1") }
    }

    @Test
    fun `a refused removal puts the member back`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1")))))
        coEvery { repository.removeParticipant(any(), any()) } returns
            NetworkResult.Failure(ApiError("forbidden"))
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.removeMember(vm.state.value.members.single())
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p1")
        assertThat(vm.state.value.actionFailed).isTrue()
    }

    @Test
    fun `banning a member drops the row instantly and sends the ban`() = runTest {
        val repository = repo(
            NetworkResult.Success(page(listOf(member("p1", userId = "u1"), member("p2", userId = "u2")), totalCount = 2)),
        )
        coEvery { repository.banParticipant(any(), any()) } returns NetworkResult.Success(Unit)
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.banMember(vm.state.value.members.first())

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p2")
        assertThat(vm.state.value.memberCount).isEqualTo(1)
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.banParticipant("c1", "u1") }
    }

    @Test
    fun `a refused ban puts the member back`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1")))))
        coEvery { repository.banParticipant(any(), any()) } returns
            NetworkResult.Failure(ApiError("forbidden"))
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()

        vm.banMember(vm.state.value.members.single())
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p1")
        assertThat(vm.state.value.actionFailed).isTrue()
    }

    @Test
    fun `the viewer's admin role offers banning moderators but not other admins`() = runTest {
        val vm = viewModel(repo(viewerRole = "admin"))

        vm.load("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.canBan(member("p1", role = "moderator"))).isTrue()
        assertThat(vm.state.value.canBan(member("p1", role = "admin"))).isFalse()
    }

    @Test
    fun `dismissing the action error clears it`() = runTest {
        val repository = repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1")))))
        coEvery { repository.removeParticipant(any(), any()) } returns
            NetworkResult.Failure(ApiError("forbidden"))
        val vm = viewModel(repository)
        vm.load("c1")
        advanceUntilIdle()
        vm.removeMember(vm.state.value.members.single())
        advanceUntilIdle()

        vm.dismissActionError()

        assertThat(vm.state.value.actionFailed).isFalse()
    }

    // MARK: real-time

    @Test
    fun `a role-updated event for this conversation rewrites the badge`() = runTest {
        val events = MutableSharedFlow<ParticipantRoleUpdatedEvent>()
        val vm = viewModel(
            repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1"))))),
            socketManager = socket(roleUpdated = events),
        )
        vm.load("c1")
        advanceUntilIdle()

        events.emit(ParticipantRoleUpdatedEvent(conversationId = "c1", userId = "u1", role = "moderator"))
        advanceUntilIdle()

        assertThat(vm.state.value.members.single().conversationRole).isEqualTo("moderator")
    }

    @Test
    fun `a role-updated event for another conversation is ignored`() = runTest {
        val events = MutableSharedFlow<ParticipantRoleUpdatedEvent>()
        val vm = viewModel(
            repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1"))))),
            socketManager = socket(roleUpdated = events),
        )
        vm.load("c1")
        advanceUntilIdle()

        events.emit(ParticipantRoleUpdatedEvent(conversationId = "other", userId = "u1", role = "admin"))
        advanceUntilIdle()

        assertThat(vm.state.value.members.single().conversationRole).isEqualTo("member")
    }

    @Test
    fun `a participant-left event drops the member from the roster`() = runTest {
        val events = MutableSharedFlow<ParticipantLeftEvent>()
        val vm = viewModel(
            repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1"), member("p2", userId = "u2"))))),
            socketManager = socket(left = events),
        )
        vm.load("c1")
        advanceUntilIdle()

        events.emit(ParticipantLeftEvent(conversationId = "c1", userId = "u1"))
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p2")
    }

    @Test
    fun `a participant-banned event drops the member from the roster`() = runTest {
        val events = MutableSharedFlow<ParticipantBannedEvent>()
        val vm = viewModel(
            repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1"), member("p2", userId = "u2"))))),
            socketManager = socket(banned = events),
        )
        vm.load("c1")
        advanceUntilIdle()

        events.emit(ParticipantBannedEvent(conversationId = "c1", userId = "u1"))
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p2")
    }

    @Test
    fun `a participant-left event drops an accountless visitor by participant id`() = runTest {
        // A link visitor with no account: the event names them by participantId only (userId null).
        val events = MutableSharedFlow<ParticipantLeftEvent>()
        val vm = viewModel(
            repo(NetworkResult.Success(page(listOf(member("p1").copy(userId = null), member("p2", userId = "u2"))))),
            socketManager = socket(left = events),
        )
        vm.load("c1")
        advanceUntilIdle()

        events.emit(ParticipantLeftEvent(conversationId = "c1", userId = null, participantId = "p1"))
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p2")
    }

    @Test
    fun `a participant-banned event drops an accountless visitor by participant id`() = runTest {
        val events = MutableSharedFlow<ParticipantBannedEvent>()
        val vm = viewModel(
            repo(NetworkResult.Success(page(listOf(member("p1").copy(userId = null), member("p2", userId = "u2"))))),
            socketManager = socket(banned = events),
        )
        vm.load("c1")
        advanceUntilIdle()

        events.emit(ParticipantBannedEvent(conversationId = "c1", userId = null, participantId = "p1"))
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p2")
    }

    @Test
    fun `a participant-left event naming neither id leaves the roster untouched`() = runTest {
        val events = MutableSharedFlow<ParticipantLeftEvent>()
        val vm = viewModel(
            repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1"), member("p2", userId = "u2"))))),
            socketManager = socket(left = events),
        )
        vm.load("c1")
        advanceUntilIdle()

        events.emit(ParticipantLeftEvent(conversationId = "c1", userId = null, participantId = null))
        advanceUntilIdle()

        assertThat(vm.state.value.members.map { it.id }).containsExactly("p1", "p2").inOrder()
    }

    @Test
    fun `rebinding to another conversation stops the previous one's events from landing`() = runTest {
        val events = MutableSharedFlow<ParticipantLeftEvent>()
        val repository = repo(NetworkResult.Success(page(listOf(member("p1", userId = "u1")))))
        val vm = viewModel(repository, socketManager = socket(left = events))
        vm.load("c1")
        advanceUntilIdle()

        vm.load("c2")
        advanceUntilIdle()
        events.emit(ParticipantLeftEvent(conversationId = "c1", userId = "u1"))
        advanceUntilIdle()

        assertThat(vm.state.value.conversationId).isEqualTo("c2")
        assertThat(vm.state.value.members.map { it.id }).containsExactly("p1")
    }

    @Test
    fun `rebinding to another conversation clears the previous search term`() = runTest {
        val vm = viewModel()
        vm.load("c1")
        advanceUntilIdle()
        vm.onSearchQueryChange("ada")
        advanceUntilIdle()

        vm.load("c2")
        advanceUntilIdle()

        assertThat(vm.state.value.searchQuery).isEmpty()
    }
}
