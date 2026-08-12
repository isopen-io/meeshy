package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo
import me.meeshy.sdk.net.api.TwoFactorSetupInfo
import me.meeshy.sdk.net.api.TwoFactorStatusInfo
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [TwoFactorViewModel] — feature-parity §L. The gateway's
 * `auth/2fa` routes are real and tested (`services/gateway/src/routes/two-factor.ts`,
 * `TwoFactorService.test.ts`) and iOS already ships this flow end to end
 * (`TwoFactorViewModel`/`TwoFactorSetupView`); the Android settings row was removed on
 * the (incorrect) assumption that no gateway route existed. Covers: the initial status
 * load, the setup→enable→backup-codes happy path, backup-code regeneration, disable,
 * the local code-format pre-flight gates, the double-tap in-flight guards, and the
 * per-action failure→[TwoFactorErrorKind] mapping (mirrors iOS's fixed per-action
 * localized error strings rather than parsing the server's message).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TwoFactorViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(repository: AuthRepository = mockk(relaxed = true)) =
        TwoFactorViewModel(repository)

    private fun setupInfo() = TwoFactorSetupInfo(
        secret = "JBSWY3DPEHPK3PXP",
        qrCodeDataUrl = "data:image/png;base64,iVBORw0KGgo=",
        otpauthUrl = "otpauth://totp/Meeshy:atabeth?secret=JBSWY3DPEHPK3PXP",
    )

    // ─── Status load (init) ──────────────────────────────────────────────

    @Test
    fun init_statusSuccess_populatesEnabledAndBackupCodesCount() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>()
        coEvery { repository.getTwoFactorStatus() } returns
            NetworkResult.Success(TwoFactorStatusInfo(enabled = true, hasBackupCodes = true, backupCodesCount = 7))
        val sut = vm(repository)
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.isEnabled).isTrue()
        assertThat(state.backupCodesCount).isEqualTo(7)
        assertThat(state.isLoading).isFalse()
    }

    @Test
    fun init_statusFailure_setsStatusError() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>()
        coEvery { repository.getTwoFactorStatus() } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "NETWORK"))
        val sut = vm(repository)
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(TwoFactorErrorKind.STATUS)
        assertThat(state.isLoading).isFalse()
    }

    // ─── Setup → enable → backup codes ───────────────────────────────────

    @Test
    fun beginSetup_success_movesToSetupStageWithData() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.beginTwoFactorSetup() } returns NetworkResult.Success(setupInfo())
        val sut = vm(repository)
        advanceUntilIdle()

        sut.beginSetup()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.stage).isEqualTo(TwoFactorStage.SETUP)
        assertThat(state.setupData).isEqualTo(setupInfo())
    }

    @Test
    fun beginSetup_failure_fallsBackToStatusWithSetupError() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.beginTwoFactorSetup() } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_400", httpStatus = 400))
        val sut = vm(repository)
        advanceUntilIdle()

        sut.beginSetup()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.stage).isEqualTo(TwoFactorStage.STATUS)
        assertThat(state.error).isEqualTo(TwoFactorErrorKind.SETUP)
    }

    @Test
    fun onCodeChange_updatesBufferAndClearsError() = runTest(dispatcher) {
        val sut = vm()
        advanceUntilIdle()

        sut.onCodeChange("123456")

        assertThat(sut.state.value.codeInput).isEqualTo("123456")
        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun confirmSetup_malformedCode_doesNothing() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginSetup()
        advanceUntilIdle()
        sut.onCodeChange("12") // too short — not a valid TOTP

        sut.confirmSetup()
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.enableTwoFactor(any()) }
    }

    @Test
    fun confirmSetup_success_movesToBackupCodesAndEnables() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.beginTwoFactorSetup() } returns NetworkResult.Success(setupInfo())
        coEvery { repository.enableTwoFactor("123456") } returns
            NetworkResult.Success(TwoFactorBackupCodesInfo(backupCodes = listOf("AAAA1111", "BBBB2222")))
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginSetup()
        advanceUntilIdle()
        sut.onCodeChange("123456")

        sut.confirmSetup()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.stage).isEqualTo(TwoFactorStage.BACKUP_CODES)
        assertThat(state.isEnabled).isTrue()
        assertThat(state.backupCodes).containsExactly("AAAA1111", "BBBB2222").inOrder()
        assertThat(state.codeInput).isEmpty()
        assertThat(state.setupData).isNull()
    }

    @Test
    fun confirmSetup_invalidCode_setsInvalidCodeError() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.beginTwoFactorSetup() } returns NetworkResult.Success(setupInfo())
        coEvery { repository.enableTwoFactor("000000") } returns
            NetworkResult.Failure(ApiError(message = "bad code", code = "HTTP_400", httpStatus = 400))
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginSetup()
        advanceUntilIdle()
        sut.onCodeChange("000000")

        sut.confirmSetup()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.error).isEqualTo(TwoFactorErrorKind.INVALID_CODE)
        assertThat(state.isEnabled).isFalse()
    }

    @Test
    fun confirmSetup_whileInFlight_callsRepositoryOnce() = runTest(dispatcher) {
        val gate = CompletableDeferred<NetworkResult<TwoFactorBackupCodesInfo>>()
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.beginTwoFactorSetup() } returns NetworkResult.Success(setupInfo())
        coEvery { repository.enableTwoFactor("123456") } coAnswers { gate.await() }
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginSetup()
        advanceUntilIdle()
        sut.onCodeChange("123456")

        sut.confirmSetup()
        runCurrent()
        // a second tap while the first request is in flight must be ignored
        sut.confirmSetup()
        runCurrent()

        gate.complete(NetworkResult.Success(TwoFactorBackupCodesInfo(backupCodes = listOf("X"))))
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.enableTwoFactor("123456") }
    }

    // ─── Backup code regeneration ────────────────────────────────────────

    @Test
    fun beginRegenerateCodes_movesToRegenerateStage() = runTest(dispatcher) {
        val sut = vm()
        advanceUntilIdle()

        sut.beginRegenerateCodes()

        assertThat(sut.state.value.stage).isEqualTo(TwoFactorStage.REGENERATE_CODES)
    }

    @Test
    fun confirmRegenerateCodes_success_movesToBackupCodesWithNewCodes() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.regenerateTwoFactorBackupCodes("654321") } returns
            NetworkResult.Success(TwoFactorBackupCodesInfo(backupCodes = listOf("NEW11111")))
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginRegenerateCodes()
        sut.onCodeChange("654321")

        sut.confirmRegenerateCodes()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.stage).isEqualTo(TwoFactorStage.BACKUP_CODES)
        assertThat(state.backupCodes).containsExactly("NEW11111")
    }

    @Test
    fun confirmRegenerateCodes_failure_setsBackupCodesError() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.regenerateTwoFactorBackupCodes("654321") } returns
            NetworkResult.Failure(ApiError(message = "boom", code = "HTTP_400", httpStatus = 400))
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginRegenerateCodes()
        sut.onCodeChange("654321")

        sut.confirmRegenerateCodes()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(TwoFactorErrorKind.BACKUP_CODES)
    }

    @Test
    fun acknowledgeBackupCodes_resetsToStatusAndClearsTransientState() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.beginTwoFactorSetup() } returns NetworkResult.Success(setupInfo())
        coEvery { repository.enableTwoFactor("123456") } returns
            NetworkResult.Success(TwoFactorBackupCodesInfo(backupCodes = listOf("AAAA1111")))
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginSetup()
        advanceUntilIdle()
        sut.onCodeChange("123456")
        sut.confirmSetup()
        advanceUntilIdle()

        sut.acknowledgeBackupCodes()

        val state = sut.state.value
        assertThat(state.stage).isEqualTo(TwoFactorStage.STATUS)
        assertThat(state.backupCodes).isEmpty()
        assertThat(state.setupData).isNull()
        // isEnabled from the successful enable stays true — only the transient setup data clears
        assertThat(state.isEnabled).isTrue()
    }

    // ─── Disable ──────────────────────────────────────────────────────────

    @Test
    fun beginDisable_movesToDisableStage() = runTest(dispatcher) {
        val sut = vm()
        advanceUntilIdle()

        sut.beginDisable()

        assertThat(sut.state.value.stage).isEqualTo(TwoFactorStage.DISABLE)
    }

    @Test
    fun disableFieldChanges_updateBuffersAndClearError() = runTest(dispatcher) {
        val sut = vm()
        advanceUntilIdle()
        sut.beginDisable()

        sut.onDisablePasswordChange("hunter2pass")
        sut.onDisableCodeChange("123456")

        val state = sut.state.value
        assertThat(state.disablePassword).isEqualTo("hunter2pass")
        assertThat(state.disableCode).isEqualTo("123456")
        assertThat(state.error).isNull()
    }

    @Test
    fun confirmDisable_missingPassword_doesNothing() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginDisable()
        sut.onDisableCodeChange("123456") // no password entered

        sut.confirmDisable()
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.disableTwoFactor(any(), any()) }
    }

    @Test
    fun confirmDisable_success_disablesAndReturnsToStatus() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.getTwoFactorStatus() } returns
            NetworkResult.Success(TwoFactorStatusInfo(enabled = true))
        coEvery { repository.disableTwoFactor("hunter2pass", "123456") } returns NetworkResult.Success(Unit)
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginDisable()
        sut.onDisablePasswordChange("hunter2pass")
        sut.onDisableCodeChange("123456")

        sut.confirmDisable()
        advanceUntilIdle()

        val state = sut.state.value
        assertThat(state.isEnabled).isFalse()
        assertThat(state.stage).isEqualTo(TwoFactorStage.STATUS)
        assertThat(state.disablePassword).isEmpty()
        assertThat(state.disableCode).isEmpty()
        coVerify(exactly = 1) { repository.disableTwoFactor("hunter2pass", "123456") }
    }

    @Test
    fun confirmDisable_failure_setsDisableError() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.disableTwoFactor("hunter2pass", "123456") } returns
            NetworkResult.Failure(ApiError(message = "wrong password", code = "HTTP_400", httpStatus = 400))
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginDisable()
        sut.onDisablePasswordChange("hunter2pass")
        sut.onDisableCodeChange("123456")

        sut.confirmDisable()
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(TwoFactorErrorKind.DISABLE)
    }

    // ─── Cancel (back from any sub-stage) ────────────────────────────────

    @Test
    fun cancel_fromSetup_returnsToStatusAndClearsSetupData() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>(relaxed = true)
        coEvery { repository.beginTwoFactorSetup() } returns NetworkResult.Success(setupInfo())
        val sut = vm(repository)
        advanceUntilIdle()
        sut.beginSetup()
        advanceUntilIdle()
        sut.onCodeChange("123456")

        sut.cancel()

        val state = sut.state.value
        assertThat(state.stage).isEqualTo(TwoFactorStage.STATUS)
        assertThat(state.setupData).isNull()
        assertThat(state.codeInput).isEmpty()
    }

    @Test
    fun cancel_fromDisable_returnsToStatusAndClearsFields() = runTest(dispatcher) {
        val sut = vm()
        advanceUntilIdle()
        sut.beginDisable()
        sut.onDisablePasswordChange("hunter2pass")

        sut.cancel()

        val state = sut.state.value
        assertThat(state.stage).isEqualTo(TwoFactorStage.STATUS)
        assertThat(state.disablePassword).isEmpty()
    }
}
