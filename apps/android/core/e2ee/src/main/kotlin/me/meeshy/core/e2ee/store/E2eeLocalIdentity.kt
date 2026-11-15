package me.meeshy.core.e2ee.store

import java.security.SecureRandom
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.RecordReader
import me.meeshy.core.e2ee.vault.RecordTransaction
import me.meeshy.core.e2ee.vault.RecordVault
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.InvalidKeyException

/**
 * L'identité libsignal de CETTE installation (spec § 3.1) : une paire Curve25519 et une `registrationId` de 14 bits,
 * tirées une fois. La clé privée ne quitte jamais l'appareil ; elle vit dans le coffre scellé. Miroir de
 * `E2EELocalIdentity` / `E2EEIdentityVault` (iOS : le trousseau).
 */
public class E2eeLocalIdentity(public val keyPair: IdentityKeyPair, public val registrationId: Int) {
    public val identityKeyBase64: String get() = base64(keyPair.publicKey.serialize())

    public companion object {
        public const val MAX_REGISTRATION_ID: Int = 0x3FFF

        public fun generate(random: SecureRandom = SecureRandom()): E2eeLocalIdentity =
            E2eeLocalIdentity(IdentityKeyPair.generate(), 1 + random.nextInt(MAX_REGISTRATION_ID))
    }
}

public class E2eeIdentityCorruptedException(cause: Throwable? = null) : Exception("e2ee identity record does not decode", cause)

/**
 * L'identité dans le coffre, sous UN enregistrement (2 octets de `registrationId` gros-boutistes, puis la paire
 * sérialisée par libsignal), le format du trousseau iOS : elles ne divergent jamais.
 */
public object E2eeIdentityRecords {
    private const val KEY = "current"

    public fun load(reader: RecordReader): E2eeLocalIdentity? {
        val raw = reader.load(RecordKind.IDENTITY, KEY) ?: return null
        if (raw.size <= 2) throw E2eeIdentityCorruptedException()
        val registrationId = ((raw[0].toInt() and 0xFF) shl 8) or (raw[1].toInt() and 0xFF)
        return try {
            E2eeLocalIdentity(IdentityKeyPair(raw.copyOfRange(2, raw.size)), registrationId)
        } catch (error: InvalidKeyException) {
            throw E2eeIdentityCorruptedException(error)
        }
    }

    public fun save(identity: E2eeLocalIdentity, transaction: RecordTransaction) {
        val prefix = byteArrayOf((identity.registrationId shr 8 and 0xFF).toByte(), (identity.registrationId and 0xFF).toByte())
        transaction.save(RecordKind.IDENTITY, KEY, prefix + identity.keyPair.serialize())
    }

    /** L'identité existante, ou une nouvelle, rangée avant d'être rendue — sous le verrou du coffre : jamais deux identités. */
    public fun currentOrCreate(vault: RecordVault): E2eeLocalIdentity = vault.write { transaction ->
        load(transaction) ?: E2eeLocalIdentity.generate().also { save(it, transaction) }
    }
}

internal fun base64(bytes: ByteArray): String = java.util.Base64.getEncoder().encodeToString(bytes)

internal fun unbase64(text: String): ByteArray? = runCatching { java.util.Base64.getDecoder().decode(text) }.getOrNull()
