package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.DirectConversationSource
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.ConnectionActionController
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.profile.ProfileCallRequest
import me.meeshy.sdk.model.profile.ProfileConnectionAction
import me.meeshy.sdk.model.profile.ProfileLayout
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileActionsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val friendshipCache = FriendshipCache()
    private val blockCache = BlockCache()
    private val connection: ConnectionActionController = mockk(relaxed = true) {
        every { feedback } returns MutableSharedFlow<ConnectionFeedback>()
    }
    private val blockRepository: BlockRepository = mockk(relaxed = true) {
        coEvery { listBlocked() } returns NetworkResult.Success(emptyList())
        coEvery { setBlockedDurably(any(), any()) } answers {
            blockCache.setBlocked(firstArg(), secondArg())
            "cmid"
        }
    }
    private val session: SessionRepository = mockk(relaxed = true) {
        every { currentUserId } returns "me"
    }

    private fun opener(resolution: DirectConversationResolution) = DirectConversationOpener(
        object : DirectConversationSource {
            override suspend fun cachedDirectWith(userId: String): ApiConversation? = null
            override suspend fun directConversationWith(userId: String) = resolution
        },
    )

    private fun viewModel(
        direct: DirectConversationResolution = DirectConversationResolution.Failed(ApiError("boom"), offline = false),
    ) = ProfileActionsViewModel(
        connection = connection,
        friendshipCache = friendshipCache,
        blockCache = blockCache,
        blockRepository = blockRepository,
        directConversationOpener = opener(direct),
        workManager = mockk(relaxed = true),
        sessionRepository = session,
    )

    private fun TestScope.events(vm: ProfileActionsViewModel): List<ProfileActionEvent> {
        val seen = mutableListOf<ProfileActionEvent>()
        backgroundScope.launch(dispatcher) { vm.events.collect { seen += it } }
        return seen
    }

    @Test
    fun `a stranger offers message, connection request, block and report`() = runTest {
        val vm = viewModel()

        vm.bind("u2", isAnonymous = false)

        val plan = vm.state.value.plan!!
        assertThat(plan.canMessage).isTrue()
        assertThat(plan.canBlock).isTrue()
        assertThat(plan.canReport).isTrue()
        assertThat(plan.connectionActions).containsExactly(ProfileConnectionAction.REQUEST)
    }

    @Test
    fun `a received request offers accept and decline`() = runTest {
        friendshipCache.hydrate(
            sent = emptyList(),
            received = listOf(FriendRequest(id = "r1", senderId = "u2", receiverId = "me", status = "pending")),
        )
        val vm = viewModel()

        vm.bind("u2", isAnonymous = false)

        assertThat(vm.state.value.plan!!.connectionActions)
            .containsExactly(ProfileConnectionAction.ACCEPT, ProfileConnectionAction.DECLINE).inOrder()
    }

    @Test
    fun `the plan follows the shared friendship cache after a gesture`() = runTest {
        val vm = viewModel()
        vm.bind("u2", isAnonymous = false)

        friendshipCache.didSendRequest("u2", "r9")

        assertThat(vm.state.value.plan!!.connectionActions)
            .containsExactly(ProfileConnectionAction.CANCEL, ProfileConnectionAction.RESEND).inOrder()
        assertThat(vm.state.value.render).isEqualTo(ConnectionActionRender.PendingSent)
    }

    @Test
    fun `requesting a connection goes through the shared controller`() = runTest {
        val vm = viewModel()
        vm.bind("u2", isAnonymous = false)

        vm.requestConnection()

        verify { connection.send("u2") }
    }

    @Test
    fun `blocking switches to the blocked layout and toasts it`() = runTest {
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.block()

        coVerify { blockRepository.setBlockedDurably("u2", true) }
        assertThat(vm.state.value.plan!!.layout).isEqualTo(ProfileLayout.BLOCKED_BY_ME)
        assertThat(vm.state.value.plan!!.canUnblock).isTrue()
        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.UserBlocked))
    }

    @Test
    fun `unblocking restores the normal layout and toasts it`() = runTest {
        blockCache.setBlocked("u2", true)
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.unblock()

        assertThat(vm.state.value.plan!!.layout).isEqualTo(ProfileLayout.NORMAL)
        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.UserUnblocked))
    }

    @Test
    fun `a failed block toasts the failure and keeps the profile usable`() = runTest {
        coEvery { blockRepository.setBlockedDurably("u2", true) } throws IllegalStateException("disk")
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.block()

        assertThat(vm.state.value.plan!!.layout).isEqualTo(ProfileLayout.NORMAL)
        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.BlockFailed))
    }

    @Test
    fun `sending a message opens the direct conversation`() = runTest {
        val direct = ApiConversation(id = "c1", type = "direct")
        val vm = viewModel(direct = DirectConversationResolution.Found(direct, fromCache = false))
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.sendMessage()

        assertThat(seen).containsExactly(ProfileActionEvent.OpenConversation("c1"))
    }

    @Test
    fun `a direct conversation that cannot open toasts the failure`() = runTest {
        val vm = viewModel(direct = DirectConversationResolution.Failed(ApiError("boom"), offline = false))
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.sendMessage()

        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.OpenConversationFailed))
    }

    @Test
    fun `calls are offered only when the host can place them`() = runTest {
        val withCalls = viewModel()
        val withoutCalls = viewModel()

        withCalls.bind("u2", isAnonymous = false, callsAvailable = true)
        withoutCalls.bind("u2", isAnonymous = false)

        assertThat(withCalls.state.value.plan!!.offersCall).isTrue()
        assertThat(withoutCalls.state.value.plan!!.offersCall).isFalse()
    }

    @Test
    fun `a call resolves the direct conversation and asks the host to ring`() = runTest {
        val direct = ApiConversation(id = "c1", type = "direct")
        val vm = viewModel(direct = DirectConversationResolution.Found(direct, fromCache = false))
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false, callsAvailable = true)

        vm.call(isVideo = true, displayName = "Ada")

        assertThat(seen).containsExactly(
            ProfileActionEvent.Call(ProfileCallRequest("u2", "Ada", isVideo = true, conversationId = "c1")),
        )
    }

    @Test
    fun `a call that finds no conversation toasts the failure`() = runTest {
        val vm = viewModel(direct = DirectConversationResolution.Failed(ApiError("boom"), offline = false))
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false, callsAvailable = true)

        vm.call(isVideo = false, displayName = "Ada")

        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.OpenConversationFailed))
    }

    @Test
    fun `my own id offers no relation action`() = runTest {
        val vm = viewModel()

        vm.bind("me", isAnonymous = false)

        val plan = vm.state.value.plan!!
        assertThat(plan.canMessage).isFalse()
        assertThat(plan.canBlock).isFalse()
        assertThat(plan.connectionActions).isEmpty()
    }
}
