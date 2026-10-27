package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.GamePrivacyRequest
import me.meeshy.sdk.model.game.LeagueConsentRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT

/**
 * Les pages du jeu de la vague 2 — port de `GameService` iOS, dans leur partie sans valeur : le classement de la
 * semaine, la ligue Amis, les réglages, le consentement à la ligue publique et « Jeu masqué ». Aucune route qui
 * débite ou crédite (frappe, coffre, Flamme, haltes, Sceau, Renaissance) : elles viennent avec leur audit.
 *
 * Les charges sont rendues en [JsonElement] et lues par `GameWave2Parser` / `GameIntegrationParser` (`:core:model`) :
 * une valeur ajoutée au serveur avant la mise à jour de l'app ne fait jamais échouer une lecture DÉJÀ acquise.
 */
interface GameApi {
    @GET("me/game/league/week")
    suspend fun leagueWeek(): ApiResponse<JsonElement>

    @GET("me/game/league/friends")
    suspend fun leagueFriends(): ApiResponse<JsonElement>

    @GET("me/game/privacy")
    suspend fun settings(): ApiResponse<JsonElement>

    @POST("me/game/league/consent")
    suspend fun setLeagueConsent(@Body body: LeagueConsentRequest): ApiResponse<JsonElement>

    @PUT("me/game/privacy")
    suspend fun setPrivacy(@Body body: GamePrivacyRequest): ApiResponse<JsonElement>
}
