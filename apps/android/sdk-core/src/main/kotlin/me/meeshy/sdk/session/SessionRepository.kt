package me.meeshy.sdk.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileEditApply
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.SessionTransitionFlags
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
    private val transition: SessionTransitionFlags,
) {
    constructor(authApi: AuthApi, tokenStore: TokenStore) : this(authApi, tokenStore, SessionTransitionFlags())

    /** Horloge de la limite d'une relecture par minute ; remplaçable par les tests. */
    internal var nowMillis: () -> Long = System::currentTimeMillis

    private var lastRevalidatedAtMillis: Long? = null

    private val _currentUser = MutableStateFlow<MeeshyUser?>(null)

    private val _hasResolvedStoredSession = MutableStateFlow(false)

    /**
     * Faux jusqu'à la fin de la restauration, vrai ensuite — succès OU échec définitif, et
     * hors ligne avec une identité en cache (cache-first : l'écran de connexion ne s'affiche
     * jamais sur une simple panne réseau). Une seule transition faux -> vrai par processus.
     */
    val hasResolvedStoredSession: StateFlow<Boolean> = _hasResolvedStoredSession.asStateFlow()

    private val _sessionOrigin = MutableStateFlow<SessionOrigin?>(null)

    /** D'où vient la session ouverte (fête d'arrivée, permission de notification). */
    val sessionOrigin: StateFlow<SessionOrigin?> = _sessionOrigin.asStateFlow()

    /** The signed-in identity, or `null` when no session is active. */
    val currentUser: StateFlow<MeeshyUser?> = _currentUser.asStateFlow()

    val currentUserId: String?
        get() = _currentUser.value?.id

    /**
     * Adopt the identity returned by a fresh login or register. Mirrors the id into
     * [TokenStore.userId] alongside the in-memory publish — the persisted copy is
     * what a cold, widget-triggered process (which never runs this app's normal
     * startup flow) reads back.
     */
    fun adopt(user: MeeshyUser, origin: SessionOrigin = SessionOrigin.LOGIN) {
        if (tokenStore.userId != user.id) transition.bumpGeneration()
        _currentUser.value = user
        tokenStore.userId = user.id
        _sessionOrigin.value = origin
        _hasResolvedStoredSession.value = true
    }

    /**
     * Applies a profile edit onto the signed-in identity for an instant optimistic
     * paint (ARCHITECTURE.md §4). Merges via [ProfileEditApply] so the local result
     * matches the gateway `PATCH /users/me` exactly, then republishes so every
     * surface observing [currentUser] re-renders. Inert when no session is active.
     */
    fun applyProfileEdit(request: UpdateProfileRequest) {
        val current = _currentUser.value ?: return
        _currentUser.value = ProfileEditApply.apply(current, request)
    }

    /**
     * Re-hydrates the identity from the gateway on app start. Clears the
     * identity when no token is held; a network failure leaves the current
     * value untouched (offline-tolerant).
     */
    suspend fun refresh() {
        val generation = transition.generation
        try {
            if (!tokenStore.isAuthenticated) {
                clear()
                return
            }
            lastRevalidatedAtMillis = nowMillis()
            val result = apiCall { authApi.me() }
            if (generation != transition.generation) return
            if (result is NetworkResult.Success) {
                _currentUser.value = result.data.user
                tokenStore.userId = result.data.user.id
                if (_sessionOrigin.value == null) _sessionOrigin.value = SessionOrigin.RESTORED
            }
        } finally {
            _hasResolvedStoredSession.value = true
        }
    }

    /**
     * La relecture du profil au retour au premier plan : au plus UNE par minute, et sans effet
     * hors session.
     */
    suspend fun revalidateIfStale() {
        val last = lastRevalidatedAtMillis
        if (last != null && nowMillis() - last < REVALIDATION_WINDOW_MILLIS) return
        refresh()
    }

    /** Drop the identity on logout / account switch. */
    fun clear() {
        transition.bumpGeneration()
        _currentUser.value = null
        _sessionOrigin.value = null
        tokenStore.userId = null
    }

    private companion object {
        const val REVALIDATION_WINDOW_MILLIS = 60_000L
    }
}
