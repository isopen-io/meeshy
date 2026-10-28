package me.meeshy.sdk.game

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonElement
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.KeyedJsonCacheSource
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.game.GameIntegrationParser
import me.meeshy.sdk.model.game.GamePrivacyRequest
import me.meeshy.sdk.model.game.DuoInviteRequest
import me.meeshy.sdk.model.game.DuoInviteResponse
import me.meeshy.sdk.model.game.DuoStatusResponse
import me.meeshy.sdk.model.game.GamePathSegments
import me.meeshy.sdk.model.game.GamePrivacyResponse
import me.meeshy.sdk.model.game.GameWriteRequest
import me.meeshy.sdk.model.game.LeaguePseudonymRequest
import me.meeshy.sdk.model.game.LeaguePseudonymResponse
import me.meeshy.sdk.model.game.ShowcaseOrderRequest
import me.meeshy.sdk.model.game.ShowcaseOrderResponse
import me.meeshy.sdk.model.game.GameSettingsResponse
import me.meeshy.sdk.model.game.GameWave2Parser
import me.meeshy.sdk.model.game.LeagueConsentRequest
import me.meeshy.sdk.model.game.LeagueConsentResponse
import me.meeshy.sdk.model.game.LeagueFriendsResponse
import me.meeshy.sdk.model.game.LeagueWeekResponse
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibilityRequest
import me.meeshy.sdk.model.game.ShowcaseVisibilityResponse
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.GameApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.AccountFence

/**
 * Le sort d'une écriture : prise en compte par le serveur, ou refusée. [Refused.code] est le code de la passerelle
 * (jamais affiché : `GameErrorMessages` le met en phrase) ; [Refused.offline] dit que RIEN n'est parti.
 */
sealed interface GameWriteOutcome<out T> {
    data class Done<T>(val value: T) : GameWriteOutcome<T>
    data class Refused(val code: String?, val offline: Boolean) : GameWriteOutcome<Nothing>
}

/**
 * Les lectures des pages du jeu — port de `GameWave2Model` (iOS), partie lecture : le classement de MA semaine, la
 * ligue Amis et les réglages du jeu, plus les trois écritures qui ne touchent à aucun solde (le consentement à la ligue
 * publique, « Jeu masqué », et la fermeture des quatre visibilités qui l'accompagne).
 *
 * **Cache-first, gardé BRUT.** Chaque lecture sert le disque d'abord (`Fresh`, `Stale`, `Syncing`), `Empty` seulement à
 * froid ; un échec réseau garde ce qui est peint. Le cache garde la charge du serveur clé pour clé, et une charge
 * illisible n'y entre jamais. Le client ne classe, ne place et ne compte rien : il rend ce que la passerelle sert.
 *
 * **Conformité A-9.** Les pseudonymes et les totaux des AUTRES membres d'une ligue ne restent pas sur l'appareil de qui
 * n'y joue plus : [forgetLeagueWeek] à la sortie, et tout est vidé à la déconnexion ([PerAccountCache]).
 */
@Singleton
class GamePagesRepository(
    private val api: GameApi,
    private val cache: KeyedJsonCache,
    private val clock: CacheClock,
) : PerAccountCache {

    @Inject
    constructor(api: GameApi, dao: KeyedJsonCacheDao, fence: AccountFence) :
        this(api, KeyedJsonCache(dao, fence = fence), SystemCacheClock)

    fun leagueWeek(onSyncError: (Throwable) -> Unit = {}): Flow<CacheResult<LeagueWeekResponse>> =
        weekSource().results(CachePolicy.UserStats, clock, onSyncError).readAs(GameWave2Parser::leagueWeek)

    suspend fun refreshLeagueWeek() = weekSource().revalidate()

    fun friendsLeague(onSyncError: (Throwable) -> Unit = {}): Flow<CacheResult<LeagueFriendsResponse>> =
        friendsSource().results(CachePolicy.UserStats, clock, onSyncError).readAs(GameWave2Parser::leagueFriends)

    suspend fun refreshFriendsLeague() = friendsSource().revalidate()

    fun settings(onSyncError: (Throwable) -> Unit = {}): Flow<CacheResult<GameSettingsResponse>> =
        settingsSource().results(CachePolicy.Preferences, clock, onSyncError).readAs(GameIntegrationParser::settings)

    suspend fun refreshSettings() = settingsSource().revalidate()

    /** Quitter la ligue retire le classement du disque (A-9) ; la prochaine lecture repart du réseau. */
    suspend fun forgetLeagueWeek() = cache.clear(NAMESPACE, WEEK_KEY)

    /**
     * Consentir à la ligue publique, ou retirer son accord. [requestId] naît UNE fois par intention : rejouer une
     * écriture rend son résultat, jamais une seconde écriture. `null` : la charge n'est pas lisible.
     */
    suspend fun setLeagueConsent(requestId: String, consent: Boolean): GameWriteOutcome<LeagueConsentResponse> =
        write(GameWave2Parser::consent) { api.setLeagueConsent(LeagueConsentRequest(requestId, consent)) }

    /** « Jeu masqué » et l'opposition à la ligue Amis : au moins un des deux interrupteurs. */
    suspend fun setPrivacy(
        requestId: String,
        gameHidden: Boolean? = null,
        friendsLeagueOptOut: Boolean? = null,
    ): GameWriteOutcome<GamePrivacyResponse> =
        write(GameWave2Parser::privacy) { api.setPrivacy(GamePrivacyRequest(requestId, gameHidden, friendsLeagueOptOut)) }

    /** Les quatre visibilités à « moi seul » — ce que « Jeu masqué » ferme et que réafficher ne rouvre pas. */
    suspend fun closeVisibility(requestId: String): GameWriteOutcome<ShowcaseVisibilityResponse> {
        val me = ShowcaseVisibility.Me
        return write(GameWave2Parser::showcaseVisibility) {
            api.setVisibility(ShowcaseVisibilityRequest(requestId, showcase = me, rank = me, treasury = me, atlas = me))
        }
    }

    /**
     * Les écritures de la vague 2 qui ne touchent AUCUN solde : ranger la vitrine, régler une visibilité, le nom de joute et
     * l'alliance. Chacune porte son [requestId] (né une fois par intention chez l'appelant, rejoué tel quel sur un
     * réessai) ; la passerelle reste maîtresse et la réponse rendue est la sienne, jamais une valeur devinée ici.
     */
    suspend fun setShowcaseOrder(requestId: String, order: List<String>): GameWriteOutcome<ShowcaseOrderResponse> =
        write(GameWave2Parser::showcaseOrder) { api.setShowcaseOrder(ShowcaseOrderRequest(requestId, order)) }

    /** UNE facette de « qui voit quoi » : les trois autres restent absentes de la requête. */
    suspend fun setVisibility(request: ShowcaseVisibilityRequest): GameWriteOutcome<ShowcaseVisibilityResponse> =
        write(GameWave2Parser::showcaseVisibility) { api.setVisibility(request) }

    suspend fun setLeaguePseudonym(requestId: String, pseudonym: String): GameWriteOutcome<LeaguePseudonymResponse> =
        write(GameWave2Parser::pseudonym) { api.setLeaguePseudonym(LeaguePseudonymRequest(requestId, pseudonym)) }

    suspend fun inviteToDuo(requestId: String, friendId: String): GameWriteOutcome<DuoInviteResponse> {
        if (!GamePathSegments.isSafe(friendId)) return unsent()
        return write(GameWave2Parser::duoInvite) { api.inviteToDuo(DuoInviteRequest(requestId, friendId)) }
    }

    suspend fun acceptDuo(requestId: String, duoId: String): GameWriteOutcome<DuoStatusResponse> {
        if (!GamePathSegments.isSafe(duoId)) return unsent()
        return write(GameWave2Parser::duoStatus) { api.acceptDuo(duoId, GameWriteRequest(requestId)) }
    }

    /** Décliner, annuler ou quitter : un seul geste. */
    suspend fun abandonDuo(requestId: String, duoId: String): GameWriteOutcome<DuoStatusResponse> {
        if (!GamePathSegments.isSafe(duoId)) return unsent()
        return write(GameWave2Parser::duoStatus) { api.abandonDuo(duoId, GameWriteRequest(requestId)) }
    }

    /** Un identifiant que le client ne sait pas mettre dans un chemin : rien ne part, et ce n'est pas une coupure. */
    private fun unsent(): GameWriteOutcome<Nothing> = GameWriteOutcome.Refused(code = null, offline = false)

    private suspend fun <T : Any> write(parse: (String?) -> T?, send: suspend () -> ApiResponse<JsonElement>): GameWriteOutcome<T> =
        when (val result = apiCall(send)) {
            is NetworkResult.Success -> parse(result.data.toString())?.let { GameWriteOutcome.Done(it) }
                ?: GameWriteOutcome.Refused(code = null, offline = false)
            is NetworkResult.Failure -> GameWriteOutcome.Refused(
                code = result.error.code,
                offline = result.error.code == OFFLINE_CODE,
            )
        }

    override suspend fun clear() = cache.clearNamespace(NAMESPACE)

    private fun weekSource() = source(WEEK_KEY, { api.leagueWeek().data }) { GameWave2Parser.leagueWeek(it) != null }

    private fun friendsSource() = source(FRIENDS_KEY, { api.leagueFriends().data }) { GameWave2Parser.leagueFriends(it) != null }

    private fun settingsSource() = source(SETTINGS_KEY, { api.settings().data }) { GameIntegrationParser.settings(it) != null }

    private fun source(
        key: String,
        fetch: suspend () -> JsonElement?,
        readable: (String) -> Boolean,
    ) = KeyedJsonCacheSource(cache, NAMESPACE, key, JsonElement.serializer()) {
        val payload = fetch() ?: throw UnreadableGamePayloadException()
        if (!readable(payload.toString())) throw UnreadableGamePayloadException()
        payload
    }

    /** Une charge que le cache gardait avant une évolution du modèle et qui ne se relit plus vaut « froid ». */
    private fun <T : Any> Flow<CacheResult<JsonElement>>.readAs(parse: (String?) -> T?): Flow<CacheResult<T>> =
        map { result ->
            when (result) {
                is CacheResult.Fresh -> parse(result.value.toString())?.let { CacheResult.Fresh(it, result.ageMillis) } ?: CacheResult.Empty
                is CacheResult.Stale -> parse(result.value.toString())?.let { CacheResult.Stale(it, result.ageMillis) } ?: CacheResult.Empty
                is CacheResult.Syncing -> CacheResult.Syncing(result.value?.let { parse(it.toString()) })
                CacheResult.Empty -> CacheResult.Empty
            }
        }.flowOn(Dispatchers.Default)

    /** La passerelle a répondu, mais la charge n'est pas lisible : rien n'est gardé. */
    class UnreadableGamePayloadException : RuntimeException("game payload unreadable")

    private companion object {
        const val NAMESPACE = "game-pages"
        const val WEEK_KEY = "league-week"
        const val FRIENDS_KEY = "league-friends"
        const val SETTINGS_KEY = "settings"
        const val OFFLINE_CODE = "NETWORK"
    }
}
