package me.meeshy.core.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.security.SecureKeyNamespace
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore

/**
 * [SecureStore] on the Android Keystore through `EncryptedSharedPreferences`.
 *
 * - Lazy: nothing touches the Keystore until the first read/write, and the
 *   suspend variants run on [io], so the first frame never waits for it.
 * - Fail-soft: an unusable Keystore (invalidated key, restored backup,
 *   `AEADBadTagException`, `KeyStoreException`) is an EMPTY vault. The corrupt
 *   file is recreated once through [reset]; if it still cannot open, the store
 *   stays empty and writes report `false`. It never throws, never loops.
 * - `get` stays fail-soft, but [read] does NOT confuse "absent" with "unreadable": a file recreated
 *   after an open failure (we cannot know what it held) and any entry that throws are
 *   [SecureRead.Unreadable], so a caller never regenerates a secret over data it merely failed to read.
 *   [acknowledgeRecovery] is the explicit, per-account way out.
 * - Durable recovery: the "recreated" mark and the per-account acknowledgements also live in
 *   [recoveryLedger], a plain (non-secret) file written BEFORE the vault file is deleted, so the
 *   next launch still reads [SecureRead.Unreadable] instead of "absent". An unreadable ledger keeps
 *   every account unreadable; a ledger that cannot be written leaves the vault file in place.
 * - Silent: no value (and no key) is ever logged.
 *
 * [open] is injected so tests substitute real `SharedPreferences` for the
 * Keystore-bound ones (Robolectric has no `AndroidKeyStore` provider).
 */
class KeystoreSecureStore(
    private val open: () -> SharedPreferences,
    private val reset: () -> Unit = {},
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val recoveryLedger: () -> SharedPreferences? = { null },
) : SecureStore {

    private val lock = Any()
    private var cached: SharedPreferences? = null
    private var gaveUp = false
    private var recreated = false
    private val acknowledged = mutableSetOf<String>()
    private var ledgerBroken = false
    private val ledger: SharedPreferences? by lazy {
        try {
            recoveryLedger()
        } catch (_: Exception) {
            ledgerBroken = true
            null
        }
    }

    private fun prefs(): SharedPreferences? = synchronized(lock) {
        cached ?: if (gaveUp) null else openOrRecreate().also { cached = it; gaveUp = it == null }
    }

    private fun openOrRecreate(): SharedPreferences? =
        attempt(open) ?: run {
            recreated = true
            if (!markRecreated()) return null
            attempt(reset)
            attempt(open)
        }

    private fun markRecreated(): Boolean {
        val ledger = ledger ?: return !ledgerBroken
        return attempt { ledger.edit().putBoolean(RECREATED, true).remove(ACKNOWLEDGED).commit() } == true
    }

    private fun <T> attempt(block: () -> T): T? = try {
        block()
    } catch (_: Exception) {
        null
    }

    override fun get(key: String, account: String?): String? =
        prefs()?.let { attempt { it.getString(SecureKeyNamespace.compose(account, key), null) } }

    override fun read(key: String, account: String?): SecureRead {
        val prefs = prefs() ?: return SecureRead.Unreadable
        if (isRecoveryPending(account)) return SecureRead.Unreadable
        val composed = SecureKeyNamespace.compose(account, key)
        return try {
            if (!prefs.contains(composed)) SecureRead.Absent
            else prefs.getString(composed, null)?.let(SecureRead::Present) ?: SecureRead.Unreadable
        } catch (_: Exception) {
            SecureRead.Unreadable
        }
    }

    override fun acknowledgeRecovery(account: String?) {
        val owner = SecureKeyNamespace.normalize(account).orEmpty()
        synchronized(lock) {
            acknowledged.add(owner)
            val ledger = ledger ?: return
            attempt {
                val known = ledger.getStringSet(ACKNOWLEDGED, null).orEmpty()
                ledger.edit().putStringSet(ACKNOWLEDGED, known + owner).commit()
            }
        }
    }

    private fun isRecoveryPending(account: String?): Boolean = synchronized(lock) {
        val owner = SecureKeyNamespace.normalize(account).orEmpty()
        (recreated || ledgerSaysRecreated()) && owner !in acknowledged && !ledgerAcknowledged(owner)
    }

    private fun ledgerSaysRecreated(): Boolean {
        val ledger = ledger ?: return ledgerBroken
        return attempt { ledger.getBoolean(RECREATED, false) } ?: true
    }

    private fun ledgerAcknowledged(owner: String): Boolean {
        val ledger = ledger ?: return false
        return attempt { ledger.getStringSet(ACKNOWLEDGED, null).orEmpty().contains(owner) } ?: false
    }

    override fun put(key: String, value: String, account: String?): Boolean {
        val prefs = prefs() ?: return false
        return attempt { prefs.edit().putString(SecureKeyNamespace.compose(account, key), value).commit() } ?: false
    }

    override fun remove(key: String, account: String?) {
        val prefs = prefs() ?: return
        attempt { prefs.edit().remove(SecureKeyNamespace.compose(account, key)).commit() }
    }

    override fun keys(account: String?): Set<String> {
        val prefs = prefs() ?: return emptySet()
        val raw = attempt { prefs.all.keys.toList() } ?: return emptySet()
        return raw.mapNotNull { SecureKeyNamespace.bareKey(it, account) }.toSet()
    }

    override fun clearAccount(account: String) {
        val owner = SecureKeyNamespace.normalize(account) ?: return
        val prefs = prefs() ?: return
        attempt {
            val editor = prefs.edit()
            prefs.all.keys.filter { SecureKeyNamespace.belongsTo(it, owner) }.forEach { editor.remove(it) }
            editor.commit()
        }
    }

    override fun clearAll() {
        val prefs = prefs() ?: return
        attempt { prefs.edit().clear().commit() }
    }

    override suspend fun getSuspend(key: String, account: String?): String? =
        withContext(io) { get(key, account) }

    override suspend fun putSuspend(key: String, value: String, account: String?): Boolean =
        withContext(io) { put(key, value, account) }

    override suspend fun removeSuspend(key: String, account: String?) =
        withContext(io) { remove(key, account) }

    companion object {
        private const val RECREATED = "recreated"
        private const val ACKNOWLEDGED = "acknowledged"

        /** Opens (or reopens, unchanged) the Keystore-encrypted file [fileName]. */
        fun create(context: Context, fileName: String): KeystoreSecureStore {
            val app = context.applicationContext
            return KeystoreSecureStore(
                open = {
                    val masterKey = MasterKey.Builder(app)
                        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                        .build()
                    EncryptedSharedPreferences.create(
                        app,
                        fileName,
                        masterKey,
                        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                    )
                },
                reset = { app.deleteSharedPreferences(fileName) },
                recoveryLedger = { app.getSharedPreferences("$fileName.recovery", Context.MODE_PRIVATE) },
            )
        }
    }
}
