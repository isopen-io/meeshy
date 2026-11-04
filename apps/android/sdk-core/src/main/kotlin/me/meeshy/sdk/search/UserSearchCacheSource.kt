package me.meeshy.sdk.search

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.store.RoomCacheStore
import me.meeshy.sdk.cache.store.swrFlow
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite

/**
 * Recherche d'utilisateurs rejouable hors ligne : les resultats de chaque requete sont ranges sous la requete
 * normalisee (casse et espaces ignores) sur le CacheStore generique, et relus tels quels quand le reseau manque.
 *
 * Presence (loi 2026-08-25) : `isOnline` / `lastActiveAt` ne sont NI ranges NI restitues — une ligne rejouee
 * ne porte jamais de point d'avatar que le serveur n'a pas servi a l'instant.
 */
class UserSearchCacheSource(
    private val store: RoomCacheStore<UserSearchResult>,
    private val fence: AccountFence? = null,
) {
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    suspend fun cached(query: String): List<UserSearchResult>? {
        val key = keyOf(query) ?: return null
        return store.loadIgnoringExpiry(key)?.items?.map { it.withoutServedPresence() }
    }

    suspend fun remember(query: String, results: List<UserSearchResult>, ticket: AccountTicket?) {
        val key = keyOf(query) ?: return
        fence.commitOrWrite(ticket) {
            store.saveFetched(results.distinctBy { it.id }.map { it.withoutServedPresence() }, key)
        }
    }

    fun results(query: String, fetch: suspend () -> List<UserSearchResult>): Flow<CacheResult<List<UserSearchResult>>> {
        val key = keyOf(query) ?: return kotlinx.coroutines.flow.flowOf(CacheResult.Empty)
        return store.swrFlow(key, select = { rows -> rows.map { it.withoutServedPresence() } }, revalidate = {
            val ticket = ticket()
            remember(query, fetch(), ticket)
        })
    }

    private fun keyOf(query: String): String? = query.trim().lowercase().takeIf { it.isNotEmpty() }

    private fun UserSearchResult.withoutServedPresence(): UserSearchResult =
        if (isOnline == null && lastActiveAt == null) this else copy(isOnline = null, lastActiveAt = null)

    companion object {
        const val NAMESPACE: String = "user_search"
    }
}
