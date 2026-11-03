package me.meeshy.sdk.session

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SwrCacheSource
import me.meeshy.sdk.model.session.UserSessionsPayload
import me.meeshy.sdk.net.NetworkResult

/** Levée quand la revalidation de la liste des appareils échoue ; porte le message de l'API. */
public class UserSessionsSyncException(message: String) : Exception(message)

/**
 * [SwrCacheSource] du relevé des appareils : le snapshot est servi tel quel, et [revalidate] tire [fetch]
 * puis le persiste avec un nouvel instant. Un échec lève et laisse le cache intact.
 */
internal class UserSessionsCacheSource(
    private val store: UserSessionsSnapshotStore,
    private val clock: CacheClock,
    private val fetch: suspend () -> NetworkResult<UserSessionsPayload>,
) : SwrCacheSource<UserSessionsPayload> {

    override fun observe(): Flow<UserSessionsPayload?> = store.observe()

    override fun lastSyncedAt(): Flow<Long?> = store.lastSyncedAt()

    override suspend fun revalidate() {
        when (val result = fetch()) {
            is NetworkResult.Success -> store.save(result.data, clock.nowMillis())
            is NetworkResult.Failure -> throw UserSessionsSyncException(result.error.message)
        }
    }
}
