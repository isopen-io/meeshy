package me.meeshy.sdk.media

import me.meeshy.core.crypto.primitives.StreamingSeal
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.channels.Channels
import java.security.MessageDigest

/**
 * The octets of the queued uploads, one SEALED file per `cmid` (#13551). They used to live in the SQLCipher
 * database; they now stay on disk, encrypted at rest the same way ([StreamingSeal], key in the Android Keystore), so a
 * 200 MB video is queued, kept and sent through a bounded buffer instead of a row read whole into memory.
 *
 * - The file name is a digest of the `cmid` — no caller string ever becomes a path.
 * - Each file is bound to its `cmid` (associated data): a file moved under another `cmid` does not open.
 * - A file is written beside its final name then renamed: a crash never leaves a half-written blob under a real name.
 */
internal class MediaBlobFiles(
    private val directory: File,
    seal: () -> StreamingSeal,
) {
    private val seal by lazy(LazyThreadSafetyMode.SYNCHRONIZED, seal)

    /** Seals [source] under [cmid], replacing any previous blob for it. */
    fun write(cmid: String, source: MediaUploadSource) {
        directory.mkdirs()
        val target = fileOf(cmid)
        val part = File(directory, target.name + PART_SUFFIX)
        try {
            seal.sealing(SyncedOutput(FileOutputStream(part)), associatedData(cmid)).use { sealed ->
                source.open().use { input -> input.copyTo(sealed, COPY_BUFFER_BYTES) }
            }
            check(part.renameTo(target)) { "The sealed blob could not take its name" }
        } finally {
            part.delete()
        }
    }

    /** The plaintext of [cmid]'s blob, streamed; `null` when no file is held or it does not open (lost key, altered, moved). */
    fun source(cmid: String): MediaUploadSource? {
        val file = fileOf(cmid).takeIf { it.isFile } ?: return null
        val associated = associatedData(cmid)
        val size = runCatching { seal.openSeekable(file, associated).use { it.size() } }.getOrNull() ?: return null
        return Sealed(file, associated, size)
    }

    fun exists(cmid: String): Boolean = fileOf(cmid).isFile

    fun delete(cmid: String) {
        fileOf(cmid).delete()
    }

    /** Every blob, whatever its `cmid` — the account boundary. */
    fun clear() {
        directory.listFiles().orEmpty().forEach { it.delete() }
    }

    private fun fileOf(cmid: String): File = File(directory, digest(cmid) + BLOB_SUFFIX)

    private inner class Sealed(private val file: File, private val associated: ByteArray, override val size: Long) : MediaUploadSource {
        override fun open(offset: Long): InputStream {
            require(offset in 0..size) { "offset $offset outside 0..$size" }
            val channel = seal.openSeekable(file, associated)
            return try {
                Channels.newInputStream(channel.position(offset))
            } catch (failure: Exception) {
                channel.close()
                throw failure
            }
        }
    }

    /** Syncs the file to the disk when the seal closes it, after its final segment: the rename only ever names durable octets. */
    private class SyncedOutput(private val out: FileOutputStream) : OutputStream() {
        override fun write(b: Int) = out.write(b)
        override fun write(b: ByteArray, off: Int, len: Int) = out.write(b, off, len)
        override fun flush() = out.flush()
        override fun close() {
            out.flush()
            out.fd.sync()
            out.close()
        }
    }

    private companion object {
        const val BLOB_SUFFIX = ".blob"
        const val PART_SUFFIX = ".part"
        const val COPY_BUFFER_BYTES = 64 * 1024
        const val DOMAIN = "meeshy.media-blob.v1:"

        fun associatedData(cmid: String): ByteArray = (DOMAIN + cmid).toByteArray(Charsets.UTF_8)

        fun digest(cmid: String): String =
            MessageDigest.getInstance("SHA-256").digest(cmid.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}
