package me.meeshy.core.e2ee.open

import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.coroutines.CancellationException
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.content.E2eeContentException
import me.meeshy.core.e2ee.content.E2eeEnvelopeOrigin
import me.meeshy.core.e2ee.content.E2eeOpening
import me.meeshy.core.e2ee.content.E2eePayloadKind
import me.meeshy.core.e2ee.content.E2eePlaintextReader
import me.meeshy.core.e2ee.content.E2eeSignal
import me.meeshy.core.e2ee.content.E2eeSignalAction
import me.meeshy.core.e2ee.content.withoutTrailingWhitespace
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.session.E2eeCipherFormatException
import me.meeshy.core.e2ee.session.E2eeCiphertext
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.store.E2eeDeviceAddress
import me.meeshy.core.e2ee.store.E2eeLocalDevice
import me.meeshy.core.e2ee.store.E2eeOwnDeviceApprovals
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.store.E2eePlaintextRecords
import me.meeshy.core.e2ee.store.E2eeReceivedSignals
import me.meeshy.core.e2ee.store.isSameAccount
import me.meeshy.core.e2ee.store.unbase64
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordReader
import me.meeshy.core.e2ee.vault.RecordTransaction
import me.meeshy.core.e2ee.vault.RecordVault
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
    /**
     * Le message, ouvert, et son clair rangé au coffre. [servedAtMillis] est l'instant où la PASSERELLE a reçu le message
     * (`createdAt` de l'enveloppe), jamais l'horloge de l'émetteur écrite dans le chiffré (#14672) ; `null` s'il est illisible.
     */
    public data class Opened(
        val messageId: String,
        val conversationId: String,
        val senderUserId: String,
        val senderDeviceId: Int,
        val content: E2eeContent,
        val servedAtMillis: Long? = null,
    ) : E2eeOpenOutcome

    /** Chiffrée pour une autre génération de ma place (#12592) : écartée, jamais ouverte, jamais acquittée. */
    public data class NotForThisDevice(val envelopeId: String) : E2eeOpenOutcome

    /**
     * Servie hors format (#18972, #18973) : émetteur dont le compte n'est pas un identifiant servi par la passerelle honnête
     * (une autre casse du mien comprise), ou appareil hors `1..127`. Écartée, jamais ouverte, jamais acquittée.
     */
    public data class Malformed(val envelopeId: String) : E2eeOpenOutcome

    /** Le coffre a refusé, ou l'appareil émetteur est un des miens non approuvé : rien n'est décidé, l'enveloppe attend. */
    public data class Deferred(val envelopeId: String) : E2eeOpenOutcome

    /** libsignal l'a refusée : la ligne locale le dit, rien ne repart en clair, aucun renvoi n'est demandé. */
    public data class Undecryptable(val messageId: String, val conversationId: String) : E2eeOpenOutcome

    /**
     * Une version que cet appareil ne lit pas encore (#18980) : son clair est GARDÉ au coffre et l'enveloppe acquittée ; le
     * fil dit « mettez à jour », et une version plus récente de l'app le relit.
     */
    public data class FutureVersion(val messageId: String, val conversationId: String) : E2eeOpenOutcome

    /** Déjà supprimé pour tous par son auteur (#18981) : rien ne s'ouvre, l'enveloppe s'acquitte. */
    public data class Deleted(val messageId: String, val conversationId: String) : E2eeOpenOutcome

    /**
     * Un SIGNAL authentifié (#13142 : réaction, frappe, accusé…), rangé au coffre avec son déchiffrement. Seule la
     * suppression pour tous s'applique sur Android (#18981) ; les autres signaux sont gardés, pas perdus (#13202).
     */
    public data class Signal(val signalId: String, val conversationId: String) : E2eeOpenOutcome

    public val acknowledges: Boolean
        get() = this is Opened || this is Undecryptable || this is Signal || this is FutureVersion || this is Deleted
}

/** Une enveloppe d'un de mes appareils pas (ou plus, ou pas sous cette clé) approuvé : elle attend. */
public class E2eeUnapprovedOwnDeviceException : Exception("envelope from an unapproved own device")

/**
 * L'ouverture des enveloppes de CET appareil (spec § 4.1 et § 4.3), par la socket ou par le rattrapage, miroir de
 * `E2EEEnvelopeOpener` (iOS). Le clair est rangé au coffre DANS la transaction du déchiffrement, puis l'enveloppe est
 * acquittée — effacée du serveur. Une enveloppe déjà ouverte (la socket et le rattrapage se croisent) n'est pas
 * redéchiffrée : un second déchiffrement échouerait (clé de message consommée) et effacerait le clair.
 *
 * Une enveloppe que cet appareil ne sait pas traiter n'arrête jamais les autres (#18970) : toute lecture du coffre se
 * fait sous `try` (un refus du coffre fait ATTENDRE cette enveloppe, sans l'acquitter), et le rattrapage traite chaque
 * enveloppe isolément, `Error` comprise (audit de #19077, P1). Le clair se lit par la lecture STRICTE du contrat commun
 * ([E2eePlaintextReader], #18944), dont la profondeur est bornée avant toute analyse.
 */
public class E2eeEnvelopeOpener(
    private val local: E2eeLocalDevice,
    private val cipher: E2eeSessionCipher,
    private val directory: E2eeDirectoryClient,
    private val vault: RecordVault,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {

    public fun open(envelope: E2eeServedEnvelope): E2eeOpenOutcome {
        if (!envelope.isAddressedTo(local.registrationId)) return E2eeOpenOutcome.NotForThisDevice(envelope.id)
        if (!envelope.isWellFormed()) return E2eeOpenOutcome.Malformed(envelope.id)
        val stored = try {
            known(envelope)
        } catch (_: Exception) {
            return E2eeOpenOutcome.Deferred(envelope.id)
        }
        if (stored != null) return stored
        val sender = E2eeDeviceAddress(envelope.senderUserId, envelope.senderDeviceId)
        // Un de mes appareils que je n'ai pas (encore) approuvé : l'enveloppe reste au serveur, NON déchiffrée (le ratchet
        // n'avance pas), et s'ouvrira au rattrapage qui suit l'approbation (spec § 3.5).
        if (local.isMe(sender.userId) && !isApproved(sender.deviceId)) return E2eeOpenOutcome.Deferred(envelope.id)
        return try {
            decrypt(envelope, sender)
        } catch (error: Exception) {
            settle(envelope, error)
        }
    }

    /** Ouvre puis acquitte une enveloppe reçue en temps réel. */
    public suspend fun receive(envelope: E2eeServedEnvelope): E2eeOpenOutcome {
        val outcome = isolated(envelope)
        acknowledge(listOf(envelope to outcome))
        return outcome
    }

    /** Relit toutes les enveloppes en attente, les ouvre UNE À UNE et acquitte celles qui sont jugées ou rangées. */
    public suspend fun catchUp(): List<E2eeOpenOutcome> {
        val outcomes = mutableListOf<E2eeOpenOutcome>()
        var cursor: String? = null
        do {
            val page = directory.envelopes(cursor, PAGE_SIZE)
            val opened = page.envelopes.map { it to isolated(it) }
            acknowledge(opened)
            outcomes += opened.map { it.second }
            cursor = if (page.envelopes.isEmpty() && page.discarded == 0) null else page.nextCursor
        } while (cursor != null)
        return outcomes
    }

    /**
     * Une enveloppe qui fait lever autre chose qu'un verdict attend SEULE, même sur une `Error` (une panique que le pont JNI
     * rend en `AssertionError`, un débordement de pile) : elle n'interrompt ni la page, ni son accusé, ni la file.
     */
    private fun isolated(envelope: E2eeServedEnvelope): E2eeOpenOutcome = try {
        open(envelope)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Throwable) {
        E2eeOpenOutcome.Deferred(envelope.id)
    }

    private fun decrypt(envelope: E2eeServedEnvelope, sender: E2eeDeviceAddress): E2eeOpenOutcome {
        val body = unbase64(envelope.body) ?: throw E2eeCipherFormatException("envelope body is not base64")
        val origin = E2eeEnvelopeOrigin(envelope.conversationId, envelope.senderUserId, envelope.senderDeviceId)
        return cipher.decrypt(E2eeCiphertext(envelope.type, body), sender) { plaintext, transaction ->
            // L'épingle se relit DANS la transaction : une clé qui n'est pas l'épinglée annule tout (le ratchet n'avance pas).
            if (local.isMe(sender.userId)) requirePinned(sender, transaction)
            when (val opening = E2eePlaintextReader.open(plaintext, origin)) {
                is E2eeOpening.Message -> {
                    val entry = E2eePlaintextEntry.Readable(opening.content, envelope.senderUserId)
                    E2eePlaintextRecords.save(entry, envelope.messageId, transaction, nowMillis())
                    opened(envelope, opening.content, envelope.senderUserId)
                }
                is E2eeOpening.Signal -> {
                    E2eeReceivedSignals.save(envelope.messageId, envelope.conversationId, plaintext.unpadded(), transaction, nowMillis())
                    applyDeletion(opening.signal, envelope, transaction)
                    E2eeOpenOutcome.Signal(envelope.messageId, envelope.conversationId)
                }
                is E2eeOpening.FutureVersion -> keepFuture(opening, envelope, origin, transaction)
                is E2eeOpening.Unreadable ->
                    throw E2eeContentException.Malformed(IllegalArgumentException("e2ee plaintext unreadable: ${opening.reason}"))
                is E2eeOpening.Misattributed ->
                    throw if (opening.conversation) E2eeContentException.Misattributed() else E2eeContentException.MisattributedAuthor()
            }
        }
    }

    /**
     * Une version future d'un MESSAGE garde son JSON, à la place que l'enveloppe lui donnait (#18980) ; celle d'un SIGNAL se
     * range avec les signaux reçus. Dans les deux cas rien ne s'affiche à moitié, et rien n'est perdu.
     */
    private fun keepFuture(
        opening: E2eeOpening.FutureVersion,
        envelope: E2eeServedEnvelope,
        origin: E2eeEnvelopeOrigin,
        transaction: RecordTransaction,
    ): E2eeOpenOutcome {
        if (opening.payload == E2eePayloadKind.SIGNAL) {
            E2eeReceivedSignals.save(envelope.messageId, envelope.conversationId, opening.json, transaction, nowMillis())
            return E2eeOpenOutcome.Signal(envelope.messageId, envelope.conversationId)
        }
        val entry = E2eePlaintextEntry.FutureVersion(opening.version, opening.json, origin)
        E2eePlaintextRecords.save(entry, envelope.messageId, transaction, nowMillis())
        return E2eeOpenOutcome.FutureVersion(envelope.messageId, envelope.conversationId)
    }

    /**
     * Le minimum de #13202 porté sur Android (#18981) : une suppression pour tous s'applique quand l'auteur que libsignal
     * vient d'authentifier pour ce signal est l'auteur AUTHENTIFIÉ du message visé, et que ce message est rangé dans la
     * MÊME conversation. Son clair quitte le coffre et une pierre tombale le dit. Tout autre signal est gardé, jamais appliqué.
     */
    private fun applyDeletion(signal: E2eeSignal, envelope: E2eeServedEnvelope, transaction: RecordTransaction) {
        val action = signal.action as? E2eeSignalAction.DeleteForEveryone ?: return
        val target = E2eePlaintextRecords.load(action.target, transaction) as? E2eePlaintextEntry.Readable ?: return
        if (!isSameAccount(target.senderUserId, envelope.senderUserId) || !target.content.belongsTo(envelope.conversationId)) return
        E2eePlaintextRecords.save(E2eePlaintextEntry.DeletedForEveryone(envelope.conversationId), action.target, transaction, nowMillis())
    }

    private fun requirePinned(sender: E2eeDeviceAddress, transaction: RecordTransaction) {
        val pinned = E2eeOwnDeviceApprovals.pinned(sender.deviceId, transaction)
        val presented = transaction.load(RecordKind.REMOTE_IDENTITY, "${sender.userId}.${sender.deviceId}")
        if (pinned == null || presented == null || !pinned.contentEquals(presented)) throw E2eeUnapprovedOwnDeviceException()
    }

    /** Une approbation que le coffre ne relit pas n'en est pas une : l'enveloppe attend. */
    private fun isApproved(deviceId: Int): Boolean = try {
        vault.read { E2eeOwnDeviceApprovals.pinned(deviceId, it) } != null
    } catch (_: Exception) {
        false
    }

    /**
     * Après un échec : la socket et le rattrapage peuvent ouvrir la même enveloppe en même temps, le second échoue APRÈS que
     * le premier a rangé le clair, et il le relit. Sinon seul un VERDICT juge l'enveloppe ; tout le reste la fait attendre.
     */
    private fun settle(envelope: E2eeServedEnvelope, error: Exception): E2eeOpenOutcome {
        val stored = try {
            known(envelope)
        } catch (_: Exception) {
            null
        }
        if (stored != null) return stored
        if (error is E2eeUnapprovedOwnDeviceException || !isVerdict(error)) return E2eeOpenOutcome.Deferred(envelope.id)
        try {
            vault.write { E2eePlaintextRecords.save(E2eePlaintextEntry.Undecryptable, envelope.messageId, it, nowMillis()) }
        } catch (_: Exception) {
            // La ligne locale « illisible » n'a pas pu s'écrire : le verdict, lui, tient.
        }
        return E2eeOpenOutcome.Undecryptable(envelope.messageId, envelope.conversationId)
    }

    /** Une enveloppe ouverte, ou définitivement jugée, s'efface du serveur ; un échec d'accusé se rejoue au rattrapage. */
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
            is E2eePlaintextEntry.FutureVersion -> E2eeOpenOutcome.FutureVersion(envelope.messageId, envelope.conversationId)
            is E2eePlaintextEntry.DeletedForEveryone -> E2eeOpenOutcome.Deleted(envelope.messageId, envelope.conversationId)
            null -> null
        }
    }

    private fun opened(envelope: E2eeServedEnvelope, content: E2eeContent, senderUserId: String): E2eeOpenOutcome.Opened =
        E2eeOpenOutcome.Opened(envelope.messageId, envelope.conversationId, senderUserId, envelope.senderDeviceId, content, envelope.servedAtMillis())

    public companion object {
        public const val PAGE_SIZE: Int = 100

        /**
         * Une erreur qui JUGE l'enveloppe (libsignal la refuse, son contenu est illisible ou mal placé) — par opposition au
         * coffre qui refuse « pas maintenant ». Seul un verdict efface l'enveloppe : un refus de stockage acquitté perdrait
         * le message à jamais. Une erreur de décodage d'un enregistrement du COFFRE n'est pas un verdict : le clair, lui, se
         * juge par la lecture stricte, qui ne lève que des [E2eeContentException].
         */
        public fun isVerdict(error: Throwable): Boolean = when (error) {
            is InvalidMessageException, is DuplicateMessageException, is InvalidKeyIdException, is InvalidKeyException,
            is UntrustedIdentityException, is NoSessionException, is InvalidVersionException, is LegacyMessageException,
            is E2eeContentException, is E2eeCipherFormatException,
            -> true
            else -> false
        }
    }
}

/** L'instant où la passerelle a reçu le message, lu dans l'horodatage ISO-8601 qu'elle sert ; `null` s'il est illisible. */
private fun E2eeServedEnvelope.servedAtMillis(): Long? = try {
    Instant.parse(createdAt).toEpochMilli()
} catch (_: DateTimeParseException) {
    null
}

/** Le clair sans son remplissage ni aucun blanc JSON de fin, décodé en UTF-8 (déjà validé par la lecture stricte). */
private fun ByteArray.unpadded(): String = withoutTrailingWhitespace(toString(Charsets.UTF_8))
