package me.meeshy.core.e2ee.session

import me.meeshy.core.e2ee.E2eeWire
import me.meeshy.core.e2ee.store.E2eeDeviceAddress
import me.meeshy.core.e2ee.store.E2eeLocalIdentity
import me.meeshy.core.e2ee.store.MeeshySignalProtocolStore
import me.meeshy.core.e2ee.store.unbase64
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordTransaction
import me.meeshy.core.e2ee.vault.RecordVault
import me.meeshy.core.e2ee.wire.E2eeDeviceBundle
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.SessionBuilder
import org.signal.libsignal.protocol.SessionCipher
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.kem.KEMPublicKey
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.state.PreKeyBundle

/** Un chiffré libsignal tel qu'il voyage dans une enveloppe : 3 = `PreKeySignalMessage`, 2 = `SignalMessage`. */
public class E2eeCiphertext(public val type: Int, public val body: ByteArray)

/** Un chiffré qui ne se lit pas comme libsignal : il JUGE l'enveloppe. */
public class E2eeCipherFormatException(message: String) : Exception(message)

/**
 * Le chiffrement et le déchiffrement libsignal (PQXDH puis Double Ratchet) de cet appareil, miroir de
 * `E2EESessionCipher` (iOS). Chaque opération s'exécute dans UNE transaction du coffre : le nouvel état du ratchet est
 * écrit avec le résultat, ou rien ne l'est. Bloquant : l'appelant le sort du fil principal.
 */
public class E2eeSessionCipher(
    private val local: E2eeDeviceAddress,
    private val identity: E2eeLocalIdentity,
    private val vault: RecordVault,
) {
    private fun store(transaction: RecordTransaction): MeeshySignalProtocolStore =
        MeeshySignalProtocolStore(identity, transaction, ownUserId = local.userId)

    private val ours: SignalProtocolAddress get() = local.protocolAddress()

    // L'ordre des adresses DIFFÈRE entre les deux constructeurs Java de libsignal (lu au bytecode en 0.105, inchangé en 0.106.2) :
    // `SessionBuilder(store, distante, locale)` mais `SessionCipher(store, locale, distante)`.

    /** PQXDH (spec § 4.1) : libsignal vérifie les signatures XEdDSA de la pré-clé signée et de la Kyber avant d'ouvrir. */
    public fun startSession(bundle: E2eeDeviceBundle, userId: String) {
        val preKeyBundle = preKeyBundle(bundle)
        val remote = E2eeDeviceAddress(userId, bundle.deviceId).protocolAddress()
        vault.write { transaction -> SessionBuilder(store(transaction), remote, ours).process(preKeyBundle) }
    }

    /** La `registrationId` avec laquelle la session courante a été ouverte ; `null` sans session (Sesame § 3). */
    public fun remoteRegistrationId(address: E2eeDeviceAddress): Int? = vault.write { transaction ->
        val session = store(transaction).loadSession(address.protocolAddress()) ?: return@write null
        runCatching { session.remoteRegistrationId }.getOrNull()?.takeIf { session.hasSenderChain() }
    }

    /** La clé d'identité que cet appareil connaît pour l'adresse (TOFU). */
    public fun remoteIdentity(address: E2eeDeviceAddress): ByteArray? = vault.read { reader ->
        reader.load(RecordKind.REMOTE_IDENTITY, address.recordKey)
    }

    public fun deleteSession(address: E2eeDeviceAddress) {
        vault.write { transaction -> store(transaction).deleteSession(address.protocolAddress()) }
    }

    public fun encrypt(plaintext: ByteArray, address: E2eeDeviceAddress): E2eeCiphertext = vault.write { transaction ->
        val message = SessionCipher(store(transaction), ours, address.protocolAddress()).encrypt(plaintext)
        E2eeCiphertext(message.type, message.serialize())
    }

    /** Déchiffre ET range ce que [persist] tire du clair dans la MÊME transaction que le nouvel état du ratchet. */
    public fun <T> decrypt(ciphertext: E2eeCiphertext, from: E2eeDeviceAddress, persist: (ByteArray, RecordTransaction) -> T): T =
        vault.write { transaction ->
            val cipher = SessionCipher(store(transaction), ours, from.protocolAddress())
            val plaintext = when (ciphertext.type) {
                E2eeWire.PRE_KEY_TYPE -> cipher.decrypt(PreKeySignalMessage(ciphertext.body))
                E2eeWire.WHISPER_TYPE -> cipher.decrypt(SignalMessage(ciphertext.body))
                else -> throw E2eeCipherFormatException("unknown message type ${ciphertext.type}")
            }
            persist(plaintext, transaction)
        }

    public companion object {
        /** Le bundle servi par la passerelle, en `PreKeyBundle` libsignal ; une clé illisible lève [E2eeCipherFormatException]. */
        public fun preKeyBundle(bundle: E2eeDeviceBundle): PreKeyBundle {
            fun bytes(base64: String): ByteArray = unbase64(base64) ?: throw E2eeCipherFormatException("malformed bundle")
            val oneTime = bundle.preKey
            return PreKeyBundle(
                bundle.registrationId,
                bundle.deviceId,
                oneTime?.keyId ?: PreKeyBundle.NULL_PRE_KEY_ID,
                oneTime?.let { ECPublicKey(bytes(it.publicKey)) },
                bundle.signedPreKey.keyId,
                ECPublicKey(bytes(bundle.signedPreKey.publicKey)),
                bytes(bundle.signedPreKey.signature),
                IdentityKey(bytes(bundle.identityKey)),
                bundle.kyberPreKey.keyId,
                KEMPublicKey(bytes(bundle.kyberPreKey.publicKey)),
                bytes(bundle.kyberPreKey.signature),
            )
        }
    }
}

internal fun E2eeDeviceAddress.protocolAddress(): SignalProtocolAddress = SignalProtocolAddress(userId, deviceId)
