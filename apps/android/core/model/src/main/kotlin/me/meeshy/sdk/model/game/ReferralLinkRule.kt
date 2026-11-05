package me.meeshy.sdk.model.game

import java.time.Instant
import java.time.OffsetDateTime
import me.meeshy.sdk.model.AffiliateToken

/**
 * QUEL JETON DEVIENT LE LIEN DE PARTAGE (#7742) — la règle du web (`loadShareableReferralLink`) et d'iOS
 * (`ReferralLinkRule`), pure : le premier jeton CRÉÉ PAR le lecteur (la liste `GET /affiliate/tokens` ne
 * rend que les siens) qui est actif, non expiré, non épuisé, et qui porte un lien. Un jeton que la passerelle
 * dirait inutilisable ne part jamais : un lien qui laisserait croire au parrainage serait pire que pas de lien.
 */
public object ReferralLinkRule {

    public const val TOKEN_NAME: String = "Invitation Meeshy"

    /** Expiré STRICTEMENT après l'échéance ; une date illisible ne vaut jamais « sans échéance ». */
    public fun isExpired(expiresAt: String?, nowEpochMillis: Long): Boolean {
        if (expiresAt == null) return false
        val deadline = parse(expiresAt) ?: return true
        return nowEpochMillis > deadline
    }

    /** `maxUses` nul ou non positif veut dire illimité (même lecture que `GET /affiliate/validate/:token`). */
    public fun isExhausted(maxUses: Int?, currentUses: Int): Boolean {
        if (maxUses == null || maxUses <= 0) return false
        return currentUses >= maxUses
    }

    public fun isUsable(token: AffiliateToken, nowEpochMillis: Long): Boolean {
        if (!token.isActive) return false
        if (isExpired(token.expiresAt, nowEpochMillis)) return false
        if (isExhausted(token.maxUses, token.currentUses)) return false
        return !token.affiliateLink.isNullOrEmpty()
    }

    public fun link(tokens: List<AffiliateToken>, nowEpochMillis: Long): String? =
        tokens.firstOrNull { isUsable(it, nowEpochMillis) }?.affiliateLink

    private fun parse(raw: String): Long? =
        runCatching { Instant.parse(raw).toEpochMilli() }
            .recoverCatching { OffsetDateTime.parse(raw).toInstant().toEpochMilli() }
            .getOrNull()
}
