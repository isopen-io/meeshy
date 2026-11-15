package me.meeshy.sdk.model.auth

/**
 * La forme d'un code d'invitation — la seule question qu'un client tranche seul. Il ne VALIDE
 * rien : seule la passerelle sait si un jeton est actif. Miroir de `ReferralCode` (iOS) et de
 * `apps/web/src/lib/view/referral-code.ts` : identifiant opaque d'un seul tenant, 128 caractères
 * au plus, casse conservée.
 */
public object ReferralCode {
    public const val MAX_LENGTH: Int = 128

    /** Le code sans ses espaces de bord, ou `null` s'il n'a pas la forme d'un code. */
    public fun normalized(raw: String?): String? =
        raw?.trim()?.takeIf { it.isNotEmpty() && it.length <= MAX_LENGTH && it.none(Char::isWhitespace) }
}
