package me.meeshy.sdk.world

import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.world.LinkMembershipRequest
import me.meeshy.sdk.model.world.WorldEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.WorldApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.AnonymousSessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * L'entrée World Wide (miroir de `WorldService`, iOS) : lire l'entrée servie par `GET /world`, puis faire
 * entrer un invité par la porte canonique des liens. La session qui en sort est posée comme toute session
 * invitée — jeton installé, contexte durable — et seulement quand la réponse forme une vraie session.
 */
@Singleton
class WorldEntryRepository @Inject constructor(
    private val api: WorldApi,
    private val sessions: AnonymousSessionRepository,
) {
    suspend fun entry(): NetworkResult<WorldEntry> = apiCall { api.entry() }

    suspend fun joinAsGuest(key: String, nickname: String, language: String): NetworkResult<AnonymousSessionContext> =
        when (val result = apiCall { api.joinAsGuest(key, LinkMembershipRequest(nickname = nickname, language = language)) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val context = result.data.toSessionContext(linkKey = key)
                    ?: return NetworkResult.Failure(ApiError(message = "Malformed guest membership response", code = "PARSE"))
                sessions.adopt(context)
                NetworkResult.Success(context)
            }
        }
}
