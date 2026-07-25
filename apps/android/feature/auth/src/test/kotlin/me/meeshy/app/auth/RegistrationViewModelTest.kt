package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.auth.RegistrationStep
import me.meeshy.sdk.model.auth.StepFill
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RegistrationViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeAuthApi(
        var registerResponse: ApiResponse<AuthSession>,
        val captured: MutableList<RegisterRequest> = mutableListOf(),
    ) : AuthApi {
        override suspend fun login(body: LoginRequest) = ApiResponse<AuthSession>(success = false)
        override suspend fun register(body: RegisterRequest): ApiResponse<AuthSession> {
            captured += body
            return registerResponse
        }
        override suspend fun refresh(body: RefreshTokenRequest) = ApiResponse<AuthSession>(success = false)
        override suspend fun me() = ApiResponse<MeEnvelope>(success = false)
    }

    private fun scenario(
        registerResponse: ApiResponse<AuthSession> = ApiResponse(success = false),
        coordinator: RealtimeSessionCoordinator = mockk(relaxed = true),
    ): Triple<RegistrationViewModel, FakeAuthApi, RealtimeSessionCoordinator> {
        val api = FakeAuthApi(registerResponse)
        val store = InMemoryTokenStore()
        val vm = RegistrationViewModel(
            AuthRepository(api, store, SessionRepository(api, store)),
            coordinator,
        )
        return Triple(vm, api, coordinator)
    }

    /** Drives the wizard to a state where RECAP's gate passes, without navigating. */
    private fun RegistrationViewModel.fillAllValid() {
        onUsernameChange("atabeth")
        onUsernameAvailability(true)
        onEmailChange("a@b.co")
        onEmailAvailability(true)
        onPhoneChange("0123456789")
        onPhoneAvailability(true)
        onFirstNameChange("Ada")
        onLastNameChange("Lovelace")
        onPasswordChange("supersecret")
        onConfirmPasswordChange("supersecret")
        onSystemLanguageChange("fr")
        onAcceptTermsChange(true)
    }

    @Before
    fun setUp() { Dispatchers.setMain(dispatcher) }

    @After
    fun tearDown() { Dispatchers.resetMain() }

    // ---- initial state -------------------------------------------------------

    @Test
    fun initialState_startsOnFirstStepBlocked() {
        val (vm, _, _) = scenario()
        val s = vm.state.value
        assertThat(s.currentStep).isEqualTo(RegistrationStep.PSEUDO)
        assertThat(s.isFirstStep).isTrue()
        assertThat(s.isLastStep).isFalse()
        assertThat(s.canProceed).isFalse()
        assertThat(s.isRegistered).isFalse()
        assertThat(s.isSubmitting).isFalse()
    }

    // ---- field edits + availability -----------------------------------------

    @Test
    fun onUsernameChange_locallyValidButUnprobed_doesNotYetProceed() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        assertThat(vm.state.value.fields.username).isEqualTo("atabeth")
        assertThat(vm.state.value.canProceed).isFalse()
    }

    @Test
    fun onUsernameAvailability_true_withValidHandle_unlocksProceed() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        assertThat(vm.state.value.canProceed).isTrue()
    }

    @Test
    fun editingUsername_invalidatesStaleAvailability() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        assertThat(vm.state.value.canProceed).isTrue()

        vm.onUsernameChange("atabeth2")

        assertThat(vm.state.value.fields.usernameAvailable).isNull()
        assertThat(vm.state.value.canProceed).isFalse()
    }

    @Test
    fun editingEmail_invalidatesStaleAvailability() {
        val (vm, _, _) = scenario()
        vm.onEmailChange("a@b.co")
        vm.onEmailAvailability(true)
        vm.onEmailChange("a@c.co")
        assertThat(vm.state.value.fields.emailAvailable).isNull()
    }

    @Test
    fun editingPhone_invalidatesStaleAvailability() {
        val (vm, _, _) = scenario()
        vm.onPhoneChange("0123456789")
        vm.onPhoneAvailability(true)
        vm.onPhoneChange("0123456780")
        assertThat(vm.state.value.fields.phoneAvailable).isNull()
    }

    // ---- next() --------------------------------------------------------------

    @Test
    fun next_whenGateBlocks_staysOnStep() {
        val (vm, _, _) = scenario()
        vm.next()
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PSEUDO)
    }

    @Test
    fun next_whenGatePasses_advancesOneStep() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        vm.next()
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PHONE)
    }

    // ---- previous() ----------------------------------------------------------

    @Test
    fun previous_onFirstStep_isNoOp() {
        val (vm, _, _) = scenario()
        vm.previous()
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PSEUDO)
    }

    @Test
    fun previous_afterAdvancing_goesBack() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        vm.next()
        vm.previous()
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PSEUDO)
    }

    // ---- skip() --------------------------------------------------------------

    @Test
    fun skip_onPhoneStep_forcesAdvanceAndClearsPhone() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        vm.next() // -> PHONE
        vm.onPhoneChange("0123456789")

        vm.skip()

        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.EMAIL)
        assertThat(vm.state.value.fields.phoneNumber).isEmpty()
        assertThat(vm.state.value.fields.skipPhone).isTrue()
        assertThat(vm.state.value.fields.phoneAvailable).isNull()
    }

    @Test
    fun skip_onNonPhoneStep_forcesAdvanceWithoutClearingPhone() {
        val (vm, _, _) = scenario()
        // On PSEUDO (gate blocks a normal next), skip still forces advance.
        vm.skip()
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PHONE)
        assertThat(vm.state.value.fields.skipPhone).isFalse()
    }

    @Test
    fun skip_onLastStep_isNoOp() {
        val (vm, _, _) = scenario()
        vm.fillAllValid()
        vm.jumpTo(RegistrationStep.PSEUDO) // no-op, still PSEUDO; use forced skips to reach RECAP
        repeat(RegistrationStep.total) { vm.skip() }
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.RECAP)
        vm.skip()
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.RECAP)
    }

    // ---- jumpTo() ------------------------------------------------------------

    @Test
    fun jumpTo_completedStep_navigatesBack() {
        val (vm, _, _) = scenario()
        repeat(3) { vm.skip() } // PSEUDO -> IDENTITY
        vm.jumpTo(RegistrationStep.PHONE)
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PHONE)
    }

    @Test
    fun jumpTo_currentStep_reSelectsItself() {
        val (vm, _, _) = scenario()
        vm.skip() // -> PHONE
        vm.jumpTo(RegistrationStep.PHONE)
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PHONE)
    }

    @Test
    fun jumpTo_upcomingStep_isIgnored() {
        val (vm, _, _) = scenario()
        vm.jumpTo(RegistrationStep.RECAP)
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PSEUDO)
    }

    // ---- fill() progress-bar derivation -------------------------------------

    @Test
    fun fill_partitionsStepsAroundCurrent() {
        val (vm, _, _) = scenario()
        vm.skip() // current = PHONE
        val s = vm.state.value
        assertThat(s.fill(RegistrationStep.PSEUDO)).isEqualTo(StepFill.COMPLETED)
        assertThat(s.fill(RegistrationStep.PHONE)).isEqualTo(StepFill.CURRENT)
        assertThat(s.fill(RegistrationStep.EMAIL)).isEqualTo(StepFill.UPCOMING)
    }

    // ---- register() ----------------------------------------------------------

    @Test
    fun register_beforeRecap_isNoOp() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        vm.register()
        advanceUntilIdle()
        assertThat(api.captured).isEmpty()
        assertThat(vm.state.value.isRegistered).isFalse()
    }

    @Test
    fun register_onRecapWithBlockedGate_isNoOp() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        repeat(RegistrationStep.total) { vm.skip() } // reach RECAP with empty fields (terms unticked)
        vm.register()
        advanceUntilIdle()
        assertThat(api.captured).isEmpty()
    }

    @Test
    fun register_onRecapValid_succeeds_marksRegisteredAndBindsRealtime() = runTest(dispatcher) {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()), coordinator)
        vm.fillAllValid()
        repeat(RegistrationStep.total) { vm.skip() } // to RECAP
        vm.register()
        advanceUntilIdle()

        assertThat(vm.state.value.isRegistered).isTrue()
        assertThat(vm.state.value.isSubmitting).isFalse()
        assertThat(api.captured).hasSize(1)
        val sent = api.captured.single()
        assertThat(sent.username).isEqualTo("atabeth")
        assertThat(sent.email).isEqualTo("a@b.co")
        assertThat(sent.systemLanguage).isEqualTo("fr")
        verify { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun register_onRecapValid_failure_surfacesErrorAndNoRealtime() = runTest(dispatcher) {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val (vm, _, _) = scenario(ApiResponse(success = false, error = "Username taken"), coordinator)
        vm.fillAllValid()
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        assertThat(vm.state.value.isRegistered).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("Username taken")
        verify(exactly = 0) { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun register_whileSubmitting_isNoOp() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register() // launches, sets isSubmitting
        vm.register() // second call must be ignored while in flight
        advanceUntilIdle()
        assertThat(api.captured).hasSize(1)
    }

    @Test
    fun register_blankOptionalNames_sendsNullNotBlank() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        vm.onEmailChange("a@b.co")
        vm.onEmailAvailability(true)
        vm.onPasswordChange("supersecret")
        vm.onConfirmPasswordChange("supersecret")
        vm.onSystemLanguageChange("fr")
        vm.onAcceptTermsChange(true)
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        val sent = api.captured.single()
        assertThat(sent.firstName).isNull()
        assertThat(sent.lastName).isNull()
    }

    private fun session() = AuthSession(MeeshyUser(id = "u1", username = "atabeth"), token = "jwt")
}
