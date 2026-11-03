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
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiViolation
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.RegisterResponse
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupFieldIssue
import me.meeshy.sdk.model.auth.SignupPhase
import me.meeshy.sdk.model.auth.SignupFieldMessage
import me.meeshy.sdk.model.auth.SignupRefusal
import me.meeshy.sdk.model.auth.SignupSubmitError
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

/**
 * L'inscription en un écran, vue de son ViewModel : ce qu'elle envoie, ce
 * qu'elle fait d'un refus, et ce qu'elle N'appelle PAS.
 *
 * Le témoin le plus important est [noNetworkCallHappensBeforeSubmission] : la
 * disparition de la sonde de disponibilité est la moitié du sujet, et une
 * régression y remettrait la seconde d'attente que cet écran existe pour
 * supprimer.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignupViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeAuthApi(
        var registerResponse: ApiResponse<RegisterResponse> = ApiResponse(success = false),
        /** Panne de TRANSPORT — la seule façon honnête de produire un `ApiError(code = "NETWORK")`. */
        var registerFailure: IOException? = null,
        val captured: MutableList<RegisterRequest> = mutableListOf(),
        val availabilityCalls: MutableList<Triple<String?, String?, String?>> = mutableListOf(),
    ) : AuthApi {
        override suspend fun login(body: LoginRequest) = ApiResponse<me.meeshy.sdk.model.auth.LoginResponse>(success = false)
        override suspend fun register(body: RegisterRequest): ApiResponse<RegisterResponse> {
            captured += body
            registerFailure?.let { throw it }
            return registerResponse
        }
        override suspend fun refresh(body: RefreshTokenRequest) = ApiResponse<AuthSession>(success = false)
        override suspend fun me() = ApiResponse<MeEnvelope>(success = false)
        override suspend fun checkAvailability(
            username: String?,
            email: String?,
            phoneNumber: String?,
        ): ApiResponse<AvailabilityResult> {
            availabilityCalls += Triple(username, email, phoneNumber)
            return ApiResponse(success = false)
        }
        override suspend fun forgotPassword(body: me.meeshy.sdk.net.api.ForgotPasswordRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun requestMagicLink(body: me.meeshy.sdk.net.api.MagicLinkRequestBody) =
            ApiResponse<me.meeshy.sdk.net.api.MagicLinkRequestData>(success = false)
        override suspend fun listSessions() =
            ApiResponse<me.meeshy.sdk.model.session.UserSessionsPayload>(success = false)
        override suspend fun revokeSession(sessionId: String) = ApiResponse<Unit>(success = true)
        override suspend fun revokeOtherSessions() = ApiResponse<Unit>(success = true)
        override suspend fun validateMagicLink(body: me.meeshy.sdk.net.api.MagicLinkValidateRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.LoginResponse>(success = false)
        override suspend fun getTwoFactorStatus() =
            ApiResponse<me.meeshy.sdk.net.api.TwoFactorStatusInfo>(success = false)
        override suspend fun beginTwoFactorSetup() =
            ApiResponse<me.meeshy.sdk.net.api.TwoFactorSetupInfo>(success = false)
        override suspend fun enableTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
            ApiResponse<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo>(success = false)
        override suspend fun disableTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorDisableRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun regenerateTwoFactorBackupCodes(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
            ApiResponse<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo>(success = false)
        override suspend fun completeLoginWith2FA(body: me.meeshy.sdk.model.auth.TwoFactorLoginRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.LoginResponse>(success = false)
        override suspend fun verifyEmail(body: me.meeshy.sdk.model.auth.EmailVerificationRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.LoginResponse>(success = false)
        override suspend fun resendVerification(body: me.meeshy.sdk.model.auth.ResendVerificationRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun verificationStatus(body: me.meeshy.sdk.model.auth.VerificationStatusRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.VerificationStatusData>(success = false)
        override suspend fun verifyResetToken(body: me.meeshy.sdk.model.auth.ResetTokenVerificationRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.ResetTokenVerification>(success = false)
        override suspend fun resetPassword(body: me.meeshy.sdk.model.auth.ResetPasswordRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun phoneRecoveryLookup(body: me.meeshy.sdk.model.auth.PhoneRecoveryLookupRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.PhoneRecoveryLookupData>(success = false)
        override suspend fun phoneRecoveryVerifyIdentity(body: me.meeshy.sdk.model.auth.PhoneRecoveryIdentityRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.PhoneRecoveryIdentityData>(success = false)
        override suspend fun phoneRecoveryVerifyCode(body: me.meeshy.sdk.model.auth.PhoneRecoveryCodeRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.PhoneRecoveryCodeData>(success = false)
        override suspend fun phoneRecoveryResend(body: me.meeshy.sdk.model.auth.PhoneRecoveryResendRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun sendPhoneCode(body: me.meeshy.sdk.model.auth.SendPhoneCodeRequest) =
            ApiResponse<Unit>(success = true)
        override suspend fun verifyPhone(body: me.meeshy.sdk.model.auth.VerifyPhoneRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.VerifyPhoneData>(success = false)
        override suspend fun logout(authorization: String?, sessionToken: String?) =
            ApiResponse<Unit>(success = true)
        override suspend fun verifyTwoFactor(body: me.meeshy.sdk.net.api.TwoFactorCodeRequest) =
            ApiResponse<me.meeshy.sdk.model.auth.TwoFactorVerifyResult>(success = false)
        override suspend fun cancelTwoFactorSetup() = ApiResponse<Unit>(success = true)
        override suspend fun meSecurity(fields: String, expand: String) =
            ApiResponse<me.meeshy.sdk.model.auth.MeSecurityEnvelope>(success = false)
    }

    /** Locale déterministe — les deux `null` conduisent au repli du cœur (fr / en / pays prioritaire). */
    private class FakeDeviceLocaleProvider(
        private val language: String? = null,
        private val region: String? = null,
    ) : DeviceLocaleProvider {
        override fun languageTag(): String? = language
        override fun regionTag(): String? = region
    }

    private class Scenario(
        val viewModel: SignupViewModel,
        val api: FakeAuthApi,
        val coordinator: RealtimeSessionCoordinator,
        val tokenStore: InMemoryTokenStore,
        val port: FakeProvenSessionPort,
        val celebration: me.meeshy.sdk.auth.ArrivalCelebrating,
    )

    private fun scenario(
        registerResponse: ApiResponse<RegisterResponse> = ApiResponse(success = false),
        registerFailure: IOException? = null,
        deviceLocaleProvider: DeviceLocaleProvider = FakeDeviceLocaleProvider(),
        referrals: me.meeshy.sdk.auth.PendingReferralStore = me.meeshy.sdk.auth.InMemoryPendingReferralStore(),
        handoffs: me.meeshy.sdk.auth.LoginHandoffs = me.meeshy.sdk.auth.LoginHandoffs(),
        port: FakeProvenSessionPort = FakeProvenSessionPort(),
        now: () -> Long = { dispatcher.scheduler.currentTime },
    ): Scenario {
        val opener = provenOpener(
            port = port,
            scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + dispatcher),
            nowMs = now,
        )
        val celebration = arrivalCelebration()
        val api = FakeAuthApi(registerResponse, registerFailure)
        val store = InMemoryTokenStore()
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val repository = AuthRepository(
            api,
            store,
            SessionRepository(api, store),
            mockk<SessionTeardown>(relaxed = true),
            SyncSeqTracker(),
        )
        return Scenario(SignupViewModel(repository, coordinator, deviceLocaleProvider, me.meeshy.sdk.notification.InMemoryPushPermissionDeferralStore(), referrals, handoffs, provenSessions = opener, celebration = celebration, clock = object : me.meeshy.sdk.cache.CacheClock { override fun nowMillis(): Long = now() }), api, coordinator, store, port, celebration)
    }

    private fun session() = RegisterResponse(
        user = MeeshyUser(id = "u1", username = "ada"),
        token = "jwt-123",
        sessionToken = "sess-456",
    )

    private fun SignupViewModel.fillValid() {
        onDisplayNameChange("Ada Lovelace")
        onEmailChange("ada@meeshy.me")
        onPhoneEntryChange("0612345678")
        onPasswordChange("secret1")
    }

    @Before
    fun setUp() { Dispatchers.setMain(dispatcher) }

    @After
    fun tearDown() { Dispatchers.resetMain() }

    // ---- état initial --------------------------------------------------------

    @Test
    fun initialState_isEmptyAndCannotSubmit() {
        val state = scenario().viewModel.state.value

        assertThat(state.form.displayName).isEmpty()
        assertThat(state.canSubmit).isFalse()
        assertThat(state.isRegistered).isFalse()
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.submitError).isNull()
    }

    @Test
    fun initialState_showsNoErrorUnderAnyField() {
        val state = scenario().viewModel.state.value

        SignupField.entries.forEach { field ->
            assertThat(state.messageFor(field)).isNull()
        }
    }

    @Test
    fun initialState_prefillsTheReadingLanguageAndCountryFromTheDeviceLocale() {
        val state = scenario(deviceLocaleProvider = FakeDeviceLocaleProvider("es", "MX")).viewModel.state.value

        assertThat(state.form.systemLanguage).isEqualTo("es")
        assertThat(state.form.dialCountryIso).isEqualTo("MX")
    }

    @Test
    fun initialState_unresolvableLocale_keepsTheFallbackLanguageAndPriorityCountry() {
        val state = scenario().viewModel.state.value

        assertThat(state.form.systemLanguage).isEqualTo("fr")
        assertThat(state.form.regionalLanguage).isEqualTo("en")
        assertThat(state.form.dialCountryIso).isEqualTo(CountryCatalog.priority.first())
    }

    // ---- pas d'attente -------------------------------------------------------

    @Test
    fun noNetworkCallHappensBeforeSubmission() = runTest(dispatcher) {
        val scenario = scenario()
        scenario.viewModel.fillValid()
        scenario.viewModel.onPhoneEntryChange("0612345678")
        advanceUntilIdle()

        assertThat(scenario.api.availabilityCalls).isEmpty()
        assertThat(scenario.api.captured).isEmpty()
    }

    @Test
    fun phasesAppearInOrder_phoneFirstThenTheAddressThenTheCard() {
        val vm = scenario().viewModel
        assertThat(vm.state.value.phase).isEqualTo(SignupPhase.PHONE)

        vm.onEmailChange("ada@meeshy.me")
        assertThat(vm.state.value.progress.emailShown).isFalse()

        vm.onPhoneEntryChange("0612345678")
        assertThat(vm.state.value.phase).isEqualTo(SignupPhase.CARD)
        assertThat(vm.state.value.progress.emailShown).isTrue()
        assertThat(vm.state.value.progress.cardShown).isTrue()
    }

    @Test
    fun aPhaseNeverDisappears_evenWhenTheNumberIsEmptiedAgain() {
        val vm = scenario().viewModel
        vm.onPhoneEntryChange("0612345678")
        assertThat(vm.state.value.progress.emailShown).isTrue()

        vm.onPhoneEntryChange("")

        assertThat(vm.state.value.progress.emailShown).isTrue()
    }

    @Test
    fun submitButtonLightsUpOnlyOnceTheCardIsThereAndTheFormIsReady() {
        val vm = scenario().viewModel

        vm.onPhoneEntryChange("0612345678")
        assertThat(vm.state.value.canSubmit).isFalse()
        vm.onEmailChange("ada@meeshy.me")
        assertThat(vm.state.value.canSubmit).isTrue()
    }

    @Test
    fun thePasswordIsOptional_andOnlyAppearsOnceTheIdentityIsDefined() {
        val vm = scenario().viewModel
        vm.onPhoneEntryChange("0612345678")
        assertThat(vm.state.value.passwordRevealed).isFalse()

        vm.onEmailChange("ada@meeshy.me")

        assertThat(vm.state.value.passwordRevealed).isTrue()
        assertThat(vm.state.value.canSubmit).isTrue()
    }

    @Test
    fun anEmptyPhoneBlocksTheButton() {
        val vm = scenario().viewModel
        vm.fillValid()
        vm.onPhoneEntryChange("")

        assertThat(vm.state.value.canSubmit).isFalse()
    }

    @Test
    fun aFillerPhoneIsOnlyRefusedOutLoudOnceTheFieldIsLeft() {
        val vm = scenario().viewModel
        vm.onPhoneEntryChange("11111111")
        assertThat(vm.state.value.messageFor(SignupField.PHONE)).isNull()

        vm.onPhoneFieldLeft()

        assertThat(vm.state.value.messageFor(SignupField.PHONE)).isNotNull()
    }

    @Test
    fun leavingAnEmptyPhoneFieldSaysNothing() {
        val vm = scenario().viewModel

        vm.onPhoneFieldLeft()

        assertThat(vm.state.value.shownPhoneRefusal).isNull()
        assertThat(vm.state.value.phoneRequiredShown).isFalse()
    }

    @Test
    fun touchingTheInactiveButtonExplainsTheMissingPhone() = runTest(dispatcher) {
        val scenario = scenario()

        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.viewModel.state.value.phoneRequiredShown).isTrue()
        assertThat(scenario.api.captured).isEmpty()
    }

    @Test
    fun theDisplayNameAndThePseudoFollowTheAddressUntilTheyAreTouched() {
        val vm = scenario().viewModel

        vm.onPhoneEntryChange("0612345678")
        vm.onEmailChange("jean.dupont@meeshy.me")

        assertThat(vm.state.value.shownDisplayName).isEqualTo("Jean Dupont")
        assertThat(vm.state.value.shownUsername).isEqualTo("jean-dupont")
    }

    @Test
    fun aTypedPseudoWinsAndClearingItShowsTheDerivationAsPlaceholder() {
        val vm = scenario().viewModel
        vm.onPhoneEntryChange("0612345678")
        vm.onEmailChange("ada@meeshy.me")

        vm.onUsernameChange("@ada_l")
        assertThat(vm.state.value.usernameInput).isEqualTo("ada_l")
        assertThat(vm.state.value.shownUsername).isEqualTo("ada_l")

        vm.onUsernameChange("")
        assertThat(vm.state.value.usernameInput).isEmpty()
        assertThat(vm.state.value.usernamePlaceholder).isEqualTo("ada")
        assertThat(vm.state.value.shownUsername).isEqualTo("ada")
        assertThat(vm.state.value.form.effectiveUsername).isEqualTo("ada")
    }

    @Test
    fun register_afterClearingTheNameAndPseudo_sendsThePlaceholdersTheCardShows() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.onPhoneEntryChange("0612345678")
        scenario.viewModel.onEmailChange("jean.dupont@meeshy.me")

        scenario.viewModel.onUsernameChange("")
        scenario.viewModel.onDisplayNameChange("")
        val state = scenario.viewModel.state.value
        assertThat(state.usernameInput).isEmpty()
        assertThat(state.displayNameInput).isEmpty()
        assertThat(state.usernamePlaceholder).isEqualTo("jean-dupont")
        assertThat(state.displayNamePlaceholder).isEqualTo("Jean Dupont")
        assertThat(state.canSubmit).isTrue()
        scenario.viewModel.register()
        advanceUntilIdle()

        val sent = scenario.api.captured.single()
        assertThat(sent.username).isEqualTo(state.shownUsername)
        assertThat(sent.displayName).isEqualTo(state.shownDisplayName)
        assertThat(sent.username).isEqualTo("jean-dupont")
        assertThat(sent.displayName).isEqualTo("Jean Dupont")
    }

    @Test
    fun register_afterRetypingAClearedPseudo_sendsWhatWasTyped() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.onUsernameChange("")
        scenario.viewModel.onUsernameChange("jdupont")
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.api.captured.single().username).isEqualTo("jdupont")
        assertThat(scenario.viewModel.state.value.shownUsername).isEqualTo("jdupont")
    }

    @Test
    fun aTooShortPseudoIsRefusedLiveWhileTyping() {
        val vm = scenario().viewModel
        vm.onPhoneEntryChange("0612345678")
        vm.onEmailChange("ada@meeshy.me")

        vm.onUsernameChange("ab")

        assertThat(vm.state.value.usernameRefusal)
            .isEqualTo(me.meeshy.sdk.model.auth.RegistrationIdentity.UsernameRefusal.TOO_SHORT)
        assertThat(vm.state.value.canSubmit).isFalse()
    }

    @Test
    fun aPastedInternationalNumberMovesItsDialCodeOntoTheCountryButton() {
        val vm = scenario().viewModel

        vm.onPhoneEntryChange("+33 (0)6 12-34-56-78")

        assertThat(vm.state.value.form.dialCountryIso).isEqualTo("FR")
        assertThat(vm.state.value.form.phoneDigits).isEqualTo("0612345678")
    }

    @Test
    fun aNationalNumberKeepsOnlyItsDigitsAndLeavesTheCountryAlone() {
        val vm = scenario().viewModel

        vm.onDialCountryChange("BE")
        vm.onPhoneEntryChange("04 70 12 34 56")

        assertThat(vm.state.value.form.dialCountryIso).isEqualTo("BE")
        assertThat(vm.state.value.form.phoneDigits).isEqualTo("0470123456")
    }

    // ---- envoi ---------------------------------------------------------------

    @Test
    fun register_sendsTheDisplayNamePayloadAndNeverTheWizardsFields() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        val sent = scenario.api.captured.single()
        assertThat(sent.displayName).isEqualTo("Ada Lovelace")
        assertThat(sent.email).isEqualTo("ada@meeshy.me")
        assertThat(sent.password).isEqualTo("secret1")
        assertThat(sent.systemLanguage).isEqualTo("fr")
        assertThat(sent.regionalLanguage).isEqualTo("en")
        assertThat(sent.username).isEqualTo("ada")
        assertThat(sent.firstName).isNull()
        assertThat(sent.lastName).isNull()
    }

    @Test
    fun register_withoutPassword_omitsTheKeyAndStillCreatesTheAccount() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.onPasswordChange("")
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.api.captured.single().password).isNull()
        assertThat(scenario.viewModel.state.value.isRegistered).isTrue()
    }

    @Test
    fun register_sendsTheEditedNameAndPseudo() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.onDisplayNameChange("Ada L.")
        scenario.viewModel.onUsernameChange("adal")
        scenario.viewModel.register()
        advanceUntilIdle()

        val sent = scenario.api.captured.single()
        assertThat(sent.displayName).isEqualTo("Ada L.")
        assertThat(sent.username).isEqualTo("adal")
    }

    @Test
    fun register_filledPhone_sendsTheTypedDigitsAndTheirCountry() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.onDialCountryChange("FR")
        scenario.viewModel.onPhoneEntryChange("0612345678")
        scenario.viewModel.register()
        advanceUntilIdle()

        val sent = scenario.api.captured.single()
        assertThat(sent.phoneNumber).isEqualTo("0612345678")
        assertThat(sent.phoneCountryCode).isEqualTo("FR")
    }

    @Test
    fun register_success_marksRegisteredBindsRealtimeAndKeepsTheSession() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.viewModel.state.value.isRegistered).isTrue()
        assertThat(scenario.viewModel.state.value.isSubmitting).isFalse()
        assertThat(scenario.tokenStore.jwt).isEqualTo("jwt-123")
        verify { scenario.coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun register_whileInFlight_isIgnored() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.api.captured).hasSize(1)
    }

    @Test
    fun register_withAnInvalidForm_callsNothing() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.onDisplayNameChange("Ada")
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.api.captured).isEmpty()
    }

    // ---- refus ---------------------------------------------------------------

    @Test
    fun phoneOwnershipConflict_landsUnderThePhoneAndCreatesNoSession() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(success = true, data = RegisterResponse(phoneOwnershipConflict = true)),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.onPhoneEntryChange("0612345678")
        scenario.viewModel.register()
        advanceUntilIdle()

        val state = scenario.viewModel.state.value
        assertThat(state.isRegistered).isFalse()
        assertThat(state.messageFor(SignupField.PHONE))
            .isEqualTo(SignupFieldMessage.Refused(SignupRefusal.PHONE_OWNERSHIP_CONFLICT, null))
        assertThat(state.globalError).isNull()
        assertThat(scenario.tokenStore.isAuthenticated).isFalse()
        verify(exactly = 0) { scenario.coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun emailTaken_landsUnderTheEmail() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(success = false, error = "Email already in use", code = "EMAIL_TAKEN", fieldName = "email"),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        val state = scenario.viewModel.state.value
        assertThat(state.messageFor(SignupField.EMAIL))
            .isEqualTo(SignupFieldMessage.Refused(SignupRefusal.EMAIL_TAKEN, "Email already in use"))
        assertThat(state.globalError).isNull()
        assertThat(state.isSubmitting).isFalse()
    }

    @Test
    fun usernameTaken_landsUnderTheDisplayName() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(success = false, error = "Username taken", code = "USERNAME_TAKEN", fieldName = "username"),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        val message = scenario.viewModel.state.value.messageFor(SignupField.DISPLAY_NAME)
        assertThat((message as? SignupFieldMessage.Refused)?.refusal).isEqualTo(SignupRefusal.NAME_TAKEN)
    }

    @Test
    fun phoneInvalid_landsUnderThePhone() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(success = false, error = "Bad number", code = "PHONE_INVALID", fieldName = "phoneNumber"),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.onPhoneEntryChange("0612345678")
        scenario.viewModel.register()
        advanceUntilIdle()

        val message = scenario.viewModel.state.value.messageFor(SignupField.PHONE)
        assertThat((message as? SignupFieldMessage.Refused)?.refusal).isEqualTo(SignupRefusal.PHONE_INVALID)
    }

    @Test
    fun validationViolation_landsUnderTheFieldItNames() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(
                success = false,
                error = "Validation failed",
                code = "VALIDATION_ERROR",
                violations = listOf(ApiViolation(path = "/body/password", message = "too short")),
            ),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.viewModel.state.value.messageFor(SignupField.PASSWORD))
            .isEqualTo(SignupFieldMessage.Refused(SignupRefusal.INVALID, "too short"))
    }

    @Test
    fun anUnattributableRefusal_staysGlobal() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = false, error = "Server exploded"))
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        val state = scenario.viewModel.state.value
        assertThat(state.globalError).isEqualTo(SignupSubmitError.Global("Server exploded"))
        SignupField.entries.forEach { field ->
            assertThat(state.messageFor(field)).isNull()
        }
    }

    @Test
    fun editingAnyFieldClearsTheServerRefusal() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(success = false, error = "Email already in use", code = "EMAIL_TAKEN", fieldName = "email"),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()
        assertThat(scenario.viewModel.state.value.submitError).isNotNull()

        scenario.viewModel.onEmailChange("ada2@meeshy.me")

        assertThat(scenario.viewModel.state.value.submitError).isNull()
        assertThat(scenario.viewModel.state.value.messageFor(SignupField.EMAIL)).isNull()
    }

    @Test
    fun clearingThePhoneClearsTheOwnershipConflict() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(success = true, data = RegisterResponse(phoneOwnershipConflict = true)),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.onPhoneEntryChange("0612345678")
        scenario.viewModel.register()
        advanceUntilIdle()

        scenario.viewModel.onPhoneEntryChange("")

        assertThat(scenario.viewModel.state.value.messageFor(SignupField.PHONE)).isNull()
        assertThat(scenario.viewModel.state.value.canSubmit).isFalse()
    }

    @Test
    fun anUnreachableNetworkIsAGlobalMessage_neverAFieldRefusal() = runTest(dispatcher) {
        val scenario = scenario(registerFailure = IOException("no route to host"))
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        val state = scenario.viewModel.state.value
        assertThat(state.globalError).isEqualTo(SignupSubmitError.Network)
        assertThat(state.isSubmitting).isFalse()
        assertThat(state.isRegistered).isFalse()
        SignupField.entries.forEach { field ->
            assertThat(state.messageFor(field)).isNull()
        }
    }

    // ---- verdict local affiché -----------------------------------------------

    @Test
    fun aHalfTypedEmailNeverNagsWhileTyping() {
        val vm = scenario().viewModel

        vm.onEmailChange("ada-at-meeshy")

        assertThat(vm.state.value.messageFor(SignupField.EMAIL)).isNull()
    }

    @Test
    fun aTooShortPasswordShowsItsIssue() {
        val vm = scenario().viewModel

        vm.onPasswordChange("123")

        assertThat(vm.state.value.messageFor(SignupField.PASSWORD))
            .isEqualTo(SignupFieldMessage.Local(SignupFieldIssue.PASSWORD_TOO_SHORT))
    }

    @Test
    fun aFillerPhoneShowsItsReasonAndBlocksSubmit_whileAnEmptyOneOnlyBlocks() {
        val vm = scenario().viewModel
        vm.fillValid()
        assertThat(vm.state.value.canSubmit).isTrue()

        vm.onPhoneEntryChange("12345678")
        assertThat(vm.state.value.messageFor(SignupField.PHONE))
            .isEqualTo(SignupFieldMessage.Local(SignupFieldIssue.PHONE_TOO_SHORT))
        assertThat(vm.state.value.canSubmit).isFalse()

        vm.onPhoneEntryChange("1111100000")
        assertThat(vm.state.value.messageFor(SignupField.PHONE))
            .isEqualTo(SignupFieldMessage.Local(SignupFieldIssue.PHONE_IMPLAUSIBLE))
        assertThat(vm.state.value.canSubmit).isFalse()

        vm.onPhoneEntryChange("")
        assertThat(vm.state.value.messageFor(SignupField.PHONE)).isNull()
        assertThat(vm.state.value.canSubmit).isFalse()
    }

    // ---- langue de lecture ---------------------------------------------------

    @Test
    fun changingTheReadingLanguage_travelsInTheNextPayload() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.onSystemLanguageChange("de")
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.api.captured.single().systemLanguage).isEqualTo("de")
    }

    @Test
    fun aReadingLanguageEqualToTheInferredRegionalOne_sendsOnlyOne() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.onSystemLanguageChange("en")
        scenario.viewModel.register()
        advanceUntilIdle()

        val sent = scenario.api.captured.single()
        assertThat(sent.systemLanguage).isEqualTo("en")
        assertThat(sent.regionalLanguage).isNull()
    }

    // ---- pseudo pris, parrainage, passage à la connexion ----------------------

    @Test
    fun usernameTaken_offersTheFreePseudosTheGatewaySuggests() = runTest(dispatcher) {
        val scenario = scenario(
            ApiResponse(
                success = false,
                error = "Username taken",
                code = "USERNAME_TAKEN",
                fieldName = "username",
                suggestions = listOf("ada1", "ada_l"),
            ),
        )
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.viewModel.state.value.usernameSuggestions).containsExactly("ada1", "ada_l").inOrder()

        scenario.viewModel.onUsernameSuggestionPicked("ada1")

        assertThat(scenario.viewModel.state.value.usernameSuggestions).isEmpty()
        assertThat(scenario.viewModel.state.value.form.effectiveUsername).isEqualTo("ada1")
    }

    @Test
    fun aPendingReferralCodeTravelsWithTheRequest_andIsForgottenOnceTheAccountExists() = runTest(dispatcher) {
        val referrals = me.meeshy.sdk.auth.InMemoryPendingReferralStore().apply { remember("friend-42") }
        val scenario = scenario(ApiResponse(success = true, data = session()), referrals = referrals)
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(scenario.api.captured.single().affiliateToken).isEqualTo("friend-42")
        assertThat(referrals.recall()).isNull()
    }

    @Test
    fun aRefusedSignupKeepsTheReferralCodeForTheNextTry() = runTest(dispatcher) {
        val referrals = me.meeshy.sdk.auth.InMemoryPendingReferralStore().apply { remember("friend-42") }
        val scenario = scenario(ApiResponse(success = false, error = "boom"), referrals = referrals)
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        assertThat(referrals.recall()).isEqualTo("friend-42")
    }

    @Test
    fun switchingToLogin_handsOverACompleteAddressOnce() {
        val handoffs = me.meeshy.sdk.auth.LoginHandoffs()
        val vm = scenario(handoffs = handoffs).viewModel
        vm.onEmailChange("  ada@meeshy.me ")

        vm.onSwitchToLogin()

        assertThat(handoffs.signupEmail.take()).isEqualTo("ada@meeshy.me")
        assertThat(handoffs.signupEmail.take()).isNull()
    }

    @Test
    fun switchingToLogin_neverHandsOverAHalfTypedAddress() {
        val handoffs = me.meeshy.sdk.auth.LoginHandoffs()
        val vm = scenario(handoffs = handoffs).viewModel
        vm.onEmailChange("ada@")

        vm.onSwitchToLogin()

        assertThat(handoffs.signupEmail.take()).isNull()
    }

    // ---- « Valider mon compte maintenant » : la session TENUE, le code dans la carte ---------------

    private fun SignupViewModel.validated(): SignupViewModel = apply { fillValid() }

    private val held = RegisterResponse(
        user = MeeshyUser(id = "u1", username = "ada"),
        token = "jwt-held",
        sessionToken = "sess-held",
        pendingSessionToken = "pending-1",
    )

    private val codeSession = AuthSession(MeeshyUser(id = "u1", username = "ada"), token = "jwt-code")

    @Test
    fun validateNow_createsTheAccountHoldingTheSessionAndShowsTheCodeInTheCard() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = held))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()

        val state = s.viewModel.state.value
        val card = state.card as SignupCard.AwaitingCode
        assertThat(card.step.email).isEqualTo("ada@meeshy.me")
        assertThat(card.step.pendingSessionToken).isEqualTo("pending-1")
        assertThat(state.phase).isEqualTo(SignupPhase.CODE)
        assertThat(state.isRegistered).isFalse()
        assertThat(s.tokenStore.jwt).isNull()
        assertThat(s.port.installed).isEmpty()
        verify(exactly = 0) { s.coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun validateNow_withARefusedPayload_staysOnTheEditingCardWithTheRefusal() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = RegisterResponse(phoneOwnershipConflict = true)))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()

        val state = s.viewModel.state.value
        assertThat(state.card).isEqualTo(SignupCard.Editing)
        assertThat(state.isValidating).isFalse()
        assertThat(state.submitError).isNotNull()
    }

    @Test
    fun aRightCode_turnsTheCardIntoAValidatedAccountWhoseButtonSpeaksToOthers() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = held))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()

        s.viewModel.onCodeVerified(me.meeshy.sdk.model.auth.LoginOutcome.Authenticated(codeSession))

        val state = s.viewModel.state.value
        assertThat(state.card).isInstanceOf(SignupCard.Verified::class.java)
        assertThat(state.phase).isEqualTo(SignupPhase.VERIFIED)
        assertThat(state.primaryAction).isEqualTo(me.meeshy.sdk.model.auth.SignupPrimaryAction.Talk)
    }

    @Test
    fun aLinkOpenedElsewhere_validatesTheAccountWhoseSessionIsHeldHere() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = held))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()

        s.viewModel.onLinkOpenedElsewhere()

        assertThat((s.viewModel.state.value.card as SignupCard.Verified).proof).isEqualTo(SignupProof.LINK)
    }

    @Test
    fun talkingToOthers_afterTheLink_opensTheHeldSessionAndThePreload() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = held))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()
        s.viewModel.onLinkOpenedElsewhere()

        s.viewModel.onPrimary()
        dispatcher.scheduler.runCurrent()

        assertThat(s.port.installed.map { it.first.token }).containsExactly("jwt-held")
        assertThat(s.viewModel.state.value.isRegistered).isTrue()
        verify { s.celebration.prepare("u1") }
        verify { s.coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun talkingToOthers_afterTheCode_prefersTheProvenSessionAndClosesTheHeldOne() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = held))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()
        s.viewModel.onCodeVerified(me.meeshy.sdk.model.auth.LoginOutcome.Authenticated(codeSession))

        s.viewModel.onPrimary()
        dispatcher.scheduler.runCurrent()

        assertThat(s.port.installed.map { it.first.token }).containsExactly("jwt-code")
        assertThat(s.port.closedJwts).containsExactly("jwt-held")
        assertThat(s.viewModel.state.value.isRegistered).isTrue()
    }

    @Test
    fun aRefusedOpening_isSaidWithoutLosingTheValidatedCard() = runTest(dispatcher) {
        val s = scenario(
            registerResponse = ApiResponse(success = true, data = held),
            port = FakeProvenSessionPort(isAuthenticated = true, activeUserId = "someone-else"),
        )
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()
        s.viewModel.onLinkOpenedElsewhere()

        s.viewModel.onPrimary()
        dispatcher.scheduler.runCurrent()

        val state = s.viewModel.state.value
        assertThat(state.openRefused).isTrue()
        assertThat(state.isRegistered).isFalse()
        assertThat(state.card).isInstanceOf(SignupCard.Verified::class.java)
        assertThat(s.port.installed).isEmpty()
    }

    @Test
    fun signingUpWithoutACode_isAllowedDuringTheGracePeriodAndInstallsTheHeldSession() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = held))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()
        assertThat(s.viewModel.state.value.primaryAction)
            .isEqualTo(me.meeshy.sdk.model.auth.SignupPrimaryAction.SignUp(enabled = true))

        s.viewModel.onPrimary()
        dispatcher.scheduler.runCurrent()

        assertThat(s.port.installed.map { it.first.token }).containsExactly("jwt-held")
        assertThat(s.viewModel.state.value.isRegistered).isTrue()
    }

    @Test
    fun afterTheGracePeriod_theHeldSessionIsDiscardedAndTheUserIsSentToSignIn() = runTest(dispatcher) {
        val s = scenario(registerResponse = ApiResponse(success = true, data = held))
        s.viewModel.validated().validateNow()
        dispatcher.scheduler.runCurrent()

        dispatcher.scheduler.advanceTimeBy(600_000)
        dispatcher.scheduler.runCurrent()
        s.viewModel.onPrimary()
        dispatcher.scheduler.runCurrent()

        assertThat(s.port.closedJwts).containsExactly("jwt-held")
        assertThat(s.port.installed).isEmpty()
        val state = s.viewModel.state.value
        assertThat(state.needsSignIn).isTrue()
        assertThat(state.isRegistered).isFalse()
    }
}
