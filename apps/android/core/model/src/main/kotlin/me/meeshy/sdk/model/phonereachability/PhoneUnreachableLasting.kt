package me.meeshy.sdk.model.phonereachability

/**
 * UN TÉLÉPHONE INJOIGNABLE QUI DURE (#20241, iso `PhoneUnreachableLasting.swift`) — la passerelle me sert que le téléphone
 * d'un proche ne répond plus depuis `unreachableSince` (son dernier signe de vie, après ses sondes). Passé
 * [MINIMUM_SILENCE_MS], ce qui exige son téléphone ne peut plus aboutir : le talkie devient un message vocal, « Demander
 * un relevé » disparaît. Sans état servi, ou au-delà du TTL du contrat, rien ne change : ce client ne devine rien.
 */
public object PhoneUnreachableLasting {
    /**
     * Cinq minutes de silence au moins depuis le dernier signe de vie. La passerelle n'en sert un état qu'après ses deux
     * sondes : le seuil écarte seulement une horloge ou un épisode tout juste ouvert.
     */
    public const val MINIMUM_SILENCE_MS: Long = 5L * 60L * 1000L

    public fun isLasting(state: PhoneReachabilityState?, nowMillis: Long): Boolean {
        val served = state?.takeUnless { it.isExpired(nowMillis) } ?: return false
        return nowMillis - served.unreachableSinceMillis >= MINIMUM_SILENCE_MS
    }

    /** Le temps qu'il reste avant que le silence compte ; `null` quand il compte déjà ou qu'il n'y a rien à attendre. */
    public fun remainingMs(state: PhoneReachabilityState?, nowMillis: Long): Long? {
        val served = state?.takeUnless { it.isExpired(nowMillis) } ?: return null
        val left = MINIMUM_SILENCE_MS - (nowMillis - served.unreachableSinceMillis)
        return left.takeIf { it > 0 }
    }

    private fun PhoneReachabilityState.isExpired(nowMillis: Long): Boolean =
        nowMillis - unreachableSinceMillis >= PhoneReachabilityContract.STATE_TTL_MILLIS
}

/**
 * « Demander un relevé » (batterie, au Sang) réveille le téléphone de la personne. Un téléphone qu'on SAIT injoignable
 * depuis plusieurs minutes ne répondra pas : la rangée ne se propose pas (rien de non actionnable).
 */
public object BatteryPullOffer {
    public fun offers(canPull: Boolean, unreachable: PhoneReachabilityState?, nowMillis: Long): Boolean =
        offers(canPull, lasting = PhoneUnreachableLasting.isLasting(unreachable, nowMillis))

    public fun offers(canPull: Boolean, lasting: Boolean): Boolean = canPull && !lasting
}
