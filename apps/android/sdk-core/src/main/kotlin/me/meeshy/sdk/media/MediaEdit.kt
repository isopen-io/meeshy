package me.meeshy.sdk.media

import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile

/**
 * One change a scrubber plans on a media (#13551). Every change keeps the length of what it touches — a box becomes a
 * `free` of the same size, an element a `Void` of the same size, samples are zeroed — so no offset moves and the plan
 * applies IN PLACE, on a copy of the file, through a bounded buffer. The only length change is a cut at the end
 * ([MediaRewrite.copyEdited]'s `length`).
 */
internal sealed interface MediaEdit {
    /** Writes [bytes] at [at] — a box type, an element header: a few octets. */
    class Overwrite(val at: Long, val bytes: ByteArray) : MediaEdit

    /** Zeroes `[from, to)`. */
    class Zero(val from: Long, val to: Long) : MediaEdit

    /** Whether applying this edit to [media] would change an octet — a plan made only of no-ops leaves the media as it is. */
    fun changes(media: MediaBytes): Boolean = when (this) {
        is Overwrite -> !media.bytes(at, bytes.size).contentEquals(bytes)
        is Zero -> !media.isZero(from, to)
    }

    companion object {
        private val FREE = "free".toByteArray(Charsets.ISO_8859_1)
        private const val EBML_VOID = 0xEC

        /** An ISO box at [offset], payload `[payload, end)`, turned into a `free` box of the same size, contents zeroed. */
        fun isoFree(offset: Long, payload: Long, end: Long): List<MediaEdit> = listOf(Overwrite(offset + 4, FREE), Zero(payload, end))

        /**
         * An EBML element spanning `[offset, end)` turned into a `Void` (0xEC) of the same total length: the id, a size on
         * `L` octets (`L = min(8, total − 1)`), then zeroes.
         */
        fun ebmlVoid(offset: Long, end: Long): List<MediaEdit> {
            val total = end - offset
            require(total >= 2) { "A Void needs at least two octets, got $total" }
            val sizeLength = minOf(8L, total - 1).toInt()
            val payload = total - 1 - sizeLength
            val header = ByteArray(1 + sizeLength)
            header[0] = EBML_VOID.toByte()
            (0 until sizeLength).forEach { i -> header[1 + i] = (payload ushr (8 * (sizeLength - 1 - i))).toByte() }
            header[1] = (header[1].toInt() or (0x80 ushr (sizeLength - 1))).toByte()
            return listOf(Overwrite(offset, header), Zero(offset + header.size, end))
        }
    }
}

/** Applies a plan of [MediaEdit]s to a FILE, never through an array of its size. */
internal object MediaRewrite {
    private const val COPY_BUFFER_BYTES = 64 * 1024

    /**
     * Writes the first [length] octets of [source] to [target], then applies [edits] there IN PLACE; the file is synced
     * before this returns. [target] is replaced if it exists. An edit outside `[0, length)` is a programming error.
     */
    fun copyEdited(source: MediaUploadSource, target: File, edits: List<MediaEdit>, length: Long = source.size) {
        require(length in 0..source.size) { "length $length outside 0..${source.size}" }
        FileOutputStream(target).use { out ->
            source.open().use { input ->
                val buffer = ByteArray(COPY_BUFFER_BYTES)
                var remaining = length
                while (remaining > 0) {
                    val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                    if (read < 0) throw java.io.EOFException("source ended with $remaining of $length octets to copy")
                    out.write(buffer, 0, read)
                    remaining -= read
                }
            }
            out.flush()
        }
        applyInPlace(target, edits)
    }

    /** Applies [edits] to [file] in place and syncs it. */
    fun applyInPlace(file: File, edits: List<MediaEdit>) {
        RandomAccessFile(file, "rw").use { raf ->
            val length = raf.length()
            val zeros = ByteArray(COPY_BUFFER_BYTES)
            edits.forEach { edit ->
                when (edit) {
                    is MediaEdit.Overwrite -> {
                        require(edit.at >= 0 && edit.at + edit.bytes.size <= length) { "overwrite at ${edit.at} outside $length" }
                        raf.seek(edit.at)
                        raf.write(edit.bytes)
                    }
                    is MediaEdit.Zero -> {
                        require(edit.from in 0..edit.to && edit.to <= length) { "zero ${edit.from}..${edit.to} outside $length" }
                        raf.seek(edit.from)
                        var remaining = edit.to - edit.from
                        while (remaining > 0) {
                            val count = minOf(zeros.size.toLong(), remaining).toInt()
                            raf.write(zeros, 0, count)
                            remaining -= count
                        }
                    }
                }
            }
            raf.fd.sync()
        }
    }
}
