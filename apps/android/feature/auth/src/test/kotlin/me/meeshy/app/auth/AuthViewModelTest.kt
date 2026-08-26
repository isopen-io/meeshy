package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
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
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.model.auth.ServerEnvironment
import me.meeshy.sdk.net.InMemoryServerEnvironmentStore
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.sync.SyncSeqTracker
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeAuthApi(var response: ApiResponse<AuthSession>) : AuthApi {
        override suspend fun login(body: LoginRequest) = response
        override suspend fun register(body: RegisterRequest) = response
        override suspend fun refresh(body: RefreshTokenRequest) = response
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
        override suspend fun checkAvailability(username: String?, email: String?, phoneNumber: String?) =
            ApiResponse<me.meeshy.sdk.model.AvailabilityResult>(success = false)
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

    private class FixedCacheClock(private val millis: Long) : CacheClock {
        override fun nowMillis(): Long = millis
    }

    private fun account(id: String, username: String = "user-$id") =
        SavedAccount(id = id, username = username, displayName = null, avatarUrl = null, lastActiveAtMillis = 1L)

    private fun viewModel(
        response: ApiResponse<AuthSession>,
        store: InMemoryTokenStore = InMemoryTokenStore(),
        coordinator: RealtimeSessionCoordinator = mockk(relaxed = true),
        teardown: SessionTeardown = mockk(relaxed = true),
        savedAccountsStore: InMemorySavedAccountsStore = InMemorySavedAccountsStore(),
        clock: CacheClock = FixedCacheClock(999L),
        config: MeeshyConfig = MeeshyConfig(),
        environmentStore: InMemoryServerEnvironmentStore = InMemoryServerEnvironmentStore(),
    ): AuthViewModel {
        val api = FakeAuthApi(response)
        return AuthViewModel(
            AuthRepository(api, store, SessionRepository(api, store), teardown, SyncSeqTracker()),
            coordinator,
            savedAccountsStore,
            clock,
            config,
            environmentStore,
        )
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun login_withBlankFields_showsValidationError() {
        val vm = viewModel(ApiResponse(success = false))
        vm.login()
        assertThat(vm.state.value.errorRes).isNotNull()
        assertThat(vm.state.value.isAuthenticated).isFalse()
    }

    @Test
    fun login_success_marksAuthenticated() = runTest(dispatcher) {
        val session = AuthSession(MeeshyUser(id = "u1", username = "atabeth"), token = "jwt")
        val vm = viewModel(ApiResponse(success = true, data = session))

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isTrue()
        assertThat(vm.state.value.isSubmitting).isFalse()
    }

    @Test
    fun login_failure_surfacesErrorMessage() = runTest(dispatcher) {
        val vm = viewModel(ApiResponse(success = false, error = "Invalid credentials"))

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("wrong")
        vm.login()
        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("Invalid credentials")
    }

    @Test
    fun init_withRestoredToken_bindsRealtimeToTheSession() {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)

        viewModel(ApiResponse(success = false), store = InMemoryTokenStore(jwt = "jwt"), coordinator = coordinator)

        verify { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun init_withoutToken_reportsUnauthenticatedToRealtime() {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)

        viewModel(ApiResponse(success = false), coordinator = coordinator)

        verify { coordinator.onAuthenticatedChanged(false) }
    }

    @Test
    fun login_success_bindsRealtimeToTheSession() = runTest(dispatcher) {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val session = AuthSession(MeeshyUser(id = "u1", username = "atabeth"), token = "jwt")
        val vm = viewModel(ApiResponse(success = true, data = session), coordinator = coordinator)

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        verify { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun login_failure_doesNotBindRealtime() = runTest(dispatcher) {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val vm = viewModel(ApiResponse(success = false, error = "nope"), coordinator = coordinator)

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("wrong")
        vm.login()
        advanceUntilIdle()

        verify(exactly = 0) { coordinator.onAuthenticatedChanged(true) }
    }

    @Test
    fun logout_unbindsRealtimeFromTheSession() = runTest(dispatcher) {
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val vm = viewModel(ApiResponse(success = false), store = InMemoryTokenStore(jwt = "jwt"), coordinator = coordinator)

        vm.logout()
        advanceUntilIdle()

        verify { coordinator.onAuthenticatedChanged(false) }
    }

    @Test
    fun logout_wipesEveryPerAccountCacheBeforeClearingTheAuthenticatedState() = runTest(dispatcher) {
        val teardown = mockk<SessionTeardown>(relaxed = true)
        val vm = viewModel(ApiResponse(success = false), store = InMemoryTokenStore(jwt = "jwt"), teardown = teardown)

        vm.logout()
        advanceUntilIdle()

        coVerify { teardown.wipe() }
        assertThat(vm.state.value.isAuthenticated).isFalse()
    }

    // --- Saved-account picker (auth-saved-account-picker-ui) ---

    @Test
    fun initialState_seedsSavedAccountsFromTheStore_andShowsThePicker() {
        val store = InMemorySavedAccountsStore(initial = listOf(account("a1")))

        val vm = viewModel(ApiResponse(success = false), savedAccountsStore = store)

        assertThat(vm.state.value.savedAccounts.map { it.id }).containsExactly("a1")
        assertThat(vm.state.value.showPicker).isTrue()
    }

    @Test
    fun initialState_withNoSavedAccounts_doesNotShowThePicker() {
        val vm = viewModel(ApiResponse(success = false))

        assertThat(vm.state.value.showPicker).isFalse()
    }

    @Test
    fun selectAccount_prefillsUsernameAndClearsThePasswordAndAnyError() {
        val vm = viewModel(ApiResponse(success = false, error = "stale"))
        vm.onPasswordChange("stale-password")

        vm.selectAccount(account("a1", username = "atabeth"))

        val state = vm.state.value
        assertThat(state.selectedAccount?.id).isEqualTo("a1")
        assertThat(state.username).isEqualTo("atabeth")
        assertThat(state.password).isEmpty()
    }

    @Test
    fun deselectAccount_returnsToThePickerAndClearsThePassword() {
        val vm = viewModel(ApiResponse(success = false), savedAccountsStore = InMemorySavedAccountsStore(listOf(account("a1"))))
        vm.selectAccount(account("a1"))
        vm.onPasswordChange("typed")

        vm.deselectAccount()

        val state = vm.state.value
        assertThat(state.selectedAccount).isNull()
        assertThat(state.password).isEmpty()
        assertThat(state.showPicker).isTrue()
    }

    @Test
    fun useAnotherAccount_switchesToTheNormalLoginFormAndClearsAnySelection() {
        val vm = viewModel(ApiResponse(success = false), savedAccountsStore = InMemorySavedAccountsStore(listOf(account("a1"))))
        vm.selectAccount(account("a1"))

        vm.useAnotherAccount()

        val state = vm.state.value
        assertThat(state.showNormalLogin).isTrue()
        assertThat(state.selectedAccount).isNull()
        assertThat(state.showPicker).isFalse()
    }

    @Test
    fun backToSavedAccounts_returnsFromTheNormalFormToThePicker() {
        val vm = viewModel(ApiResponse(success = false), savedAccountsStore = InMemorySavedAccountsStore(listOf(account("a1"))))
        vm.useAnotherAccount()

        vm.backToSavedAccounts()

        assertThat(vm.state.value.showPicker).isTrue()
    }

    @Test
    fun removeAccount_dropsItFromTheStoreAndTheExposedState() = runTest(dispatcher) {
        val store = InMemorySavedAccountsStore(initial = listOf(account("a1"), account("a2")))
        val vm = viewModel(ApiResponse(success = false), savedAccountsStore = store)

        vm.removeAccount("a1")
        advanceUntilIdle()

        assertThat(vm.state.value.savedAccounts.map { it.id }).containsExactly("a2")
    }

    @Test
    fun login_success_upsertsTheAccountIntoTheSavedAccountsStore() = runTest(dispatcher) {
        val store = InMemorySavedAccountsStore()
        val session = AuthSession(MeeshyUser(id = "u1", username = "atabeth", displayName = "Ata"), token = "jwt")
        val vm = viewModel(ApiResponse(success = true, data = session), savedAccountsStore = store, clock = FixedCacheClock(42L))

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("secret")
        vm.login()
        advanceUntilIdle()

        val saved = store.accounts.value.single()
        assertThat(saved.id).isEqualTo("u1")
        assertThat(saved.username).isEqualTo("atabeth")
        assertThat(saved.displayName).isEqualTo("Ata")
        assertThat(saved.lastActiveAtMillis).isEqualTo(42L)
    }

    @Test
    fun login_failure_doesNotUpsertAnyAccount() = runTest(dispatcher) {
        val store = InMemorySavedAccountsStore()
        val vm = viewModel(ApiResponse(success = false, error = "nope"), savedAccountsStore = store)

        vm.onUsernameChange("atabeth")
        vm.onPasswordChange("wrong")
        vm.login()
        advanceUntilIdle()

        assertThat(store.accounts.value).isEmpty()
    }

    @Test
    fun logout_preservesTheSavedAccountsList() = runTest(dispatcher) {
        val store = InMemorySavedAccountsStore(initial = listOf(account("a1")))
        val vm = viewModel(ApiResponse(success = false), store = InMemoryTokenStore(jwt = "jwt"), savedAccountsStore = store)

        vm.logout()
        advanceUntilIdle()

        assertThat(vm.state.value.savedAccounts.map { it.id }).containsExactly("a1")
    }

    // --- Server environment selector (auth-server-environment-wiring) ---

    @Test
    fun initialState_seedsTheSelectedEnvironmentAndCustomHostFromTheStore() {
        val environmentStore = InMemoryServerEnvironmentStore(
            initialEnvironment = ServerEnvironment.STAGING,
            initialCustomHost = "gate.example.com",
        )

        val vm = viewModel(ApiResponse(success = false), environmentStore = environmentStore)

        assertThat(vm.state.value.selectedEnvironment).isEqualTo(ServerEnvironment.STAGING)
        assertThat(vm.state.value.customHostInput).isEqualTo("gate.example.com")
    }

    @Test
    fun initialState_whenConfigLoggingIsEnabled_showsTheEnvironmentSelector() {
        val vm = viewModel(ApiResponse(success = false), config = MeeshyConfig(enableLogging = true))

        assertThat(vm.state.value.showEnvironmentSelector).isTrue()
    }

    @Test
    fun initialState_whenConfigLoggingIsDisabled_hidesTheEnvironmentSelector() {
        val vm = viewModel(ApiResponse(success = false), config = MeeshyConfig(enableLogging = false))

        assertThat(vm.state.value.showEnvironmentSelector).isFalse()
    }

    @Test
    fun selectEnvironment_nonCustom_updatesStateAndPersistsImmediately() {
        val environmentStore = InMemoryServerEnvironmentStore()
        val vm = viewModel(ApiResponse(success = false), environmentStore = environmentStore)

        vm.selectEnvironment(ServerEnvironment.STAGING)

        assertThat(vm.state.value.selectedEnvironment).isEqualTo(ServerEnvironment.STAGING)
        assertThat(environmentStore.selectedEnvironment).isEqualTo(ServerEnvironment.STAGING)
    }

    @Test
    fun selectEnvironment_custom_updatesStateButDoesNotPersistUntilApplied() {
        val environmentStore = InMemoryServerEnvironmentStore()
        val vm = viewModel(ApiResponse(success = false), environmentStore = environmentStore)

        vm.selectEnvironment(ServerEnvironment.CUSTOM)

        assertThat(vm.state.value.selectedEnvironment).isEqualTo(ServerEnvironment.CUSTOM)
        assertThat(vm.state.value.showCustomHostInput).isTrue()
        assertThat(environmentStore.selectedEnvironment).isEqualTo(ServerEnvironment.PRODUCTION)
    }

    @Test
    fun onCustomHostChange_updatesTheInputFieldOnly() {
        val environmentStore = InMemoryServerEnvironmentStore()
        val vm = viewModel(ApiResponse(success = false), environmentStore = environmentStore)

        vm.onCustomHostChange("gate.example.com")

        assertThat(vm.state.value.customHostInput).isEqualTo("gate.example.com")
        assertThat(environmentStore.customHost).isEmpty()
    }

    @Test
    fun applyCustomHost_withAValidHost_persistsAndSelectsCustom() {
        val environmentStore = InMemoryServerEnvironmentStore()
        val vm = viewModel(ApiResponse(success = false), environmentStore = environmentStore)

        vm.onCustomHostChange("gate.example.com")
        vm.applyCustomHost()

        assertThat(vm.state.value.selectedEnvironment).isEqualTo(ServerEnvironment.CUSTOM)
        assertThat(environmentStore.selectedEnvironment).isEqualTo(ServerEnvironment.CUSTOM)
        assertThat(environmentStore.customHost).isEqualTo("gate.example.com")
    }

    @Test
    fun applyCustomHost_withABlankHost_isInert() {
        val environmentStore = InMemoryServerEnvironmentStore()
        val vm = viewModel(ApiResponse(success = false), environmentStore = environmentStore)

        vm.onCustomHostChange("   ")
        vm.applyCustomHost()

        assertThat(vm.state.value.selectedEnvironment).isEqualTo(ServerEnvironment.PRODUCTION)
        assertThat(environmentStore.customHost).isEmpty()
    }

    @Test
    fun serverOriginLabel_reflectsTheSelectedEnvironment() {
        val vm = viewModel(ApiResponse(success = false))

        vm.selectEnvironment(ServerEnvironment.LOCALHOST)

        assertThat(vm.state.value.serverOriginLabel).isEqualTo("http://localhost:3000")
    }

    @Test
    fun logout_preservesTheServerEnvironmentSelection() = runTest(dispatcher) {
        val environmentStore = InMemoryServerEnvironmentStore(initialEnvironment = ServerEnvironment.STAGING)
        val vm = viewModel(
            ApiResponse(success = false),
            store = InMemoryTokenStore(jwt = "jwt"),
            environmentStore = environmentStore,
        )

        vm.logout()
        advanceUntilIdle()

        assertThat(vm.state.value.selectedEnvironment).isEqualTo(ServerEnvironment.STAGING)
    }
}
