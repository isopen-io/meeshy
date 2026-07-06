package me.meeshy.sdk.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the signed-in identity for the whole app (ARCHITECTURE.md §3).
 *
 * [currentUser] is a [MeeshyUser] for **both** registered and anonymous
 * sessions — the model carries `isAnonymous` and implements the Prisme
 * [me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences], so every
 * feature reads identity and content-language preferences from one source.
 */
@Singleton
class SessionRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
) {
    private val _currentUser = MutableStateFlow<MeeshyUser?>(null)

    /** The signed-in identity, or `null` when no session is active. */
    val currentUser: StateFlow<MeeshyUser?> = _currentUser.asStateFlow()

    val currentUserId: String?
        get() = _currentUser.value?.id

    /** Adopt the identity returned by a fresh login or register. */
    fun adopt(user: MeeshyUser) {
        _currentUser.value = user
    }

    /**
     * Re-hydrates the identity from the gateway on app start. Clears the
     * identity when no token is held; a network failure leaves the current
     * value untouched (offline-tolerant).
     */
    suspend fun refresh() {
        if (!tokenStore.isAuthenticated) {
            _currentUser.value = null
            return
        }
        when (val result = apiCall { authApi.me() }) {
            is NetworkResult.Success -> _currentUser.value = result.data
            is NetworkResult.Failure -> Unit
        }
    }

    /** Drop the identity on logout / account switch. */
    fun clear() {
        _currentUser.value = null
    }
}
