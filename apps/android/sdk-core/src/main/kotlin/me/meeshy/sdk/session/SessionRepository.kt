package me.meeshy.sdk.session

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileEditApply
import me.meeshy.sdk.model.ProfileSnapshot
import me.meeshy.sdk.model.ServedProfileDecor
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
    private val pendingProfileEdits: PendingProfileEdits = PendingProfileEdits.NONE,
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
     * Rétablit le cliché d'avant une édition abandonnée (retour arrière de l'optimisme). Sans effet
     * hors session ou si [snapshot] est celui d'un autre compte.
     */
    fun restoreProfileSnapshot(snapshot: MeeshyUser) {
        val current = _currentUser.value ?: return
        if (current.id != snapshot.id) return
        _currentUser.value = snapshot
    }

    /**
     * Adopte la réponse du serveur à une mutation de MON profil en la FUSIONNANT sur l'identité
     * locale ([ProfileSnapshot.mergingServerUser] : voicePublic, décor et activation survivent), puis
     * réapplique les éditions encore en attente — sauf [deliveredCmid], celle qui vient de partir —
     * pour qu'une confirmation ne remplace jamais un état optimiste plus récent. Sans effet hors
     * session, pour un autre compte, ou si la session a changé pendant la lecture de la file.
     */
    suspend fun adoptMerging(server: MeeshyUser, deliveredCmid: String? = null) {
        val generation = transition.generation
        if (_currentUser.value?.id != server.id) return
        val pending = pendingEditsFor(server.id, deliveredCmid)
        if (generation != transition.generation) return
        val current = _currentUser.value ?: return
        if (current.id != server.id) return
        _currentUser.value = ProfileSnapshot.resolveServerUserWithOptimistic(
            ProfileSnapshot.mergingServerUser(server, current),
            pending,
        )
    }

    private suspend fun pendingEditsFor(userId: String, excludingCmid: String? = null): List<UpdateProfileRequest> = try {
        pendingProfileEdits.pendingFor(userId, excludingCmid)
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        emptyList()
    }

    /**
     * Publie le décor de profil de SOI (fusion : aucun autre champ de [MeeshyUser] ne bouge) pour
     * que chaque surface qui observe [currentUser] se repeigne au toucher. Sans effet hors session.
     */
    fun applyProfileDecor(decor: ServedProfileDecor) {
        val current = _currentUser.value ?: return
        _currentUser.value = current.copy(profileDecor = decor)
    }

    /**
     * Re-hydrates the identity from the gateway on app start. Clears the
     * identity when no token is held; a network failure leaves the current
     * value untouched (offline-tolerant). The server answer is merged onto the
     * local identity and every profile edit still pending in the outbox is
     * re-applied on top — a restart before confirmation never loses an edit.
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
                val server = result.data.user
                val pending = pendingEditsFor(server.id)
                if (generation != transition.generation) return
                _currentUser.value = ProfileSnapshot.resolveServerUserWithOptimistic(
                    ProfileSnapshot.mergingServerUser(server, _currentUser.value),
                    pending,
                )
                tokenStore.userId = server.id
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
