package me.meeshy.core.e2ee.store

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordReader
import me.meeshy.core.e2ee.vault.RecordTransaction
import me.meeshy.core.e2ee.vault.RecordVault

private val recordJson = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }

/** L'adresse de CET appareil telle que l'annuaire l'a enrôlé. */
@Serializable
public data class E2eeLocalDevice(val userId: String, val deviceId: Int, val registrationId: Int) {
    public val address: E2eeDeviceAddress get() = E2eeDeviceAddress(userId, deviceId)
}

/** L'adresse libsignal d'un appareil Meeshy : (identifiant de compte, numéro d'appareil). */
public data class E2eeDeviceAddress(val userId: String, val deviceId: Int) {
    internal val recordKey: String get() = "$userId.$deviceId"
}

public object E2eeEnrollmentRecords {
    private const val KEY = "current"

    public fun load(reader: RecordReader): E2eeLocalDevice? =
        reader.load(RecordKind.LOCAL_ENROLLMENT, KEY)?.let { recordJson.decodeFromString(E2eeLocalDevice.serializer(), it.decodeToString()) }

    public fun save(device: E2eeLocalDevice, transaction: RecordTransaction) {
        transaction.save(RecordKind.LOCAL_ENROLLMENT, KEY, recordJson.encodeToString(E2eeLocalDevice.serializer(), device).toByteArray())
    }
}

/**
 * Ce que l'appareil sait d'un message chiffré : son clair et l'auteur que libsignal a AUTHENTIFIÉ, ou le fait qu'il n'a
 * pas pu l'ouvrir (spec § 4.1 : une ligne « un message n'a pas pu être déchiffré », jamais un repli en clair).
 */
public sealed interface E2eePlaintextEntry {
    public data class Readable(val content: E2eeContent, val senderUserId: String) : E2eePlaintextEntry
    public data object Undecryptable : E2eePlaintextEntry
}

@Serializable
private data class PlaintextRecord(val state: String, val content: E2eeContent? = null, val sender: String? = null)

/** Le clair local, par identifiant de message, écrit dans la MÊME transaction que le déchiffrement qui l'a produit. */
public object E2eePlaintextRecords {
    public fun load(messageId: String, reader: RecordReader): E2eePlaintextEntry? =
        reader.load(RecordKind.PLAINTEXT, messageId)?.let { decode(it) }

    public fun save(entry: E2eePlaintextEntry, messageId: String, transaction: RecordTransaction) {
        val record = when (entry) {
            is E2eePlaintextEntry.Readable -> PlaintextRecord("readable", entry.content, entry.senderUserId)
            E2eePlaintextEntry.Undecryptable -> PlaintextRecord("undecryptable")
        }
        transaction.save(RecordKind.PLAINTEXT, messageId, recordJson.encodeToString(PlaintextRecord.serializer(), record).toByteArray())
    }

    private fun decode(raw: ByteArray): E2eePlaintextEntry {
        val record = recordJson.decodeFromString(PlaintextRecord.serializer(), raw.decodeToString())
        val content = record.content
        val sender = record.sender
        return if (record.state == "readable" && content != null && sender != null) E2eePlaintextEntry.Readable(content, sender)
        else E2eePlaintextEntry.Undecryptable
    }
}

/**
 * Le coffre des clairs, servi au seul compte dont l'installation est enrôlée (#13000) : un compte B connecté sur
 * l'appareil de A, tant qu'il ne s'est pas réenrôlé (ce qui efface tout), ne lit ni n'écrit rien du coffre de A.
 */
public class E2eePlaintextVault(private val vault: RecordVault, private val owner: String?) {

    public fun entry(messageId: String): E2eePlaintextEntry? = vault.read { reader ->
        if (!serves(reader)) null else E2eePlaintextRecords.load(messageId, reader)
    }

    public fun entries(messageIds: Collection<String>): Map<String, E2eePlaintextEntry> = vault.read { reader ->
        if (!serves(reader)) emptyMap()
        else messageIds.mapNotNull { id -> E2eePlaintextRecords.load(id, reader)?.let { id to it } }.toMap()
    }

    public fun save(entry: E2eePlaintextEntry, messageIds: Collection<String>) {
        vault.write { transaction ->
            if (!serves(transaction)) throw E2eeForeignVaultException()
            messageIds.forEach { E2eePlaintextRecords.save(entry, it, transaction) }
        }
    }

    public fun remove(messageIds: Collection<String>) {
        vault.write { transaction ->
            if (!serves(transaction) && E2eeEnrollmentRecords.load(transaction) != null) throw E2eeForeignVaultException()
            messageIds.forEach { transaction.remove(RecordKind.PLAINTEXT, it) }
        }
    }

    /**
     * Retire le clair de chaque message de [conversationId] composé jusqu'à [composedUpTo] (#14655) : une conversation
     * supprimée ne laisse rien au coffre, même des messages que le cache n'a jamais tenus. Le contenu porte sa
     * conversation DANS le chiffré : un serveur ne peut pas y faire entrer un message d'une autre.
     */
    public fun removeConversation(conversationId: String, composedUpTo: Long) {
        vault.write { transaction ->
            if (!serves(transaction) && E2eeEnrollmentRecords.load(transaction) != null) throw E2eeForeignVaultException()
            transaction.keys(RecordKind.PLAINTEXT)
                .filter { id ->
                    val readable = E2eePlaintextRecords.load(id, transaction) as? E2eePlaintextEntry.Readable
                    readable != null && readable.content.belongsTo(conversationId) && readable.content.sentAt <= composedUpTo
                }
                .forEach { transaction.remove(RecordKind.PLAINTEXT, it) }
        }
    }

    public fun servesItsOwner(): Boolean = vault.read(::serves)

    private fun serves(reader: RecordReader): Boolean = owner == null || E2eeEnrollmentRecords.load(reader)?.userId == owner
}

public class E2eeForeignVaultException : Exception("the e2ee vault belongs to another account")

/**
 * Une approbation d'un de MES appareils (spec § 3.5) : la clé d'identité épinglée et, quand l'appairage l'a vue, la
 * génération de la place. Une place reprise par une autre installation n'hérite jamais de l'approbation (#12543).
 */
@Serializable
public data class E2eeOwnDeviceApproval(val identityKey: String, val registrationId: Int? = null) {
    public fun covers(announced: Int): Boolean = registrationId?.let { it == announced } ?: true
}

/**
 * Mes autres appareils que J'AI approuvés. Un appareil que le serveur annonce sur mon compte sans approbation locale ne
 * reçoit RIEN : sans cela, un serveur compromis ajouterait un « appareil » pour recevoir une copie de mes messages.
 * L'appairage par QR (`E2EEOwnDeviceLinking` iOS) n'est pas encore porté (#14591, suivi) : sans lui, aucun de mes
 * autres appareils n'est approuvé, et tous partent en `unapprovedOwnDevices`.
 */
public object E2eeOwnDeviceApprovals {
    public fun approval(deviceId: Int, reader: RecordReader): E2eeOwnDeviceApproval? =
        reader.load(RecordKind.APPROVED_OWN_DEVICE, deviceId.toString())
            ?.let { recordJson.decodeFromString(E2eeOwnDeviceApproval.serializer(), it.decodeToString()) }

    public fun pinned(deviceId: Int, reader: RecordReader): ByteArray? = approval(deviceId, reader)?.identityKey?.let(::unbase64)

    public fun approve(deviceId: Int, identityKey: ByteArray, registrationId: Int?, transaction: RecordTransaction) {
        val record = E2eeOwnDeviceApproval(base64(identityKey), registrationId)
        transaction.save(RecordKind.APPROVED_OWN_DEVICE, deviceId.toString(), recordJson.encodeToString(E2eeOwnDeviceApproval.serializer(), record).toByteArray())
    }

    public fun revoke(deviceId: Int, transaction: RecordTransaction) {
        transaction.remove(RecordKind.APPROVED_OWN_DEVICE, deviceId.toString())
    }
}
