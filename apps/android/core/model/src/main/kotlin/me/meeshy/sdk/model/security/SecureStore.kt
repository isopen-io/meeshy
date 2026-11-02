package me.meeshy.sdk.model.security

/**
 * The device secret vault — Android mirror of iOS `KeychainStoring` /
 * `KeychainManager`. Values are addressed by (account, key); a call with no
 * account never reaches a namespaced value (see [SecureKeyNamespace]).
 *
 * Contract: for [get], a Keystore failure (invalidated key, restored backup, bad tag) is
 * an absent value, never an exception — the app starts with an empty vault and
 * falls back to the sign-in screen. [read] does not confuse the two: a failure is
 * [SecureRead.Unreadable]. Implementations never log a value.
 *
 * The suspend variants are the ones to use at startup: Keystore-backed
 * implementations run them off the main thread.
 */
/** Lecture à trois états : une valeur ABSENTE n'est pas une valeur ILLISIBLE (clé invalidée, tag invalide, coffre recréé). */
sealed interface SecureRead {
    data class Present(val value: String) : SecureRead {
        override fun toString(): String = "Present"
    }

    data object Absent : SecureRead

    data object Unreadable : SecureRead
}

interface SecureStore {
    fun get(key: String, account: String? = null): String?

    /**
     * Lecture qui ne confond pas « absent » et « illisible ». Seul [SecureRead.Absent] autorise un
     * appelant à créer un secret ; l'implémentation par défaut (fail-soft) ne sait pas les distinguer.
     */
    fun read(key: String, account: String? = null): SecureRead =
        get(key, account)?.let(SecureRead::Present) ?: SecureRead.Absent

    /** Le compte [account] accepte de repartir d'un coffre recréé : ses lectures redeviennent fiables. */
    fun acknowledgeRecovery(account: String?) {}

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
