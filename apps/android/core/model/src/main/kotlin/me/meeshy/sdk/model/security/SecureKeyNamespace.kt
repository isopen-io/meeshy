package me.meeshy.sdk.model.security

/**
 * Pure key-namespacing law of the secure vault — mirror of iOS
 * `KeychainManager`'s `account` parameter.
 *
 * A value stored for an account lives under `<account>.<key>`; a call without
 * an account addresses the bare `<key>` and therefore can never read a
 * namespaced value. A bare key never contains the separator, which keeps the
 * two address spaces disjoint (user ids are Mongo ObjectIds, never dotted).
 */
object SecureKeyNamespace {

    const val SEPARATOR: Char = '.'

    /** A blank account is treated as no account at all. */
    fun normalize(account: String?): String? = account?.takeIf { it.isNotBlank() }

    /** The raw storage key for [key] under [account] (bare when no account). */
    fun compose(account: String?, key: String): String {
        val owner = normalize(account) ?: return key
        return "$owner$SEPARATOR$key"
    }

    /** `true` when [rawKey] belongs to an account namespace. */
    fun isNamespaced(rawKey: String): Boolean = rawKey.indexOf(SEPARATOR) > 0

    /** `true` when [rawKey] belongs to [account]'s namespace (bare when null). */
    fun belongsTo(rawKey: String, account: String?): Boolean {
        val owner = normalize(account) ?: return !isNamespaced(rawKey)
        return rawKey.startsWith("$owner$SEPARATOR")
    }

    /** The bare key of a raw key owned by [account], or `null` when it is not. */
    fun bareKey(rawKey: String, account: String?): String? {
        if (!belongsTo(rawKey, account)) return null
        val owner = normalize(account) ?: return rawKey
        return rawKey.removePrefix("$owner$SEPARATOR")
    }
}
