package me.meeshy.sdk.link

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.AffiliateRegisterRequest
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.AffiliateTrackVisitRequest
import me.meeshy.sdk.model.AffiliateTrackVisitResult
import me.meeshy.sdk.model.AffiliateValidation
import me.meeshy.sdk.model.AffiliateVisitorData
import me.meeshy.sdk.model.CreateAffiliateTokenRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AffiliateReferralApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le parrainage avant et après l'inscription. [validate] et [trackVisit] sont des routes PUBLIQUES
 * (aucun bearer) ; [createToken], [deleteToken] et [register] exigent la session.
 */
@Singleton
class AffiliateReferralRepository @Inject constructor(
    private val api: AffiliateReferralApi,
) {
    suspend fun validate(token: String): NetworkResult<AffiliateValidation> = apiCall { api.validate(token) }

    suspend fun trackVisit(token: String, visitor: AffiliateVisitorData? = null): NetworkResult<AffiliateTrackVisitResult> =
        apiCall { api.trackVisit(AffiliateTrackVisitRequest(token, visitor)) }

    suspend fun createToken(name: String, maxUses: Int? = null, expiresAt: String? = null): NetworkResult<AffiliateToken> =
        apiCall { api.createToken(CreateAffiliateTokenRequest(name, maxUses, expiresAt)) }

    suspend fun deleteToken(id: String): NetworkResult<Unit> = apiCallUnit { api.deleteToken(id) }

    suspend fun register(token: String, referredUserId: String, sessionKey: String? = null): NetworkResult<JsonElement> =
        apiCall { api.register(AffiliateRegisterRequest(token, referredUserId, sessionKey)) }
}
