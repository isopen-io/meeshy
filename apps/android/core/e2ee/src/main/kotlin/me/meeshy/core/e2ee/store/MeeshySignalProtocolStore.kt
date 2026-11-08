package me.meeshy.core.e2ee.store

import java.util.UUID
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordTransaction
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.NoSessionException
import org.signal.libsignal.protocol.ReusedBaseKeyException
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.groups.state.SenderKeyRecord
import org.signal.libsignal.protocol.state.IdentityKeyStore
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SignalProtocolStore
import org.signal.libsignal.protocol.state.SignedPreKeyRecord

/**
 * Les six stores libsignal sur UNE transaction du coffre (spec § 4.4), miroir de `MeeshySignalProtocolStore` (iOS). Un
 * store se construit pour une transaction et ne lui survit pas : un déchiffrement et le nouvel état du ratchet partent
 * ensemble ou pas du tout (l'API Java de libsignal n'a pas de contexte de transaction, la transaction est le store).
 *
 * Confiance : TOFU avec alerte (spec § 4.1 et § 7.3) pour un CONTACT. Un ENVOI vers un de MES autres appareils n'est
 * permis que sous la clé épinglée à son approbation, vérifiée ici, dans la transaction même de libsignal.
 */
public class MeeshySignalProtocolStore(
    private val identity: E2eeLocalIdentity,
    private val transaction: RecordTransaction,
    private val ownUserId: String? = null,
) : SignalProtocolStore {

    private fun key(address: SignalProtocolAddress): String = "${address.name}.${address.deviceId}"

    // IdentityKeyStore

    override fun getIdentityKeyPair(): IdentityKeyPair = identity.keyPair

    override fun getLocalRegistrationId(): Int = identity.registrationId

    override fun saveIdentity(address: SignalProtocolAddress, identityKey: IdentityKey): IdentityKeyStore.IdentityChange {
        val serialized = identityKey.serialize()
        val previous = transaction.load(RecordKind.REMOTE_IDENTITY, key(address))
        transaction.save(RecordKind.REMOTE_IDENTITY, key(address), serialized)
        return if (previous == null || previous.contentEquals(serialized)) IdentityKeyStore.IdentityChange.NEW_OR_UNCHANGED
        else IdentityKeyStore.IdentityChange.REPLACED_EXISTING
    }

    override fun isTrustedIdentity(address: SignalProtocolAddress, identityKey: IdentityKey, direction: IdentityKeyStore.Direction): Boolean {
        if (direction != IdentityKeyStore.Direction.SENDING || ownUserId == null || address.name != ownUserId) return true
        return E2eeOwnDeviceApprovals.pinned(address.deviceId, transaction)?.contentEquals(identityKey.serialize()) == true
    }

    override fun getIdentity(address: SignalProtocolAddress): IdentityKey? =
        transaction.load(RecordKind.REMOTE_IDENTITY, key(address))?.let(::IdentityKey)

    // PreKeyStore

    override fun loadPreKey(preKeyId: Int): PreKeyRecord =
        transaction.load(RecordKind.PRE_KEY, preKeyId.toString())?.let(::PreKeyRecord)
            ?: throw InvalidKeyIdException("no prekey with this identifier")

    override fun storePreKey(preKeyId: Int, record: PreKeyRecord) {
        transaction.save(RecordKind.PRE_KEY, preKeyId.toString(), record.serialize())
    }

    override fun containsPreKey(preKeyId: Int): Boolean = transaction.load(RecordKind.PRE_KEY, preKeyId.toString()) != null

    override fun removePreKey(preKeyId: Int) {
        transaction.remove(RecordKind.PRE_KEY, preKeyId.toString())
    }

    // SignedPreKeyStore

    override fun loadSignedPreKey(signedPreKeyId: Int): SignedPreKeyRecord =
        transaction.load(RecordKind.SIGNED_PRE_KEY, signedPreKeyId.toString())?.let(::SignedPreKeyRecord)
            ?: throw InvalidKeyIdException("no signed prekey with this identifier")

    override fun loadSignedPreKeys(): List<SignedPreKeyRecord> =
        transaction.keys(RecordKind.SIGNED_PRE_KEY).mapNotNull { transaction.load(RecordKind.SIGNED_PRE_KEY, it)?.let(::SignedPreKeyRecord) }

    override fun storeSignedPreKey(signedPreKeyId: Int, record: SignedPreKeyRecord) {
        transaction.save(RecordKind.SIGNED_PRE_KEY, signedPreKeyId.toString(), record.serialize())
    }

    override fun containsSignedPreKey(signedPreKeyId: Int): Boolean =
        transaction.load(RecordKind.SIGNED_PRE_KEY, signedPreKeyId.toString()) != null

    override fun removeSignedPreKey(signedPreKeyId: Int) {
        transaction.remove(RecordKind.SIGNED_PRE_KEY, signedPreKeyId.toString())
    }

    // KyberPreKeyStore

    override fun loadKyberPreKey(kyberPreKeyId: Int): KyberPreKeyRecord =
        transaction.load(RecordKind.KYBER_PRE_KEY, kyberPreKeyId.toString())?.let(::KyberPreKeyRecord)
            ?: throw InvalidKeyIdException("no kyber prekey with this identifier")

    override fun loadKyberPreKeys(): List<KyberPreKeyRecord> =
        transaction.keys(RecordKind.KYBER_PRE_KEY).mapNotNull { transaction.load(RecordKind.KYBER_PRE_KEY, it)?.let(::KyberPreKeyRecord) }

    override fun storeKyberPreKey(kyberPreKeyId: Int, record: KyberPreKeyRecord) {
        transaction.save(RecordKind.KYBER_PRE_KEY, kyberPreKeyId.toString(), record.serialize())
    }

    override fun containsKyberPreKey(kyberPreKeyId: Int): Boolean =
        transaction.load(RecordKind.KYBER_PRE_KEY, kyberPreKeyId.toString()) != null

    /**
     * La pré-clé Kyber de DERNIER RECOURS se réutilise, jamais avec la même clé de base (rejeu d'un
     * `PreKeySignalMessage`) ; une pré-clé Kyber UNIQUE s'efface à son premier usage (PQXDH § 2.4).
     */
    override fun markKyberPreKeyUsed(kyberPreKeyId: Int, signedPreKeyId: Int, baseKey: ECPublicKey) {
        val seen = "$kyberPreKeyId.$signedPreKeyId.${base64(baseKey.serialize())}"
        if (transaction.load(RecordKind.KYBER_BASE_KEY_SEEN, seen) != null) throw ReusedBaseKeyException("reused base key")
        transaction.save(RecordKind.KYBER_BASE_KEY_SEEN, seen, byteArrayOf(1))
        if (transaction.load(RecordKind.KYBER_LAST_RESORT_MARKER, kyberPreKeyId.toString()) == null) {
            transaction.remove(RecordKind.KYBER_PRE_KEY, kyberPreKeyId.toString())
        }
    }

    /** Déclare une pré-clé Kyber comme de dernier recours : elle survit à son usage. */
    public fun markKyberPreKeyLastResort(kyberPreKeyId: Int) {
        transaction.save(RecordKind.KYBER_LAST_RESORT_MARKER, kyberPreKeyId.toString(), byteArrayOf(1))
    }

    // SessionStore

    override fun loadSession(address: SignalProtocolAddress): SessionRecord? =
        transaction.load(RecordKind.SESSION, key(address))?.let(::SessionRecord)

    override fun loadExistingSessions(addresses: List<SignalProtocolAddress>): List<SessionRecord> =
        addresses.map { address -> loadSession(address) ?: throw NoSessionException(address, "no session") }

    override fun getSubDeviceSessions(name: String): List<Int> =
        transaction.keys(RecordKind.SESSION).filter { it.substringBeforeLast('.') == name }
            .mapNotNull { it.substringAfterLast('.').toIntOrNull() }

    override fun storeSession(address: SignalProtocolAddress, record: SessionRecord) {
        transaction.save(RecordKind.SESSION, key(address), record.serialize())
    }

    override fun containsSession(address: SignalProtocolAddress): Boolean = loadSession(address) != null

    /** Efface la session d'un appareil périmé (409 `stale` de Sesame, spec § 3.4). */
    override fun deleteSession(address: SignalProtocolAddress) {
        transaction.remove(RecordKind.SESSION, key(address))
    }

    override fun deleteAllSessions(name: String) {
        getSubDeviceSessions(name).forEach { transaction.remove(RecordKind.SESSION, "$name.$it") }
    }

    // SenderKeyStore — les groupes ne sont pas encore chiffrés (#14591, suivi) ; le store est complet pour libsignal.

    override fun storeSenderKey(sender: SignalProtocolAddress, distributionId: UUID, record: SenderKeyRecord) {
        transaction.save(RecordKind.SENDER_KEY, "${key(sender)}.$distributionId", record.serialize())
    }

    override fun loadSenderKey(sender: SignalProtocolAddress, distributionId: UUID): SenderKeyRecord? =
        transaction.load(RecordKind.SENDER_KEY, "${key(sender)}.$distributionId")?.let(::SenderKeyRecord)
}
