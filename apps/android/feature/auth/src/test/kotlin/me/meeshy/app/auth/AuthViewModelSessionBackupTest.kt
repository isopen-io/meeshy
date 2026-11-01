package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.BackedUpSession
import me.meeshy.sdk.net.BackedUpTokenStore
import me.meeshy.sdk.net.InMemoryServerEnvironmentStore
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.SessionBackup
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import me.meeshy.sdk.sync.SyncSeqTracker
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** Réinstaller l'app garde la connexion (#14058) : le démarrage sans session relit le Block Store. */
@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelSessionBackupTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeBackup(var held: BackedUpSession?) : SessionBackup {
        override suspend fun read(): BackedUpSession? = held
        override fun save(session: BackedUpSession) { held = session }
        override fun erase() { held = null }
    }

    private val user = MeeshyUser(id = "u1", username = "atabeth")

    private fun viewModel(
        api: AuthApi,
        backup: SessionBackup,
        coordinator: RealtimeSessionCoordinator = mockk(relaxed = true),
        accounts: InMemorySavedAccountsStore = InMemorySavedAccountsStore(),
    ): AuthViewModel {
        val tokens = BackedUpTokenStore(InMemoryTokenStore(), backup)
        return AuthViewModel(
            AuthRepository(
                api,
                tokens,
                SessionRepository(api, tokens),
                mockk<SessionTeardown>(relaxed = true),
                SyncSeqTracker(),
                sessionBackup = backup,
            ),
            coordinator,
            accounts,
            object : CacheClock { override fun nowMillis(): Long = 1L },
            MeeshyConfig(),
            InMemoryServerEnvironmentStore(),
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
    fun `une session sauvegardee ouvre l'app connectee`() = runTest(dispatcher) {
        val api = mockk<AuthApi>(relaxed = true)
        coEvery { api.refresh(any()) } returns ApiResponse(success = true, data = AuthSession(user, token = "new", sessionToken = "s"))
        val coordinator = mockk<RealtimeSessionCoordinator>(relaxed = true)
        val accounts = InMemorySavedAccountsStore()
        val vm = viewModel(api, FakeBackup(BackedUpSession("u1", "old", "s")), coordinator, accounts)

        assertThat(vm.state.value.isRestoringSession).isTrue()
        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isTrue()
        assertThat(vm.state.value.hasAccount).isTrue()
        assertThat(vm.state.value.isRestoringSession).isFalse()
        verify { coordinator.onAuthenticatedChanged(true) }
        assertThat(accounts.accounts.value.map { it.id }).containsExactly("u1")
    }

    @Test
    fun `un jeton refuse montre l'ecran de connexion sans message`() = runTest(dispatcher) {
        val api = mockk<AuthApi>(relaxed = true)
        coEvery { api.refresh(any()) } throws HttpException(Response.error<Any>(401, "{}".toResponseBody()))
        val backup = FakeBackup(BackedUpSession("u1", "old", "s"))
        val vm = viewModel(api, backup)

        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.isRestoringSession).isFalse()
        assertThat(vm.state.value.errorRes).isNull()
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.sessionClosedNotice).isFalse()
        assertThat(backup.held).isNull()
    }

    @Test
    fun `sans sauvegarde le demarrage reste sur l'ecran de connexion`() = runTest(dispatcher) {
        val vm = viewModel(mockk(relaxed = true), FakeBackup(null))

        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(vm.state.value.isRestoringSession).isFalse()
    }

    @Test
    fun `une connexion a la main pendant la restauration la remplace`() = runTest(dispatcher) {
        val api = mockk<AuthApi>(relaxed = true)
        coEvery { api.refresh(any()) } coAnswers {
            kotlinx.coroutines.delay(1_000)
            ApiResponse(success = true, data = AuthSession(user, token = "restored", sessionToken = "s"))
        }
        coEvery { api.login(any()) } returns ApiResponse(
            success = true,
            data = me.meeshy.sdk.model.auth.LoginResponse(
                user = MeeshyUser(id = "u2", username = "bob"),
                token = "typed",
                sessionToken = "s2",
            ),
        )
        val accounts = InMemorySavedAccountsStore()
        val vm = viewModel(api, FakeBackup(BackedUpSession("u1", "old", "s")), accounts = accounts)
        runCurrent()
        vm.onUsernameChange("bob")
        vm.onPasswordChange("secret")

        vm.login()
        advanceUntilIdle()

        assertThat(vm.state.value.isAuthenticated).isTrue()
        assertThat(vm.state.value.isRestoringSession).isFalse()
        assertThat(accounts.accounts.value.map { it.id }).containsExactly("u2")
    }

    @Test
    fun `une restauration qui ne repond pas rend la connexion a la main`() = runTest(dispatcher) {
        val api = mockk<AuthApi>(relaxed = true)
        coEvery { api.refresh(any()) } coAnswers {
            kotlinx.coroutines.awaitCancellation()
        }
        val backup = FakeBackup(BackedUpSession("u1", "old", "s"))
        val vm = viewModel(api, backup)

        advanceUntilIdle()

        assertThat(vm.state.value.isRestoringSession).isFalse()
        assertThat(vm.state.value.isAuthenticated).isFalse()
        assertThat(backup.held).isNotNull()
    }
}
