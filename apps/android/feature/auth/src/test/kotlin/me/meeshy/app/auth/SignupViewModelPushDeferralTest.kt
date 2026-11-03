package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.RegisterOutcome
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.InMemoryPushPermissionDeferralStore
import me.meeshy.sdk.notification.PushPermissionDeferralStore
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignupViewModelPushDeferralTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private fun viewModel(
        outcome: NetworkResult<RegisterOutcome>,
        store: PushPermissionDeferralStore,
    ): SignupViewModel {
        val repository = mockk<AuthRepository>()
        coEvery { repository.register(any()) } returns outcome
        return SignupViewModel(
            repository,
            mockk<RealtimeSessionCoordinator>(relaxed = true),
            object : DeviceLocaleProvider {
                override fun languageTag(): String = "en"
                override fun regionTag(): String = "US"
            },
            store,
            provenSessions = provenOpener(),
            celebration = arrivalCelebration(),
        ).apply {
            onDisplayNameChange("Ada Lovelace")
            onEmailChange("ada@meeshy.me")
            onPhoneEntryChange("0612345678")
            onPasswordChange("secret1")
        }
    }

    private val created = NetworkResult.Success(
        RegisterOutcome.Created(AuthSession(MeeshyUser(id = "u1", username = "ada"), token = "jwt")),
    )

    @Test
    fun `a successful signup posts the deferral marker`() = runTest(dispatcher) {
        val store = InMemoryPushPermissionDeferralStore()
        viewModel(created, store).register()
        advanceUntilIdle()
        assertThat(store.isPending()).isTrue()
    }

    @Test
    fun `a refused signup leaves the marker alone`() = runTest(dispatcher) {
        val store = InMemoryPushPermissionDeferralStore()
        viewModel(NetworkResult.Failure(ApiError(message = "taken")), store).register()
        advanceUntilIdle()
        assertThat(store.isPending()).isFalse()
    }

    @Test
    fun `a phone ownership conflict leaves the marker alone`() = runTest(dispatcher) {
        val store = InMemoryPushPermissionDeferralStore()
        viewModel(NetworkResult.Success(RegisterOutcome.PhoneOwnershipConflict), store).register()
        advanceUntilIdle()
        assertThat(store.isPending()).isFalse()
    }
}
