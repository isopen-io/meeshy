package me.meeshy.core.e2ee.vault

import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Chaque enregistrement scellé par AES-256-GCM (spec § 4.4, iOS : CryptoKit sur chaque ligne GRDB) sous une clé de
 * 256 bits que le stockage durable ne voit jamais. Les données associées lient le chiffré à SA place
 * (`meeshy-e2ee-record:v1:<nature>:<clé>`) : une ligne déplacée sous une autre clé ne s'ouvre pas.
 *
 * Forme sur le disque : `nonce (12 octets) ‖ chiffré ‖ étiquette (16 octets)`.
 */
public class RecordSealer(private val key: SecretKey, private val random: SecureRandom = SecureRandom()) {

    public fun seal(id: RecordId, plaintext: ByteArray): ByteArray {
        val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce))
        cipher.updateAAD(associatedData(id))
        return nonce + cipher.doFinal(plaintext)
    }

    /** Un enregistrement qui ne s'ouvre pas (clé changée, ligne altérée ou déplacée) lève [SealedRecordException]. */
    public fun open(id: RecordId, sealed: ByteArray): ByteArray {
        if (sealed.size < NONCE_BYTES + TAG_BITS / 8) throw SealedRecordException(id)
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 0, NONCE_BYTES))
            cipher.updateAAD(associatedData(id))
            cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES)
        } catch (error: GeneralSecurityException) {
            throw SealedRecordException(id, error)
        }
    }

    private fun associatedData(id: RecordId): ByteArray = "meeshy-e2ee-record:v1:${id.kind.tag}:${id.key}".toByteArray(Charsets.UTF_8)

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val NONCE_BYTES = 12
        const val TAG_BITS = 128
    }
}

/** Un enregistrement scellé qui ne s'ouvre pas : le coffre REFUSE (jamais « absent »), la décision remonte. */
public class SealedRecordException(id: RecordId, cause: Throwable? = null) :
    Exception("sealed e2ee record does not open (${id.kind.tag})", cause)

/** Un [RecordBackend] dont chaque valeur est scellée avant de toucher [raw], et ouverte à la lecture. */
public class SealedRecordBackend(private val raw: RecordBackend, private val sealer: RecordSealer) : RecordBackend {
    override fun load(kind: RecordKind, key: String): ByteArray? =
        raw.load(kind, key)?.let { sealer.open(RecordId(kind, key), it) }

    override fun keys(kind: RecordKind): List<String> = raw.keys(kind)

    override fun commit(changes: Map<RecordId, ByteArray?>, clearFirst: Boolean) {
        raw.commit(changes.mapValues { (id, value) -> value?.let { sealer.seal(id, it) } }, clearFirst)
    }
}
