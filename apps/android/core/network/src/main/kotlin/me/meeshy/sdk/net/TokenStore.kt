package me.meeshy.sdk.net

/**
 * Secure storage for the JWT (registered users) and session token (all users).
 * See /CLAUDE.md: registered users authenticate with `Authorization: Bearer`,
 * anonymous users with `X-Session-Token`.
 */
interface TokenStore {
    var jwt: String?
    var sessionToken: String?
    val isAuthenticated: Boolean
    fun clear()
}

/** Volatile token store — for tests and previews. */
class InMemoryTokenStore(
    override var jwt: String? = null,
    override var sessionToken: String? = null,
) : TokenStore {
    override val isAuthenticated: Boolean get() = jwt != null || sessionToken != null

    override fun clear() {
        jwt = null
        sessionToken = null
    }
}
