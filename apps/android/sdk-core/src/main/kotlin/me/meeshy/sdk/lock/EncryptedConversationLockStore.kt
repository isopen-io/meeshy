package me.meeshy.sdk.lock

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * [ConversationLockStore] backed by the Android Keystore via
 * `EncryptedSharedPreferences` — mirrors `EncryptedTokenStore`'s pattern.
 * [lockedConversationIds] is derived from which lock keys exist rather than
 * kept as a separate persisted list, so it can never drift from the hashes
 * that actually gate a conversation.
 *
 * No Robolectric unit test exercises this class directly: `MasterKey.Builder`
 * requires the `AndroidKeyStore` security provider, which Robolectric's JVM
 * does not provide (`NoSuchAlgorithmException`/`KeyStoreException` — confirmed
 * live in CI, not assumed). This is exactly why `EncryptedTokenStore`, the
 * pattern this mirrors, ships with no dedicated test either — a codebase-wide
 * constraint of this Robolectric setup, not something specific to this class.
 * [InMemoryConversationLockStore] carries the full behavioural contract
 * ([InMemoryConversationLockStoreTest]); this class is a structural port of
 * the same logic onto real storage, verified by `./apps/android/meeshy.sh
 * check` compiling and by manual/instrumented verification before shipping
 * any UI on top of it.
 */
class EncryptedConversationLockStore(context: Context) : ConversationLockStore {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override val lockedConversationIds: Set<String>
        get() = prefs.all.keys
            .filter { it.startsWith(LOCK_KEY_PREFIX) }
            .map { it.removePrefix(LOCK_KEY_PREFIX) }
            .toSet()

    override fun hasMasterPin(): Boolean = prefs.contains(MASTER_PIN_KEY)

    override fun setMasterPin(pin: String) {
        prefs.edit().putString(MASTER_PIN_KEY, PinHasher.hash(pin)).apply()
    }

    override fun verifyMasterPin(pin: String): Boolean =
        prefs.getString(MASTER_PIN_KEY, null) == PinHasher.hash(pin)

    override fun removeMasterPin() {
        if (lockedConversationIds.isEmpty()) prefs.edit().remove(MASTER_PIN_KEY).apply()
    }

    override fun forceRemoveMasterPin() {
        prefs.edit().remove(MASTER_PIN_KEY).apply()
    }

    override fun isLocked(conversationId: String): Boolean = prefs.contains(lockKey(conversationId))

    override fun setLock(conversationId: String, pin: String) {
        prefs.edit().putString(lockKey(conversationId), PinHasher.hash(pin)).apply()
    }

    override fun verifyLock(conversationId: String, pin: String): Boolean =
        prefs.getString(lockKey(conversationId), null) == PinHasher.hash(pin)

    override fun removeLock(conversationId: String) {
        prefs.edit().remove(lockKey(conversationId)).apply()
    }

    override fun removeAllLocks() {
        val editor = prefs.edit()
        lockedConversationIds.forEach { editor.remove(lockKey(it)) }
        editor.apply()
    }

    private fun lockKey(conversationId: String) = "$LOCK_KEY_PREFIX$conversationId"

    companion object {
        private const val FILE_NAME = "meeshy_conversation_locks"
        private const val MASTER_PIN_KEY = "master_pin"
        private const val LOCK_KEY_PREFIX = "lock_"
    }
}
