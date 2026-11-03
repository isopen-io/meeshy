package me.meeshy.app.chat.conversationcard

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.link.LinkCacheRepository
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.conversationcard.ConversationCard
import me.meeshy.sdk.model.conversationcard.ConversationCardKind
import me.meeshy.sdk.model.conversationcard.ConversationCardLink
import me.meeshy.sdk.model.conversationcard.ConversationCardResolution
import me.meeshy.sdk.model.conversationcard.ConversationCardStats
import me.meeshy.sdk.model.conversationcard.ConversationCardViewer
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.CardError
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Pending
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Phase
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.sharelink.ShareLinkJoinRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationLinkCardsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val shareTarget = ConversationCardTarget.ShareLink("club")
    private val directTarget = ConversationCardTarget.Direct("c1")

    private val outsider = ConversationCard(
        kind = ConversationCardKind.SHARE_LINK,
        title = "Club",
        stats = ConversationCardStats(memberCount = 10),
        viewer = ConversationCardViewer(canJoin = true),
        link = ConversationCardLink(identifier = "club", isActive = true),
    )
    private val member = ConversationCard(
        kind = ConversationCardKind.DIRECT,
        conversationId = "c1",
        title = "Club",
        stats = ConversationCardStats(memberCount = 10),
        viewer = ConversationCardViewer(isMember = true),
    )

    private class Harness(
        val cache: LinkCacheRepository,
        val join: ShareLinkJoinRepository,
        val conversations: ConversationRepository,
        val viewModel: ConversationLinkCardsViewModel,
    )

    private fun harness(
        served: Map<ConversationCardTarget, CacheResult<ConversationCardResolution>>,
        user: MeeshyUser? = null,
    ): Harness {
        val cache = mockk<LinkCacheRepository>(relaxed = true)
        every { cache.card(any(), any()) } answers {
            flowOf(served[firstArg()] ?: CacheResult.Empty)
        }
        val join = mockk<ShareLinkJoinRepository>()
        val conversations = mockk<ConversationRepository>()
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        val viewModel = ConversationLinkCardsViewModel(cache, join, conversations, session, MeeshyConfig())
        return Harness(cache, join, conversations, viewModel)
    }

    @Test
    fun `a cached card is served at once and never shows the skeleton`() = runTest(dispatcher) {
        val h = harness(mapOf(shareTarget to CacheResult.Stale(ConversationCardResolution.Card(outsider), 1_000)))
        val flow = h.viewModel.state(shareTarget)
        assertThat(flow.value.phase).isEqualTo(Phase.Loading)

        advanceUntilIdle()

        assertThat(flow.value.phase).isEqualTo(Phase.Card(outsider))
    }

    @Test
    fun `an empty cache keeps the skeleton until the server answers`() = runTest(dispatcher) {
        val h = harness(emptyMap())
        val flow = h.viewModel.state(shareTarget)

        advanceUntilIdle()

        assertThat(flow.value.phase).isEqualTo(Phase.Loading)
    }

    @Test
    fun `joining ends with the joined member card and hands over the conversation id`() = runTest(dispatcher) {
        val h = harness(mapOf(shareTarget to CacheResult.Fresh(ConversationCardResolution.Card(outsider), 0)))
        coEvery { h.join.joinAuthenticated("club") } returns NetworkResult.Success("c9")
        val flow = h.viewModel.state(shareTarget)
        advanceUntilIdle()
        val opened = mutableListOf<String>()

        h.viewModel.join(shareTarget, onJoined = { opened += it }, onFailed = { error("no") })
        assertThat(flow.value.pending).isEqualTo(Pending.JOINING)
        advanceUntilIdle()

        val card = (flow.value.phase as Phase.Card).card
        assertThat(card.viewer.isMember).isTrue()
        assertThat(card.stats.memberCount).isEqualTo(11)
        assertThat(flow.value.pending).isEqualTo(Pending.NONE)
        assertThat(opened).containsExactly("c9")
    }

    @Test
    fun `a refused join rolls back to the join state with the localized reason`() = runTest(dispatcher) {
        val cases = mapOf(404 to CardError.LINK_NOT_FOUND, 410 to CardError.LINK_INACTIVE, 403 to CardError.FORBIDDEN, 500 to CardError.JOIN_FAILED)
        cases.forEach { (status, expected) ->
            val h = harness(mapOf(shareTarget to CacheResult.Fresh(ConversationCardResolution.Card(outsider), 0)))
            coEvery { h.join.joinAuthenticated("club") } returns NetworkResult.Failure(ApiError(message = "x", httpStatus = status))
            val flow = h.viewModel.state(shareTarget)
            advanceUntilIdle()
            var failed = 0

            h.viewModel.join(shareTarget, onJoined = { error("no") }, onFailed = { failed++ })
            advanceUntilIdle()

            assertThat(flow.value.error).isEqualTo(expected)
            assertThat(flow.value.phase).isEqualTo(Phase.Card(outsider))
            assertThat(flow.value.pending).isEqualTo(Pending.NONE)
            assertThat(failed).isEqualTo(1)
        }
    }

    @Test
    fun `a second join while one is in flight is ignored`() = runTest(dispatcher) {
        val h = harness(mapOf(shareTarget to CacheResult.Fresh(ConversationCardResolution.Card(outsider), 0)))
        val gate = CompletableDeferred<NetworkResult<String>>()
        coEvery { h.join.joinAuthenticated("club") } coAnswers { gate.await() }
        h.viewModel.state(shareTarget)
        advanceUntilIdle()

        h.viewModel.join(shareTarget, onJoined = {}, onFailed = {})
        h.viewModel.join(shareTarget, onJoined = {}, onFailed = {})
        gate.complete(NetworkResult.Success("c9"))
        advanceUntilIdle()

        coVerify(exactly = 1) { h.join.joinAuthenticated("club") }
    }

    @Test
    fun `leaving is optimistic and a direct card turns private once the departure is confirmed`() = runTest(dispatcher) {
        val h = harness(mapOf(directTarget to CacheResult.Fresh(ConversationCardResolution.Card(member), 0)))
        val gate = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { h.conversations.leave("c1") } coAnswers { gate.await() }
        val flow = h.viewModel.state(directTarget)
        advanceUntilIdle()
        var done: Boolean? = null

        h.viewModel.leave(directTarget) { done = it }
        assertThat((flow.value.phase as Phase.Card).card.viewer.isMember).isFalse()
        assertThat(flow.value.pending).isEqualTo(Pending.LEAVING)
        gate.complete(NetworkResult.Success(Unit))
        advanceUntilIdle()

        assertThat(flow.value.phase).isEqualTo(Phase.PrivateConversation)
        assertThat(done).isTrue()
    }

    @Test
    fun `a refused leave restores the member card and says so`() = runTest(dispatcher) {
        val h = harness(mapOf(directTarget to CacheResult.Fresh(ConversationCardResolution.Card(member), 0)))
        coEvery { h.conversations.leave("c1") } returns NetworkResult.Failure(ApiError(message = "x", httpStatus = 500))
        val flow = h.viewModel.state(directTarget)
        advanceUntilIdle()
        var done: Boolean? = null

        h.viewModel.leave(directTarget) { done = it }
        advanceUntilIdle()

        assertThat(flow.value.phase).isEqualTo(Phase.Card(member))
        assertThat(flow.value.error).isEqualTo(CardError.LEAVE_FAILED)
        assertThat(done).isFalse()
    }

    @Test
    fun `a join forgets the direct card of the same conversation`() = runTest(dispatcher) {
        val direct = member.copy(viewer = ConversationCardViewer())
        val h = harness(
            mapOf(
                shareTarget to CacheResult.Fresh(ConversationCardResolution.Card(outsider), 0),
                directTarget to CacheResult.Fresh(ConversationCardResolution.Card(direct), 0),
            ),
        )
        coEvery { h.join.joinAuthenticated("club") } returns NetworkResult.Success("c1")
        h.viewModel.state(shareTarget)
        h.viewModel.state(directTarget)
        advanceUntilIdle()

        h.viewModel.join(shareTarget, onJoined = {}, onFailed = {})
        advanceUntilIdle()

        coVerify { h.cache.forgetCard(directTarget) }
    }

    @Test
    fun `the join button is named by the account, absent for a guest session`() = runTest(dispatcher) {
        val named = harness(emptyMap(), MeeshyUser(id = "u", username = "moussa", displayName = "Moussa"))
        val guest = harness(emptyMap(), MeeshyUser(id = "g", username = "guest", displayName = "Guest", isAnonymous = true))

        assertThat(named.viewModel.joinAccount.value?.title).isEqualTo("Moussa")
        assertThat(named.viewModel.joinAccount.value?.handle).isEqualTo("@moussa")
        assertThat(guest.viewModel.joinAccount.value).isNull()
    }
}
