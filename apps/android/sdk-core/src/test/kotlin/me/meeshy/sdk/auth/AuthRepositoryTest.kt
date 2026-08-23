package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.Test

class AuthRepositoryTest {

    private class RecordingSessionTeardown : SessionTeardown {
        var wipeCallCount = 0
            private set

        override suspend fun wipe() {
            wipeCallCount += 1
        }
    }

    private class FakeAuthApi(
        var response: ApiResponse<AuthSession>,
        var availabilityResponse: ApiResponse<AvailabilityResult> = ApiResponse(success = false),
        val availabilityCalls: MutableList<Triple<String?, String?, String?>> = mutableListOf(),
    ) : AuthApi {
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

    private fun session() = AuthSession(
        user = MeeshyUser(id = "u1", username = "atabeth"),
        token = "jwt-123",
        sessionToken = "sess-456",
    )

    private fun repository(
        api: AuthApi,
        store: TokenStore,
        teardown: SessionTeardown = RecordingSessionTeardown(),
        syncSeqTracker: SyncSeqTracker = SyncSeqTracker(),
    ): Pair<AuthRepository, SessionRepository> {
        val session = SessionRepository(api, store)
        return AuthRepository(api, store, session, teardown, syncSeqTracker) to session
    }

    @Test
    fun login_success_persistsTokensAndAdoptsSession() = runTest {
        val store = InMemoryTokenStore()
        val (repo, session) = repository(
            FakeAuthApi(ApiResponse(success = true, data = session())),
            store,
        )

        val result = repo.login("atabeth", "pw")

        assertThat(result.isSuccess).isTrue()
        assertThat(store.jwt).isEqualTo("jwt-123")
        assertThat(store.sessionToken).isEqualTo("sess-456")
        assertThat(repo.isAuthenticated).isTrue()
        assertThat(session.currentUser.value?.id).isEqualTo("u1")
    }

    @Test
    fun login_failure_doesNotPersistTokens() = runTest {
        val store = InMemoryTokenStore()
        val (repo, session) = repository(
            FakeAuthApi(ApiResponse(success = false, error = "Bad credentials")),
            store,
        )

        val result = repo.login("x", "y")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }

    @Test
    fun checkAvailability_success_forwardsOnlyTheProbedFieldAndReturnsResult() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            ApiResponse(success = false),
            availabilityResponse = ApiResponse(
                success = true,
                data = AvailabilityResult(usernameAvailable = true, suggestions = listOf("atabeth1")),
            ),
        )
        val (repo, _) = repository(api, store)

        val result = repo.checkAvailability(username = "atabeth")

        assertThat(api.availabilityCalls).containsExactly(Triple("atabeth", null, null))
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(result.getOrNull()?.usernameAvailable).isTrue()
        assertThat(result.getOrNull()?.suggestions).containsExactly("atabeth1")
    }

    @Test
    fun checkAvailability_failure_returnsFailure() = runTest {
        val store = InMemoryTokenStore()
        val api = FakeAuthApi(
            ApiResponse(success = false),
            availabilityResponse = ApiResponse(success = false, error = "boom"),
        )
        val (repo, _) = repository(api, store)

        val result = repo.checkAvailability(email = "a@b.co")

        assertThat(api.availabilityCalls).containsExactly(Triple(null, "a@b.co", null))
        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun logout_clearsTokensAndSession() = runTest {
        val store = InMemoryTokenStore(jwt = "j", sessionToken = "s")
        val (repo, session) = repository(FakeAuthApi(ApiResponse(success = false)), store)
        session.adopt(MeeshyUser(id = "u1", username = "atabeth"))

        repo.logout()

        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }

    @Test
    fun logout_resetsTheSyncSeqCursor() = runTest {
        // `_seq` est alloué PAR USER : le curseur d'un compte ne veut rien dire
        // pour le suivant, et hérité il masquerait ses trous.
        val store = InMemoryTokenStore(jwt = "j", sessionToken = "s")
        val tracker = SyncSeqTracker()
        tracker.observe(9_000L)
        val (repo, _) = repository(
            FakeAuthApi(ApiResponse(success = false)),
            store,
            syncSeqTracker = tracker,
        )

        repo.logout()

        assertThat(tracker.lastSeq).isNull()
    }

    @Test
    fun logout_wipesEveryPerAccountCache() = runTest {
        val store = InMemoryTokenStore(jwt = "j", sessionToken = "s")
        val teardown = RecordingSessionTeardown()
        val (repo, _) = repository(FakeAuthApi(ApiResponse(success = false)), store, teardown)

        repo.logout()

        assertThat(teardown.wipeCallCount).isEqualTo(1)
    }
}
