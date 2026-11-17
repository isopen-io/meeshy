package me.meeshy.core.e2ee.store

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.content.E2eeEnvelopeOrigin
import me.meeshy.core.e2ee.content.E2eeOpening
import me.meeshy.core.e2ee.content.E2eePlaintextReader
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordReader
import me.meeshy.core.e2ee.vault.RecordTransaction

/**
 * Ce que l'appareil sait d'un message chiffré : son clair et l'auteur que libsignal a AUTHENTIFIÉ, ou le fait qu'il n'a
 * pas pu l'ouvrir (spec § 4.1 : une ligne « un message n'a pas pu être déchiffré », jamais un repli en clair), qu'il ne
 * sait pas ENCORE le lire, ou que son auteur l'a supprimé pour tous.
 */
public sealed interface E2eePlaintextEntry {
    public data class Readable(val content: E2eeContent, val senderUserId: String) : E2eePlaintextEntry

    public data object Undecryptable : E2eePlaintextEntry

    /**
     * Une version que cet appareil ne lit pas encore (#18980) : son JSON reste au coffre, scellé, avec la place que
     * l'enveloppe lui donnait (conversation, auteur authentifié) ; une version plus récente de l'app le relit à cette place.
     */
    public data class FutureVersion(val version: Long, val json: String, val origin: E2eeEnvelopeOrigin) : E2eePlaintextEntry

    /** Supprimé pour tous par son auteur, que libsignal a authentifié (#18981) : plus aucun clair, la place le dit. */
    public data class DeletedForEveryone(val conversationId: String) : E2eePlaintextEntry
}

@Serializable
private data class PlaintextRecord(
    val state: String,
    val content: E2eeContent? = null,
    val sender: String? = null,
    /** L'instant LOCAL du rangement (#14672) ; absent d'un enregistrement antérieur, tenu pour antérieur à toute borne. */
    val storedAt: Long? = null,
    val version: Long? = null,
    val json: String? = null,
    val senderDevice: Int? = null,
    val conversation: String? = null,
)

/** Le clair local, par identifiant de message, écrit dans la MÊME transaction que le déchiffrement qui l'a produit. */
public object E2eePlaintextRecords {
    private const val READABLE = "readable"
    private const val UNDECRYPTABLE = "undecryptable"
    private const val FUTURE = "future"
    private const val DELETED = "deleted"

    private class Stored(val entry: E2eePlaintextEntry, val conversationId: String?, val storedAt: Long?)

    public fun load(messageId: String, reader: RecordReader): E2eePlaintextEntry? =
        reader.load(RecordKind.PLAINTEXT, messageId)?.let { decode(it).entry }

    public fun save(entry: E2eePlaintextEntry, messageId: String, transaction: RecordTransaction, storedAt: Long = System.currentTimeMillis()) {
        val record = when (entry) {
            is E2eePlaintextEntry.Readable -> PlaintextRecord(READABLE, entry.content, entry.senderUserId, storedAt)
            E2eePlaintextEntry.Undecryptable -> PlaintextRecord(UNDECRYPTABLE, storedAt = storedAt)
            is E2eePlaintextEntry.FutureVersion -> PlaintextRecord(
                FUTURE,
                sender = entry.origin.senderUserId,
                storedAt = storedAt,
                version = entry.version,
                json = entry.json,
                senderDevice = entry.origin.senderDeviceId,
                conversation = entry.origin.conversationId,
            )
            is E2eePlaintextEntry.DeletedForEveryone -> PlaintextRecord(DELETED, storedAt = storedAt, conversation = entry.conversationId)
        }
        transaction.save(RecordKind.PLAINTEXT, messageId, recordJson.encodeToString(PlaintextRecord.serializer(), record).toByteArray())
    }

    /**
     * Les messages rangés pour [conversationId] jusqu'à [storedUpTo], horloge locale contre horloge locale (#14672). Une ligne
     * que le coffre ne relit pas ne bloque pas l'effacement des autres : scellée, elle ne livre rien.
     */
    internal fun storedIn(conversationId: String, storedUpTo: Long, reader: RecordReader): List<String> =
        reader.keys(RecordKind.PLAINTEXT).filter { id ->
            val stored = try {
                reader.load(RecordKind.PLAINTEXT, id)?.let(::decode)
            } catch (_: Exception) {
                null
            }
            stored != null && stored.conversationId == conversationId && (stored.storedAt ?: Long.MIN_VALUE) <= storedUpTo
        }

    private fun decode(raw: ByteArray): Stored {
        val record = recordJson.decodeFromString(PlaintextRecord.serializer(), raw.decodeToString())
        return when (record.state) {
            READABLE -> readable(record)
            FUTURE -> future(record)
            DELETED -> Stored(
                record.conversation?.let { E2eePlaintextEntry.DeletedForEveryone(it) } ?: E2eePlaintextEntry.Undecryptable,
                record.conversation,
                record.storedAt,
            )
            else -> Stored(E2eePlaintextEntry.Undecryptable, record.conversation, record.storedAt)
        }
    }

    private fun readable(record: PlaintextRecord): Stored {
        val content = record.content
        val sender = record.sender
        val entry = if (content != null && sender != null) E2eePlaintextEntry.Readable(content, sender) else E2eePlaintextEntry.Undecryptable
        return Stored(entry, content?.conversationId, record.storedAt)
    }

    /**
     * Une version future se RELIT à chaque lecture (#18980) : le jour où cette app sait lire sa version, le même
     * enregistrement s'ouvre, confronté à la place que l'enveloppe lui avait donnée.
     */
    private fun future(record: PlaintextRecord): Stored {
        val json = record.json
        val sender = record.sender
        val device = record.senderDevice
        val conversation = record.conversation
        val version = record.version
        if (json == null || sender == null || device == null || conversation == null || version == null) {
            return Stored(E2eePlaintextEntry.Undecryptable, conversation, record.storedAt)
        }
        val origin = E2eeEnvelopeOrigin(conversation, sender, device)
        val entry = when (val opening = E2eePlaintextReader.open(json.toByteArray(Charsets.UTF_8), origin)) {
            is E2eeOpening.Message -> E2eePlaintextEntry.Readable(opening.content, sender)
            is E2eeOpening.FutureVersion -> E2eePlaintextEntry.FutureVersion(opening.version, json, origin)
            else -> E2eePlaintextEntry.Undecryptable
        }
        return Stored(entry, conversation, record.storedAt)
    }
}

/**
 * Les signaux reçus (#13142), rangés avec la conversation de LEUR ENVELOPPE et l'instant local du rangement, pour partir
 * avec elle (#18981) — un signal `edit` porte du texte. Leur application, au-delà de la suppression pour tous, reste à
 * porter (#13202) : le JSON est gardé tel que libsignal l'a rendu, sans son remplissage.
 */
public object E2eeReceivedSignals {
    @Serializable
    private data class SignalRecord(val conversation: String, val json: String, val storedAt: Long)

    public fun save(signalId: String, conversationId: String, json: String, transaction: RecordTransaction, storedAt: Long) {
        val record = SignalRecord(conversationId, json, storedAt)
        transaction.save(RecordKind.SIGNAL_RECEIVED, signalId, recordJson.encodeToString(SignalRecord.serializer(), record).toByteArray())
    }

    internal fun storedIn(conversationId: String, storedUpTo: Long, reader: RecordReader): List<String> =
        reader.keys(RecordKind.SIGNAL_RECEIVED).filter { id ->
            val placed = try {
                reader.load(RecordKind.SIGNAL_RECEIVED, id)?.let(::placement)
            } catch (_: Exception) {
                null
            }
            placed != null && placed.first == conversationId && (placed.second ?: Long.MIN_VALUE) <= storedUpTo
        }

    /** La conversation et l'instant du rangement ; un signal rangé avant ce format (son JSON nu) se lit par sa clé `conversationId`. */
    private fun placement(raw: ByteArray): Pair<String, Long?>? {
        val root = recordJson.parseToJsonElement(raw.decodeToString()) as? JsonObject ?: return null
        val wrapped = (root["conversation"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val legacy = (root["conversationId"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val storedAt = (root["storedAt"] as? JsonPrimitive)?.takeUnless { it.isString }?.content?.toLongOrNull()
        return (wrapped ?: legacy)?.let { it to storedAt }
    }
}
