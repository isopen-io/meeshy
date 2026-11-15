package me.meeshy.sdk.session

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.cacheFirstFlowOf
import me.meeshy.sdk.model.session.SessionsListReducer
import me.meeshy.sdk.model.session.UserSessionsPayload
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les appareils connectés, cache-first (clé `sessions:list`) : le dernier relevé durable est servi
 * aussitôt, hors ligne compris, puis revalidé en silence ; une panne ne l'efface jamais et remonte par
 * [syncFailure] (bannière). Miroir de `SessionService` / `ActiveSessionsViewModel` (iOS).
 *
 * Une révocation retire la ligne tout de suite, persiste le nouvel état, et la remet à son index si la
 * passerelle refuse. La session courante n'est jamais révocable par ce chemin.
 */
@Singleton
public class UserSessionsRepository @Inject constructor(
    private val api: AuthApi,
    private val store: UserSessionsSnapshotStore,
    private val clock: CacheClock,
) {
    private val failure = MutableStateFlow<String?>(null)
    private val writes = Mutex()

    /** Le message du dernier échec de revalidation, nul dès qu'une revalidation réussit. */
    public val syncFailure: StateFlow<String?> = failure.asStateFlow()

    public fun stream(policy: CachePolicy = CachePolicy.Sessions): Flow<CacheResult<UserSessionsPayload>> =
        cacheFirstFlowOf(
            policy = policy,
            snapshots = store.snapshot(),
            revalidate = {
                source().revalidate()
                failure.value = null
            },
            clock = clock,
            onRevalidateError = { failure.value = it.message ?: "sync failed" },
        )

    /** Rafraîchissement explicite (tirer pour rafraîchir). Lève en cas d'échec ; le cache reste. */
    public suspend fun refresh() {
        try {
            source().revalidate()
            failure.value = null
        } catch (e: UserSessionsSyncException) {
            failure.value = e.message
            throw e
        }
    }

    public suspend fun revoke(sessionId: String): NetworkResult<Unit> = writes.withLock {
        val current = store.observe().first() ?: return@withLock refusal("sessions not loaded")
        val outcome = SessionsListReducer.revoke(current.sessions, sessionId)
        if (outcome.removed.isEmpty()) return@withLock refusal("session cannot be revoked")
        persist(current, outcome.sessions)
        val result = apiCallUnit { api.revokeSession(sessionId) }
        if (result is NetworkResult.Failure) rollback(outcome.removed)
        result
    }

    public suspend fun revokeOthers(): NetworkResult<Unit> = writes.withLock {
        val current = store.observe().first() ?: return@withLock refusal("sessions not loaded")
        val outcome = SessionsListReducer.revokeOthers(current.sessions)
        persist(current, outcome.sessions)
        val result = apiCallUnit { api.revokeOtherSessions() }
        if (result is NetworkResult.Failure) rollback(outcome.removed)
        result
    }

    private suspend fun rollback(removed: List<SessionsListReducer.Removed>) {
        val now = store.observe().first() ?: return
        persist(now, SessionsListReducer.restore(now.sessions, removed))
    }

    private suspend fun persist(base: UserSessionsPayload, sessions: List<me.meeshy.sdk.model.session.UserSession>) {
        val stamp = store.lastSyncedAt().first() ?: clock.nowMillis()
        store.save(base.copy(sessions = sessions, totalCount = sessions.size), stamp)
    }

    private fun refusal(message: String): NetworkResult<Unit> = NetworkResult.Failure(ApiError(message = message))

    private fun source() = UserSessionsCacheSource(store, clock) { apiCall { api.listSessions() } }
}
