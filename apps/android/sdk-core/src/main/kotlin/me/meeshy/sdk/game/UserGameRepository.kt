package me.meeshy.sdk.game

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonElement
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.game.GameIntegrationParser
import me.meeshy.sdk.model.game.GamePathSegments
import me.meeshy.sdk.model.game.UserGameProfileResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.GameApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache

/**
 * **Le jeu d'un AUTRE membre** (miroir de `GameUserGameLoader`, iOS) : son niveau et son rang selon SES réglages, le palier
 * de son trésor — et rien d'autre ne voyage. Le client ne devine jamais : ce que la passerelle ne sert pas n'est pas
 * peint, et un badge masqué n'est pas fabriqué.
 *
 * Cache-first, comme la vitrine : [cached] sert le disque sans réseau (l'écran s'y peint avant la lecture). Quand la
 * passerelle a RÉPONDU — refus, blocage, réglage fermé depuis (conformité D-5) —, la copie gardée est oubliée, jamais
 * rouverte depuis le disque : elle ne sert que sur une panne de TRANSPORT. Vidé à la déconnexion.
 */
@Singleton
class UserGameRepository(
    private val api: GameApi,
    private val cache: KeyedJsonCache,
) : PerAccountCache {

    @Inject
    constructor(api: GameApi, dao: KeyedJsonCacheDao, fence: AccountFence) :
        this(api, KeyedJsonCache(dao, SystemCacheClock, fence))

    /** Ce que le disque a gardé de ce membre, `null` quand il n'y a rien à MONTRER. */
    suspend fun cached(userId: String): UserGameProfileResponse? {
        if (!GamePathSegments.isSafe(userId)) return null
        val stored = cache.get(NAMESPACE, userId, JsonElement.serializer())?.value ?: return null
        return GameIntegrationParser.userGame(stored.toString())?.takeIf { it.hasSomethingToShow }
    }

    /**
     * La lecture servie. `null` : rien à montrer — un refus, un compte inconnu, une charge illisible — ou une panne
     * sans copie gardée. Une panne de transport rend la copie du disque ; toute réponse du serveur la remplace ou l'efface.
     */
    suspend fun load(userId: String): UserGameProfileResponse? {
        if (!GamePathSegments.isSafe(userId)) return null
        val ticket = cache.ticket()
        return when (val result = apiCall { api.userGame(userId) }) {
            is NetworkResult.Success -> {
                val payload = result.data
                val parsed = GameIntegrationParser.userGame(payload.toString())
                if (parsed == null) {
                    cache.clear(NAMESPACE, userId)
                    null
                } else {
                    cache.put(NAMESPACE, userId, payload, JsonElement.serializer(), ticket)
                    parsed.takeIf { it.hasSomethingToShow }
                }
            }
            is NetworkResult.Failure ->
                if (result.error.code == OFFLINE_CODE) {
                    cached(userId)
                } else {
                    cache.clear(NAMESPACE, userId)
                    null
                }
        }
    }

    override suspend fun clear() = cache.clearNamespace(NAMESPACE)

    private companion object {
        const val NAMESPACE = "user-game"
        const val OFFLINE_CODE = "NETWORK"
    }
}
