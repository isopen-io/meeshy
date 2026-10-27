package me.meeshy.app.game.gestures

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
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.GameGestureRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.model.game.ChestClaimResponse
import me.meeshy.sdk.model.game.DailyChest
import me.meeshy.sdk.model.game.GameIntentIds
import me.meeshy.sdk.model.game.GameMission
import me.meeshy.sdk.model.game.MissionDifficulty
import me.meeshy.sdk.model.game.MissionRerollResponse
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GameGesturesViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val gestures = mockk<GameGestureRepository>()
    private val progress = mockk<EngagementProgressRepository>(relaxed = true)
    private val network = InMemoryNetworkMonitor(initialOnline = true)

    private fun viewModel(): GameGesturesViewModel {
        var next = 0
        return GameGesturesViewModel(gestures, progress, network, GameIntentIds { "req-${++next}-xxxxxxxx" })
    }

    private val replacement = GameMission(
        id = "m-2", templateKey = "send_texts", difficulty = MissionDifficulty.Easy, signal = "s",
        prism = false, target = 3, progress = 0, reward = 100, glory = 0,
    )
    private val rerolled = GameWriteOutcome.Done(MissionRerollResponse(replacement, balance = 4L))
    private val chest = ChestClaimResponse("claimed", DailyChest(points = 900, fragment = true, freeze = false), score = 4200L)

    @Test
    fun `le succes relit la progression servie et libere le geste`() = runTest {
        coEvery { gestures.rerollMission(any(), "m-1") } returns rerolled
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.reroll("m-1")

        coVerify(exactly = 1) { progress.refresh() }
        assertThat(vm.state.value.rerollingMissionId).isNull()
        assertThat(vm.state.value.failures).isEmpty()
    }

    @Test
    fun `un refus du serveur se dit par son code et relit l etat`() = runTest {
        coEvery { gestures.rerollMission(any(), any()) } returns GameWriteOutcome.Refused("MISSION_REROLL_EXHAUSTED", offline = false)
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.reroll("m-1")

        assertThat(vm.state.value.failures[GameGesture.Reroll]).isEqualTo(GameGestureFailure(offline = false, code = "MISSION_REROLL_EXHAUSTED"))
        coVerify(exactly = 1) { progress.refresh() }
        assertThat(vm.state.value.rerollingMissionId).isNull()
    }

    @Test
    fun `un double appui n envoie qu une requete`() = runTest {
        val gate = CompletableDeferred<GameWriteOutcome<MissionRerollResponse>>()
        coEvery { gestures.rerollMission(any(), "m-1") } coAnswers { gate.await() }
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.reroll("m-1")
        vm.reroll("m-1")
        vm.reroll("m-1")
        assertThat(vm.state.value.rerollingMissionId).isEqualTo("m-1")
        gate.complete(rerolled)

        coVerify(exactly = 1) { gestures.rerollMission(any(), any()) }
    }

    @Test
    fun `rien ne bouge avant la reponse de la passerelle`() = runTest {
        val gate = CompletableDeferred<GameWriteOutcome<ChestClaimResponse>>()
        coEvery { gestures.claimChest(any()) } coAnswers { gate.await() }
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.claimChest()

        assertThat(vm.state.value.chestOpening).isTrue()
        assertThat(vm.state.value.chestReward).isNull()
        coVerify(exactly = 0) { progress.refresh() }
        gate.complete(GameWriteOutcome.Done(chest))
        assertThat(vm.state.value.chestOpening).isFalse()
    }

    @Test
    fun `le contenu de l Offrande est celui que la passerelle a rendu`() = runTest {
        coEvery { gestures.claimChest(any()) } returns GameWriteOutcome.Done(chest)
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.claimChest()

        assertThat(vm.state.value.chestReward).isEqualTo(chest.reward)
        coVerify(exactly = 1) { progress.refresh() }
    }

    @Test
    fun `apres une coupure le reessai rejoue le meme identifiant`() = runTest {
        val sent = mutableListOf<String>()
        coEvery { gestures.claimChest(capture(sent)) } returnsMany listOf(
            GameWriteOutcome.Refused("NETWORK", offline = true),
            GameWriteOutcome.Done(chest),
        )
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.claimChest()
        assertThat(vm.state.value.failures[GameGesture.Chest]?.offline).isTrue()
        vm.claimChest()

        assertThat(sent).hasSize(2)
        assertThat(sent[1]).isEqualTo(sent[0])
        assertThat(vm.state.value.failures).isEmpty()
        coVerify(exactly = 1) { progress.refresh() }
    }

    @Test
    fun `l identifiant se renouvelle apres un succes`() = runTest {
        val sent = mutableListOf<String>()
        coEvery { gestures.claimChest(capture(sent)) } returns GameWriteOutcome.Done(chest)
        val vm = viewModel()

        vm.claimChest()
        vm.claimChest()

        assertThat(sent).hasSize(2)
        assertThat(sent[1]).isNotEqualTo(sent[0])
    }

    @Test
    fun `un identifiant deja servi a une autre ecriture est renouvele`() = runTest {
        val sent = mutableListOf<String>()
        coEvery { gestures.claimChest(capture(sent)) } returnsMany listOf(
            GameWriteOutcome.Refused("REQUEST_ID_CONFLICT", offline = false),
            GameWriteOutcome.Done(chest),
        )
        val vm = viewModel()

        vm.claimChest()
        vm.claimChest()

        assertThat(sent[1]).isNotEqualTo(sent[0])
    }

    @Test
    fun `un refus d etat sans reponse du reseau garde l identifiant`() = runTest {
        val sent = mutableListOf<String>()
        coEvery { gestures.claimChest(capture(sent)) } returns GameWriteOutcome.Refused("CHEST_NOT_READY", offline = false)
        val vm = viewModel()

        vm.claimChest()
        vm.claimChest()

        assertThat(sent[1]).isEqualTo(sent[0])
    }

    @Test
    fun `hors ligne rien ne part et rien n est mis en file`() = runTest {
        network.simulateOffline()
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.reroll("m-1")
        vm.claimChest()

        coVerify(exactly = 0) { gestures.rerollMission(any(), any()) }
        coVerify(exactly = 0) { gestures.claimChest(any()) }
        assertThat(vm.state.value.online).isFalse()
        assertThat(vm.state.value.failures[GameGesture.Reroll]).isEqualTo(GameGestureFailure(offline = true, code = null))
        assertThat(vm.state.value.failures[GameGesture.Chest]?.offline).isTrue()
        assertThat(vm.state.value.rerollingMissionId).isNull()
    }

    @Test
    fun `une coupure pendant le vol ne relit rien`() = runTest {
        coEvery { gestures.rerollMission(any(), any()) } returns GameWriteOutcome.Refused("NETWORK", offline = true)
        val vm = viewModel()

        vm.reroll("m-1")

        coVerify(exactly = 0) { progress.refresh() }
    }
}
