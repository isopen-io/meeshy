package me.meeshy.sdk.game

import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.ChestClaimResponse
import me.meeshy.sdk.model.game.DuoInviteRequest
import me.meeshy.sdk.model.game.DuoInviteResponse
import me.meeshy.sdk.model.game.DuoStatusResponse
import me.meeshy.sdk.model.game.FlameFreezeResponse
import me.meeshy.sdk.model.game.FlameRelightResponse
import me.meeshy.sdk.model.game.GameArchiveParser
import me.meeshy.sdk.model.game.GameIntegrationParser
import me.meeshy.sdk.model.game.GameLeagueWeekArchive
import me.meeshy.sdk.model.game.GamePathSegments
import me.meeshy.sdk.model.game.GamePrivacyRequest
import me.meeshy.sdk.model.game.GamePrivacyResponse
import me.meeshy.sdk.model.game.GameSeasonArchive
import me.meeshy.sdk.model.game.GameSettingsResponse
import me.meeshy.sdk.model.game.GameWave2Parser
import me.meeshy.sdk.model.game.GameWriteParser
import me.meeshy.sdk.model.game.GameWriteRequest
import me.meeshy.sdk.model.game.GuideSeenRequest
import me.meeshy.sdk.model.game.GuideSeenResponse
import me.meeshy.sdk.model.game.LeagueConsentRequest
import me.meeshy.sdk.model.game.LeagueConsentResponse
import me.meeshy.sdk.model.game.LeagueFriendsResponse
import me.meeshy.sdk.model.game.LeaguePseudonymRequest
import me.meeshy.sdk.model.game.LeaguePseudonymResponse
import me.meeshy.sdk.model.game.LeagueWeekResponse
import me.meeshy.sdk.model.game.MissionRerollResponse
import me.meeshy.sdk.model.game.PrestigeResponse
import me.meeshy.sdk.model.game.SeasonClaimResponse
import me.meeshy.sdk.model.game.SeasonSealResponse
import me.meeshy.sdk.model.game.ShowcaseOrderRequest
import me.meeshy.sdk.model.game.ShowcaseOrderResponse
import me.meeshy.sdk.model.game.ShowcaseVisibilityRequest
import me.meeshy.sdk.model.game.ShowcaseVisibilityResponse
import me.meeshy.sdk.model.game.UserGameProfileResponse
import me.meeshy.sdk.model.game.UserShowcaseResponse
import me.meeshy.sdk.net.api.GameApi
import retrofit2.HttpException
import retrofit2.Response

/**
 * Le service du jeu : les quatre contrats ([GameServiceProviding], [GameWave2ServiceProviding],
 * [GameIntegrationServiceProviding], [GameArchiveServiceProviding]) sur [GameApi]. Port de `GameService` (iOS).
 *
 * **Rien n'est mis en file.** Une coupure rend [GameServiceResult.Offline] et le geste ne part pas. **Un refus 409 se lit
 * depuis le corps brut** ([GameRefusalMapper]) ; un code inconnu ou un 5xx est un [GameServiceResult.Failed], jamais un
 * refus. **Les routes opt-in** (vague 2, intégration, archives) rendent [GameServiceResult.Unavailable] sur un 404 : la
 * fonction se masque au lieu de lever. Une charge lisible à moitié ne fait pas échouer une écriture déjà faite : les
 * lecteurs de `:core:model` sont tolérants.
 */
@Singleton
class DefaultGameService @Inject constructor(
    private val api: GameApi,
) : GameServiceProviding, GameWave2ServiceProviding, GameIntegrationServiceProviding, GameArchiveServiceProviding {

    // --- Lot 1 : les cinq écritures (routes servies depuis le premier lot, jamais opt-in) ---

    override suspend fun rerollMission(missionId: String, requestId: String): GameServiceResult<MissionRerollResponse> =
        safePath(missionId) { call(GameWriteParser::rerollMission) { api.rerollMission(missionId, GameWriteRequest(requestId)) } }

    override suspend fun claimChest(requestId: String): GameServiceResult<ChestClaimResponse> =
        call(GameWriteParser::claimChest) { api.claimChest(GameWriteRequest(requestId)) }

    override suspend fun buyFlameFreeze(requestId: String): GameServiceResult<FlameFreezeResponse> =
        call(GameWriteParser::buyFlameFreeze) { api.buyFlameFreeze(GameWriteRequest(requestId)) }

    override suspend fun relightFlame(requestId: String): GameServiceResult<FlameRelightResponse> =
        call(GameWriteParser::relightFlame) { api.relightFlame(GameWriteRequest(requestId)) }

    override suspend fun markGuideSeen(keys: List<String>, requestId: String): GameServiceResult<GuideSeenResponse> =
        call(GameWriteParser::markGuideSeen) { api.markGuideSeen(GuideSeenRequest(requestId, keys)) }

    // --- Vague 2 : opt-in ---

    override suspend fun setLeagueConsent(
        consent: Boolean,
        pseudonym: String?,
        requestId: String,
    ): GameServiceResult<LeagueConsentResponse> =
        call(GameWave2Parser::consent, optIn = true) { api.setLeagueConsent(LeagueConsentRequest(requestId, consent, pseudonym)) }

    override suspend fun setLeaguePseudonym(pseudonym: String, requestId: String): GameServiceResult<LeaguePseudonymResponse> =
        call(GameWave2Parser::pseudonym, optIn = true) { api.setLeaguePseudonym(LeaguePseudonymRequest(requestId, pseudonym)) }

    override suspend fun fetchLeagueWeek(): GameServiceResult<LeagueWeekResponse> =
        call(GameWave2Parser::leagueWeek, optIn = true) { api.leagueWeek() }

    override suspend fun fetchFriendsLeague(): GameServiceResult<LeagueFriendsResponse> =
        call(GameWave2Parser::leagueFriends, optIn = true) { api.leagueFriends() }

    override suspend fun inviteToDuo(friendId: String, requestId: String): GameServiceResult<DuoInviteResponse> =
        safePath(friendId) { call(GameWave2Parser::duoInvite, optIn = true) { api.inviteToDuo(DuoInviteRequest(requestId, friendId)) } }

    override suspend fun acceptDuo(duoId: String, requestId: String): GameServiceResult<DuoStatusResponse> =
        safePath(duoId) { call(GameWave2Parser::duoStatus, optIn = true) { api.acceptDuo(duoId, GameWriteRequest(requestId)) } }

    override suspend fun abandonDuo(duoId: String, requestId: String): GameServiceResult<DuoStatusResponse> =
        safePath(duoId) { call(GameWave2Parser::duoStatus, optIn = true) { api.abandonDuo(duoId, GameWriteRequest(requestId)) } }

    override suspend fun claimSeasonStep(step: Int, requestId: String): GameServiceResult<SeasonClaimResponse> =
        call(GameWave2Parser::seasonClaim, optIn = true) { api.claimSeasonStep(step, GameWriteRequest(requestId)) }

    override suspend fun buySeasonSeal(requestId: String): GameServiceResult<SeasonSealResponse> =
        call(GameWave2Parser::seasonSeal, optIn = true) { api.buySeasonSeal(GameWriteRequest(requestId)) }

    override suspend fun setShowcaseOrder(order: List<String>, requestId: String): GameServiceResult<ShowcaseOrderResponse> =
        call(GameWave2Parser::showcaseOrder, optIn = true) { api.setShowcaseOrder(ShowcaseOrderRequest(requestId, order)) }

    override suspend fun setVisibility(request: ShowcaseVisibilityRequest): GameServiceResult<ShowcaseVisibilityResponse> =
        call(GameWave2Parser::showcaseVisibility, optIn = true) { api.setVisibility(request) }

    override suspend fun fetchUserShowcase(userId: String): GameServiceResult<UserShowcaseResponse> =
        safePath(userId) { rawCall(GameWave2Parser::userShowcase, optIn = true) { api.userShowcase(userId) } }

    override suspend fun passPrestige(requestId: String): GameServiceResult<PrestigeResponse> =
        call(GameWave2Parser::prestige, optIn = true) { api.passPrestige(GameWriteRequest(requestId)) }

    override suspend fun setPrivacy(
        gameHidden: Boolean?,
        friendsLeagueOptOut: Boolean?,
        requestId: String,
    ): GameServiceResult<GamePrivacyResponse> =
        call(GameWave2Parser::privacy, optIn = true) { api.setPrivacy(GamePrivacyRequest(requestId, gameHidden, friendsLeagueOptOut)) }

    // --- Intégration ---

    override suspend fun fetchSettings(): GameServiceResult<GameSettingsResponse> =
        call(GameIntegrationParser::settings, optIn = true) { api.settings() }

    override suspend fun fetchUserGame(userId: String): GameServiceResult<UserGameProfileResponse> =
        safePath(userId) { call(GameIntegrationParser::userGame, optIn = true) { api.userGame(userId) } }

    // --- Archives ---

    override suspend fun fetchSeasonArchive(number: Int): GameServiceResult<GameSeasonArchive> =
        call(GameArchiveParser::season, optIn = true) { api.seasonArchive(number) }

    override suspend fun fetchLeagueWeekArchive(weekKey: String): GameServiceResult<GameLeagueWeekArchive> =
        safePath(weekKey) { call(GameArchiveParser::leagueWeek, optIn = true) { api.leagueWeekArchive(weekKey) } }

    override suspend fun fetchSeasonCalendar(ifNoneMatch: String?): GameServiceResult<GameSeasonCalendarRead> =
        try {
            val response = api.seasonCalendar(ifNoneMatch)
            val payload = response.body()?.takeIf { it.success }?.data
            when {
                response.code() == NOT_MODIFIED -> GameServiceResult.Done(GameSeasonCalendarRead.NotModified)
                response.isSuccessful && payload != null ->
                    GameServiceResult.Done(GameSeasonCalendarRead.Fresh(payload, response.headers()["ETag"]))
                response.isSuccessful -> GameServiceResult.Failed(null)
                else -> failure(response.code(), GameRefusalMapper.refusal(response), optIn = true)
            }
        } catch (e: HttpException) {
            failure(e.code(), GameRefusalMapper.refusal(e), optIn = true)
        } catch (_: IOException) {
            GameServiceResult.Offline
        } catch (_: SerializationException) {
            GameServiceResult.Failed(null)
        }

    // --- Plomberie ---

    /** Un identifiant que le client ne sait pas mettre dans un chemin : rien ne part, et ce n'est pas une coupure. */
    private inline fun <T> safePath(segment: String, send: () -> GameServiceResult<T>): GameServiceResult<T> =
        if (GamePathSegments.isSafe(segment)) send() else GameServiceResult.Failed(null)

    private suspend fun <T : Any> call(
        parse: (String?) -> T?,
        optIn: Boolean = false,
        send: suspend () -> ApiResponse<JsonElement>,
    ): GameServiceResult<T> =
        try {
            val envelope = send()
            val payload = envelope.data?.takeIf { envelope.success }
            payload?.let { parse(it.toString()) }?.let { GameServiceResult.Done(it) } ?: GameServiceResult.Failed(null)
        } catch (e: HttpException) {
            failure(e.code(), GameRefusalMapper.refusal(e), optIn)
        } catch (_: IOException) {
            GameServiceResult.Offline
        } catch (_: SerializationException) {
            GameServiceResult.Failed(null)
        }

    /** Pour une méthode Retrofit qui rend la [Response] brute (le corps d'un refus 403/409 reste lisible). */
    private suspend fun <T : Any> rawCall(
        parse: (String?) -> T?,
        optIn: Boolean,
        send: suspend () -> Response<ApiResponse<JsonElement>>,
    ): GameServiceResult<T> =
        try {
            val response = send()
            if (response.isSuccessful) {
                val envelope = response.body()
                val payload = envelope?.data?.takeIf { envelope.success }
                payload?.let { parse(it.toString()) }?.let { GameServiceResult.Done(it) } ?: GameServiceResult.Failed(null)
            } else {
                failure(response.code(), GameRefusalMapper.refusal(response), optIn)
            }
        } catch (e: HttpException) {
            failure(e.code(), GameRefusalMapper.refusal(e), optIn)
        } catch (_: IOException) {
            GameServiceResult.Offline
        } catch (_: SerializationException) {
            GameServiceResult.Failed(null)
        }

    private fun failure(status: Int, refusal: me.meeshy.sdk.model.game.GameRefusal?, optIn: Boolean): GameServiceResult<Nothing> =
        when {
            refusal != null -> GameServiceResult.Refused(refusal)
            optIn && status == NOT_FOUND -> GameServiceResult.Unavailable
            else -> GameServiceResult.Failed(status)
        }

    private companion object {
        const val NOT_FOUND = 404
        const val NOT_MODIFIED = 304
    }
}
