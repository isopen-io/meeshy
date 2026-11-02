package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.e2ee.ConversationEncryptionProviding
import me.meeshy.sdk.e2ee.ConversationEncryptionRepository
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.e2ee.ConversationEncryptionContent
import me.meeshy.sdk.model.e2ee.ConversationEncryptionModeChoice
import me.meeshy.sdk.model.e2ee.ConversationEncryptionRegime
import me.meeshy.sdk.model.e2ee.ConversationEncryptionStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La feuille Chiffrement (#13463) : la passerelle fait foi, le bout en bout appris ne se quitte pas. */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationEncryptionViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun status(mode: String?, canToggle: Boolean? = true) = ConversationEncryptionStatus(
        isEncrypted = mode != null,
        mode = mode,
        enabledAt = null,
        canTranslate = mode == "server" || mode == "hybrid",
        canToggleEncryption = canToggle,
        pairEndToEndConversationId = null,
    )

    private fun ok(mode: String?, canToggle: Boolean? = true) = NetworkResult.Success(status(mode, canToggle))

    private fun failure(code: String, httpStatus: Int? = null) = NetworkResult.Failure(ApiError("x", code, httpStatus))

    private fun viewModel(
        provider: ConversationEncryptionProviding,
        ledger: InMemoryEndToEndRegimeLedger = InMemoryEndToEndRegimeLedger(),
    ) = ConversationEncryptionViewModel(provider, ledger)

    @Test
    fun `opening reads the served regime, loading until it arrives`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("server")
        val vm = viewModel(provider)

        vm.load("c1", isDirect = true)
        assertThat(vm.state.value.isLoading).isTrue()
        advanceUntilIdle()

        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.SERVER)
        assertThat(vm.state.value.view().content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = true))
    }

    @Test
    fun `a failed read says so instead of showing a clear conversation`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns failure("NETWORK")
        val vm = viewModel(provider)

        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        assertThat(vm.state.value.status).isNull()
        assertThat(vm.state.value.notice).isEqualTo(ConversationEncryptionNotice.OFFLINE)
        assertThat(vm.state.value.readFailed).isTrue()
    }

    @Test
    fun `retrying after a failed read reads again`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returnsMany listOf(failure("X", 500), ok(null))
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.retry()
        advanceUntilIdle()

        assertThat(vm.state.value.readFailed).isFalse()
        assertThat(vm.state.value.notice).isNull()
        assertThat(vm.state.value.status).isEqualTo(status(null))
    }

    @Test
    fun `a conversation this device saw end to end opens end to end, even if the server serves clear`() = runTest {
        val ledger = InMemoryEndToEndRegimeLedger().also { it.learn("c1") }
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok(null)
        val vm = viewModel(provider, ledger)

        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        val view = vm.state.value.view()
        assertThat(view.regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(view.servedGap).isTrue()
    }

    @Test
    fun `activating the chosen server mode shows the regime the gateway served`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok(null)
        coEvery { provider.enable("c1", ConversationEncryptionModeChoice.HYBRID) } returns ok("hybrid")
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.HYBRID)
        vm.activate()
        advanceUntilIdle()

        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.HYBRID)
        assertThat(vm.state.value.isSwitching).isFalse()
    }

    @Test
    fun `end to end cannot be selected from this phone`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok(null)
        coEvery { provider.enable("c1", ConversationEncryptionModeChoice.SERVER) } returns ok("server")
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.E2EE)
        vm.activate()
        advanceUntilIdle()

        assertThat(vm.state.value.selected).isEqualTo(ConversationEncryptionModeChoice.SERVER)
        coVerify(exactly = 0) { provider.enable(any(), ConversationEncryptionModeChoice.E2EE) }
    }

    @Test
    fun `nobody who may not toggle activates anything`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok(null, canToggle = false)
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.activate()
        advanceUntilIdle()

        coVerify(exactly = 0) { provider.enable(any(), any()) }
    }

    @Test
    fun `a concurrent switch reads the state again and says so`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returnsMany listOf(ok(null), ok("server"))
        coEvery { provider.enable("c1", ConversationEncryptionModeChoice.SERVER) } returns
            failure(ConversationEncryptionRepository.REGIME_CHANGED, 409)
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.activate()
        advanceUntilIdle()

        assertThat(vm.state.value.notice).isEqualTo(ConversationEncryptionNotice.REGIME_CHANGED)
        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.SERVER)
    }

    @Test
    fun `an irreversible refusal reads the state again, which now knows it is end to end`() = runTest {
        val ledger = InMemoryEndToEndRegimeLedger()
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returnsMany listOf(ok("server"), ok("e2ee"))
        coEvery { provider.enable("c1", ConversationEncryptionModeChoice.HYBRID) } coAnswers {
            ledger.learn("c1")
            failure(ConversationEncryptionRepository.IRREVERSIBLE, 409)
        }
        val vm = viewModel(provider, ledger)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.HYBRID)
        vm.switchMode()
        advanceUntilIdle()

        assertThat(vm.state.value.notice).isEqualTo(ConversationEncryptionNotice.IRREVERSIBLE)
        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(vm.state.value.view().content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
    }

    @Test
    fun `an end to end conversation offers no mode change`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("e2ee")
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.SERVER)
        vm.switchMode()
        advanceUntilIdle()

        assertThat(vm.state.value.canSwitchMode).isFalse()
        coVerify(exactly = 0) { provider.enable(any(), any()) }
    }

    @Test
    fun `a server conversation switches directly to hybrid, never through the clear`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("server")
        coEvery { provider.enable("c1", ConversationEncryptionModeChoice.HYBRID) } returns ok("hybrid")
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.HYBRID)
        assertThat(vm.state.value.canSwitchMode).isTrue()
        vm.switchMode()
        advanceUntilIdle()

        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.HYBRID)
        assertThat(vm.state.value.canSwitchMode).isFalse()
        coVerify(exactly = 0) { provider.disable(any()) }
    }

    @Test
    fun `a hybrid conversation switches back to server`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("hybrid")
        coEvery { provider.enable("c1", ConversationEncryptionModeChoice.SERVER) } returns ok("server")
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.SERVER)
        vm.switchMode()
        advanceUntilIdle()

        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.SERVER)
    }

    @Test
    fun `the mode already in place is not a switch`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("server")
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.SERVER)
        vm.switchMode()
        advanceUntilIdle()

        assertThat(vm.state.value.canSwitchMode).isFalse()
        coVerify(exactly = 0) { provider.enable(any(), any()) }
    }

    @Test
    fun `end to end is never a switch target from this phone`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("hybrid")
        // Le choix refusé laisse le mode valide d'avant, que le changement peut viser.
        coEvery { provider.enable("c1", any()) } returns ok("server")
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.E2EE)
        vm.switchMode()
        advanceUntilIdle()

        assertThat(vm.state.value.selected).isNotEqualTo(ConversationEncryptionModeChoice.E2EE)
        coVerify(exactly = 0) { provider.enable(any(), ConversationEncryptionModeChoice.E2EE) }
    }

    @Test
    fun `a role that may not toggle switches nothing`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("server", canToggle = false)
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.select(ConversationEncryptionModeChoice.HYBRID)
        vm.switchMode()
        advanceUntilIdle()

        assertThat(vm.state.value.view().content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
        coVerify(exactly = 0) { provider.enable(any(), any()) }
    }

    @Test
    fun `a forbidden role is told, and the state stays as it was`() = runTest {
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok(null)
        coEvery { provider.enable("c1", ConversationEncryptionModeChoice.SERVER) } returns failure("FORBIDDEN", 403)
        val vm = viewModel(provider)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()

        vm.activate()
        advanceUntilIdle()

        assertThat(vm.state.value.notice).isEqualTo(ConversationEncryptionNotice.FORBIDDEN)
        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.NONE)
    }

    @Test
    fun `reopening the sheet after the conversation turned end to end never offers a mode change`() = runTest {
        val ledger = InMemoryEndToEndRegimeLedger()
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returnsMany listOf(ok("server"), ok("e2ee", canToggle = false))
        val vm = viewModel(provider, ledger)
        vm.load("c1", isDirect = true)
        advanceUntilIdle()
        assertThat(vm.state.value.view().content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = true))

        ledger.learn("c1")
        vm.load("c1", isDirect = true)

        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(vm.state.value.view().content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
        advanceUntilIdle()
        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(vm.state.value.view().content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
        coVerify(exactly = 2) { provider.status("c1") }
    }

    @Test
    fun `an end to end conversation stays end to end when the account is momentarily unknown`() = runTest {
        var account: String? = "me"
        val ledger = InMemoryEndToEndRegimeLedger { account }.also { it.learn("c1") }
        val provider = mockk<ConversationEncryptionProviding>()
        coEvery { provider.status("c1") } returns ok("server")
        val vm = viewModel(provider, ledger)
        vm.load("c1", isDirect = true)

        account = null
        advanceUntilIdle()

        assertThat(vm.state.value.view().regime).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(vm.state.value.view().content).isEqualTo(ConversationEncryptionContent.Active(offersModeChange = false))
        vm.select(ConversationEncryptionModeChoice.HYBRID)
        vm.switchMode()
        advanceUntilIdle()
        assertThat(vm.state.value.canSwitchMode).isFalse()
        coVerify(exactly = 0) { provider.enable(any(), any()) }
    }
}
