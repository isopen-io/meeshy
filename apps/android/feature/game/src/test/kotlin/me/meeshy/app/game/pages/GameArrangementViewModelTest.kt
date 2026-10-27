package me.meeshy.app.game.pages

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.app.game.gestures.GameGestureFailure
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.game.GamePagesRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.game.InMemoryGameDevicePrefsStore
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.game.DuoInviteResponse
import me.meeshy.sdk.model.game.DuoStatusResponse
import me.meeshy.sdk.model.game.GameIntentIds
import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.ShowcaseOrderResponse
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibilityResponse
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import me.meeshy.sdk.model.game.pages.VisibilityField
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameArrangementViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val pages = mockk<GamePagesRepository>()
    private val progress = mockk<EngagementProgressRepository>(relaxed = true)
    private val friends = mockk<FriendListRepository>()
    private val network = InMemoryNetworkMonitor(initialOnline = true)
    private var prefs = InMemoryGameDevicePrefsStore()

    private fun viewModel(): GameArrangementViewModel {
        var next = 0
        coEvery { friends.cachedSnapshot() } returns listOf(FriendRequestUser(id = "f1", username = "ami", displayName = "Aube"))
        return GameArrangementViewModel(pages, progress, friends, prefs, network, GameIntentIds { "req-${++next}-xxxxxxxx" })
    }

    private val atlasFriends = ShowcaseVisibilityResponse(GameVisibility(showcase = ShowcaseVisibility.Friends, rank = ShowcaseVisibility.Friends, treasury = ShowcaseVisibility.Friends, atlas = ShowcaseVisibility.Friends))

    @Test
    fun `ranger montre l ordre choisi pendant le vol puis relit la progression servie`() = runTest {
        val gate = CompletableDeferred<GameWriteOutcome<ShowcaseOrderResponse>>()
        coEvery { pages.setShowcaseOrder(any(), any()) } coAnswers { gate.await() }
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.move(listOf("a", "b", "c"), index = 2, delta = -1)

        assertThat(vm.state.value.orderInFlight).containsExactly("a", "c", "b").inOrder()
        assertThat(ArrangementWrite.Order in vm.state.value.busy).isTrue()
        gate.complete(GameWriteOutcome.Done(ShowcaseOrderResponse(listOf("a", "c", "b"))))

        assertThat(vm.state.value.orderInFlight).isNull()
        coVerify(exactly = 1) { progress.refresh() }
    }

    @Test
    fun `un refus remet l ordre servi, se dit par son code et relit l etat`() = runTest {
        coEvery { pages.setShowcaseOrder(any(), any()) } returns GameWriteOutcome.Refused("SHOWCASE_ORDER_INVALID", offline = false)
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.move(listOf("a", "b"), index = 0, delta = 1)

        assertThat(vm.state.value.orderInFlight).isNull()
        assertThat(vm.state.value.failures[ArrangementWrite.Order]).isEqualTo(GameGestureFailure(offline = false, code = "SHOWCASE_ORDER_INVALID"))
        coVerify(exactly = 1) { progress.refresh() }
    }

    @Test
    fun `un rangement qui ne change rien n envoie rien`() = runTest {
        val vm = viewModel()

        vm.move(listOf("a", "b"), index = 0, delta = -1)

        coVerify(exactly = 0) { pages.setShowcaseOrder(any(), any()) }
    }

    @Test
    fun `un reessai apres coupure ou 5xx rejoue le meme identifiant, une reponse definitive en change`() = runTest {
        val ids = mutableListOf<String>()
        coEvery { pages.setShowcaseOrder(capture(ids), any()) } returnsMany listOf(
            GameWriteOutcome.Refused("NETWORK", offline = true),
            GameWriteOutcome.Refused("INTERNAL_SERVER_ERROR", offline = false),
            GameWriteOutcome.Refused("INSUFFICIENT_MEESHES", offline = false),
            GameWriteOutcome.Done(ShowcaseOrderResponse(listOf("b", "a"))),
        )
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        repeat(4) { vm.move(listOf("a", "b"), 0, 1) }

        assertThat(ids[1]).isEqualTo(ids[0])
        assertThat(ids[2]).isEqualTo(ids[1])
        assertThat(ids[3]).isNotEqualTo(ids[2])
    }

    @Test
    fun `regler une visibilite montre le niveau choisi pendant le vol et n envoie que cette facette`() = runTest {
        val gate = CompletableDeferred<GameWriteOutcome<ShowcaseVisibilityResponse>>()
        coEvery { pages.setVisibility(any()) } coAnswers { gate.await() }
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.setVisibility(VisibilityField.Atlas, ShowcaseVisibility.Friends)

        assertThat(vm.state.value.visibilityInFlight).containsExactly(VisibilityField.Atlas, ShowcaseVisibility.Friends)
        gate.complete(GameWriteOutcome.Done(atlasFriends))
        assertThat(vm.state.value.visibilityInFlight).isEmpty()
        coVerify { pages.setVisibility(match { it.atlas == ShowcaseVisibility.Friends && it.rank == null && it.showcase == null && it.treasury == null }) }
    }

    @Test
    fun `jeu masque rien ne se rouvre`() = runTest {
        prefs = InMemoryGameDevicePrefsStore(GameDevicePrefs(hidden = true))
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.setVisibility(VisibilityField.Atlas, ShowcaseVisibility.Everyone)

        assertThat(vm.state.value.canWriteVisibility).isFalse()
        coVerify(exactly = 0) { pages.setVisibility(any()) }
    }

    @Test
    fun `hors ligne rien ne part et le geste est dit indisponible`() = runTest {
        network.simulateOffline()
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.setVisibility(VisibilityField.Rank, ShowcaseVisibility.Me)
        vm.abandon("duo1")

        assertThat(vm.state.value.failures[ArrangementWrite.Visibility]).isEqualTo(GameGestureFailure(offline = true, code = null))
        assertThat(vm.state.value.failures[ArrangementWrite.Duo]).isEqualTo(GameGestureFailure(offline = true, code = null))
        coVerify(exactly = 0) { pages.setVisibility(any()) }
        coVerify(exactly = 0) { pages.abandonDuo(any(), any()) }
    }

    @Test
    fun `un double appui sur l alliance n envoie qu une requete`() = runTest {
        val gate = CompletableDeferred<GameWriteOutcome<DuoStatusResponse>>()
        coEvery { pages.acceptDuo(any(), "duo1") } coAnswers { gate.await() }
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.accept("duo1")
        vm.accept("duo1")
        vm.abandon("duo1")
        gate.complete(GameWriteOutcome.Done(DuoStatusResponse("active", "duo1")))

        coVerify(exactly = 1) { pages.acceptDuo(any(), any()) }
        coVerify(exactly = 0) { pages.abandonDuo(any(), any()) }
        coVerify(exactly = 1) { progress.refresh() }
    }

    @Test
    fun `inviter dit quel ami est en vol et propose huit amis au plus`() = runTest {
        val gate = CompletableDeferred<GameWriteOutcome<DuoInviteResponse>>()
        coEvery { pages.inviteToDuo(any(), "f1") } coAnswers { gate.await() }
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.invite(DuoFriend("f1", "Aube"))

        assertThat(vm.state.value.invitingFriendId).isEqualTo("f1")
        assertThat(vm.state.value.friends).containsExactly(DuoFriend("f1", "Aube"))
        gate.complete(GameWriteOutcome.Done(DuoInviteResponse("invited", "duo9", "2026-10-26")))
        assertThat(vm.state.value.invitingFriendId).isNull()
    }

    @Test
    fun `quitter l alliance est une ecriture par intention et son identifiant ne sert qu a elle`() = runTest {
        val ids = mutableListOf<String>()
        coEvery { pages.abandonDuo(capture(ids), any()) } returns GameWriteOutcome.Done(DuoStatusResponse("abandoned", "duo1"))
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.abandon("duo1")
        vm.abandon("duo2")

        assertThat(ids).hasSize(2)
        assertThat(ids[0]).isNotEqualTo(ids[1])
    }
}
