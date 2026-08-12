package me.meeshy.sdk.auth

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.model.auth.SavedAccounts

/**
 * Persistent, observable store of remembered accounts — the Android building block
 * behind iOS `AuthManager`'s Keychain-backed `savedAccounts` (`upsertSavedAccount`/
 * `removeFromSavedAccounts`/`loadSavedAccounts`). Backs the login screen's one-tap
 * account picker; never stores a password or token, only display metadata.
 *
 * The pure membership/ordering logic lives in [SavedAccounts]; this seam owns only
 * durability and always exposes an already-[SavedAccounts.sorted] list — no caller
 * re-sorts. Mirrors [me.meeshy.sdk.chat.StarredMessagesStore].
 */
interface SavedAccountsStore {
    val accounts: StateFlow<List<SavedAccount>>

    /** Insert [account], or refresh it in place if its id is already remembered. */
    fun upsert(account: SavedAccount)

    /** Forget the account with [userId] (no-op when it is not remembered). */
    fun remove(userId: String)
}

/** Volatile [SavedAccountsStore] — for tests and previews. */
class InMemorySavedAccountsStore(
    initial: List<SavedAccount> = emptyList(),
) : SavedAccountsStore {
    private val _accounts = MutableStateFlow(SavedAccounts.sorted(initial))
    override val accounts: StateFlow<List<SavedAccount>> = _accounts.asStateFlow()

    override fun upsert(account: SavedAccount) = mutate { SavedAccounts.upsert(it, account) }
    override fun remove(userId: String) = mutate { SavedAccounts.remove(it, userId) }

    private fun mutate(op: (List<SavedAccount>) -> List<SavedAccount>) {
        val next = SavedAccounts.sorted(op(_accounts.value))
        if (next != _accounts.value) _accounts.value = next
    }
}

/**
 * [SavedAccountsStore] backed by SharedPreferences (mirrors iOS's persisted store —
 * Keychain, here plain SharedPreferences since only non-sensitive display metadata is
 * kept). The list is JSON-encoded under a single key, always stored already-sorted; a
 * corrupt/legacy blob decodes to an empty list instead of crashing.
 */
class SharedPrefsSavedAccountsStore(
    context: Context,
    private val json: Json,
) : SavedAccountsStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val _accounts = MutableStateFlow(SavedAccounts.sorted(decode(prefs.getString(KEY_ITEMS, null))))
    override val accounts: StateFlow<List<SavedAccount>> = _accounts.asStateFlow()

    override fun upsert(account: SavedAccount) = mutate { SavedAccounts.upsert(it, account) }
    override fun remove(userId: String) = mutate { SavedAccounts.remove(it, userId) }

    private fun mutate(op: (List<SavedAccount>) -> List<SavedAccount>) {
        val next = SavedAccounts.sorted(op(_accounts.value))
        if (next == _accounts.value) return
        prefs.edit().putString(KEY_ITEMS, json.encodeToString(SERIALIZER, next)).apply()
        _accounts.value = next
    }

    private fun decode(raw: String?): List<SavedAccount> =
        raw?.let { runCatching { json.decodeFromString(SERIALIZER, it) }.getOrNull() } ?: emptyList()

    private companion object {
        private const val FILE_NAME = "meeshy_saved_accounts"
        private const val KEY_ITEMS = "items"
        private val SERIALIZER = ListSerializer(SavedAccount.serializer())
    }
}
