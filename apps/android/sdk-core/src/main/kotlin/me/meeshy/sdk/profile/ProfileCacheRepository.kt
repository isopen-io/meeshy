package me.meeshy.sdk.profile

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.repainted

/**
 * Le cache disque des fiches (`profile_card:*`), clé par identifiant ET par pseudo : ouvrir
 * `@pseudo` puis l'id (ou l'inverse) retombe sur la même fiche. Une charge illisible est un manque
 * de cache, jamais un plantage ; toute écriture est idempotente (même clé, même ligne).
 */
@Singleton
class ProfileCacheRepository(private val cache: KeyedJsonCache) {

    @Inject
    constructor(dao: KeyedJsonCacheDao) : this(KeyedJsonCache(dao))

    /** La fiche gardée sous [key] (id ou pseudo), `null` à froid ou si la charge ne se lit plus. */
    suspend fun cachedProfile(key: String): MeeshyUser? =
        cache.get(NAMESPACE, normalize(key), MeeshyUser.serializer())?.value

    /** Range [user] sous son id, son pseudo et la clé [lookupKey] avec laquelle on l'a demandé. */
    suspend fun store(user: MeeshyUser, lookupKey: String) {
        keysOf(user, lookupKey).forEach { cache.put(NAMESPACE, it, user, MeeshyUser.serializer()) }
    }

    /** Une fiche qui n'est plus servie (bloqué par la cible) ne laisse aucune ligne, sous aucune clé. */
    suspend fun purge(user: ProfileSheetUser, lookupKey: String) {
        listOfNotNull(user.userId, user.username, lookupKey)
            .map(::normalize)
            .distinct()
            .forEach { cache.clear(NAMESPACE, it) }
    }

    suspend fun purge(user: MeeshyUser, lookupKey: String) {
        keysOf(user, lookupKey).forEach { cache.clear(NAMESPACE, it) }
    }

    /** `user:updated` : repeint chaque ligne de ce compte sans toucher à l'instant de lecture. */
    suspend fun repaint(event: UserUpdatedEvent): Int =
        try {
            cache.updateAll(NAMESPACE, MeeshyUser.serializer()) { event.repainted(it) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            0
        }

    suspend fun clearAll() = cache.clearNamespace(NAMESPACE)

    private fun keysOf(user: MeeshyUser, lookupKey: String): List<String> =
        listOf(user.id, user.username, lookupKey).filter { it.isNotBlank() }.map(::normalize).distinct()

    private fun normalize(key: String): String =
        if (ProfileSheetUser.from(key).userId != null) key else key.removePrefix("@").lowercase()

    companion object {
        const val NAMESPACE: String = "profile_card"
    }
}
