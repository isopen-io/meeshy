package me.meeshy.sdk.game

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.ChestClaimResponse
import me.meeshy.sdk.model.game.FlameFreezeResponse
import me.meeshy.sdk.model.game.FlameRelightResponse
import me.meeshy.sdk.model.game.GamePathSegments
import me.meeshy.sdk.model.game.GameRefusalLaw
import me.meeshy.sdk.model.game.GameWave2Parser
import me.meeshy.sdk.model.game.GameWriteParser
import me.meeshy.sdk.model.game.GameWriteRequest
import me.meeshy.sdk.model.game.MeeshMintResponse
import me.meeshy.sdk.model.game.MissionRerollResponse
import me.meeshy.sdk.model.game.PrestigeResponse
import me.meeshy.sdk.model.game.SeasonClaimResponse
import me.meeshy.sdk.model.game.SeasonSealResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.EngagementApi
import me.meeshy.sdk.net.api.GameApi
import me.meeshy.sdk.net.api.MeeshMintRequest
import me.meeshy.sdk.net.apiCall

/**
 * Les ÉCRITURES du jeu qui touchent un solde — port de `GameService` et de `EngagementProgressService.mintMeesh` (iOS) :
 * frapper une Meesh, changer un acte, ouvrir le coffre, une Veilleuse, rallumer la Flamme, réclamer une halte, le Sceau,
 * la Renaissance.
 *
 * **Chaque débit et chaque crédit est décidé et appliqué par la passerelle, atomiquement.** Ce dépôt n'en calcule rien
 * et ne garde rien : il envoie une INTENTION portant son [requestId] (né une fois par intention chez l'appelant, rejoué
 * tel quel sur un réessai) et rend ce que la passerelle a répondu — la réponse tolérante, ou le refus avec son code.
 * Il n'écrit ni dans le cache de la progression ni dans aucun autre : c'est l'appelant qui relit la progression servie.
 *
 * Aucune file hors ligne : un débit ne se met pas en attente. Une coupure rend [GameWriteOutcome.Refused] avec
 * `offline = true`, et RIEN n'est parti.
 */
@Singleton
class GameGestureRepository @Inject constructor(
    private val game: GameApi,
    private val engagement: EngagementApi,
) {

    /** Frappe la Meesh suivante. [maxPrice] est le prix que l'écran a montré : au-delà, 409 `PRICE_CHANGED`, rien n'est débité. */
    suspend fun mint(requestId: String, maxPrice: Int?): GameWriteOutcome<MeeshMintResponse> =
        write(GameWriteParser::mint) { engagement.mintMeesh(MeeshMintRequest(requestId, maxPrice?.takeIf { it > 0 })) }

    suspend fun rerollMission(requestId: String, missionId: String): GameWriteOutcome<MissionRerollResponse> {
        if (!GamePathSegments.isSafe(missionId)) return unsent()
        return write(GameWriteParser::rerollMission) { game.rerollMission(missionId, GameWriteRequest(requestId)) }
    }

    suspend fun claimChest(requestId: String): GameWriteOutcome<ChestClaimResponse> =
        write(GameWriteParser::claimChest) { game.claimChest(GameWriteRequest(requestId)) }

    suspend fun buyFlameFreeze(requestId: String): GameWriteOutcome<FlameFreezeResponse> =
        write(GameWriteParser::buyFlameFreeze) { game.buyFlameFreeze(GameWriteRequest(requestId)) }

    suspend fun relightFlame(requestId: String): GameWriteOutcome<FlameRelightResponse> =
        write(GameWriteParser::relightFlame) { game.relightFlame(GameWriteRequest(requestId)) }

    suspend fun claimSeasonStep(requestId: String, step: Int): GameWriteOutcome<SeasonClaimResponse> =
        write(GameWave2Parser::seasonClaim) { game.claimSeasonStep(step, GameWriteRequest(requestId)) }

    suspend fun buySeasonSeal(requestId: String): GameWriteOutcome<SeasonSealResponse> =
        write(GameWave2Parser::seasonSeal) { game.buySeasonSeal(GameWriteRequest(requestId)) }

    suspend fun passPrestige(requestId: String): GameWriteOutcome<PrestigeResponse> =
        write(GameWave2Parser::prestige) { game.passPrestige(GameWriteRequest(requestId)) }

    /** Un identifiant que le client ne sait pas mettre dans un chemin : rien ne part, et ce n'est pas une coupure. */
    private fun unsent(): GameWriteOutcome<Nothing> = GameWriteOutcome.Refused(code = null, offline = false)

    private suspend fun <T : Any> write(parse: (String?) -> T?, send: suspend () -> ApiResponse<JsonElement>): GameWriteOutcome<T> =
        when (val result = apiCall(send)) {
            is NetworkResult.Success -> parse(result.data.toString())?.let { GameWriteOutcome.Done(it) }
                ?: GameWriteOutcome.Refused(code = null, offline = false)
            is NetworkResult.Failure -> GameWriteOutcome.Refused(
                code = result.error.code,
                offline = GameRefusalLaw.isOffline(result.error.code),
            )
        }
}
