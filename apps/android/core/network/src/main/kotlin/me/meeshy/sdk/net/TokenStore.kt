package me.meeshy.sdk.net

/**
 * Secure storage for the JWT (registered users) and session token (all users).
 * See /CLAUDE.md: registered users authenticate with `Authorization: Bearer`,
 * anonymous users with `X-Session-Token`.
 */
interface TokenStore {
    var jwt: String?
    var sessionToken: String?

    /**
     * The signed-in identity's id, persisted alongside the tokens. `SessionRepository`
     * (`:sdk-core`) is in-memory only and unpopulated in a cold process that never ran
     * the app's normal startup flow — a `GlanceAppWidget` update can be exactly that
     * process. Widgets needing the current user id (e.g. to resolve a direct
     * conversation's *other* participant) read this persisted mirror instead.
     */
    var userId: String?
    val isAuthenticated: Boolean
    fun clear()
}

/** Volatile token store — for tests and previews. */
class InMemoryTokenStore(
    override var jwt: String? = null,
    override var sessionToken: String? = null,
    override var userId: String? = null,
) : TokenStore {
    override val isAuthenticated: Boolean get() = jwt != null || sessionToken != null

    override fun clear() {
        jwt = null
        sessionToken = null
        userId = null
    }
}
