package me.meeshy.app.contacts.circles

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationLevelRaisedEvent
import me.meeshy.sdk.model.relation.RelationRitualCompletedEvent
import me.meeshy.sdk.model.relation.RelationRitualProgressEvent
import me.meeshy.sdk.model.relation.RelationRitualStartedEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.After
import org.junit.Before
import org.junit.Test

/** « Mes cercles » (#13938) : iso `CirclesViewModelTests.swift` — cache d'abord, montée optimiste, demandes, rituel. */
@OptIn(ExperimentalCoroutinesApi::class)
class CirclesViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val levelRaised = MutableSharedFlow<RelationLevelRaisedEvent>(extraBufferCapacity = 8)

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private fun viewModel(gateway: FakeCirclesGateway, online: Boolean = true) = CirclesViewModel(
        gateway,
        InMemoryNetworkMonitor(initialOnline = online),
        CircleEvents(
            levelRaised = levelRaised,
            ritual = RitualEvents(
                MutableSharedFlow<RelationRitualStartedEvent>(),
                MutableSharedFlow<RelationRitualProgressEvent>(),
                MutableSharedFlow<RelationRitualCompletedEvent>(),
            ),
        ),
    )

    @Test
    fun `a froid l'indicateur ne vaut que tant que rien n'est peint, puis les liens servis se rangent par niveau`() = runTest {
        val gateway = FakeCirclesGateway(
            served = NetworkResult.Success(listOf(link("a", RelationLevel.FRIEND), link("b", RelationLevel.BLOOD), link("p", RelationLevel.PUBLIC))),
            known = mapOf("a" to CirclePerson("a", "Ana"), "b" to CirclePerson("b", "Bob")),
        )
        val vm = viewModel(gateway)
        assertThat(vm.state.value.showsSkeleton).isTrue()

        vm.load()

        val state = vm.state.value
        assertThat(state.showsSkeleton).isFalse()
        assertThat(state.sections.map { it.level }).containsExactly(RelationLevel.BLOOD, RelationLevel.FRIEND).inOrder()
        assertThat(state.people.keys).containsExactly("a", "b")
    }

    @Test
    fun `le cache se peint sans indicateur et reste affiche quand le reseau echoue`() = runTest {
        val gateway = FakeCirclesGateway(
            cached = listOf(link("a", RelationLevel.CLOSE)),
            served = NetworkResult.Failure(ApiError("boom", httpStatus = 503)),
        )
        val vm = viewModel(gateway)

        vm.load()

        val state = vm.state.value
        assertThat(state.visibleLinks.map { it.userId }).containsExactly("a")
        assertThat(state.showsSkeleton).isFalse()
        assertThat(state.hasError).isTrue()
    }

    @Test
    fun `hors ligne le cache reste affiche et le reseau n'est pas sollicite`() = runTest {
        val gateway = FakeCirclesGateway(cached = listOf(link("a", RelationLevel.FRIEND)))
        val vm = viewModel(gateway, online = false)

        vm.load()

        assertThat(vm.state.value.isOffline).isTrue()
        assertThat(vm.state.value.visibleLinks).hasSize(1)
        assertThat(gateway.refreshCount).isEqualTo(0)
    }

    @Test
    fun `aucun lien sert l'etat vide`() = runTest {
        val vm = viewModel(FakeCirclesGateway(served = NetworkResult.Success(listOf(link("p", RelationLevel.COMMUNITY)))))

        vm.load()

        assertThat(vm.state.value.isEmptyState).isTrue()
    }

    @Test
    fun `demander un cran ouvert l'affiche en attente avant le reseau et part par la file`() = runTest {
        val friend = link("a", RelationLevel.FRIEND, eligibleFor = RelationLevel.CLOSE)
        val gateway = FakeCirclesGateway(served = NetworkResult.Success(listOf(friend)))
        val vm = viewModel(gateway)
        vm.load()

        vm.requestRaise(friend)

        assertThat(vm.state.value.pendingLevel("a")).isEqualTo(RelationLevel.CLOSE)
        assertThat(gateway.raises).containsExactly("a" to RelationLevel.CLOSE)
    }

    @Test
    fun `un cran verrouille ne se demande pas`() = runTest {
        val friend = link("a", RelationLevel.FRIEND)
        val gateway = FakeCirclesGateway(served = NetworkResult.Success(listOf(friend)))
        val vm = viewModel(gateway)

        vm.requestRaise(friend)

        assertThat(gateway.raises).isEmpty()
        assertThat(vm.state.value.pendingLevel("a")).isNull()
    }

    @Test
    fun `une file qui refuse d'emblee defait l'attente`() = runTest {
        val friend = link("a", RelationLevel.ACQUAINTANCE)
        val vm = viewModel(FakeCirclesGateway(raiseCmid = null))

        vm.requestRaise(friend)

        assertThat(vm.state.value.pendingLevel("a")).isNull()
    }

    @Test
    fun `une demande que la file abandonne pour de bon defait l'attente`() = runTest {
        val friend = link("a", RelationLevel.ACQUAINTANCE)
        val gateway = FakeCirclesGateway(raiseCmid = "cmid-9")
        val vm = viewModel(gateway)
        vm.requestRaise(friend)
        assertThat(vm.state.value.pendingLevel("a")).isEqualTo(RelationLevel.FRIEND)

        gateway.exhausted.emit("cmid-9")

        assertThat(vm.state.value.pendingLevel("a")).isNull()
    }

    @Test
    fun `un niveau monte solde l'attente et relit les cercles`() = runTest {
        val friend = link("a", RelationLevel.ACQUAINTANCE)
        val gateway = FakeCirclesGateway(served = NetworkResult.Success(listOf(friend)))
        val vm = viewModel(gateway)
        vm.requestRaise(friend)
        val before = gateway.refreshCount

        levelRaised.emit(RelationLevelRaisedEvent(userId = "a", level = "FRIEND"))

        assertThat(vm.state.value.pendingLevel("a")).isNull()
        assertThat(gateway.refreshCount).isEqualTo(before + 1)
    }

    @Test
    fun `seules les demandes en attente d'un lien liste sont des montees, et la reponse est optimiste`() = runTest {
        val raise = FriendRequest(id = "r1", senderId = "a", status = "pending", targetLevel = "CLOSE")
        val stranger = FriendRequest(id = "r2", senderId = "z", status = "pending")
        val gateway = FakeCirclesGateway(
            served = NetworkResult.Success(listOf(link("a", RelationLevel.FRIEND))),
            received = listOf(raise, stranger),
        )
        val vm = viewModel(gateway)
        vm.load()
        assertThat(vm.state.value.incomingRaises.map { it.id }).containsExactly("r1")

        vm.accept(raise)

        assertThat(vm.state.value.incomingRaises).isEmpty()
        assertThat(gateway.responses).containsExactly("r1" to true)
    }

    @Test
    fun `une reponse que la file abandonne remet la demande`() = runTest {
        val raise = FriendRequest(id = "r1", senderId = "a", status = "pending", targetLevel = "CLOSE")
        val gateway = FakeCirclesGateway(
            served = NetworkResult.Success(listOf(link("a", RelationLevel.FRIEND))),
            received = listOf(raise),
            respondCmid = "cmid-r",
        )
        val vm = viewModel(gateway)
        vm.load()
        vm.decline(raise)

        gateway.exhausted.emit("cmid-r")

        assertThat(vm.state.value.incomingRaises.map { it.id }).containsExactly("r1")
    }

    @Test
    fun `une demande de Sang ne s'accepte pas, elle ouvre le rituel`() = runTest {
        val blood = FriendRequest(id = "r1", senderId = "a", status = "pending", targetLevel = "BLOOD")
        val gateway = FakeCirclesGateway(
            served = NetworkResult.Success(listOf(link("a", RelationLevel.CLOSE))),
            received = listOf(blood),
            known = mapOf("a" to CirclePerson("a", "Ana")),
        )
        val vm = viewModel(gateway)
        vm.load()

        vm.accept(blood)

        assertThat(gateway.responses).isEmpty()
        assertThat(vm.ritual.value?.userId).isEqualTo("a")
        assertThat(vm.ritual.value?.displayName).isEqualTo("Ana")
        assertThat(vm.state.value.incomingRaises.map { it.id }).containsExactly("r1")
    }

    @Test
    fun `annuler une demande envoyee la retire, et un echec la remet`() = runTest {
        val sent = FriendRequest(id = "s1", receiverId = "a", status = "pending", targetLevel = "CLOSE")
        val gateway = FakeCirclesGateway(
            served = NetworkResult.Success(listOf(link("a", RelationLevel.FRIEND))),
            sent = listOf(sent),
            cancelSucceeds = false,
        )
        val vm = viewModel(gateway)
        vm.load()
        assertThat(vm.state.value.pendingLevel("a")).isEqualTo(RelationLevel.CLOSE)

        vm.cancel(sent)

        assertThat(vm.state.value.outgoingRaises.map { it.id }).containsExactly("s1")
    }

    @Test
    fun `fermer le rituel relit les cercles`() = runTest {
        val gateway = FakeCirclesGateway()
        val vm = viewModel(gateway)
        vm.openRitual("a", "Ana")

        vm.ritualFinished()

        assertThat(vm.ritual.value).isNull()
        assertThat(gateway.refreshCount).isEqualTo(1)
    }
}
