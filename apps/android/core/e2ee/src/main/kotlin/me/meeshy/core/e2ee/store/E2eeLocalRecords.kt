package me.meeshy.core.e2ee.store

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordReader
import me.meeshy.core.e2ee.vault.RecordTransaction
import me.meeshy.core.e2ee.vault.RecordVault

internal val recordJson = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }

/**
 * Deux identifiants de compte désignent-ils le même compte ? UNE comparaison, insensible à la casse (#18973, jumelle de
 * #18950) : un serveur qui sert mon identifiant dans une autre casse ne fait pas passer un de MES appareils pour celui
 * d'un autre, ce qui le soustrairait à l'épingle de mes appareils.
 */
public fun isSameAccount(first: String, second: String): Boolean = first.equals(second, ignoreCase = true)

/** L'adresse de CET appareil telle que l'annuaire l'a enrôlé. */
@Serializable
public data class E2eeLocalDevice(val userId: String, val deviceId: Int, val registrationId: Int) {
    public val address: E2eeDeviceAddress get() = E2eeDeviceAddress(userId, deviceId)

    /** Ce compte est-il le mien, dans n'importe quelle casse ? */
    public fun isMe(account: String): Boolean = isSameAccount(account, userId)
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
 * Le coffre des clairs, servi au seul compte dont l'installation est enrôlée (#13000) : un compte B connecté sur
 * l'appareil de A, tant qu'il ne s'est pas réenrôlé (ce qui efface tout), ne lit ni n'écrit rien du coffre de A.
 * [nowMillis] est l'horloge LOCALE qui date chaque rangement (#14672) : jamais celle de l'émetteur.
 */
public class E2eePlaintextVault(
    private val vault: RecordVault,
    private val owner: String?,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {

    public fun entry(messageId: String): E2eePlaintextEntry? = vault.read { reader ->
        if (!serves(reader)) null else E2eePlaintextRecords.load(messageId, reader)
    }

    public fun entries(messageIds: Collection<String>): Map<String, E2eePlaintextEntry> = vault.read { reader ->
        if (!serves(reader)) emptyMap()
        else messageIds.mapNotNull { id -> loaded(id, reader)?.let { id to it } }.toMap()
    }

    /** Une ligne qui ne se relit pas (scellée ou altérée) ne masque que son message (audit de #19077, P5). */
    private fun loaded(messageId: String, reader: RecordReader): E2eePlaintextEntry? = try {
        E2eePlaintextRecords.load(messageId, reader)
    } catch (_: Exception) {
        null
    }

    public fun save(entry: E2eePlaintextEntry, messageIds: Collection<String>) {
        vault.write { transaction ->
            if (!serves(transaction)) throw E2eeForeignVaultException()
            val storedAt = nowMillis()
            messageIds.forEach { E2eePlaintextRecords.save(entry, it, transaction, storedAt) }
        }
    }

    /**
     * Range le clair d'un message que J'AI écrit (#18975) : le coffre LOCAL suffit. [prepare] (l'enrôlement, réseau) n'est
     * demandé que si le coffre ne sert pas encore ce compte ; un appareil enrôlé garde le texte hors ligne, et l'envoi
     * attend dans la file.
     */
    public suspend fun keepMine(account: String, content: E2eeContent, messageIds: Collection<String>, prepare: suspend () -> Unit) {
        if (!servesItsOwner()) prepare()
        save(E2eePlaintextEntry.Readable(content, account), messageIds)
    }

    public fun remove(messageIds: Collection<String>) {
        vault.write { transaction ->
            if (!serves(transaction) && E2eeEnrollmentRecords.load(transaction) != null) throw E2eeForeignVaultException()
            messageIds.forEach { transaction.remove(RecordKind.PLAINTEXT, it) }
        }
    }

    /**
     * Retire du coffre tout ce que l'appareil a rangé pour [conversationId] jusqu'à [composedUpTo] (#14655) — clairs, versions
     * futures, pierres tombales ET signaux reçus (#18981) : une conversation supprimée ne laisse rien, même des messages que
     * le cache n'a jamais tenus. La borne est l'horloge LOCALE de l'inscription, comparée à l'instant LOCAL du rangement
     * (#14672) ; un rangement antérieur à ce champ est tenu pour antérieur à toute borne. Le contenu porte sa conversation
     * DANS le chiffré : un serveur ne peut pas y faire entrer un message d'une autre.
     */
    public fun removeConversation(conversationId: String, composedUpTo: Long) {
        vault.write { transaction ->
            if (!serves(transaction) && E2eeEnrollmentRecords.load(transaction) != null) throw E2eeForeignVaultException()
            E2eePlaintextRecords.storedIn(conversationId, composedUpTo, transaction).forEach { transaction.remove(RecordKind.PLAINTEXT, it) }
            E2eeReceivedSignals.storedIn(conversationId, composedUpTo, transaction).forEach { transaction.remove(RecordKind.SIGNAL_RECEIVED, it) }
        }
    }

    public fun servesItsOwner(): Boolean = vault.read(::serves)

    private fun serves(reader: RecordReader): Boolean {
        val account = owner ?: return true
        return E2eeEnrollmentRecords.load(reader)?.let { isSameAccount(it.userId, account) } == true
    }
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
