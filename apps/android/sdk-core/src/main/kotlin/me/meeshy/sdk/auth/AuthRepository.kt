package me.meeshy.sdk.auth

import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import javax.inject.Inject
import javax.inject.Singleton

/** Authentication use cases — owns persisting tokens and the session on login/register. */
@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
    private val sessionRepository: SessionRepository,
    private val sessionTeardown: SessionTeardown,
) {
    val isAuthenticated: Boolean get() = tokenStore.isAuthenticated

    suspend fun login(username: String, password: String): NetworkResult<AuthSession> =
        apiCall { authApi.login(LoginRequest(username, password)) }
            .also { if (it is NetworkResult.Success) storeSession(it.data) }

    suspend fun register(request: RegisterRequest): NetworkResult<AuthSession> =
        apiCall { authApi.register(request) }
            .also { if (it is NetworkResult.Success) storeSession(it.data) }

    /**
     * Probe the availability of a single signup field (username / email / phone).
     * Pass exactly the one being checked; the others stay `null` and are omitted
     * from the request. A transport/HTTP failure folds into [NetworkResult.Failure]
     * so the caller can degrade to an "unknown" verdict rather than a stale answer.
     */
    suspend fun checkAvailability(
        username: String? = null,
        email: String? = null,
        phoneNumber: String? = null,
    ): NetworkResult<AvailabilityResult> =
        apiCall { authApi.checkAvailability(username, email, phoneNumber) }

    /**
     * Demande l'email de reinitialisation de mot de passe. Le gateway repond
     * TOUJOURS succes (anti-enumeration) : un echec ici est un probleme de
     * transport, jamais "cet email n'existe pas".
     */
    suspend fun requestPasswordReset(email: String): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.forgotPassword(me.meeshy.sdk.net.api.ForgotPasswordRequest(email)) }

    /**
     * Demande un magic link de connexion sans mot de passe. Retourne la validite
     * du lien en secondes (seed du compte a rebours), avec un defaut prudent si le
     * gateway n'en renvoie pas.
     */
    suspend fun requestMagicLink(email: String): NetworkResult<Int> =
        apiCall { authApi.requestMagicLink(me.meeshy.sdk.net.api.MagicLinkRequestBody(email)) }
            .map { it.expiresInSeconds ?: DEFAULT_MAGIC_LINK_VALIDITY_SECONDS }

    /** Re-hydrates the session on app start when a token is already present. */
    suspend fun restoreSession() {
        sessionRepository.refresh()
    }

    /**
     * Ends the session and wipes every per-account cache ([SessionTeardown]) so a
     * different account signing in on this device never inherits the previous
     * account's data. The wipe is awaited before returning — the caller may treat
     * the device as clean the moment this suspend call completes.
     */
    suspend fun logout() {
        tokenStore.clear()
        sessionRepository.clear()
        sessionTeardown.wipe()
    }

    private fun storeSession(session: AuthSession) {
        tokenStore.jwt = session.token
        tokenStore.sessionToken = session.sessionToken
        sessionRepository.adopt(session.user)
    }

    private companion object {
        /** Validite par defaut si le gateway omet expiresInSeconds (60 s cote serveur). */
        const val DEFAULT_MAGIC_LINK_VALIDITY_SECONDS: Int = 60
    }
}
