package me.meeshy.core.e2ee.vault

import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Ce que l'appareil garde de lui-même pour l'E2EE (spec § 4.4) : les enregistrements sérialisés de libsignal, le clair
 * de ce qu'il a déchiffré ou envoyé, ses appareils approuvés, son enrôlement, son identité. Miroir de
 * `E2EERecordVaultProviding` (iOS, GRDB scellée). Rien de tout cela ne part au serveur.
 */
public enum class RecordKind(public val tag: String) {
    IDENTITY("identity"),
    REMOTE_IDENTITY("remoteIdentity"),
    PRE_KEY("preKey"),
    SIGNED_PRE_KEY("signedPreKey"),
    KYBER_PRE_KEY("kyberPreKey"),
    KYBER_LAST_RESORT_MARKER("kyberLastResortMarker"),
    KYBER_BASE_KEY_SEEN("kyberBaseKeySeen"),
    SESSION("session"),
    SENDER_KEY("senderKey"),
    KEY_ID_COUNTER("keyIdCounter"),
    PLAINTEXT("plaintext"),
    SIGNAL_RECEIVED("signalReceived"),
    APPROVED_OWN_DEVICE("approvedOwnDevice"),
    LOCAL_ENROLLMENT("localEnrollment"),
}

/** Une lecture cohérente du coffre. */
public interface RecordReader {
    public fun load(kind: RecordKind, key: String): ByteArray?
    public fun keys(kind: RecordKind): List<String>
}

/** Une transaction : ses lectures voient ses propres écritures, et elles partent ensemble ou pas du tout. */
public interface RecordTransaction : RecordReader {
    public fun save(kind: RecordKind, key: String, value: ByteArray)
    public fun remove(kind: RecordKind, key: String)
    public fun removeAll()
}

public interface RecordVault {
    public fun <T> read(block: (RecordReader) -> T): T

    /**
     * Sous le verrou du coffre : un déchiffrement et le nouvel état du ratchet (et le clair qu'il a produit) s'écrivent
     * ensemble, ou rien ne l'est. Une exception annule toute la transaction.
     */
    public fun <T> write(block: (RecordTransaction) -> T): T
}

/** Le stockage durable, opaque : il range des octets déjà scellés (ou non, en test) et applique un lot d'un coup. */
public interface RecordBackend {
    public fun load(kind: RecordKind, key: String): ByteArray?
    public fun keys(kind: RecordKind): List<String>

    /** Applique le lot ATOMIQUEMENT : une valeur nulle efface. [clearFirst] vide tout avant le lot. */
    public fun commit(changes: Map<RecordId, ByteArray?>, clearFirst: Boolean)
}

public data class RecordId(val kind: RecordKind, val key: String)

/**
 * Le coffre transactionnel sur un [RecordBackend] : les écritures d'une transaction s'accumulent en mémoire et ne
 * touchent le stockage qu'au succès du bloc, en UN lot. Un seul écrivain à la fois (verrou réentrant) : sur Android,
 * l'app et le service de notification partagent le processus, un verrou du processus suffit (iOS : `flock` app ↔ NSE).
 */
public class TransactionalRecordVault(private val backend: RecordBackend) : RecordVault {
    private val lock = ReentrantLock()

    override fun <T> read(block: (RecordReader) -> T): T = lock.withLock { block(BackendReader(backend)) }

    override fun <T> write(block: (RecordTransaction) -> T): T = lock.withLock {
        val transaction = PendingTransaction(backend)
        val result = block(transaction)
        if (transaction.hasChanges) backend.commit(transaction.changes, transaction.cleared)
        result
    }

    private class BackendReader(private val backend: RecordBackend) : RecordReader {
        override fun load(kind: RecordKind, key: String): ByteArray? = backend.load(kind, key)?.copyOf()
        override fun keys(kind: RecordKind): List<String> = backend.keys(kind)
    }

    private class PendingTransaction(private val backend: RecordBackend) : RecordTransaction {
        val changes = LinkedHashMap<RecordId, ByteArray?>()
        var cleared = false
            private set

        val hasChanges: Boolean get() = cleared || changes.isNotEmpty()

        override fun load(kind: RecordKind, key: String): ByteArray? {
            val id = RecordId(kind, key)
            if (changes.containsKey(id)) return changes[id]?.copyOf()
            if (cleared) return null
            return backend.load(kind, key)?.copyOf()
        }

        override fun keys(kind: RecordKind): List<String> {
            val stored = if (cleared) emptyList() else backend.keys(kind)
            val written = changes.filter { (id, value) -> id.kind == kind && value != null }.keys.map { it.key }
            val erased = changes.filter { (id, value) -> id.kind == kind && value == null }.keys.map { it.key }.toSet()
            return (stored + written).distinct().filterNot { it in erased }
        }

        override fun save(kind: RecordKind, key: String, value: ByteArray) {
            changes[RecordId(kind, key)] = value.copyOf()
        }

        override fun remove(kind: RecordKind, key: String) {
            changes[RecordId(kind, key)] = null
        }

        override fun removeAll() {
            changes.clear()
            cleared = true
        }
    }
}

/** Le stockage en mémoire : les témoins, et un repli qui ne garde rien au-delà du processus. */
public class InMemoryRecordBackend : RecordBackend {
    private val records = LinkedHashMap<RecordId, ByteArray>()

    @Synchronized
    override fun load(kind: RecordKind, key: String): ByteArray? = records[RecordId(kind, key)]?.copyOf()

    @Synchronized
    override fun keys(kind: RecordKind): List<String> = records.keys.filter { it.kind == kind }.map { it.key }

    @Synchronized
    override fun commit(changes: Map<RecordId, ByteArray?>, clearFirst: Boolean) {
        if (clearFirst) records.clear()
        changes.forEach { (id, value) -> if (value == null) records.remove(id) else records[id] = value.copyOf() }
    }

    @Synchronized
    public fun snapshot(): Map<RecordId, ByteArray> = records.mapValues { it.value.copyOf() }
}
