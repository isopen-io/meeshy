package me.meeshy.sdk.engagement

import me.meeshy.sdk.model.game.GameWriteParser
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressParser
import me.meeshy.sdk.model.game.engagement.MeeshMintResult
import me.meeshy.sdk.net.api.EngagementApi
import me.meeshy.sdk.net.api.MeeshMintRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La source de la progression — port de `EngagementProgressService` iOS : lecture de `GET /me/engagement` et frappe
 * d'une Meesh. Les charges sont lues par les parseurs tolérants de `:core:model` ; une charge illisible rend `null`
 * (jamais une exception), les refus HTTP (409 `PRICE_CHANGED`, dette…) remontent à l'appelant tels quels.
 *
 * Le cache Room (SWR) s'y greffera avec le magasin d'entrées générique (`persist-cache-entries-store`) ; ce dépôt
 * ne porte volontairement ni état ni cache en attendant.
 */
@Singleton
class EngagementProgressRepository @Inject constructor(
    private val api: EngagementApi,
) {

    /** La progression du compte authentifié, ou `null` si la charge est absente ou illisible. */
    suspend fun fetchProgress(): ApiEngagementProgress? =
        EngagementProgressParser.parse(api.progress().data)

    /**
     * Frappe une Meesh. [requestId] est généré une fois par INTENTION de frappe ; [maxPrice] (> 0) est le prix que
     * l'écran a montré — au-delà, la passerelle refuse sans rien débiter.
     */
    suspend fun mintMeesh(requestId: String, maxPrice: Int? = null): MeeshMintResult? =
        GameWriteParser.mint(api.mintMeesh(MeeshMintRequest(requestId, maxPrice?.takeIf { it > 0 })).data?.toString())
}
