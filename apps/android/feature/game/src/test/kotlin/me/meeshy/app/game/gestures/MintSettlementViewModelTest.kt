package me.meeshy.app.game.gestures

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import io.mockk.coEvery
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
import me.meeshy.sdk.model.game.GameIntentIds
import me.meeshy.sdk.model.game.GameMintPreview
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.MeeshMintResponse
import me.meeshy.sdk.model.game.ceremony.GameMintSettlement
import me.meeshy.sdk.model.game.ceremony.MintSettlementOutcome
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * LE RÉGLEMENT DE LA DERNIÈRE FRAPPE (iOS `ProgressionViewModel.mintSettlement`, `GameMintSettlement`) : ce que la
 * cérémonie attend pour frapper et ce qui libère la tête de l'Héritage. Rien ne se règle avant la réponse de la
 * passerelle ; chaque réponse — pièce ou refus — compte une fois de plus ; le réglement précède la relecture.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MintSettlementViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val gestures = mockk<GameGestureRepository>()
    private val progress = mockk<EngagementProgressRepository>(relaxed = true)
    private val network = InMemoryNetworkMonitor(initialOnline = true)

    private fun viewModel(): GameGesturesViewModel {
        var next = 0
        return GameGesturesViewModel(gestures, progress, network, GameIntentIds { "req-${++next}-xxxxxxxx" }, kotlinx.coroutines.flow.flowOf(null))
    }

    private val preview = GameMintPreview(
        number = 92, price = 1221, edition = MeeshEdition.Silver, canMint = true, missingPoints = 0,
        levelBefore = 9, levelAfter = 8, levelsLost = 1, gloryGained = 1000,
    )

    @Test
    fun `rien ne se regle avant la reponse puis la piece de la reponse se regle une fois de plus a chaque frappe`() = runTest {
        val gate = CompletableDeferred<GameWriteOutcome<MeeshMintResponse>>()
        coEvery { gestures.mint(any(), any()) } coAnswers { gate.await() }
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        vm.mint(preview)
        assertWithMessage("pendant le vol, la cérémonie n'a rien à frapper").that(vm.state.value.mintSettlement).isNull()
        gate.complete(GameWriteOutcome.Done(MeeshMintResponse(status = "minted", number = 93)))
        assertThat(vm.state.value.mintSettlement).isEqualTo(GameMintSettlement(MintSettlementOutcome.Minted(93), key = 1))

        coEvery { gestures.mint(any(), any()) } returns GameWriteOutcome.Done(MeeshMintResponse(status = "already-minted"))
        vm.mint(preview)
        assertThat(vm.state.value.mintSettlement).isEqualTo(GameMintSettlement(MintSettlementOutcome.Minted(92), key = 2))
    }

    @Test
    fun `chaque refus se regle avec son code, le reseau absent se dit NETWORK`() = runTest {
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }

        coEvery { gestures.mint(any(), any()) } returns GameWriteOutcome.Done(MeeshMintResponse(status = "insufficient"))
        vm.mint(preview)
        assertThat(vm.state.value.mintSettlement).isEqualTo(GameMintSettlement(MintSettlementOutcome.Refused("INSUFFICIENT_POINTS"), 1))

        coEvery { gestures.mint(any(), any()) } returns GameWriteOutcome.Refused("PRICE_CHANGED", offline = false)
        vm.mint(preview)
        assertThat(vm.state.value.mintSettlement).isEqualTo(GameMintSettlement(MintSettlementOutcome.Refused("PRICE_CHANGED"), 2))

        coEvery { gestures.mint(any(), any()) } returns GameWriteOutcome.Refused("NETWORK", offline = true)
        vm.mint(preview)
        assertThat(vm.state.value.mintSettlement).isEqualTo(GameMintSettlement(MintSettlementOutcome.Refused("NETWORK"), 3))

        network.simulateOffline()
        vm.mint(preview)
        assertThat(vm.state.value.mintSettlement).isEqualTo(GameMintSettlement(MintSettlementOutcome.Refused("NETWORK"), 4))
    }

    @Test
    fun `la piece se regle sans attendre la relecture de la progression`() = runTest {
        val vm = viewModel()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.state.collect { } }
        val reread = CompletableDeferred<Unit>()
        coEvery { progress.refresh() } coAnswers { reread.await() }
        coEvery { gestures.mint(any(), any()) } returns GameWriteOutcome.Done(MeeshMintResponse(status = "minted", number = 93))

        vm.mint(preview)

        assertWithMessage("la relecture est encore en vol").that(vm.state.value.minting).isTrue()
        assertThat(vm.state.value.mintSettlement).isEqualTo(GameMintSettlement(MintSettlementOutcome.Minted(93), 1))
        reread.complete(Unit)
    }
}
