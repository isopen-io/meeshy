package me.meeshy.core.crypto.session

import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore

/** Une clé de session et la version de dérivation qui l'a produite. */
public class E2eeSession(internal val key: ByteArray, public val version: Int) {
    override fun toString(): String = "E2eeSession(version=$version)"
}

/**
 * Les clés de session dans le coffre, une par pair, sous l'espace du compte : `<userId>.me.meeshy.e2ee.session.<peerId>`
 * (parité Keychain iOS), avec le registre `knownPeers` qui permet de toutes les effacer. Une valeur illisible
 * ou d'une autre version se lit « absente » : une session se dérive de nouveau à l'identique.
 */
public class SessionKeyStore(private val vault: SecureStore) {

    public fun load(userId: String, peerId: String): E2eeSession? {
        val stored = vault.read(SESSION_PREFIX + peerId, userId) as? SecureRead.Present ?: return null
        return decode(stored.value)
    }

    /** Persiste puis inscrit le pair au registre. `false` si le coffre n'a pas gardé la clé. */
    public fun save(userId: String, peerId: String, session: E2eeSession): Boolean {
        if (!vault.put(SESSION_PREFIX + peerId, encode(session), userId)) return false
        register(userId, peerId)
        return true
    }

    public fun knownPeers(userId: String?): List<String> = readPeers(userId)

    /** Efface chaque session du registre et le registre lui-même. */
    public fun clear(userId: String?) {
        readPeers(userId).forEach { vault.remove(SESSION_PREFIX + it, userId) }
        vault.remove(PEERS_KEY, userId)
    }

    public fun lastUserId(): String? = (vault.read(LAST_USER_KEY, null) as? SecureRead.Present)?.value

    public fun rememberUserId(userId: String) {
        if (lastUserId() != userId) vault.put(LAST_USER_KEY, userId, null)
    }

    public fun forgetUserId() {
        vault.remove(LAST_USER_KEY, null)
    }

    /**
     * Migre UNE fois par userId les clés d'avant l'espace de noms (sans compte) vers l'espace du compte.
     * Seuls les pairs du registre nu sont migrés ; les autres se rétablissent à l'usage. Idempotent.
     */
    public fun migrateLegacyIfNeeded(userId: String): Boolean {
        if (vault.read(MIGRATION_FLAG, userId) is SecureRead.Present) return false
        readPeers(null).forEach { peerId ->
            val legacy = vault.read(SESSION_PREFIX + peerId, null) as? SecureRead.Present
            if (legacy != null && vault.read(SESSION_PREFIX + peerId, userId) is SecureRead.Absent) {
                if (vault.put(SESSION_PREFIX + peerId, legacy.value, userId)) register(userId, peerId)
            }
            vault.remove(SESSION_PREFIX + peerId, null)
        }
        vault.remove(PEERS_KEY, null)
        vault.put(MIGRATION_FLAG, "1", userId)
        return true
    }

    private fun register(userId: String, peerId: String) {
        val peers = readPeers(userId)
        if (peerId !in peers) vault.put(PEERS_KEY, (peers + peerId).joinToString("\n"), userId)
    }

    private fun readPeers(userId: String?): List<String> =
        (vault.read(PEERS_KEY, userId) as? SecureRead.Present)?.value?.split('\n')?.filter { it.isNotBlank() }.orEmpty()

    private fun encode(session: E2eeSession): String = "${session.version}$VERSION_SEPARATOR${CanonicalBase64.encode(session.key)}"

    private fun decode(value: String): E2eeSession? {
        val separator = value.indexOf(VERSION_SEPARATOR)
        if (separator <= 0) return null
        val version = value.substring(0, separator).toIntOrNull() ?: return null
        if (version != SessionKeyDerivation.VERSION) return null
        val key = CanonicalBase64.decode(value.substring(separator + 1))?.takeIf { it.size == KEY_LENGTH } ?: return null
        return E2eeSession(key, version)
    }

    public companion object {
        public const val SESSION_PREFIX: String = "me.meeshy.e2ee.session."
        public const val PEERS_KEY: String = "me.meeshy.e2ee.knownPeers"
        private const val LAST_USER_KEY = "me.meeshy.e2ee.lastUserId"
        private const val MIGRATION_FLAG = "me.meeshy.e2ee.namespaceMigration"
        private const val VERSION_SEPARATOR = ':'
        private const val KEY_LENGTH = 32
    }
}
