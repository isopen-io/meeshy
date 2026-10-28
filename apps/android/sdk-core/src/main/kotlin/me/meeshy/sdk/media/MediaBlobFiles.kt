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
 * - Each file is bound to its `cmid` AND to the account that queued it (associated data, #13555): a file moved under
 *   another `cmid`, or opened for another account, does not open. A file sealed before the account was bound (`v1`,
 *   `cmid` only) still opens, so an upload queued by the previous build is not lost; its row's author guard still holds.
 * - A file is written beside its final name then renamed: a crash never leaves a half-written blob under a real name.
 */
internal class MediaBlobFiles(
    private val directory: File,
    seal: () -> StreamingSeal,
) {
    private val seal by lazy(LazyThreadSafetyMode.SYNCHRONIZED, seal)

    /** Seals [source] under [cmid] for [ownerId]'s account, replacing any previous blob for it. */
    fun write(cmid: String, source: MediaUploadSource, ownerId: String?) {
        directory.mkdirs()
        val target = fileOf(cmid)
        val part = File(directory, target.name + PART_SUFFIX)
        try {
            seal.sealing(SyncedOutput(FileOutputStream(part)), associatedData(cmid, ownerId)).use { sealed ->
                source.open().use { input -> input.copyTo(sealed, COPY_BUFFER_BYTES) }
            }
            check(part.renameTo(target)) { "The sealed blob could not take its name" }
        } finally {
            part.delete()
        }
    }

    /**
     * The plaintext of [cmid]'s blob for [ownerId]'s account, streamed; `null` when no file is held or it does not open
     * (lost key, altered, moved, another account's). Opening reads and authenticates the first segment.
     */
    fun source(cmid: String, ownerId: String?): MediaUploadSource? {
        val file = fileOf(cmid).takeIf { it.isFile } ?: return null
        return listOf(associatedData(cmid, ownerId), legacyAssociatedData(cmid)).firstNotNullOfOrNull { associated ->
            runCatching { seal.openSeekable(file, associated).use { it.size() } }.getOrNull()?.let { Sealed(file, associated, it) }
        }
    }

    fun exists(cmid: String): Boolean = fileOf(cmid).isFile

    fun delete(cmid: String) {
        fileOf(cmid).delete()
    }

    /** Every blob, whatever its `cmid` — the account boundary. */
    fun clear() {
        directory.listFiles().orEmpty().forEach { it.delete() }
    }

    /**
     * The boot sweep (#13555): a half-written file, or a sealed file no [held] `cmid` names, left by a process that died
     * between the file and its row — only when written before [before], so a write of the running process is never touched.
     */
    fun sweep(held: Set<String>, before: Long) {
        val named = held.mapTo(HashSet()) { fileOf(it).name }
        directory.listFiles().orEmpty()
            .filter { it.lastModified() < before && it.name !in named }
            .forEach { it.delete() }
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
        const val LEGACY_DOMAIN = "meeshy.media-blob.v1:"
        const val DOMAIN = "meeshy.media-blob.v2:"

        fun associatedData(cmid: String, ownerId: String?): ByteArray =
            (DOMAIN + ownerId.orEmpty().length + ":" + ownerId.orEmpty() + ":" + cmid).toByteArray(Charsets.UTF_8)

        fun legacyAssociatedData(cmid: String): ByteArray = (LEGACY_DOMAIN + cmid).toByteArray(Charsets.UTF_8)

        fun digest(cmid: String): String =
            MessageDigest.getInstance("SHA-256").digest(cmid.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}
