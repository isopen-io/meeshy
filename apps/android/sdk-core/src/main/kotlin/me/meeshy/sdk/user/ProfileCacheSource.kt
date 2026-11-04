package me.meeshy.sdk.user

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.store.RoomCacheStore
import me.meeshy.sdk.cache.store.swrFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite
import kotlinx.coroutines.flow.Flow

/**
 * Profils d'autres utilisateurs sur le CacheStore generique (iOS `CachePolicy.userProfiles` : 30 j, 5 min de
 * fraicheur, 100 profils). Une seule liste, du plus ancien au plus recent (l'ordre du store) : son plafond de 100 evince
 * donc le profil le moins recemment vu, et revoir un profil le replace en queue (prolongation a chaque visite).
 *
 * Presence (loi 2026-08-25) : `isOnline` / `lastActiveAt` ne sont NI ranges NI restitues — le serveur peut les
 * retirer sans que rien ne le dise. Absente = aucun point d'avatar ; elle ne vient que d'une reponse fraiche.
 */
class ProfileCacheSource(
    private val store: RoomCacheStore<MeeshyUser>,
    private val fence: AccountFence? = null,
) {
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    /** La fiche gardee sous son id OU son pseudo ; `null` a froid. */
    suspend fun cached(lookup: String): MeeshyUser? =
        store.loadIgnoringExpiry(KEY)?.items?.let { find(it, lookup) }

    suspend fun remember(user: MeeshyUser, ticket: AccountTicket?) {
        fence.commitOrWrite(ticket) {
            val kept = user.withoutServedPresence()
            val others = store.loadIgnoringExpiry(KEY)?.items.orEmpty().filterNot { it.id == user.id }
            store.saveFetched(others + kept, KEY)
        }
    }

    suspend fun forget(userId: String) {
        val rest = store.loadIgnoringExpiry(KEY)?.items.orEmpty().filterNot { it.id == userId }
        store.savePreservingFreshness(rest, KEY)
    }

    fun results(lookup: String, fetch: suspend () -> MeeshyUser): Flow<CacheResult<MeeshyUser>> =
        store.swrFlow(KEY, select = { find(it, lookup) }, revalidate = {
            val ticket = ticket()
            remember(fetch(), ticket)
        })

    private fun find(rows: List<MeeshyUser>, lookup: String): MeeshyUser? {
        val wanted = lookup.removePrefix("@").lowercase()
        return rows.firstOrNull { it.id == lookup || it.username.lowercase() == wanted }?.withoutServedPresence()
    }

    private fun MeeshyUser.withoutServedPresence(): MeeshyUser =
        if (isOnline == null && lastActiveAt == null) this else copy(isOnline = null, lastActiveAt = null)

    companion object {
        const val NAMESPACE: String = "user_profiles"
        internal const val KEY: String = "recent"
    }
}
