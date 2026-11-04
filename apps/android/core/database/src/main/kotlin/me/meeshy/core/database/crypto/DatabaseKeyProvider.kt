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
public open class DatabaseEncryptionException(message: String, cause: Throwable? = null) : IllegalStateException(message, cause)

/**
 * Le coffre n'a pas rendu la clé, sans prouver qu'elle est perdue (Keystore qui a renoncé, entrée illisible, valeur
 * malformée). Rien n'est écrasé : ce lancement s'ouvre en mémoire, le suivant relit le coffre.
 */
public class DatabaseKeyUnavailableException(message: String) : DatabaseEncryptionException(message)

/**
 * La clé aléatoire de la base, gardée dans son propre coffre Keystore (`@DatabaseKeyVault`, AES-GCM adossé à l'Android
 * Keystore), qui ne se recrée que sur un échec durable prouvé : une panne passagère du Keystore ne le vide jamais.
 * Créée une seule fois, relue à l'identique ensuite. Une clé n'est créée que dans deux cas, qui prouvent que l'ancienne
 * n'existe plus : le coffre la dit ABSENTE ([KeyOrigin.CREATED]), ou il a été RECRÉÉ (Keystore invalidé, réinstallation,
 * changement biométrique) et, la reprise acquittée, il la dit absente ([KeyOrigin.REGENERATED]) — la base chiffrée par
 * l'ancienne est alors irrécupérable et [KeyLossPolicy] la purge. Toute autre lecture qui échoue (coffre qui a renoncé,
 * entrée illisible, valeur malformée) lève [DatabaseKeyUnavailableException] SANS rien écrire : écraser la clé sur une
 * panne passagère détruirait la base, outbox comprise.
 */
public class DatabaseKeyProvider(
    private val store: SecureStore,
    private val random: () -> ByteArray = { secureRandomKey() },
) {
    @Volatile private var cached: DatabaseKey? = null

    public fun obtain(): DatabaseKey = cached ?: synchronized(this) { cached ?: load().also { cached = it } }

    /**
     * La clé déjà en mémoire, ou celle que le coffre rend telle quelle ; `null` sinon. Une LECTURE seule : ni création,
     * ni acquittement de reprise, ni écriture d'aucune sorte (le sauvetage d'une base ne doit rien changer au coffre).
     */
    public fun existingOrNull(): DatabaseKey? = cached ?: when (val read = store.read(KEY, ACCOUNT)) {
        is SecureRead.Present -> DatabaseKey.fromHex(read.value, KeyOrigin.EXISTING)
        SecureRead.Absent, SecureRead.Unreadable -> null
    }

    /**
     * Remplace une clé que le coffre ne rend pas ([DatabaseKeyUnavailableException]) par une clé neuve. Réservé à
     * l'appelant qui a prouvé qu'AUCUN fichier ne dépend de l'ancienne (base en clair ou absente) : la remplacer ne
     * perd alors rien, et la garder laisserait la base en clair sur le disque, lancement après lancement.
     */
    public fun replaceUnusable(): DatabaseKey = synchronized(this) { create(KeyOrigin.REGENERATED).also { cached = it } }

    /**
     * Détruit la clé : la base chiffrée devient irrécupérable. Aucun appelant en production : la déconnexion vide les
     * tables et les copies laissées par une reprise, elle ne change pas la clé.
     */
    public fun destroyKey() {
        synchronized(this) {
            store.remove(KEY, ACCOUNT)
            cached = null
        }
    }

    private fun load(): DatabaseKey = when (val read = store.read(KEY, ACCOUNT)) {
        is SecureRead.Present -> existing(read.value)
        SecureRead.Absent -> create(KeyOrigin.CREATED)
        SecureRead.Unreadable -> afterRecovery()
    }

    /**
     * Une lecture illisible ne dit pas encore si la clé est perdue. On acquitte la reprise du coffre puis on relit : seule
     * une ABSENCE, lue dans un coffre qui s'ouvre, prouve qu'il a été recréé sans elle.
     */
    private fun afterRecovery(): DatabaseKey {
        store.acknowledgeRecovery(ACCOUNT)
        return when (val reread = store.read(KEY, ACCOUNT)) {
            SecureRead.Absent -> create(KeyOrigin.REGENERATED)
            is SecureRead.Present -> existing(reread.value)
            SecureRead.Unreadable -> throw DatabaseKeyUnavailableException("database key is unreadable in the secure vault")
        }
    }

    private fun existing(value: String): DatabaseKey =
        DatabaseKey.fromHex(value, KeyOrigin.EXISTING)
            ?: throw DatabaseKeyUnavailableException("database key in the secure vault is malformed")

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
