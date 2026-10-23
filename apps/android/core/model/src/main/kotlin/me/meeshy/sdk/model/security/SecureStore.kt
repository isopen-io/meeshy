package me.meeshy.sdk.model.security

/**
 * The device secret vault — Android mirror of iOS `KeychainStoring` /
 * `KeychainManager`. Values are addressed by (account, key); a call with no
 * account never reaches a namespaced value (see [SecureKeyNamespace]).
 *
 * Contract: a Keystore failure (invalidated key, restored backup, bad tag) is
 * an absent value, never an exception — the app starts with an empty vault and
 * falls back to the sign-in screen. Implementations never log a value.
 *
 * The suspend variants are the ones to use at startup: Keystore-backed
 * implementations run them off the main thread.
 */
interface SecureStore {
    fun get(key: String, account: String? = null): String?

    /** `true` when the value was durably written, `false` on any failure. */
    fun put(key: String, value: String, account: String? = null): Boolean

    fun remove(key: String, account: String? = null)

    /** The bare keys currently held for [account] (bare keys when null). */
    fun keys(account: String? = null): Set<String>

    /** Drops every value of [account] (no-op for a blank account). */
    fun clearAccount(account: String)

    /** Drops everything: account deletion / factory reset. */
    fun clearAll()

    suspend fun getSuspend(key: String, account: String? = null): String? = get(key, account)

    suspend fun putSuspend(key: String, value: String, account: String? = null): Boolean =
        put(key, value, account)

    suspend fun removeSuspend(key: String, account: String? = null) = remove(key, account)
}
