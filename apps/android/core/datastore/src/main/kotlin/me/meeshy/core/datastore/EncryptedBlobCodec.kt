package me.meeshy.core.datastore

import me.meeshy.core.crypto.primitives.AesGcmCombined
import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.core.crypto.primitives.RandomSource
import me.meeshy.core.crypto.primitives.SecureRandomSource
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore

/**
 * Wraps the JSON blobs a DataStore keeps (drafts, category snapshot) so they rest encrypted, like iOS' `GRDBCacheL2`.
 *
 * [open] never throws: a value that cannot be opened is `null`, a cache miss. [seal] never falls back to clear text:
 * when it cannot encrypt, the error surfaces to the writer.
 */
interface BlobCodec {
    /** The stored form of [plain]; [slot] binds the blob to the entry that holds it. Throws when it cannot encrypt. */
    fun seal(plain: String, slot: String): String

    /** The clear text of [stored], or `null` when it is unreadable (altered, moved to another slot, key lost). */
    fun open(stored: String, slot: String): String?

    /** Is [stored] a clear-text value written before encryption existed? It is still readable, and is to be re-sealed. */
    fun isLegacy(stored: String): Boolean

    /** Pass-through, for tests and previews only. */
    object Passthrough : BlobCodec {
        override fun seal(plain: String, slot: String): String = plain
        override fun open(stored: String, slot: String): String? = stored
        override fun isLegacy(stored: String): Boolean = false
    }
}

/** Where the blob key lives. */
interface BlobKeySource {
    /** The key if it exists and can be read, `null` otherwise (never creates one). */
    fun existing(): ByteArray?

    /** The key, created on first use. Throws when it can be neither read nor stored. */
    fun forSealing(): ByteArray
}

/** AES-256-GCM, key from [keys], stored form `mshy1:` + base64(nonce ‖ ciphertext ‖ tag), slot as associated data. */
class EncryptedBlobCodec(
    private val keys: BlobKeySource,
    private val aes: AesGcmCombined = AesGcmCombined(),
) : BlobCodec {

    override fun seal(plain: String, slot: String): String =
        PREFIX + CanonicalBase64.encode(aes.seal(keys.forSealing(), plain.toByteArray(Charsets.UTF_8), slot.toByteArray(Charsets.UTF_8)))

    override fun open(stored: String, slot: String): String? {
        if (isLegacy(stored)) return stored
        val combined = CanonicalBase64.decode(stored.removePrefix(PREFIX)) ?: return null
        val key = runCatching { keys.existing() }.getOrNull() ?: return null
        return aes.open(key, combined, slot.toByteArray(Charsets.UTF_8))?.toString(Charsets.UTF_8)
    }

    override fun isLegacy(stored: String): Boolean = !stored.startsWith(PREFIX)

    companion object {
        const val PREFIX: String = "mshy1:"
    }
}

/** The blob key held in a Keystore-backed [SecureStore]; an unreadable vault never yields a fresh key over an old one. */
class VaultBlobKeySource(
    private val vault: SecureStore,
    private val random: RandomSource = SecureRandomSource,
    private val entry: String = "datastore_blob_key",
) : BlobKeySource {

    private val lock = Any()

    override fun existing(): ByteArray? = synchronized(lock) {
        (vault.read(entry) as? SecureRead.Present)?.let { CanonicalBase64.decode(it.value) }
            ?.takeIf { it.size == AesGcmCombined.KEY_LENGTH }
    }

    override fun forSealing(): ByteArray = synchronized(lock) {
        when (val read = vault.read(entry)) {
            is SecureRead.Present -> CanonicalBase64.decode(read.value)?.takeIf { it.size == AesGcmCombined.KEY_LENGTH }
                ?: error("The blob key is unreadable")
            SecureRead.Absent -> random.nextBytes(AesGcmCombined.KEY_LENGTH).also {
                check(vault.put(entry, CanonicalBase64.encode(it))) { "The blob key could not be stored" }
            }
            SecureRead.Unreadable -> error("The blob key is unreadable")
        }
    }
}
