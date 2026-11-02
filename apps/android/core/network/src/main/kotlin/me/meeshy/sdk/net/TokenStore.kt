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

    /**
     * Of [candidates], the accounts whose session sleeps in the vault — what makes "stay signed in"
     * worth offering (iOS `hasPreservedSession`). A store without a per-account vault holds none.
     */
    fun accountsWithTokens(candidates: Collection<String>): Set<String> = emptySet()

    /** The tokens [userId] holds on this device — the active account's or a dormant one's; `null` when it holds none. */
    fun tokensOf(userId: String): AccountTokens? = null

    /**
     * Puts [tokens] to sleep under [userId] without making it active — a kept account brought back after a reinstall
     * (#14079). The active account is never overwritten this way.
     */
    fun keepDormant(userId: String, tokens: AccountTokens) = Unit
}

/** Volatile token store — for tests and previews. */
class InMemoryTokenStore(
    override var jwt: String? = null,
    override var sessionToken: String? = null,
    override var userId: String? = null,
) : TokenStore {
    private var dormant: Map<String, AccountTokens> = emptyMap()

    override val isAuthenticated: Boolean get() = jwt != null || sessionToken != null

    override fun accountsWithTokens(candidates: Collection<String>): Set<String> =
        candidates.filterTo(mutableSetOf()) { tokensOf(it) != null }

    override fun tokensOf(userId: String): AccountTokens? {
        if (userId == this.userId) return AccountTokens(jwt, sessionToken).takeUnless { it.isEmpty }
        return dormant[userId]
    }

    override fun keepDormant(userId: String, tokens: AccountTokens) {
        if (userId == this.userId || tokens.isEmpty) return
        dormant = dormant + (userId to tokens)
    }

    override fun clear() {
        userId?.let { dormant = dormant - it }
        jwt = null
        sessionToken = null
        userId = null
    }
}
