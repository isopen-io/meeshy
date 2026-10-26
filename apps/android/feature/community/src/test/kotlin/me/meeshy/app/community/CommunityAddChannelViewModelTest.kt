package me.meeshy.app.community

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
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommunityAddChannelViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val conversations: ConversationRepository = mockk(relaxed = true)
    private val repository: CommunityRepository = mockk(relaxed = true)
    private val cache: CommunityCacheRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)

    private fun convo(id: String, title: String, community: String? = null, role: String = "admin") =
        ApiConversation(id = id, type = "group", title = title, communityId = community, currentUserRole = role)

    private fun started(): CommunityAddChannelViewModel {
        every { session.currentUserId } returns "me"
        every { conversations.cachedConversations() } returns flowOf(
            listOf(convo("a", "Alpha"), convo("b", "Beta", community = "c1"), convo("c", "Gamma", community = "c2"), convo("d", "Delta", role = "member")),
        )
        return CommunityAddChannelViewModel(conversations, repository, cache, session).also { it.start("c1") }
    }

    @Test
    fun `candidates exclude the community's own channels and conversations the reader does not administer`() = runTest {
        val vm = started()
        assertThat(vm.state.value.candidates.map { it.id }).containsExactly("a", "c").inOrder()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `search filters locally by title`() = runTest {
        val vm = started()
        vm.onQuery("gam")
        assertThat(vm.state.value.visible.map { it.id }).containsExactly("c")
    }

    @Test
    fun `a free conversation is attached at once and leaves the list`() = runTest {
        coEvery { repository.addConversation("c1", "a") } returns NetworkResult.Success(convo("a", "Alpha"))
        val vm = started()
        vm.onPick(vm.state.value.candidates.first { it.id == "a" })

        assertThat(vm.effects.first()).isEqualTo(CommunityAddChannelEffect.Added)
        assertThat(vm.state.value.candidates.map { it.id }).containsExactly("c")
        coVerify { cache.refreshChannels("c1") }
    }

    @Test
    fun `a conversation of another community asks to confirm first`() = runTest {
        coEvery { repository.addConversation("c1", "c") } returns NetworkResult.Success(convo("c", "Gamma"))
        val vm = started()
        vm.onPick(vm.state.value.candidates.first { it.id == "c" })

        assertThat(vm.state.value.pendingMove?.id).isEqualTo("c")
        coVerify(exactly = 0) { repository.addConversation(any(), any()) }

        vm.confirmMove()
        assertThat(vm.effects.first()).isEqualTo(CommunityAddChannelEffect.Added)
    }

    @Test
    fun `cancelling the move attaches nothing`() = runTest {
        val vm = started()
        vm.onPick(vm.state.value.candidates.first { it.id == "c" })
        vm.cancelMove()

        assertThat(vm.state.value.pendingMove).isNull()
        coVerify(exactly = 0) { repository.addConversation(any(), any()) }
    }

    @Test
    fun `a refusal keeps the row and shows the message`() = runTest {
        coEvery { repository.addConversation(any(), any()) } returns NetworkResult.Failure(ApiError("Conversation not found"))
        val vm = started()
        vm.onPick(vm.state.value.candidates.first { it.id == "a" })

        assertThat(vm.state.value.errorMessage).isEqualTo("Conversation not found")
        assertThat(vm.state.value.candidates.map { it.id }).contains("a")
        assertThat(vm.state.value.addingId).isNull()
    }
}
