package me.meeshy.sdk.net

/** The session credentials of one account (either may be absent). */
data class AccountTokens(val jwt: String?, val sessionToken: String?) {
    val isEmpty: Boolean get() = jwt == null && sessionToken == null
}

/**
 * Per-account token vault — Android mirror of iOS's per-account Keychain keys
 * (`meeshy_token_<id>`, `meeshy_session_token_<id>`, #8286). It holds the tokens
 * of EVERY account on the device (the active one and the dormant, kept ones);
 * which account is active is the [TokenStore]'s business. It never stores a
 * password.
 */
interface AccountTokenVault {
    fun tokens(userId: String): AccountTokens?
    fun save(userId: String, tokens: AccountTokens)
    fun remove(userId: String)
    fun hasTokens(userId: String): Boolean = tokens(userId) != null

    /** Of [candidates], the accounts that hold tokens (the row state "signed in"). */
    fun accountsWithTokens(candidates: Collection<String>): Set<String> =
        candidates.filterTo(mutableSetOf()) { hasTokens(it) }
}
