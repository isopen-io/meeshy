package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
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
import org.junit.Test

class AuthRepositoryTest {

    private class FakeAuthApi(var response: ApiResponse<AuthSession>) : AuthApi {
        override suspend fun login(body: LoginRequest) = response
        override suspend fun register(body: RegisterRequest) = response
        override suspend fun refresh(body: RefreshTokenRequest) = response
        override suspend fun me() = ApiResponse<MeEnvelope>(success = false)
    }

    private fun session() = AuthSession(
        user = MeeshyUser(id = "u1", username = "atabeth"),
        token = "jwt-123",
        sessionToken = "sess-456",
    )

    private fun repository(
        api: AuthApi,
        store: TokenStore,
    ): Pair<AuthRepository, SessionRepository> {
        val session = SessionRepository(api, store)
        return AuthRepository(api, store, session) to session
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
    fun logout_clearsTokensAndSession() {
        val store = InMemoryTokenStore(jwt = "j", sessionToken = "s")
        val (repo, session) = repository(FakeAuthApi(ApiResponse(success = false)), store)
        session.adopt(MeeshyUser(id = "u1", username = "atabeth"))

        repo.logout()

        assertThat(store.isAuthenticated).isFalse()
        assertThat(session.currentUser.value).isNull()
    }
}
