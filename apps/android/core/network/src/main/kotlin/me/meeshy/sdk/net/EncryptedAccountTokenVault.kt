package me.meeshy.sdk.net

import me.meeshy.sdk.model.security.SecureStore
import me.meeshy.sdk.model.security.SecureStoreMigration

/**
 * [AccountTokenVault] on a [SecureStore]: each account's tokens live under its own
 * namespace (`<userId>.jwt`, `<userId>.session_token`) — the very slots
 * [EncryptedTokenStore] reads for the active account, so switching the active
 * account never mixes two token sets.
 */
class EncryptedAccountTokenVault(private val store: SecureStore) : AccountTokenVault {

    override fun tokens(userId: String): AccountTokens? {
        val tokens = AccountTokens(
            jwt = store.get(KEY_JWT, userId),
            sessionToken = store.get(KEY_SESSION, userId),
        )
        return tokens.takeUnless { it.isEmpty }
    }

    override fun save(userId: String, tokens: AccountTokens) {
        put(KEY_JWT, tokens.jwt, userId)
        put(KEY_SESSION, tokens.sessionToken, userId)
    }

    override fun remove(userId: String) {
        store.remove(KEY_JWT, userId)
        store.remove(KEY_SESSION, userId)
    }

    /** Moves tokens written before [userId] was known (bare keys) into its namespace. */
    fun adoptLegacyTokens(userId: String) {
        SecureStoreMigration.adoptBareKeys(store, userId, TOKEN_KEYS)
    }

    private fun put(key: String, value: String?, userId: String) {
        if (value == null) store.remove(key, userId) else store.put(key, value, userId)
    }

    companion object {
        const val KEY_JWT = "jwt"
        const val KEY_SESSION = "session_token"
        val TOKEN_KEYS: List<String> = listOf(KEY_JWT, KEY_SESSION)
    }
}
