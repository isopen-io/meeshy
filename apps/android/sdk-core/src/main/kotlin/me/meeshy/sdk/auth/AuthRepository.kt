package me.meeshy.sdk.auth

import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Authentication use cases — owns persisting tokens and the session on login/register. */
@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
    private val sessionRepository: SessionRepository,
) {
    val isAuthenticated: Boolean get() = tokenStore.isAuthenticated

    suspend fun login(username: String, password: String): NetworkResult<AuthSession> =
        apiCall { authApi.login(LoginRequest(username, password)) }
            .also { if (it is NetworkResult.Success) storeSession(it.data) }

    suspend fun register(request: RegisterRequest): NetworkResult<AuthSession> =
        apiCall { authApi.register(request) }
            .also { if (it is NetworkResult.Success) storeSession(it.data) }

    /** Re-hydrates the session on app start when a token is already present. */
    suspend fun restoreSession() {
        sessionRepository.refresh()
    }

    fun logout() {
        tokenStore.clear()
        sessionRepository.clear()
    }

    private fun storeSession(session: AuthSession) {
        tokenStore.jwt = session.token
        tokenStore.sessionToken = session.sessionToken
        sessionRepository.adopt(session.user)
    }
}
