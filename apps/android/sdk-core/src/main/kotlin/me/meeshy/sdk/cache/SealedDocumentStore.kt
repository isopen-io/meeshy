package me.meeshy.sdk.cache

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.core.crypto.primitives.StreamingSeal

@Serializable
private data class SealedEnvelope<T>(val savedAtMs: Long, val value: T)

private val sealedJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/**
 * Small documents kept ENCRYPTED at rest, one sealed file per key (#13677) — the Android form of the `encrypted: true`
 * GRDB stores of iOS `CacheCoordinator` for the data the Room cache must not hold in the clear (call transcripts,
 * call network journals; Room is not encrypted, see `docs/parite-ios/sdk-auth-crypto-e2ee.md`).
 *
 * - [StreamingSeal] (AES-256-GCM-HKDF, key held by the Android Keystore), the scheme of the upload queue (#13551).
 * - The file name is a digest of the key: no caller string becomes a path, no call id shows on disk.
 * - Each file is bound to [domain], its key AND its account (associated data): moved under another key, or opened for
 *   another account, it does not open — and a document that does not open reads as absent, never as an error.
 * - Bounded by [policy]: a document older than its keep window is gone, past its item count the oldest goes first.
 * - A file is written beside its final name then renamed: a crash never leaves a half-written document under a name.
 *
 * Blocking I/O: callers run it off the main thread.
 */
class SealedDocumentStore(
    private val directory: File,
    private val domain: String,
    private val policy: CachePolicy,
    seal: () -> StreamingSeal,
    private val clock: CacheClock = SystemCacheClock,
) {
    private val seal by lazy(LazyThreadSafetyMode.SYNCHRONIZED, seal)

    @Synchronized
    fun <T> read(key: String, serializer: KSerializer<T>, ownerId: String?): T? {
        val file = fileOf(key).takeIf { it.isFile } ?: return null
        val envelope = runCatching {
            val plain = seal.opening(ByteArrayInputStream(file.readBytes()), associatedData(key, ownerId)).use { it.readBytes() }
            sealedJson.decodeFromString(SealedEnvelope.serializer(serializer), plain.toString(Charsets.UTF_8))
        }.getOrNull() ?: return null
        if (isExpired(envelope.savedAtMs)) {
            file.delete()
            return null
        }
        return envelope.value
    }

    @Synchronized
    fun <T> write(key: String, value: T, serializer: KSerializer<T>, ownerId: String?) {
        directory.mkdirs()
        val now = clock.nowMillis()
        val plain = sealedJson.encodeToString(SealedEnvelope.serializer(serializer), SealedEnvelope(now, value)).toByteArray(Charsets.UTF_8)
        val sealed = ByteArrayOutputStream().also { out ->
            seal.sealing(out, associatedData(key, ownerId)).use { it.write(plain) }
        }.toByteArray()
        val target = fileOf(key)
        val part = File(directory, target.name + PART_SUFFIX)
        try {
            part.writeBytes(sealed)
            check(part.renameTo(target)) { "The sealed document could not take its name" }
            target.setLastModified(now)
        } finally {
            part.delete()
        }
        prune(now)
    }

    @Synchronized
    fun remove(key: String) {
        fileOf(key).delete()
    }

    /** Every document, whatever its key or account — the account boundary. */
    @Synchronized
    fun clear() {
        directory.listFiles().orEmpty().forEach { it.delete() }
    }

    private fun prune(now: Long) {
        val documents = directory.listFiles().orEmpty().filter { it.name.endsWith(DOC_SUFFIX) }
        val (expired, kept) = documents.partition { now - it.lastModified() > policy.keepForMillis }
        expired.forEach { it.delete() }
        val ceiling = policy.maxItemCount ?: return
        kept.sortedByDescending { it.lastModified() }.drop(ceiling).forEach { it.delete() }
    }

    private fun isExpired(savedAtMs: Long): Boolean = clock.nowMillis() - savedAtMs > policy.keepForMillis

    private fun fileOf(key: String): File = File(directory, digest(key) + DOC_SUFFIX)

    private fun associatedData(key: String, ownerId: String?): ByteArray {
        val owner = ownerId.orEmpty()
        return "$domain:${owner.length}:$owner:$key".toByteArray(Charsets.UTF_8)
    }

    private companion object {
        const val DOC_SUFFIX = ".doc"
        const val PART_SUFFIX = ".part"

        fun digest(key: String): String =
            MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}
