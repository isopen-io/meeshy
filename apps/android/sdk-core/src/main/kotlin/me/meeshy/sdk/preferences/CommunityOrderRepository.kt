package me.meeshy.sdk.preferences

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.preferences.communityReorderOf
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommunityPreferencesApi
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Envoie l'ordre complet des communautés (`POST /user-preferences/communities/reorder`). Hors ligne,
 * le dernier ordre est retenu et part avec le prochain appel ; un refus de la passerelle ne retient rien.
 */
@Singleton
public class CommunityOrderRepository @Inject constructor(
    private val api: CommunityPreferencesApi,
) {
    private val lock = Mutex()
    private var held: List<String>? = null

    public suspend fun reorder(orderedIds: List<String>): ReorderOutcome = send(orderedIds)

    /** Rejoue l'ordre retenu hors ligne ; sans effet quand rien n'est retenu. */
    public suspend fun flushPending(): ReorderOutcome? = lock.withLock { held }?.let { send(it) }

    private suspend fun send(orderedIds: List<String>): ReorderOutcome = lock.withLock {
        if (orderedIds.isEmpty()) return@withLock ReorderOutcome.Sent
        when (val result = apiCallUnit { api.reorder(communityReorderOf(orderedIds)) }) {
            is NetworkResult.Success -> {
                held = null
                ReorderOutcome.Sent
            }
            is NetworkResult.Failure ->
                if (result.error.code == NETWORK_CODE) {
                    held = orderedIds
                    ReorderOutcome.Queued
                } else {
                    held = null
                    ReorderOutcome.Rejected(result.error.message)
                }
        }
    }

    private companion object {
        const val NETWORK_CODE = "NETWORK"
    }
}
