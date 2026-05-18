package me.meeshy.sdk.auth

import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCall

/** Authentication use cases — owns persisting tokens on successful login/register. */
class AuthRepository(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
) {
    val isAuthenticated: Boolean get() = tokenStore.isAuthenticated

    suspend fun login(username: String, password: String): NetworkResult<AuthSession> =
        apiCall { authApi.login(LoginRequest(username, password)) }
            .also { if (it is NetworkResult.Success) storeSession(it.data) }

    suspend fun register(request: RegisterRequest): NetworkResult<AuthSession> =
        apiCall { authApi.register(request) }
            .also { if (it is NetworkResult.Success) storeSession(it.data) }

    fun logout() {
        tokenStore.clear()
    }

    private fun storeSession(session: AuthSession) {
        tokenStore.jwt = session.token
        tokenStore.sessionToken = session.sessionToken
    }
}
