package me.meeshy.sdk.game

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.game.ChestClaimResponse
import me.meeshy.sdk.model.game.DuoInviteResponse
import me.meeshy.sdk.model.game.DuoStatusResponse
import me.meeshy.sdk.model.game.FlameFreezeResponse
import me.meeshy.sdk.model.game.FlameRelightResponse
import me.meeshy.sdk.model.game.GameLeagueWeekArchive
import me.meeshy.sdk.model.game.GamePrivacyResponse
import me.meeshy.sdk.model.game.GameRefusal
import me.meeshy.sdk.model.game.GameSeasonArchive
import me.meeshy.sdk.model.game.GameSettingsResponse
import me.meeshy.sdk.model.game.GuideSeenResponse
import me.meeshy.sdk.model.game.LeagueConsentResponse
import me.meeshy.sdk.model.game.LeagueFriendsResponse
import me.meeshy.sdk.model.game.LeaguePseudonymResponse
import me.meeshy.sdk.model.game.LeagueWeekResponse
import me.meeshy.sdk.model.game.MissionRerollResponse
import me.meeshy.sdk.model.game.PrestigeResponse
import me.meeshy.sdk.model.game.SeasonClaimResponse
import me.meeshy.sdk.model.game.SeasonSealResponse
import me.meeshy.sdk.model.game.ShowcaseOrderResponse
import me.meeshy.sdk.model.game.ShowcaseVisibilityRequest
import me.meeshy.sdk.model.game.ShowcaseVisibilityResponse
import me.meeshy.sdk.model.game.UserGameProfileResponse
import me.meeshy.sdk.model.game.UserShowcaseResponse

/**
 * L'issue d'un appel au service du jeu. Aucune écriture n'est mise en file hors ligne (un débit ne s'attend pas) :
 * une coupure est dite [Offline] et le geste n'est PAS parti.
 */
sealed interface GameServiceResult<out T> {
    /** La passerelle a répondu et la charge est lue (un « déjà fait » est un succès). */
    data class Done<T>(val value: T) : GameServiceResult<T>

    /** Un refus d'état du contrat (409 + code connu), extras racine compris. */
    data class Refused(val refusal: GameRefusal) : GameServiceResult<Nothing>

    /** Rien n'est parti, ou rien n'est revenu : l'état affiché n'a pas changé. */
    data object Offline : GameServiceResult<Nothing>

    /** La route n'est pas servie (404 devant un serveur plus ancien) : la fonction se masque, ce n'est pas une panne. */
    data object Unavailable : GameServiceResult<Nothing>

    /** Tout le reste : un 5xx, un autre statut, une charge illisible, un code inconnu. Pas un refus du contrat. */
    data class Failed(val httpStatus: Int?) : GameServiceResult<Nothing>
}

/** Ce que le calendrier des saisons répond à une lecture conditionnelle. */
sealed interface GameSeasonCalendarRead {
    /** 304 : le calendrier gardé est encore le bon. */
    data object NotModified : GameSeasonCalendarRead

    data class Fresh(val payload: JsonElement, val etag: String?) : GameSeasonCalendarRead
}

/**
 * Les cinq écritures du lot 1 (`GameServiceProviding`, iOS). Chaque `requestId` naît UNE fois par intention
 * ([GameRequestIdLedger]) et se rejoue tel quel au réessai.
 */
interface GameServiceProviding {
    suspend fun rerollMission(missionId: String, requestId: String): GameServiceResult<MissionRerollResponse>
    suspend fun claimChest(requestId: String): GameServiceResult<ChestClaimResponse>
    suspend fun buyFlameFreeze(requestId: String): GameServiceResult<FlameFreezeResponse>
    suspend fun relightFlame(requestId: String): GameServiceResult<FlameRelightResponse>
    suspend fun markGuideSeen(keys: List<String>, requestId: String): GameServiceResult<GuideSeenResponse>
}

/**
 * Les écritures et lectures de la vague 2 (`GameWave2ServiceProviding`) : un contrat À PART, pour qu'un double de test du
 * premier n'ait rien à implémenter ici. Opt-in : une route absente rend [GameServiceResult.Unavailable].
 */
interface GameWave2ServiceProviding {
    suspend fun setLeagueConsent(consent: Boolean, pseudonym: String?, requestId: String): GameServiceResult<LeagueConsentResponse>
    suspend fun setLeaguePseudonym(pseudonym: String, requestId: String): GameServiceResult<LeaguePseudonymResponse>
    suspend fun fetchLeagueWeek(): GameServiceResult<LeagueWeekResponse>
    suspend fun fetchFriendsLeague(): GameServiceResult<LeagueFriendsResponse>
    suspend fun inviteToDuo(friendId: String, requestId: String): GameServiceResult<DuoInviteResponse>
    suspend fun acceptDuo(duoId: String, requestId: String): GameServiceResult<DuoStatusResponse>
    suspend fun abandonDuo(duoId: String, requestId: String): GameServiceResult<DuoStatusResponse>
    suspend fun claimSeasonStep(step: Int, requestId: String): GameServiceResult<SeasonClaimResponse>
    suspend fun buySeasonSeal(requestId: String): GameServiceResult<SeasonSealResponse>
    suspend fun setShowcaseOrder(order: List<String>, requestId: String): GameServiceResult<ShowcaseOrderResponse>
    suspend fun setVisibility(request: ShowcaseVisibilityRequest): GameServiceResult<ShowcaseVisibilityResponse>
    suspend fun fetchUserShowcase(userId: String): GameServiceResult<UserShowcaseResponse>
    suspend fun passPrestige(requestId: String): GameServiceResult<PrestigeResponse>
    suspend fun setPrivacy(gameHidden: Boolean?, friendsLeagueOptOut: Boolean?, requestId: String): GameServiceResult<GamePrivacyResponse>
}

/** Les lectures d'intégration (`GameIntegrationServiceProviding`) : les réglages du jeu et le jeu d'un autre membre. */
interface GameIntegrationServiceProviding {
    suspend fun fetchSettings(): GameServiceResult<GameSettingsResponse>
    suspend fun fetchUserGame(userId: String): GameServiceResult<UserGameProfileResponse>
}

/**
 * Ce qu'un lien du Jeu ouvre (`GameArchiveServiceProviding`). Un serveur antérieur ne sert pas ces routes : l'écran de
 * saison ou de ligue retombe alors sur l'EN-COURS ([GameServiceResult.Unavailable]).
 */
interface GameArchiveServiceProviding {
    suspend fun fetchSeasonArchive(number: Int): GameServiceResult<GameSeasonArchive>
    suspend fun fetchLeagueWeekArchive(weekKey: String): GameServiceResult<GameLeagueWeekArchive>
    suspend fun fetchSeasonCalendar(ifNoneMatch: String? = null): GameServiceResult<GameSeasonCalendarRead>
}
