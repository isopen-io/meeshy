package me.meeshy.core.database.crypto

import java.security.SecureRandom
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore

/** D'où vient la clé de cette ouverture : relue, créée pour la première fois, ou recréée parce que l'ancienne a disparu. */
public enum class KeyOrigin { EXISTING, CREATED, REGENERATED }

/**
 * La clé brute de la base (32 octets). Jamais journalisée : [toString] n'en dit que l'origine.
 * La phrase secrète remise à SQLCipher est la forme « clé brute » `x'<hex>'` : pas de dérivation PBKDF2 à chaque
 * ouverture, la clé étant déjà aléatoire.
 */
public class DatabaseKey internal constructor(private val material: ByteArray, public val origin: KeyOrigin) {
    init {
        require(material.size == KEY_BYTES) { "database key must be $KEY_BYTES bytes" }
    }

    public fun hex(): String = material.joinToString("") { "%02x".format(it) }

    /** Une copie fraîche à chaque appel : SQLCipher peut effacer le tableau qu'on lui remet. */
    public fun passphrase(): ByteArray = "x'${hex()}'".toByteArray(Charsets.US_ASCII)

    override fun toString(): String = "DatabaseKey(origin=$origin)"

    public companion object {
        public const val KEY_BYTES: Int = 32

        internal fun fromHex(hex: String, origin: KeyOrigin): DatabaseKey? {
            if (hex.length != KEY_BYTES * 2) return null
            val bytes = ByteArray(KEY_BYTES)
            for (i in bytes.indices) {
                val high = Character.digit(hex[i * 2], 16)
                val low = Character.digit(hex[i * 2 + 1], 16)
                if (high < 0 || low < 0) return null
                bytes[i] = ((high shl 4) or low).toByte()
            }
            return DatabaseKey(bytes, origin)
        }
    }
}

/** Le chiffrement n'a pas pu se mettre en place : l'échec remonte, il n'y a JAMAIS de repli en clair. */
public class DatabaseEncryptionException(message: String, cause: Throwable? = null) : IllegalStateException(message, cause)

/**
 * La clé aléatoire de la base, gardée dans le coffre Keystore (`SecureStore`, AES-GCM adossé à l'Android Keystore).
 * Créée une seule fois, relue à l'identique ensuite. Si le coffre ne sait plus la relire (Keystore invalidé,
 * réinstallation, changement biométrique), une nouvelle clé est créée et marquée [KeyOrigin.REGENERATED] : la base
 * chiffrée par l'ancienne est alors irrécupérable et [KeyLossPolicy] la purge.
 */
public class DatabaseKeyProvider(
    private val store: SecureStore,
    private val random: () -> ByteArray = { secureRandomKey() },
) {
    @Volatile private var cached: DatabaseKey? = null

    public fun obtain(): DatabaseKey = cached ?: synchronized(this) { cached ?: load().also { cached = it } }

    /** Détruit la clé : la base chiffrée devient irrécupérable (déconnexion complète, effacement). */
    public fun destroyKey() {
        synchronized(this) {
            store.remove(KEY, ACCOUNT)
            cached = null
        }
    }

    private fun load(): DatabaseKey = when (val read = store.read(KEY, ACCOUNT)) {
        is SecureRead.Present -> DatabaseKey.fromHex(read.value, KeyOrigin.EXISTING) ?: create(KeyOrigin.REGENERATED)
        SecureRead.Absent -> create(KeyOrigin.CREATED)
        SecureRead.Unreadable -> {
            store.acknowledgeRecovery(ACCOUNT)
            create(KeyOrigin.REGENERATED)
        }
    }

    private fun create(origin: KeyOrigin): DatabaseKey {
        val key = DatabaseKey(random(), origin)
        if (!store.put(KEY, key.hex(), ACCOUNT)) {
            throw DatabaseEncryptionException("database key could not be stored in the secure vault")
        }
        return key
    }

    public companion object {
        internal const val KEY: String = "database.passphrase"
        internal const val ACCOUNT: String = "meeshy.database"

        public fun secureRandomKey(): ByteArray = ByteArray(DatabaseKey.KEY_BYTES).also { SecureRandom().nextBytes(it) }
    }
}
