package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
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
import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockFailure
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.ConnectionActionController
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.RelationRaiseGate
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.model.relation.RelationRitualConsents
import me.meeshy.sdk.model.relation.RelationRitualPhase
import me.meeshy.sdk.model.relation.RelationRitualStep
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.profile.ProfileCallRequest
import me.meeshy.sdk.model.profile.ProfileConnectionAction
import me.meeshy.sdk.model.profile.ProfileLayout
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.relation.CirclesGateway
import me.meeshy.sdk.report.ReportRepository
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
    }
    private val blockFailures = MutableSharedFlow<BlockFailure>(extraBufferCapacity = 4)
    private val blockActions: BlockActionCoordinator = mockk(relaxed = true) {
        every { failures } returns blockFailures
        coEvery { setBlocked(any(), any()) } answers {
            blockCache.setBlocked(firstArg(), secondArg())
        }
    }
    private val reportRepository: ReportRepository = mockk(relaxed = true)
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
        circles: ProfileCirclesFake = ProfileCirclesFake(),
    ) = ProfileActionsViewModel(
        connection = connection,
        friendshipCache = friendshipCache,
        blockCache = blockCache,
        blockRepository = blockRepository,
        directConversationOpener = opener(direct),
        blockActions = blockActions,
        reportRepository = reportRepository,
        sessionRepository = session,
        circles = circles,
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

        coVerify { blockActions.setBlocked("u2", true) }
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
        coEvery { blockActions.setBlocked("u2", true) } throws IllegalStateException("disk")
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.block()

        assertThat(vm.state.value.plan!!.layout).isEqualTo(ProfileLayout.NORMAL)
        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.BlockFailed))
    }

    @Test
    fun `an abandoned block toasts the failure when the outbox gives up`() = runTest {
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        blockFailures.emit(BlockFailure("u2", wasBlocking = true))

        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.BlockFailed))
    }

    @Test
    fun `an abandoned unblock toasts the unblock failure`() = runTest {
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        blockFailures.emit(BlockFailure("u2", wasBlocking = false))

        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.UnblockFailed))
    }

    @Test
    fun `a failure for another person is not told on this profile`() = runTest {
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        blockFailures.emit(BlockFailure("someone-else", wasBlocking = true))

        assertThat(seen).isEmpty()
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
    fun `a call while offline says it did not ring instead of staying silent`() = runTest {
        val vm = viewModel(direct = DirectConversationResolution.Queued("u2"))
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false, callsAvailable = true)

        vm.call(isVideo = false, displayName = "Ada")

        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.CallNotPlaced))
        assertThat(vm.state.value.isOpeningConversation).isFalse()
    }

    @Test
    fun `a message while offline stays queued without a toast`() = runTest {
        val vm = viewModel(direct = DirectConversationResolution.Queued("u2"))
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.sendMessage()

        assertThat(seen).isEmpty()
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

    // --- le cercle sur le profil (#13940) -----------------------------------------------------------------------------

    private fun circleLink(userId: String, level: RelationLevel, eligibleFor: RelationLevel? = null) =
        RelationLink(userId, level, level, eligibleFor = eligibleFor)

    @Test
    fun `le profil montre le niveau commun servi a l'appelant, cache d'abord`() = runTest {
        val circles = ProfileCirclesFake(
            cached = listOf(circleLink("u2", RelationLevel.FRIEND)),
            served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.CLOSE))),
        )
        val vm = viewModel(circles = circles)

        vm.bind("u2", isAnonymous = false)

        assertThat(vm.state.value.circle?.level).isEqualTo(RelationLevel.CLOSE)
    }

    @Test
    fun `sans lien servi la fiche garde son badge d'avant, et une panne garde le cache`() = runTest {
        val none = viewModel(circles = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("x", RelationLevel.BLOOD)))))
        none.bind("u2", isAnonymous = false)
        assertThat(none.state.value.circle).isNull()

        val offline = viewModel(
            circles = ProfileCirclesFake(
                cached = listOf(circleLink("u2", RelationLevel.FRIEND)),
                served = NetworkResult.Failure(ApiError("offline", code = "NETWORK")),
            ),
        )
        offline.bind("u2", isAnonymous = false)
        assertThat(offline.state.value.circle?.level).isEqualTo(RelationLevel.FRIEND)
    }

    @Test
    fun `demander le cran ouvert l'affiche en attente avant le reseau, et la file qui y renonce le defait`() = runTest {
        val circles = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.FRIEND, RelationLevel.CLOSE))))
        val vm = viewModel(circles = circles)
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.requestRaise()

        assertThat(vm.state.value.circle?.pending).isEqualTo(RelationLevel.CLOSE)
        assertThat(circles.raises).containsExactly("u2" to RelationLevel.CLOSE)
        circles.exhausted.emit("cmid-raise")
        assertThat(vm.state.value.circle?.pending).isNull()
        assertThat(seen).contains(ProfileActionEvent.Toast(ProfileActionFeedback.RaiseFailed))
    }

    @Test
    fun `un cran verrouille ne se demande pas`() = runTest {
        val circles = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.FRIEND))))
        val vm = viewModel(circles = circles)
        vm.bind("u2", isAnonymous = false)

        vm.requestRaise()

        assertThat(circles.raises).isEmpty()
    }

    // --- rétrograder ou annuler le lien (#14910) ----------------------------------------------------------------------

    @Test
    fun `retrograder un Proche l'affiche Ami avant le reseau, puis garde la vue servie`() = runTest {
        val circles = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.CLOSE))))
        val reply = CompletableDeferred<NetworkResult<RelationLink>>()
        circles.lowerReply = reply
        val vm = viewModel(circles = circles)
        vm.bind("u2", isAnonymous = false)

        vm.lowerCircle()

        assertThat(vm.state.value.circle?.level).isEqualTo(RelationLevel.FRIEND)
        assertThat(circles.lowers).containsExactly("u2" to RelationLevel.FRIEND)
        reply.complete(NetworkResult.Success(circleLink("u2", RelationLevel.FRIEND)))
        assertThat(vm.state.value.circle?.level).isEqualTo(RelationLevel.FRIEND)
    }

    @Test
    fun `a Connaissance le bouton annule le lien et le cercle quitte la fiche`() = runTest {
        val circles = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.ACQUAINTANCE))))
        val vm = viewModel(circles = circles)
        vm.bind("u2", isAnonymous = false)

        vm.lowerCircle()

        assertThat(circles.lowers).containsExactly("u2" to RelationLevel.PUBLIC)
        assertThat(vm.state.value.circle).isNull()
    }

    @Test
    fun `une retrogradation refusee rend le niveau d'avant et le dit`() = runTest {
        val circles = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.CLOSE))))
        circles.lowerReply = CompletableDeferred(NetworkResult.Failure(ApiError("refused", code = "RELATION_NOT_A_DROP")))
        val vm = viewModel(circles = circles)
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.lowerCircle()

        assertThat(vm.state.value.circle?.level).isEqualTo(RelationLevel.CLOSE)
        assertThat(seen).contains(ProfileActionEvent.Toast(ProfileActionFeedback.LowerFailed))
    }

    @Test
    fun `un collegue de l'equipe sans lien ouvre le blocage du Bring et du talkie, sans cercle fabrique`() = runTest {
        val circles = ProfileCirclesFake()
        circles.gate = RelationRaiseGate(accessLevel = RelationLevel.BLOOD)
        val vm = viewModel(circles = circles)

        vm.bind("u2", isAnonymous = false)

        assertThat(vm.state.value.circle).isNull()
        assertThat(vm.state.value.receptionsWithoutLink)
            .containsExactly(RelationReceptionSetting.BRING, RelationReceptionSetting.TALKIE).inOrder()
    }

    @Test
    fun `sans niveau d'outils servi, ou pour une personne liee, aucun blocage n'est propose sur la fiche`() = runTest {
        val bare = ProfileCirclesFake()
        val vmBare = viewModel(circles = bare)
        vmBare.bind("u2", isAnonymous = false)
        assertThat(vmBare.state.value.receptionsWithoutLink).isEmpty()

        val linked = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.CLOSE))))
        linked.gate = RelationRaiseGate(accessLevel = RelationLevel.BLOOD)
        val vmLinked = viewModel(circles = linked)
        vmLinked.bind("u2", isAnonymous = false)
        assertThat(vmLinked.state.value.circle?.level).isEqualTo(RelationLevel.CLOSE)
        assertThat(vmLinked.state.value.receptionsWithoutLink).isEmpty()
    }

    @Test
    fun `un cool-down servi masque Promouvoir`() = runTest {
        val circles = ProfileCirclesFake(served = NetworkResult.Success(listOf(circleLink("u2", RelationLevel.FRIEND, RelationLevel.CLOSE))))
        circles.gate = RelationRaiseGate(raiseBlockedUntil = "2999-01-01T00:00:00Z")
        val vm = viewModel(circles = circles)
        vm.bind("u2", isAnonymous = false)

        assertThat(vm.state.value.circle?.offeredRaise).isNull()
        vm.requestRaise()
        assertThat(circles.raises).isEmpty()
    }
}

/** Le port des cercles, réglé par test. */
internal class ProfileCirclesFake(
    private val cached: List<RelationLink>? = null,
    private val served: NetworkResult<List<RelationLink>> = NetworkResult.Success(emptyList()),
    private val sent: List<FriendRequest> = emptyList(),
) : CirclesGateway {
    val raises = mutableListOf<Pair<String, RelationLevel>>()
    override val exhausted = MutableSharedFlow<String>(extraBufferCapacity = 8)
    override suspend fun cachedLinks(): List<RelationLink>? = cached
    override suspend fun refreshLinks(): NetworkResult<List<RelationLink>> = served
    override suspend fun config(): RelationsConfig? = null
    override suspend fun pendingRequests(direction: FriendRequestDirection): List<FriendRequest>? =
        if (direction == FriendRequestDirection.Sent) sent else emptyList()
    override suspend fun enqueueRaise(userId: String, target: RelationLevel): String? {
        raises += userId to target
        return "cmid-raise"
    }
    override suspend fun enqueueRespond(request: FriendRequest, accept: Boolean): String? = null
    override suspend fun cancel(request: FriendRequest): Boolean = false
    override suspend fun ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?,
    ): NetworkResult<RelationRitualStep> = NetworkResult.Failure(ApiError("unused"))
    override suspend fun people(ids: List<String>): Map<String, CirclePerson> = emptyMap()

    val lowers = mutableListOf<Pair<String, RelationLevel>>()
    var lowerReply: CompletableDeferred<NetworkResult<RelationLink>>? = null
    var gate: RelationRaiseGate? = null
    override suspend fun lower(userId: String, level: RelationLevel): NetworkResult<RelationLink> {
        lowers += userId to level
        return lowerReply?.await() ?: NetworkResult.Success(RelationLink(userId, level, level))
    }
    override suspend fun raiseGate(userId: String): RelationRaiseGate? = gate
}
