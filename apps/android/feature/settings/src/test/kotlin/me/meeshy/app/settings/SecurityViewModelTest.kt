package me.meeshy.app.settings

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
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TwoFactorStatusInfo
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SecurityViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun enabled(count: Int = 7) =
        NetworkResult.Success(TwoFactorStatusInfo(enabled = true, hasBackupCodes = true, backupCodesCount = count))

    private fun failure() = NetworkResult.Failure(ApiError(message = "boom", code = "NETWORK"))

    @Test
    fun `le statut 2FA est charge a l init`() = runTest(dispatcher) {
        val repo = mockk<AuthRepository>()
        coEvery { repo.getTwoFactorStatus() } returns enabled()
        val sut = SecurityViewModel(repo)
        assertThat(sut.state.value.twoFactor).isEqualTo(TwoFactorStatusUi.Loading)
        advanceUntilIdle()
        assertThat(sut.state.value.twoFactor).isEqualTo(TwoFactorStatusUi.Known(true, 7))
    }

    @Test
    fun `le statut est relu au retour au premier plan`() = runTest(dispatcher) {
        val repo = mockk<AuthRepository>()
        coEvery { repo.getTwoFactorStatus() } returns enabled(7) andThen
            NetworkResult.Success(TwoFactorStatusInfo(enabled = false, hasBackupCodes = false, backupCodesCount = 0))
        val sut = SecurityViewModel(repo)
        advanceUntilIdle()

        sut.onEvent(SecurityUiEvent.Resumed)
        advanceUntilIdle()

        assertThat(sut.state.value.twoFactor).isEqualTo(TwoFactorStatusUi.Known(false, 0))
        coVerify(exactly = 2) { repo.getTwoFactorStatus() }
    }

    @Test
    fun `un echec sans statut connu donne une erreur puis Reessayer recharge`() = runTest(dispatcher) {
        val repo = mockk<AuthRepository>()
        coEvery { repo.getTwoFactorStatus() } returns failure() andThen enabled(3)
        val sut = SecurityViewModel(repo)
        advanceUntilIdle()
        assertThat(sut.state.value.twoFactor).isEqualTo(TwoFactorStatusUi.Failed)

        sut.onEvent(SecurityUiEvent.RetryTwoFactor)
        assertThat(sut.state.value.twoFactor).isEqualTo(TwoFactorStatusUi.Loading)
        advanceUntilIdle()

        assertThat(sut.state.value.twoFactor).isEqualTo(TwoFactorStatusUi.Known(true, 3))
    }

    @Test
    fun `hors ligne le dernier statut connu est conserve`() = runTest(dispatcher) {
        val repo = mockk<AuthRepository>()
        coEvery { repo.getTwoFactorStatus() } returns enabled(5) andThen failure()
        val sut = SecurityViewModel(repo)
        advanceUntilIdle()

        sut.onEvent(SecurityUiEvent.Resumed)
        advanceUntilIdle()

        assertThat(sut.state.value.twoFactor).isEqualTo(TwoFactorStatusUi.Known(true, 5))
    }

    @Test
    fun `un retour au premier plan pendant un chargement n en lance pas un second`() = runTest(dispatcher) {
        val repo = mockk<AuthRepository>()
        coEvery { repo.getTwoFactorStatus() } returns enabled()
        val sut = SecurityViewModel(repo)

        sut.onEvent(SecurityUiEvent.Resumed)
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.getTwoFactorStatus() }
    }
}
