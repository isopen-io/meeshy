package me.meeshy.core.e2ee.open

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.content.E2eeContentException
import me.meeshy.core.e2ee.content.E2eePayloadKind
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.session.E2eeCipherFormatException
import me.meeshy.core.e2ee.session.E2eeCiphertext
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.store.E2eeDeviceAddress
import me.meeshy.core.e2ee.store.E2eeLocalDevice
import me.meeshy.core.e2ee.store.E2eeOwnDeviceApprovals
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.store.E2eePlaintextRecords
import me.meeshy.core.e2ee.store.unbase64
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordReader
import me.meeshy.core.e2ee.vault.RecordVault
import me.meeshy.core.e2ee.wire.E2eeJson
import me.meeshy.core.e2ee.wire.E2eeServedEnvelope
import org.signal.libsignal.protocol.DuplicateMessageException
import org.signal.libsignal.protocol.InvalidKeyException
import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.InvalidMessageException
import org.signal.libsignal.protocol.InvalidVersionException
import org.signal.libsignal.protocol.LegacyMessageException
import org.signal.libsignal.protocol.NoSessionException
import org.signal.libsignal.protocol.UntrustedIdentityException

/** Ce que devient une enveloppe reçue, miroir de `E2EEOpenOutcome` (iOS). */
public sealed interface E2eeOpenOutcome {
    /** Le message, ouvert, et son clair rangé au coffre. */
    public data class Opened(
        val messageId: String,
        val conversationId: String,
        val senderUserId: String,
        val senderDeviceId: Int,
        val content: E2eeContent,
    ) : E2eeOpenOutcome

    /** Chiffrée pour une autre génération de ma place (#12592) : écartée, jamais ouverte, jamais acquittée. */
    public data class NotForThisDevice(val envelopeId: String) : E2eeOpenOutcome

    /** Le coffre a refusé, ou l'appareil émetteur est un des miens non approuvé : rien n'est décidé, l'enveloppe attend. */
    public data class Deferred(val envelopeId: String) : E2eeOpenOutcome

    /** libsignal l'a refusée : la ligne locale le dit, rien ne repart en clair, aucun renvoi n'est demandé. */
    public data class Undecryptable(val messageId: String, val conversationId: String) : E2eeOpenOutcome

    /**
     * Un SIGNAL authentifié (#13142 : réaction, frappe, accusé…), rangé au coffre avec son déchiffrement. Son
     * application dans le fil n'est pas encore portée sur Android (#14591, suivi) : il est gardé, pas perdu.
     */
    public data class Signal(val signalId: String, val conversationId: String) : E2eeOpenOutcome

    public val acknowledges: Boolean get() = this is Opened || this is Undecryptable || this is Signal
}

/** Une enveloppe d'un de mes appareils pas (ou plus, ou pas sous cette clé) approuvé : elle attend. */
public class E2eeUnapprovedOwnDeviceException : Exception("envelope from an unapproved own device")

/**
 * L'ouverture des enveloppes de CET appareil (spec § 4.1 et § 4.3), par la socket ou par le rattrapage, miroir de
 * `E2EEEnvelopeOpener` (iOS). Le clair est rangé au coffre DANS la transaction du déchiffrement, puis l'enveloppe est
 * acquittée — effacée du serveur. Une enveloppe déjà ouverte (la socket et le rattrapage se croisent) n'est pas
 * redéchiffrée : un second déchiffrement échouerait (clé de message consommée) et effacerait le clair.
 */
public class E2eeEnvelopeOpener(
    private val local: E2eeLocalDevice,
    private val cipher: E2eeSessionCipher,
    private val directory: E2eeDirectoryClient,
    private val vault: RecordVault,
) {

    public fun open(envelope: E2eeServedEnvelope): E2eeOpenOutcome {
        if (!envelope.isAddressedTo(local.registrationId)) return E2eeOpenOutcome.NotForThisDevice(envelope.id)
        known(envelope)?.let { return it }
        val sender = E2eeDeviceAddress(envelope.senderUserId, envelope.senderDeviceId)
        // Un de mes appareils que je n'ai pas (encore) approuvé : l'enveloppe reste au serveur, NON déchiffrée (le ratchet
        // n'avance pas), et s'ouvrira au rattrapage qui suit l'approbation (spec § 3.5).
        if (sender.userId == local.userId && vault.read { E2eeOwnDeviceApprovals.pinned(sender.deviceId, it) } == null) {
            return E2eeOpenOutcome.Deferred(envelope.id)
        }
        return try {
            val body = unbase64(envelope.body) ?: throw E2eeCipherFormatException("envelope body is not base64")
            cipher.decrypt(E2eeCiphertext(envelope.type, body), sender) { plaintext, transaction ->
                // L'épingle se relit DANS la transaction : une clé qui n'est pas l'épinglée annule tout (le ratchet n'avance pas).
                if (sender.userId == local.userId) {
                    val pinned = E2eeOwnDeviceApprovals.pinned(sender.deviceId, transaction)
                    val presented = transaction.load(RecordKind.REMOTE_IDENTITY, "${sender.userId}.${sender.deviceId}")
                    if (pinned == null || presented == null || !pinned.contentEquals(presented)) throw E2eeUnapprovedOwnDeviceException()
                }
                if (E2eePayloadKind.of(plaintext) == E2eePayloadKind.SIGNAL) {
                    checkSignal(plaintext, envelope)
                    transaction.save(RecordKind.SIGNAL_RECEIVED, envelope.messageId, plaintext.trimTrailingPadding())
                    E2eeOpenOutcome.Signal(envelope.messageId, envelope.conversationId)
                } else {
                    val content = E2eeContent.decoded(plaintext)
                    if (!content.belongsTo(envelope.conversationId)) throw E2eeContentException.Misattributed()
                    if (!content.isAuthoredBy(envelope.senderUserId, envelope.senderDeviceId)) throw E2eeContentException.MisattributedAuthor()
                    E2eePlaintextRecords.save(E2eePlaintextEntry.Readable(content, envelope.senderUserId), envelope.messageId, transaction)
                    opened(envelope, content, envelope.senderUserId)
                }
            }
        } catch (error: Exception) {
            // La socket et le rattrapage peuvent ouvrir la même enveloppe en même temps : le second échoue APRÈS que le
            // premier a rangé le clair. Il le relit.
            known(envelope)?.let { return it }
            when {
                error is E2eeUnapprovedOwnDeviceException -> E2eeOpenOutcome.Deferred(envelope.id)
                !isVerdict(error) -> E2eeOpenOutcome.Deferred(envelope.id)
                else -> {
                    runCatching { vault.write { E2eePlaintextRecords.save(E2eePlaintextEntry.Undecryptable, envelope.messageId, it) } }
                    E2eeOpenOutcome.Undecryptable(envelope.messageId, envelope.conversationId)
                }
            }
        }
    }

    /** Ouvre puis acquitte une enveloppe reçue en temps réel. */
    public suspend fun receive(envelope: E2eeServedEnvelope): E2eeOpenOutcome {
        val outcome = open(envelope)
        acknowledge(listOf(envelope to outcome))
        return outcome
    }

    /** Relit toutes les enveloppes en attente, les ouvre et les acquitte. */
    public suspend fun catchUp(): List<E2eeOpenOutcome> {
        val outcomes = mutableListOf<E2eeOpenOutcome>()
        var cursor: String? = null
        do {
            val page = directory.envelopes(cursor, PAGE_SIZE)
            val opened = page.envelopes.map { it to open(it) }
            acknowledge(opened)
            outcomes += opened.map { it.second }
            cursor = if (page.envelopes.isEmpty()) null else page.nextCursor
        } while (cursor != null)
        return outcomes
    }

    /** Une enveloppe ouverte, ou définitivement illisible, s'efface du serveur ; un échec d'accusé se rejoue au rattrapage. */
    private suspend fun acknowledge(opened: List<Pair<E2eeServedEnvelope, E2eeOpenOutcome>>) {
        val ids = opened.filter { it.second.acknowledges }.map { it.first.id }
        if (ids.isEmpty()) return
        runCatching { directory.acknowledge(ids) }
    }

    private fun known(envelope: E2eeServedEnvelope): E2eeOpenOutcome? = vault.read { reader -> knownIn(reader, envelope) }

    private fun knownIn(reader: RecordReader, envelope: E2eeServedEnvelope): E2eeOpenOutcome? {
        if (reader.load(RecordKind.SIGNAL_RECEIVED, envelope.messageId) != null) {
            return E2eeOpenOutcome.Signal(envelope.messageId, envelope.conversationId)
        }
        return when (val entry = E2eePlaintextRecords.load(envelope.messageId, reader)) {
            is E2eePlaintextEntry.Readable -> opened(envelope, entry.content, entry.senderUserId)
            E2eePlaintextEntry.Undecryptable -> E2eeOpenOutcome.Undecryptable(envelope.messageId, envelope.conversationId)
            null -> null
        }
    }

    private fun opened(envelope: E2eeServedEnvelope, content: E2eeContent, senderUserId: String): E2eeOpenOutcome.Opened =
        E2eeOpenOutcome.Opened(envelope.messageId, envelope.conversationId, senderUserId, envelope.senderDeviceId, content)

    /**
     * Un signal ne se range que s'il est à SA place : sa version, la conversation de l'enveloppe, et l'appareil que
     * libsignal vient d'authentifier comme auteur (`E2EESignal.isAuthored`, iOS : un signal sans auteur n'est celui de personne).
     */
    private fun checkSignal(plaintext: ByteArray, envelope: E2eeServedEnvelope) {
        val root = try {
            E2eeJson.parseToJsonElement(plaintext.decodeToString()).jsonObject
        } catch (error: IllegalArgumentException) {
            throw E2eeContentException.Malformed(error)
        }
        fun text(key: String): String? = (root[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val version = (root["s"] as? JsonPrimitive)?.intOrNull
        if (version != SIGNAL_VERSION) throw E2eeContentException.UnsupportedVersion(version ?: -1)
        if (text("conversationId") != envelope.conversationId) throw E2eeContentException.Misattributed()
        val author = text("authorUserId")
        val authorDevice = root["authorDeviceId"]?.jsonPrimitive?.intOrNull
        if (author != envelope.senderUserId || authorDevice != envelope.senderDeviceId) throw E2eeContentException.MisattributedAuthor()
    }

    public companion object {
        public const val PAGE_SIZE: Int = 100
        private const val SIGNAL_VERSION = 1

        /**
         * Une erreur qui JUGE l'enveloppe (libsignal la refuse, son contenu est illisible ou mal placé) — par opposition au
         * coffre qui refuse « pas maintenant ». Seul un verdict efface l'enveloppe : un refus de stockage acquitté perdrait
         * le message à jamais.
         */
        public fun isVerdict(error: Throwable): Boolean = when (error) {
            is InvalidMessageException, is DuplicateMessageException, is InvalidKeyIdException, is InvalidKeyException,
            is UntrustedIdentityException, is NoSessionException, is InvalidVersionException, is LegacyMessageException,
            is E2eeContentException, is E2eeCipherFormatException, is SerializationException,
            -> true
            else -> false
        }
    }
}

private fun ByteArray.trimTrailingPadding(): ByteArray {
    var end = size
    while (end > 0 && this[end - 1] == 0x20.toByte()) end--
    return copyOfRange(0, end)
}
