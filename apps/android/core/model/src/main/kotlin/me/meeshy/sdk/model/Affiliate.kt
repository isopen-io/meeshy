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
