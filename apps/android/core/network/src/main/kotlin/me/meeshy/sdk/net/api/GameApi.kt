package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.game.GamePrivacyRequest
import me.meeshy.sdk.model.game.DuoInviteRequest
import me.meeshy.sdk.model.game.GameWriteRequest
import me.meeshy.sdk.model.game.GuideSeenRequest
import me.meeshy.sdk.model.game.LeagueConsentRequest
import me.meeshy.sdk.model.game.LeaguePseudonymRequest
import me.meeshy.sdk.model.game.ShowcaseOrderRequest
import me.meeshy.sdk.model.game.ShowcaseVisibilityRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * Les routes du jeu — port de `GameService` iOS : le classement de la semaine, la ligue Amis, les réglages, le
 * consentement à la ligue publique et « Jeu masqué », le rangement de la vitrine, les visibilités, l'alliance et le nom de
 * joute (écritures sans solde), puis les sept ÉCRITURES qui touchent un solde (changer un acte,
 * ouvrir le coffre, une Veilleuse, rallumer la Flamme, réclamer une halte, le Sceau, la Renaissance). La frappe d'une
 * Meesh est dans [EngagementApi].
 *
 * Chaque écriture porte un [GameWriteRequest] : l'identifiant d'idempotence est né UNE fois par intention et rejoué
 * tel quel sur un réessai, la passerelle rend alors le résultat de la première écriture et jamais une seconde. Un
 * refus d'état est un 409 dont le `code` est celui du contrat (`GameErrorCode`).
 *
 * Les charges sont rendues en [JsonElement] et lues par `GameWave2Parser` / `GameIntegrationParser` (`:core:model`) :
 * une valeur ajoutée au serveur avant la mise à jour de l'app ne fait jamais échouer une lecture DÉJÀ acquise.
 */
interface GameApi {
    @GET("me/game/league/week")
    suspend fun leagueWeek(): ApiResponse<JsonElement>

    @GET("me/game/league/friends")
    suspend fun leagueFriends(): ApiResponse<JsonElement>

    /**
     * Le jeu d'un AUTRE membre : son niveau et son rang selon SES réglages (`rank`), le palier de son trésor (`treasury`).
     * Un refus, un blocage ou un compte inconnu répondent `visible: false` — jamais une erreur qui trahirait le réglage.
     */
    @GET("users/{userId}/game")
    suspend fun userGame(@Path("userId") userId: String): ApiResponse<JsonElement>

    @GET("me/game/privacy")
    suspend fun settings(): ApiResponse<JsonElement>

    @POST("me/game/league/consent")
    suspend fun setLeagueConsent(@Body body: LeagueConsentRequest): ApiResponse<JsonElement>

    @PUT("me/game/privacy")
    suspend fun setPrivacy(@Body body: GamePrivacyRequest): ApiResponse<JsonElement>

    @PUT("me/game/visibility")
    suspend fun setVisibility(@Body body: ShowcaseVisibilityRequest): ApiResponse<JsonElement>

    /** Range la vitrine : l'ordre des clés de trophées, 200 au plus. Aucun solde n'est touché. */
    @PUT("me/game/showcase/order")
    suspend fun setShowcaseOrder(@Body body: ShowcaseOrderRequest): ApiResponse<JsonElement>

    /** Change le nom de joute. La passerelle le refuse tant que le choix du nom n'est pas ouvert (conformité A-5). */
    @PUT("me/game/league/pseudonym")
    suspend fun setLeaguePseudonym(@Body body: LeaguePseudonymRequest): ApiResponse<JsonElement>

    /** Invite un ami accepté à l'alliance de la semaine. */
    @POST("me/game/duo/invite")
    suspend fun inviteToDuo(@Body body: DuoInviteRequest): ApiResponse<JsonElement>

    @POST("me/game/duo/{duoId}/accept")
    suspend fun acceptDuo(@Path("duoId") duoId: String, @Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Décliner, annuler ou quitter : un seul geste (conformité B-4 : l'alliance se quitte à tout moment). */
    @POST("me/game/duo/{duoId}/abandon")
    suspend fun abandonDuo(@Path("duoId") duoId: String, @Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Change UNE mission du jour : 1 Meesh, une fois par jour, même difficulté. */
    @POST("me/game/missions/{missionId}/reroll")
    suspend fun rerollMission(@Path("missionId") missionId: String, @Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Ouvre le coffre du jour, une fois toutes les missions finies. */
    @POST("me/game/chest/claim")
    suspend fun claimChest(@Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Achète UNE Veilleuse (un gel de Flamme) : 1 Meesh, 2 en réserve au plus. */
    @POST("me/game/flame/freezes")
    suspend fun buyFlameFreeze(@Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Rallume une Flamme éteinte : 3 Meeshes, 48 h, une fois par mois. */
    @POST("me/game/flame/relight")
    suspend fun relightFlame(@Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Réclame la récompense d'une halte du Voyage. */
    @POST("me/game/season/steps/{step}/claim")
    suspend fun claimSeasonStep(@Path("step") step: Int, @Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Prend le Sceau du Voyage (10 Meeshes, purement décoratif). */
    @POST("me/game/season/seal")
    suspend fun buySeasonSeal(@Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Renaît : niveau à 1, étincelles à 0, une étoile de plus. */
    @POST("me/game/prestige")
    suspend fun passPrestige(@Body body: GameWriteRequest): ApiResponse<JsonElement>

    /** Marque des cartes du guide comme vues (1 à 32 clés) : la prochaine ouverture les dit en version courte. */
    @POST("me/game/guide/seen")
    suspend fun markGuideSeen(@Body body: GuideSeenRequest): ApiResponse<JsonElement>
}
