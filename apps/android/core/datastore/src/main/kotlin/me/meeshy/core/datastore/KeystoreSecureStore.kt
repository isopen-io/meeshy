package me.meeshy.core.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.security.SecureKeyNamespace
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
 * - Silent: no value (and no key) is ever logged.
 *
 * [open] is injected so tests substitute real `SharedPreferences` for the
 * Keystore-bound ones (Robolectric has no `AndroidKeyStore` provider).
 */
class KeystoreSecureStore(
    private val open: () -> SharedPreferences,
    private val reset: () -> Unit = {},
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : SecureStore {

    private val lock = Any()
    private var cached: SharedPreferences? = null
    private var gaveUp = false

    private fun prefs(): SharedPreferences? = synchronized(lock) {
        cached ?: if (gaveUp) null else openOrRecreate().also { cached = it; gaveUp = it == null }
    }

    private fun openOrRecreate(): SharedPreferences? =
        attempt(open) ?: run {
            attempt(reset)
            attempt(open)
        }

    private fun <T> attempt(block: () -> T): T? = try {
        block()
    } catch (_: Exception) {
        null
    }

    override fun get(key: String, account: String?): String? =
        prefs()?.let { attempt { it.getString(SecureKeyNamespace.compose(account, key), null) } }

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
            )
        }
    }
}
