package me.meeshy.sdk.net

import me.meeshy.sdk.model.security.SecureStore

/**
 * [TokenStore] on the secure vault. Tokens of the active account live under
 * `<userId>.jwt` / `<userId>.session_token`; `user_id` (the active-account
 * pointer) stays bare. Tokens written before the user id is known — the login
 * flow stores them first — sit in bare slots and are adopted into the account's
 * namespace as soon as [userId] is set (and once per process for an install that
 * predates namespacing), the bare original always being removed.
 *
 * Reads are lazy: nothing opens the Keystore before the first token access.
 */
class EncryptedTokenStore(private val store: SecureStore) : TokenStore {

    private val vault = EncryptedAccountTokenVault(store)

    private val adoption = lazy {
        store.get(KEY_USER_ID)?.let { vault.adoptLegacyTokens(it) }
        true
    }

    override var jwt: String?
        get() = read(EncryptedAccountTokenVault.KEY_JWT)
        set(value) = write(EncryptedAccountTokenVault.KEY_JWT, value)

    override var sessionToken: String?
        get() = read(EncryptedAccountTokenVault.KEY_SESSION)
        set(value) = write(EncryptedAccountTokenVault.KEY_SESSION, value)

    override var userId: String?
        get() = store.get(KEY_USER_ID)
        set(value) {
            if (value == null) {
                store.remove(KEY_USER_ID)
                return
            }
            store.put(KEY_USER_ID, value)
            vault.adoptLegacyTokens(value)
        }

    override val isAuthenticated: Boolean get() = jwt != null || sessionToken != null

    /** Signs the active account out: its tokens and the active pointer go; dormant accounts stay. */
    override fun clear() {
        store.get(KEY_USER_ID)?.let(vault::remove)
        EncryptedAccountTokenVault.TOKEN_KEYS.forEach { store.remove(it) }
        store.remove(KEY_USER_ID)
    }

    private fun read(key: String): String? {
        adoption.value
        return store.get(key, store.get(KEY_USER_ID)) ?: store.get(key)
    }

    private fun write(key: String, value: String?) {
        adoption.value
        val account = store.get(KEY_USER_ID)
        if (value == null) {
            store.remove(key, account)
            store.remove(key)
        } else {
            store.put(key, value, account)
            if (key == EncryptedAccountTokenVault.KEY_JWT) store.remove(VisitorReaderKey.STORAGE_KEY)
        }
    }

    private companion object {
        private const val KEY_USER_ID = "user_id"
    }
}
