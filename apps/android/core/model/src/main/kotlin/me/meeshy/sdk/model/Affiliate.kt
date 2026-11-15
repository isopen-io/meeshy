package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Affiliate token — port of AffiliateModels.swift. */
@Serializable
data class AffiliateToken(
    val id: String,
    val token: String,
    val name: String,
    val affiliateLink: String? = null,
    val maxUses: Int? = null,
    val currentUses: Int = 0,
    val isActive: Boolean = false,
    val expiresAt: String? = null,
    val createdAt: String? = null,
    val _count: AffiliateCount? = null,
    val clickCount: Int = 0,
) {
    val referralCount: Int get() = _count?.affiliations ?: 0
}

@Serializable
data class AffiliateCount(
    val affiliations: Int = 0,
)

@Serializable
data class AffiliateStats(
    val totalTokens: Int? = null,
    val totalReferrals: Int? = null,
    val totalVisits: Int? = null,
    val conversionRate: Double? = null,
)

@Serializable
data class CreateAffiliateTokenRequest(
    val name: String,
    val maxUses: Int? = null,
    val expiresAt: String? = null,
)

/** Corps de `POST /affiliate/track-visit` (route publique). */
@Serializable
data class AffiliateVisitorData(
    val userAgent: String? = null,
    val referrer: String? = null,
    val country: String? = null,
    val language: String? = null,
)

@Serializable
data class AffiliateTrackVisitRequest(
    val token: String,
    val visitorData: AffiliateVisitorData? = null,
)

@Serializable
data class AffiliateTrackVisitResult(
    val sessionKey: String? = null,
)

/** Corps de `POST /affiliate/register` : rattache un filleul au parrain (authentifié). */
@Serializable
data class AffiliateRegisterRequest(
    val token: String,
    val referredUserId: String,
    val sessionKey: String? = null,
)

/** Réponse de `GET /affiliate/validate/:token` — toujours 200, `isValid` dit le verdict. */
@Serializable
data class AffiliateValidation(
    val isValid: Boolean = false,
    val token: AffiliateValidatedToken? = null,
    val affiliateUser: AffiliateInviter? = null,
)

@Serializable
data class AffiliateValidatedToken(
    val id: String = "",
    val name: String = "",
    val token: String = "",
    val maxUses: Int? = null,
    val currentUses: Int = 0,
    val expiresAt: String? = null,
)

/** Le parrain d'un jeton valide — de quoi nommer qui invite avant l'inscription. */
@Serializable
data class AffiliateInviter(
    val id: String = "",
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
)
