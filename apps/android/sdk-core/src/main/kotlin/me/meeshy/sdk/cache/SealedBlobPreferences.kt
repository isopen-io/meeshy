package me.meeshy.sdk.cache

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CancellationException
import me.meeshy.core.datastore.BlobCodec
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Encryption at rest of the JSON blobs a Preferences [DataStore] keeps. A value written in clear before encryption
 * existed is read as is, then re-sealed once ([sealLegacy]); a value that cannot be opened is a cache miss.
 */
internal class SealedBlobPreferences(
    private val dataStore: DataStore<Preferences>,
    private val codec: BlobCodec,
    private val owns: (String) -> Boolean,
) {
    private val checked = AtomicBoolean(false)

    fun seal(plain: String, slot: String): String = codec.seal(plain, slot)

    fun open(stored: String?, slot: String): String? = stored?.let { codec.open(it, slot) }

    /**
     * Re-seals, in one edit, every clear-text blob whose key [owns]. A failure to encrypt leaves the clear value readable
     * where it is — it is never rewritten in clear — and the next call retries.
     */
    suspend fun sealLegacy() {
        if (checked.get()) return
        try {
            dataStore.edit { prefs ->
                prefs.asMap().entries
                    .filter { (key, value) -> owns(key.name) && value is String && codec.isLegacy(value) }
                    .forEach { (key, value) -> prefs[stringPreferencesKey(key.name)] = codec.seal(value as String, key.name) }
            }
            checked.set(true)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
        }
    }
}
