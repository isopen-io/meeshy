package me.meeshy.app.auth

import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
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
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.LanguageSelectionState
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.auth.RegistrationLeadingAction
import me.meeshy.sdk.model.auth.RegistrationPrimaryAction
import me.meeshy.sdk.model.auth.RegistrationPrimaryLabel
import me.meeshy.sdk.model.auth.RegistrationStep
import me.meeshy.sdk.model.auth.SummaryField
import me.meeshy.sdk.model.auth.StepFill
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.sync.SyncSeqTracker
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RegistrationViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeAuthApi(
        var registerResponse: ApiResponse<AuthSession>,
        var availabilityResponse: ApiResponse<AvailabilityResult> = ApiResponse(
            success = true,
            data = AvailabilityResult(
                usernameAvailable = true,
                emailAvailable = true,
                phoneNumberAvailable = true,
            ),
        ),
        val captured: MutableList<RegisterRequest> = mutableListOf(),
        val availabilityCalls: MutableList<Triple<String?, String?, String?>> = mutableListOf(),
    ) : AuthApi {
        override suspend fun login(body: LoginRequest) = ApiResponse<AuthSession>(success = false)
        override suspend fun register(body: RegisterRequest): ApiResponse<AuthSession> {
            captured += body
            return registerResponse
        }
        override suspend fun refresh(body: RefreshTokenRequest) = ApiResponse<AuthSession>(success = false)
        override suspend fun me() = ApiResponse<MeEnvelope>(success = false)
        override suspend fun forgotPassword(body: me.meeshy.sdk.net.api.ForgotPasswordRequest) =
            me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
        override suspend fun requestMagicLink(body: me.meeshy.sdk.net.api.MagicLinkRequestBody) =
            me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.MagicLinkRequestData>(success = false)
        override suspend fun listSessions() =
            me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.SessionsListData>(success = false)
        override suspend fun revokeSession(sessionId: String) =
            me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
        override suspend fun revokeOtherSessions() =
            me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
        override suspend fun validateMagicLink(body: me.meeshy.sdk.net.api.MagicLinkValidateRequest) =
            me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.model.AuthSession>(success = false)
        override suspend fun checkAvailability(username: String?, email: String?, phoneNumber: String?): ApiResponse<AvailabilityResult> {
            availabilityCalls += Triple(username, email, phoneNumber)
            return availabilityResponse
        }
        override suspend fun getTwoFactorStatus() =
            me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorStatusInfo>(success = false)
        override suspend fun beginTwoFactorSetup() =
            me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorSetupInfo>(success = false)
        override suspend fun enableTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
            me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo>(success = false)
        override suspend fun disableTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorDisableRequest) =
            me.meeshy.sdk.model.ApiResponse<Unit>(success = true)
        override suspend fun regenerateTwoFactorBackupCodes(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
            me.meeshy.sdk.model.ApiResponse<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo>(success = false)
    }

    /**
     * Fake [DeviceLocaleProvider] for deterministic tests — defaults to an unresolvable locale
     * (both `null`), which drives `SignupRegionInference`'s own fallback branch (system `"fr"`,
     * regional `"en"`, country left at [RegistrationFields]'s static default). Every scenario
     * that doesn't care about locale inference stays deterministic without passing this at all.
     */
    private class FakeDeviceLocaleProvider(
        private val language: String? = null,
        private val region: String? = null,
    ) : DeviceLocaleProvider {
        override fun languageTag(): String? = language
        override fun regionTag(): String? = region
    }

    private fun scenario(
        registerResponse: ApiResponse<AuthSession> = ApiResponse(success = false),
        availabilityResponse: ApiResponse<AvailabilityResult> = ApiResponse(
            success = true,
            data = AvailabilityResult(usernameAvailable = true, emailAvailable = true, phoneNumberAvailable = true),
        ),
        coordinator: RealtimeSessionCoordinator = mockk(relaxed = true),
        mediaRepository: MediaRepository = mockk(relaxed = true),
        userRepository: UserRepository = mockk(relaxed = true),
        workManager: WorkManager = mockk(relaxed = true),
        deviceLocaleProvider: DeviceLocaleProvider = FakeDeviceLocaleProvider(),
    ): Triple<RegistrationViewModel, FakeAuthApi, RealtimeSessionCoordinator> {
        val api = FakeAuthApi(registerResponse, availabilityResponse)
        val store = InMemoryTokenStore()
        val teardown = mockk<SessionTeardown>(relaxed = true)
        val vm = RegistrationViewModel(
            AuthRepository(api, store, SessionRepository(api, store), teardown, SyncSeqTracker()),
            coordinator,
            mediaRepository,
            userRepository,
            workManager,
            deviceLocaleProvider,
        )
        return Triple(vm, api, coordinator)
    }

    private fun uploadedMedia(url: String) = UploadedMedia(
        id = "m1",
        url = url,
        mimeType = "image/jpeg",
        fileSize = 10,
        width = null,
        height = null,
        durationMs = null,
        thumbnailUrl = null,
    )

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

    @Test
    fun initialState_defaultsToThePriorityCountry() {
        val (vm, _, _) = scenario()
        assertThat(vm.state.value.fields.countryIso).isEqualTo(CountryCatalog.priority.first())
    }

    // ---- device-locale inference (SignupRegionInference wiring) --------------

    @Test
    fun initialState_unresolvableDeviceLocale_fallsBackToFrenchAndKeepsPriorityCountry() {
        val (vm, _, _) = scenario(deviceLocaleProvider = FakeDeviceLocaleProvider(language = null, region = null))
        val fields = vm.state.value.fields
        assertThat(fields.systemLanguage).isEqualTo("fr")
        assertThat(fields.regionalLanguage).isEqualTo("en")
        assertThat(fields.countryIso).isEqualTo(CountryCatalog.priority.first())
    }

    @Test
    fun initialState_supportedDeviceLanguage_becomesSystemLanguage() {
        val (vm, _, _) = scenario(deviceLocaleProvider = FakeDeviceLocaleProvider(language = "es", region = null))
        assertThat(vm.state.value.fields.systemLanguage).isEqualTo("es")
    }

    @Test
    fun initialState_deviceLanguageIsUppercase_stillMatchesCaseInsensitively() {
        val (vm, _, _) = scenario(deviceLocaleProvider = FakeDeviceLocaleProvider(language = "ES", region = null))
        assertThat(vm.state.value.fields.systemLanguage).isEqualTo("es")
    }

    @Test
    fun initialState_knownDeviceRegion_becomesCountryIso() {
        val (vm, _, _) = scenario(deviceLocaleProvider = FakeDeviceLocaleProvider(language = null, region = "MX"))
        assertThat(vm.state.value.fields.countryIso).isEqualTo("MX")
    }

    @Test
    fun initialState_unknownDeviceRegion_keepsThePriorityCountryDefault() {
        val (vm, _, _) = scenario(deviceLocaleProvider = FakeDeviceLocaleProvider(language = null, region = "ZZ"))
        assertThat(vm.state.value.fields.countryIso).isEqualTo(CountryCatalog.priority.first())
    }

    @Test
    fun initialState_deviceRegionMapsToARegionalLanguageDistinctFromSystem_setsBoth() {
        // "CM" -> "fr" in SignupRegionInference.regionLanguageMap; system stays "en" (supported,
        // distinct from the region's mapped "fr") so the regional slot adopts the map's language
        // instead of falling back to the generic secondary.
        val (vm, _, _) = scenario(deviceLocaleProvider = FakeDeviceLocaleProvider(language = "en", region = "CM"))
        val fields = vm.state.value.fields
        assertThat(fields.systemLanguage).isEqualTo("en")
        assertThat(fields.regionalLanguage).isEqualTo("fr")
        assertThat(fields.countryIso).isEqualTo("CM")
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

    @Test
    fun onCountryChange_updatesCountryIso() {
        val (vm, _, _) = scenario()
        vm.onCountryChange("US")
        assertThat(vm.state.value.fields.countryIso).isEqualTo("US")
    }

    @Test
    fun onCountryChange_afterPhoneProbed_invalidatesStaleAvailability() {
        val (vm, _, _) = scenario()
        vm.onPhoneChange("0123456789")
        vm.onPhoneAvailability(true)

        vm.onCountryChange("US")

        assertThat(vm.state.value.fields.phoneAvailable).isNull()
    }

    // ---- username suggestion strip --------------------------------------------

    @Test
    fun onUsernameSuggestions_setsFieldSuggestions() {
        val (vm, _, _) = scenario()
        vm.onUsernameSuggestions(listOf("ada1", "ada_lovelace"))
        assertThat(vm.state.value.fields.usernameSuggestions).containsExactly("ada1", "ada_lovelace").inOrder()
    }

    @Test
    fun editingUsername_invalidatesStaleSuggestions() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        vm.onUsernameSuggestions(listOf("atabeth1", "atabeth_"))
        assertThat(vm.state.value.fields.usernameSuggestions).isNotEmpty()

        vm.onUsernameChange("atabeth2")

        assertThat(vm.state.value.fields.usernameSuggestions).isEmpty()
    }

    @Test
    fun selectUsernameSuggestion_setsUsernameAndMarksAvailable() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("taken")
        vm.onUsernameSuggestions(listOf("takenlover", "takenfan"))

        vm.selectUsernameSuggestion("takenlover")

        assertThat(vm.state.value.fields.username).isEqualTo("takenlover")
        assertThat(vm.state.value.fields.usernameAvailable).isTrue()
        assertThat(vm.state.value.fields.usernameSuggestions).isEmpty()
        assertThat(vm.state.value.canProceed).isTrue()
    }

    @Test
    fun selectUsernameSuggestion_thenEditingAgain_invalidatesTheOptimisticAvailability() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("taken")
        vm.onUsernameSuggestions(listOf("takenlover"))
        vm.selectUsernameSuggestion("takenlover")

        vm.onUsernameChange("takenlover2")

        assertThat(vm.state.value.fields.usernameAvailable).isNull()
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
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()), coordinator = coordinator)
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
        val (vm, _, _) = scenario(ApiResponse(success = false, error = "Username taken"), coordinator = coordinator)
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

    @Test
    fun register_sendsDialCodePrefixedPhoneAndCountry() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid() // phoneNumber = "0123456789", default country "FR"
        // Advance via next() (gate-respecting), not skip() — skip() force-clears the PHONE step.
        repeat(RegistrationStep.total) { vm.next() }
        vm.register()
        advanceUntilIdle()

        val sent = api.captured.single()
        assertThat(sent.phoneNumber).isEqualTo("+330123456789") // "+33" dial code + fillAllValid's digits verbatim
        assertThat(sent.phoneCountryCode).isEqualTo("FR")
    }

    @Test
    fun register_whenPhoneStepWasSkipped_sendsNullPhoneFields() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        repeat(RegistrationStep.total) { vm.skip() } // force-advance clears the phone at the PHONE step
        vm.register()
        advanceUntilIdle()

        val sent = api.captured.single()
        assertThat(sent.phoneNumber).isNull()
        assertThat(sent.phoneCountryCode).isNull()
    }

    // ---- debounced availability probe ---------------------------------------

    @Test
    fun validUsername_afterDebounce_probesAndAppliesVerdict() = runTest(dispatcher) {
        val (vm, api, _) = scenario()
        vm.onUsernameChange("atabeth")
        advanceUntilIdle()

        assertThat(api.availabilityCalls).containsExactly(Triple("atabeth", null, null))
        assertThat(vm.state.value.fields.usernameAvailable).isTrue()
    }

    @Test
    fun availableUsername_afterDebounce_leavesSuggestionsEmpty() = runTest(dispatcher) {
        val (vm, _, _) = scenario() // default verdict: available, no suggestions echoed
        vm.onUsernameChange("atabeth")
        advanceUntilIdle()

        assertThat(vm.state.value.fields.usernameSuggestions).isEmpty()
    }

    @Test
    fun takenUsername_afterDebounce_appliesSuggestions() = runTest(dispatcher) {
        val (vm, _, _) = scenario(
            availabilityResponse = ApiResponse(
                success = true,
                data = AvailabilityResult(usernameAvailable = false, suggestions = listOf("atabeth1", "atabeth_")),
            ),
        )
        vm.onUsernameChange("atabeth")
        advanceUntilIdle()

        assertThat(vm.state.value.fields.usernameAvailable).isFalse()
        assertThat(vm.state.value.fields.usernameSuggestions).containsExactly("atabeth1", "atabeth_").inOrder()
    }

    @Test
    fun invalidUsername_afterDebounce_neverProbesAndStaysUnknown() = runTest(dispatcher) {
        val (vm, api, _) = scenario()
        vm.onUsernameChange("a") // below the 2-char local minimum
        advanceUntilIdle()

        assertThat(api.availabilityCalls).isEmpty()
        assertThat(vm.state.value.fields.usernameAvailable).isNull()
    }

    @Test
    fun rapidUsernameEdits_debounceToASingleProbeOnTheLastValue() = runTest(dispatcher) {
        val (vm, api, _) = scenario()
        vm.onUsernameChange("atab")
        vm.onUsernameChange("atabet")
        vm.onUsernameChange("atabeth")
        advanceUntilIdle()

        assertThat(api.availabilityCalls).containsExactly(Triple("atabeth", null, null))
    }

    @Test
    fun eachDistinctValidValue_probesAgainAcrossDebounceWindows() = runTest(dispatcher) {
        val (vm, api, _) = scenario()
        vm.onUsernameChange("atabeth")
        advanceUntilIdle() // window #1
        vm.onUsernameChange("adalove")
        advanceUntilIdle() // window #2

        assertThat(api.availabilityCalls).containsExactly(
            Triple("atabeth", null, null),
            Triple("adalove", null, null),
        ).inOrder()
    }

    @Test
    fun probeFailure_leavesAvailabilityUnknown() = runTest(dispatcher) {
        val (vm, api, _) = scenario(availabilityResponse = ApiResponse(success = false, error = "network"))
        vm.onUsernameChange("atabeth")
        advanceUntilIdle()

        assertThat(api.availabilityCalls).hasSize(1)
        assertThat(vm.state.value.fields.usernameAvailable).isNull()
    }

    @Test
    fun probeFailure_leavesSuggestionsEmpty() = runTest(dispatcher) {
        val (vm, _, _) = scenario(availabilityResponse = ApiResponse(success = false, error = "network"))
        vm.onUsernameChange("atabeth")
        advanceUntilIdle()

        assertThat(vm.state.value.fields.usernameSuggestions).isEmpty()
    }

    @Test
    fun validEmail_afterDebounce_probesAndAppliesVerdict() = runTest(dispatcher) {
        val (vm, api, _) = scenario()
        vm.onEmailChange("a@b.co")
        advanceUntilIdle()

        assertThat(api.availabilityCalls).containsExactly(Triple(null, "a@b.co", null))
        assertThat(vm.state.value.fields.emailAvailable).isTrue()
    }

    @Test
    fun validPhone_afterDebounce_probesWithDefaultCountryDialCodePrefixed() = runTest(dispatcher) {
        val (vm, api, _) = scenario()
        vm.onPhoneChange("6 12 34 56 78") // national digits only — the picker supplies the dial code
        advanceUntilIdle()

        assertThat(api.availabilityCalls).containsExactly(Triple(null, null, "+33612345678"))
        assertThat(vm.state.value.fields.phoneAvailable).isTrue()
    }

    @Test
    fun validPhone_afterDebounce_probesWithTheSelectedCountryDialCode() = runTest(dispatcher) {
        val (vm, api, _) = scenario()
        vm.onCountryChange("US")
        vm.onPhoneChange("650 555 1234")
        advanceUntilIdle()

        assertThat(api.availabilityCalls).containsExactly(Triple(null, null, "+16505551234"))
    }

    // ---- recap summary wiring ------------------------------------------------

    @Test
    fun summary_reflectsCollectedFields_inRecapOrder() {
        val (vm, _, _) = scenario()
        vm.fillAllValid()

        val fields = vm.state.value.summary
        assertThat(fields.map { it.field }).containsExactly(
            SummaryField.USERNAME,
            SummaryField.EMAIL,
            SummaryField.NAME,
            SummaryField.PHONE,
            SummaryField.LANGUAGES,
        ).inOrder()
        assertThat(fields.first { it.field == SummaryField.NAME }.value).isEqualTo("Ada Lovelace")
        assertThat(fields.first { it.field == SummaryField.EMAIL }.value).isEqualTo("a@b.co")
    }

    @Test
    fun summary_omitsPhone_whenPhoneStepSkipped() {
        val (vm, _, _) = scenario()
        vm.fillAllValid()
        // Land on the phone step and skip it — the number must not resurface in the recap.
        vm.next() // PSEUDO -> PHONE
        vm.skip() // PHONE -> EMAIL, clears the number + marks skipped

        assertThat(vm.state.value.summary.map { it.field }).doesNotContain(SummaryField.PHONE)
    }

    @Test
    fun summary_phoneValue_isPrefixedWithTheSelectedCountryDialCode() {
        val (vm, _, _) = scenario()
        vm.fillAllValid() // default country "FR", phoneNumber = "0123456789"

        assertThat(vm.state.value.summary.first { it.field == SummaryField.PHONE }.value)
            .isEqualTo("+33 0123456789")
    }

    // ---- regional (secondary) language wiring --------------------------------

    @Test
    fun onRegionalLanguageChange_updatesRegionalLanguageField() {
        val (vm, _, _) = scenario()
        vm.onRegionalLanguageChange("es")
        assertThat(vm.state.value.fields.regionalLanguage).isEqualTo("es")
    }

    @Test
    fun languageSelection_mirrorsSystemAndRegionalFields() {
        val (vm, _, _) = scenario()
        vm.onSystemLanguageChange("fr")
        vm.onRegionalLanguageChange("es")
        assertThat(vm.state.value.languageSelection)
            .isEqualTo(LanguageSelectionState(systemLanguage = "fr", regionalLanguage = "es"))
    }

    @Test
    fun register_sendsChosenRegionalLanguage() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        vm.onRegionalLanguageChange("es")
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        assertThat(api.captured.single().regionalLanguage).isEqualTo("es")
    }

    @Test
    fun register_blankRegionalLanguage_sendsNullNotBlank() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        // Since applyDeviceLocaleDefaults() now pre-fills regionalLanguage at init (like every
        // other device-inferred default), an explicit clear is the only way to reach the blank
        // case this test exercises — the field is no longer blank on fresh state.
        vm.onRegionalLanguageChange("")
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        assertThat(api.captured.single().regionalLanguage).isNull()
    }

    @Test
    fun register_whitespaceRegionalLanguage_isTrimmedToNull() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        vm.onRegionalLanguageChange("   ")
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        assertThat(api.captured.single().regionalLanguage).isNull()
    }

    @Test
    fun register_trimsRegionalLanguageValue() = runTest(dispatcher) {
        val (vm, api, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        vm.onRegionalLanguageChange("  es  ")
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        assertThat(api.captured.single().regionalLanguage).isEqualTo("es")
    }

    @Test
    fun summary_includesDistinctRegionalLanguage() {
        val (vm, _, _) = scenario()
        vm.fillAllValid() // systemLanguage = "fr"
        vm.onRegionalLanguageChange("es")

        val languages = vm.state.value.summary.first { it.field == SummaryField.LANGUAGES }.value
        val expected =
            "${LanguageStepSelection.summaryLabel("fr")} / ${LanguageStepSelection.summaryLabel("es")}"
        assertThat(languages).isEqualTo(expected)
    }

    // ---- PROFILE step wiring (bio + picked assets) ---------------------------

    @Test
    fun onBioChange_updatesFieldsBio() {
        val (vm, _, _) = scenario()
        vm.onBioChange("Building bridges across languages")
        assertThat(vm.state.value.fields.bio).isEqualTo("Building bridges across languages")
    }

    @Test
    fun onProfileImagePicked_updatesState() {
        val (vm, _, _) = scenario()
        val item = MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = "avatar.jpg", mimeType = "image/jpeg")
        vm.onProfileImagePicked(item)
        assertThat(vm.state.value.profileImage).isSameInstanceAs(item)
    }

    @Test
    fun onBannerImagePicked_updatesState() {
        val (vm, _, _) = scenario()
        val item = MediaUploadItem(bytes = byteArrayOf(4, 5, 6), fileName = "banner.jpg", mimeType = "image/jpeg")
        vm.onBannerImagePicked(item)
        assertThat(vm.state.value.bannerImage).isSameInstanceAs(item)
    }

    @Test
    fun summary_includesBio_whenNonBlank() {
        val (vm, _, _) = scenario()
        vm.fillAllValid()
        vm.onBioChange("Building bridges")
        assertThat(vm.state.value.summary.map { it.field }).contains(SummaryField.BIO)
        assertThat(vm.state.value.summary.first { it.field == SummaryField.BIO }.value)
            .isEqualTo("Building bridges")
    }

    @Test
    fun summary_omitsBio_whenBlank() {
        val (vm, _, _) = scenario()
        vm.fillAllValid() // never calls onBioChange
        assertThat(vm.state.value.summary.map { it.field }).doesNotContain(SummaryField.BIO)
    }

    // ---- register() post-registration profile-completion upload -------------
    // Mirrors iOS `ProfileCompletionUploader`: `POST /auth/register` carries none
    // of these (avatar/banner/bio aren't RegisterRequest fields), so they upload
    // only once authenticated — right after this success branch — reusing the
    // same validate -> upload -> confirm primitives `AvatarBannerUploadViewModel`
    // already ships for the post-registration profile-edit screen, plus the
    // established `enqueueProfileEdit` + wake-the-worker path for the bio.

    @Test
    fun register_onRecapValid_withProfileImage_uploadsAndAppliesAvatar() = runTest(dispatcher) {
        val mediaRepository = mockk<MediaRepository>()
        val userRepository = mockk<UserRepository>(relaxed = true)
        val item = MediaUploadItem(bytes = ByteArray(10), fileName = "avatar.jpg", mimeType = "image/jpeg")
        coEvery { mediaRepository.upload(listOf(item)) } returns
            NetworkResult.Success(listOf(uploadedMedia("https://cdn.meeshy.me/avatar.jpg")))

        val (vm, _, _) = scenario(
            ApiResponse(success = true, data = session()),
            mediaRepository = mediaRepository,
            userRepository = userRepository,
        )
        vm.fillAllValid()
        vm.onProfileImagePicked(item)
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        coVerify { mediaRepository.upload(listOf(item)) }
        coVerify { userRepository.updateAvatar("https://cdn.meeshy.me/avatar.jpg") }
        assertThat(vm.state.value.isRegistered).isTrue()
    }

    @Test
    fun register_onRecapValid_withBannerImage_uploadsAndAppliesBanner() = runTest(dispatcher) {
        val mediaRepository = mockk<MediaRepository>()
        val userRepository = mockk<UserRepository>(relaxed = true)
        val item = MediaUploadItem(bytes = ByteArray(10), fileName = "banner.jpg", mimeType = "image/jpeg")
        coEvery { mediaRepository.upload(listOf(item)) } returns
            NetworkResult.Success(listOf(uploadedMedia("https://cdn.meeshy.me/banner.jpg")))

        val (vm, _, _) = scenario(
            ApiResponse(success = true, data = session()),
            mediaRepository = mediaRepository,
            userRepository = userRepository,
        )
        vm.fillAllValid()
        vm.onBannerImagePicked(item)
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        coVerify { userRepository.updateBanner("https://cdn.meeshy.me/banner.jpg") }
    }

    @Test
    fun register_onRecapValid_withBio_enqueuesProfileEditAndWakesWorker() = runTest(dispatcher) {
        val userRepository = mockk<UserRepository>(relaxed = true)
        coEvery { userRepository.enqueueProfileEdit(UpdateProfileRequest(bio = "Building bridges")) } returns "cmid_1"
        val workManager = mockk<WorkManager>(relaxed = true)

        val (vm, _, _) = scenario(
            ApiResponse(success = true, data = session()),
            userRepository = userRepository,
            workManager = workManager,
        )
        vm.fillAllValid()
        vm.onBioChange("Building bridges")
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        coVerify { userRepository.enqueueProfileEdit(UpdateProfileRequest(bio = "Building bridges")) }
        verify { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun register_onRecapValid_withNoProfileAssets_skipsUploadCalls() = runTest(dispatcher) {
        val mediaRepository = mockk<MediaRepository>(relaxed = true)
        val userRepository = mockk<UserRepository>(relaxed = true)
        val (vm, _, _) = scenario(
            ApiResponse(success = true, data = session()),
            mediaRepository = mediaRepository,
            userRepository = userRepository,
        )
        vm.fillAllValid() // bio left blank, no images picked
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        coVerify(exactly = 0) { mediaRepository.upload(any()) }
        coVerify(exactly = 0) { userRepository.updateAvatar(any()) }
        coVerify(exactly = 0) { userRepository.updateBanner(any()) }
        coVerify(exactly = 0) { userRepository.enqueueProfileEdit(any()) }
    }

    @Test
    fun register_onRecapValid_withInvalidProfileImage_skipsUpload() = runTest(dispatcher) {
        val mediaRepository = mockk<MediaRepository>(relaxed = true)
        val empty = MediaUploadItem(bytes = ByteArray(0), fileName = "empty.jpg", mimeType = "image/jpeg")
        val (vm, _, _) = scenario(
            ApiResponse(success = true, data = session()),
            mediaRepository = mediaRepository,
        )
        vm.fillAllValid()
        vm.onProfileImagePicked(empty)
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        coVerify(exactly = 0) { mediaRepository.upload(any()) }
    }

    @Test
    fun register_onRecapValid_uploadReturnsFailure_skipsConfirmAndStillMarksRegistered() = runTest(dispatcher) {
        val mediaRepository = mockk<MediaRepository>()
        val userRepository = mockk<UserRepository>(relaxed = true)
        val item = MediaUploadItem(bytes = ByteArray(4), fileName = "avatar.jpg", mimeType = "image/jpeg")
        coEvery { mediaRepository.upload(listOf(item)) } returns
            NetworkResult.Failure(ApiError(message = "server down"))

        val (vm, _, _) = scenario(
            ApiResponse(success = true, data = session()),
            mediaRepository = mediaRepository,
            userRepository = userRepository,
        )
        vm.fillAllValid()
        vm.onProfileImagePicked(item)
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepository.updateAvatar(any()) }
        assertThat(vm.state.value.isRegistered).isTrue()
    }

    @Test
    fun register_onRecapValid_uploadFailure_stillMarksRegistered() = runTest(dispatcher) {
        val mediaRepository = mockk<MediaRepository>()
        val item = MediaUploadItem(bytes = ByteArray(4), fileName = "avatar.jpg", mimeType = "image/jpeg")
        coEvery { mediaRepository.upload(any()) } throws RuntimeException("network down")

        val (vm, _, _) = scenario(
            ApiResponse(success = true, data = session()),
            mediaRepository = mediaRepository,
        )
        vm.fillAllValid()
        vm.onProfileImagePicked(item)
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        advanceUntilIdle()

        assertThat(vm.state.value.isRegistered).isTrue()
        assertThat(vm.state.value.isSubmitting).isFalse()
    }

    // ---- nav chrome derivation (RegistrationNav wiring) ---------------------

    @Test
    fun nav_onFirstStepBlocked_isCloseLeadingNextLabelDisabledAtPositionOne() {
        val (vm, _, _) = scenario()
        val nav = vm.state.value.nav
        assertThat(nav.leading).isEqualTo(RegistrationLeadingAction.CLOSE)
        assertThat(nav.primaryLabel).isEqualTo(RegistrationPrimaryLabel.NEXT)
        assertThat(nav.primaryAction).isEqualTo(RegistrationPrimaryAction.ADVANCE)
        assertThat(nav.primaryEnabled).isFalse()
        assertThat(nav.showSkip).isFalse()
        assertThat(nav.positionLabel).isEqualTo("1/8")
    }

    @Test
    fun nav_primaryEnabled_tracksTheProceedGate() {
        val (vm, _, _) = scenario()
        assertThat(vm.state.value.nav.primaryEnabled).isFalse()
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        assertThat(vm.state.value.nav.primaryEnabled).isTrue()
    }

    @Test
    fun nav_afterAdvancing_leadingBecomesBack() {
        val (vm, _, _) = scenario()
        vm.onUsernameChange("atabeth")
        vm.onUsernameAvailability(true)
        vm.next()
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PHONE)
        assertThat(vm.state.value.nav.leading).isEqualTo(RegistrationLeadingAction.BACK)
        assertThat(vm.state.value.nav.positionLabel).isEqualTo("2/8")
    }

    @Test
    fun nav_onProfileStep_showsSkipAndContinueLabel() {
        val (vm, _, _) = scenario()
        vm.fillAllValid()
        repeat(RegistrationStep.PROFILE.index) { vm.skip() }
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.PROFILE)
        val nav = vm.state.value.nav
        assertThat(nav.showSkip).isTrue()
        assertThat(nav.primaryLabel).isEqualTo(RegistrationPrimaryLabel.CONTINUE)
        assertThat(nav.primaryAction).isEqualTo(RegistrationPrimaryAction.ADVANCE)
    }

    @Test
    fun nav_onRecapStep_primaryActionBecomesRegister() {
        val (vm, _, _) = scenario()
        vm.fillAllValid()
        repeat(RegistrationStep.total) { vm.skip() }
        assertThat(vm.state.value.currentStep).isEqualTo(RegistrationStep.RECAP)
        val nav = vm.state.value.nav
        assertThat(nav.primaryAction).isEqualTo(RegistrationPrimaryAction.REGISTER)
        assertThat(nav.primaryLabel).isEqualTo(RegistrationPrimaryLabel.CREATE_ACCOUNT)
        assertThat(nav.primaryEnabled).isTrue()
        assertThat(nav.positionLabel).isEqualTo("8/8")
    }

    @Test
    fun nav_whileSubmitting_disablesThePrimaryButton() = runTest(dispatcher) {
        val (vm, _, _) = scenario(ApiResponse(success = true, data = session()))
        vm.fillAllValid()
        repeat(RegistrationStep.total) { vm.skip() }
        vm.register()
        // register() flips isSubmitting synchronously; the launched flight is still pending.
        assertThat(vm.state.value.isSubmitting).isTrue()
        assertThat(vm.state.value.nav.primaryEnabled).isFalse()
        advanceUntilIdle()
    }

    private fun session() = AuthSession(MeeshyUser(id = "u1", username = "atabeth"), token = "jwt")
}
