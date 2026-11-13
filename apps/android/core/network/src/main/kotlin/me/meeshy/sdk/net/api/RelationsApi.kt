package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.relation.ListeningCategoryShareBody
import me.meeshy.sdk.model.relation.BringBlockBody
import me.meeshy.sdk.model.relation.TalkieBlockBody
import me.meeshy.sdk.model.relation.NowPlayingSnapshotWire
import me.meeshy.sdk.model.relation.RelationPersonSettings
import me.meeshy.sdk.model.relation.RelationLinkWire
import me.meeshy.sdk.model.relation.RelationRitualBody
import me.meeshy.sdk.model.relation.RelationRitualStep
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.model.relation.SharedLocationSnapshotWire
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * La réponse de `GET /relations/:userId` (#13998) : le niveau EFFECTIF du lien du lecteur avec [userId], tel que la
 * passerelle le sert. [effectiveLevel] reste la chaîne brute (`PUBLIC`, `COMMUNITY`, `ACQUAINTANCE`, `FRIEND`, `CLOSE`,
 * `BLOOD`) : un niveau ajouté au serveur avant la mise à jour de l'app n'est pas fatal. `PUBLIC` dit aussi « bloqué » et
 * « inconnu » — voulu côté serveur.
 */
@Serializable
data class RelationLevelResponse(
    val userId: String,
    val effectiveLevel: String,
    /** Élargissement #14910 : `false` quand je ne peux pas demander de monter maintenant. Absent ⇒ comportement d'avant. */
    val canRaise: Boolean? = null,
    /** Élargissement #14910 : l'échéance ISO du cool-down de remontée, ou `null`. */
    val raiseBlockedUntil: String? = null,
    /**
     * Élargissement #16623 : le niveau auquel la passerelle juge les outils de cercle (le Bring) — le lien réel, sauf entre
     * deux comptes de l'équipe (Sang sans lien). Absent ⇒ retomber sur [effectiveLevel] ; aucun rôle n'est servi.
     */
    val accessLevel: String? = null,
)

/** Le corps de `POST /relations/:userId/level` (#14910) : le cran visé, strictement sous mon accord ; `PUBLIC` annule le lien. */
@Serializable
data class RelationLowerBody(val level: String)

/** Les cercles — miroir de `RelationsEndpoint` d'iOS (`RelationsService.swift`, #13938). */
interface RelationsApi {
    /** Le niveau de lien avec une personne. */
    @GET(ApiRoutesRelations.BY_USER_ID)
    suspend fun byUserId(@Path("userId") userId: String): ApiResponse<RelationLevelResponse>

    /** « Mes cercles » : chaque lien d'au moins Connaissance, avec sa progression et son éligibilité. */
    @GET(ApiRoutesRelations.ROOT)
    suspend fun links(): ApiResponse<List<RelationLinkWire>>

    /** Ce que mes Proches et mes Sangs écoutent en ce moment, tronqué par la passerelle à ce qu'ils me partagent (#16686). */
    @GET(ApiRoutesRelations.NOW_PLAYING)
    suspend fun nowPlaying(): ApiResponse<NowPlayingSnapshotWire>

    /**
     * Les positions qu'on me partage en ce moment (#16985), tronquées par la passerelle à la précision que chaque émetteur
     * m'a donnée et filtrées par [bbox] (`minLon,minLat,maxLon,maxLat`, `SharedLocationBounds.queryValue`) ; `null` = toute
     * la carte.
     */
    @GET(ApiRoutesRelations.LOCATIONS)
    suspend fun sharedLocations(@Query("bbox") bbox: String? = null): ApiResponse<SharedLocationSnapshotWire>

    /** Les niveaux, leurs libellés des sept langues et leurs icônes. */
    @GET(ApiRoutesRelations.CONFIG)
    suspend fun config(): ApiResponse<RelationsConfig>

    /** Baisser MON accord d'un lien (#14910) : rétrograder d'un cran, ou annuler le lien avec `PUBLIC`. Rend la vue du lien. */
    @POST(ApiRoutesRelations.BY_USER_ID_LEVEL)
    suspend fun lower(@Path("userId") userId: String, @Body body: RelationLowerBody): ApiResponse<RelationLinkWire>

    /** Les réglages que JE pose pour l'autre (#13936, #13935, #16836) : `bringBlocked`, `talkieBlocked`, `listeningCategoryShared`. */
    @GET(ApiRoutesRelations.BY_USER_ID_SETTINGS)
    suspend fun settings(@Path("userId") userId: String): ApiResponse<RelationPersonSettings>

    /** Bloquer (ou non) les Bring de cette personne vers moi ; l'autre n'en est pas prévenu. Rend les réglages servis. */
    @PUT(ApiRoutesRelations.BY_USER_ID_SETTINGS)
    suspend fun setBringBlocked(@Path("userId") userId: String, @Body body: BringBlockBody): ApiResponse<RelationPersonSettings>

    /** Couper (ou non) le talkie de cette personne vers moi (#16675) : sa voix arrive alors en message vocal. */
    @PUT(ApiRoutesRelations.BY_USER_ID_SETTINGS)
    suspend fun setTalkieBlocked(@Path("userId") userId: String, @Body body: TalkieBlockBody): ApiResponse<RelationPersonSettings>

    /** Accorder (ou retirer) « Ce que j'écoute » à cette personne (#16836) : refusé par défaut, l'autre n'en est pas prévenu. */
    @PUT(ApiRoutesRelations.BY_USER_ID_SETTINGS)
    suspend fun setListeningCategoryShared(
        @Path("userId") userId: String,
        @Body body: ListeningCategoryShareBody,
    ): ApiResponse<RelationPersonSettings>

    /** Le rituel du Sang : `start` ouvre ou rejoint, `hold` se rejoue tant qu'on tient l'écran, `confirm` scelle. */
    @POST(ApiRoutesRelations.BY_USER_ID_RITUAL)
    suspend fun ritual(@Path("userId") userId: String, @Body body: RelationRitualBody): ApiResponse<RelationRitualStep>
}
