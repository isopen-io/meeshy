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
        override suspend fun login(body: LoginRequest) = ApiResponse<AuthSession>(success = false)
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
            ApiResponse<me.meeshy.sdk.net.api.SessionsListData>(success = false)
        override suspend fun revokeSession(sessionId: String) = ApiResponse<Unit>(success = true)
        override suspend fun revokeOtherSessions() = ApiResponse<Unit>(success = true)
        override suspend fun validateMagicLink(body: me.meeshy.sdk.net.api.MagicLinkValidateRequest) =
            ApiResponse<AuthSession>(success = false)
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
    )

    private fun scenario(
        registerResponse: ApiResponse<RegisterResponse> = ApiResponse(success = false),
        registerFailure: IOException? = null,
        deviceLocaleProvider: DeviceLocaleProvider = FakeDeviceLocaleProvider(),
    ): Scenario {
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
        return Scenario(SignupViewModel(repository, coordinator, deviceLocaleProvider), api, coordinator, store)
    }

    private fun session() = RegisterResponse(
        user = MeeshyUser(id = "u1", username = "ada"),
        token = "jwt-123",
        sessionToken = "sess-456",
    )

    private fun SignupViewModel.fillValid() {
        onDisplayNameChange("Ada Lovelace")
        onEmailChange("ada@meeshy.me")
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
    fun submitButtonLightsUpAsSoonAsNameEmailAndPasswordAreValid() {
        val vm = scenario().viewModel

        vm.onDisplayNameChange("Ada")
        assertThat(vm.state.value.canSubmit).isFalse()
        vm.onEmailChange("ada@meeshy.me")
        assertThat(vm.state.value.canSubmit).isFalse()
        vm.onPasswordChange("secret1")
        assertThat(vm.state.value.canSubmit).isTrue()
    }

    @Test
    fun anEmptyPhoneNeverBlocksTheButton() {
        val vm = scenario().viewModel
        vm.fillValid()

        assertThat(vm.state.value.form.phoneDigits).isEmpty()
        assertThat(vm.state.value.canSubmit).isTrue()
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
        assertThat(sent.username).isNull()
        assertThat(sent.firstName).isNull()
        assertThat(sent.lastName).isNull()
    }

    @Test
    fun register_emptyPhone_omitsBothPhoneFields() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.register()
        advanceUntilIdle()

        val sent = scenario.api.captured.single()
        assertThat(sent.phoneNumber).isNull()
        assertThat(sent.phoneCountryCode).isNull()
    }

    @Test
    fun register_filledPhone_sendsTheDialCodePrefixedNumberAndItsCountry() = runTest(dispatcher) {
        val scenario = scenario(ApiResponse(success = true, data = session()))
        scenario.viewModel.fillValid()
        scenario.viewModel.onDialCountryChange("FR")
        scenario.viewModel.onPhoneEntryChange("0612345678")
        scenario.viewModel.register()
        advanceUntilIdle()

        val sent = scenario.api.captured.single()
        assertThat(sent.phoneNumber).isEqualTo("+330612345678")
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
        scenario.viewModel.onPhoneEntryChange("06")
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
        assertThat(scenario.viewModel.state.value.canSubmit).isTrue()
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
    fun aTypedButInvalidEmailShowsItsIssue_whileAnUntouchedOneShowsNothing() {
        val vm = scenario().viewModel

        assertThat(vm.state.value.messageFor(SignupField.EMAIL)).isNull()
        vm.onEmailChange("ada-at-meeshy")
        assertThat(vm.state.value.messageFor(SignupField.EMAIL))
            .isEqualTo(SignupFieldMessage.Local(SignupFieldIssue.EMAIL_INVALID))
    }

    @Test
    fun aTooShortPasswordShowsItsIssue() {
        val vm = scenario().viewModel

        vm.onPasswordChange("123")

        assertThat(vm.state.value.messageFor(SignupField.PASSWORD))
            .isEqualTo(SignupFieldMessage.Local(SignupFieldIssue.PASSWORD_TOO_SHORT))
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
}
