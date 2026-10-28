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

    /** Writes the first [length] octets of [source] to [target] with [edits] applied — [write] of [MediaPlan.edited]. */
    fun copyEdited(source: MediaUploadSource, target: File, edits: List<MediaEdit>, length: Long = source.size) {
        require(length in 0..source.size) { "length $length outside 0..${source.size}" }
        write(source, target, MediaPlan.edited(length, edits))
    }

    /**
     * Streams [plan] applied to [source] into [target] (replaced if it exists) and syncs it. Each source range passes
     * through one [COPY_BUFFER_BYTES] buffer; the edits that touch it are applied to the buffer in their PLAN order, so
     * overlapping edits end exactly as [MediaPlan.render] leaves them.
     */
    fun write(source: MediaUploadSource, target: File, plan: MediaPlan) {
        val ordered = plan.edits.withIndex().sortedBy { it.value.start }
        var next = 0
        val active = mutableListOf<IndexedValue<MediaEdit>>()
        val buffer = ByteArray(COPY_BUFFER_BYTES)
        FileOutputStream(target).use { out ->
            plan.pieces.forEach { piece ->
                when (piece) {
                    is MediaPlan.Piece.Literal -> out.write(piece.bytes)
                    is MediaPlan.Piece.Source -> source.open(piece.from).use { input ->
                        var at = piece.from
                        while (at < piece.to) {
                            val count = input.read(buffer, 0, minOf(buffer.size.toLong(), piece.to - at).toInt())
                            if (count < 0) throw java.io.EOFException("source ended at $at, ${piece.to} planned")
                            while (next < ordered.size && ordered[next].value.start < at + count) active += ordered[next++]
                            active.removeAll { it.value.end <= at }
                            active.sortedBy { it.index }.forEach { it.value.applyTo(buffer, at, count) }
                            out.write(buffer, 0, count)
                            at += count
                        }
                    }
                }
            }
            out.flush()
            out.fd.sync()
        }
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

/**
 * What a scrubber decides for a whole media (#13551): the output is the concatenation of [pieces] — ranges of the SOURCE,
 * in ascending order, or a few literal octets (a rebuilt envelope header) — after [edits] (source coordinates, applied in
 * order) have been made to the source. The SAME plan renders to an array ([render]) or streams to a file
 * ([MediaRewrite.write]): one decision, two backends, no twin.
 */
internal class MediaPlan(val pieces: List<Piece>, val edits: List<MediaEdit> = emptyList()) {
    sealed interface Piece {
        class Source(val from: Long, val to: Long) : Piece
        class Literal(val bytes: ByteArray) : Piece
    }

    init {
        val ranges = pieces.filterIsInstance<Piece.Source>()
        require(ranges.all { it.from <= it.to } && ranges.zipWithNext().all { (a, b) -> a.to <= b.from }) { "source pieces must ascend" }
    }

    val length: Long get() = pieces.sumOf { piece -> if (piece is Piece.Source) piece.to - piece.from else (piece as Piece.Literal).bytes.size.toLong() }

    /** Whether the plan gives back [media] octet for octet — nothing to write, the original leaves as it is. */
    fun isIdentity(media: MediaBytes): Boolean {
        val whole = pieces.singleOrNull() as? Piece.Source ?: return media.size == 0L && pieces.isEmpty()
        return whole.from == 0L && whole.to == media.size && edits.none { it.changes(media) }
    }

    /** The output as an array — for a media already in memory. The SAME [src] when the plan is the identity. */
    fun render(src: ByteArray): ByteArray {
        if (isIdentity(ArrayMediaBytes(src))) return src
        val edited = if (edits.isEmpty()) src else src.copyOf().also { copy -> edits.forEach { it.applyTo(copy, 0L, copy.size) } }
        val out = ByteArray(length.toInt())
        var at = 0
        pieces.forEach { piece ->
            when (piece) {
                is Piece.Source -> {
                    edited.copyInto(out, at, piece.from.toInt(), piece.to.toInt())
                    at += (piece.to - piece.from).toInt()
                }
                is Piece.Literal -> {
                    piece.bytes.copyInto(out, at)
                    at += piece.bytes.size
                }
            }
        }
        return out
    }

    companion object {
        fun identity(size: Long): MediaPlan = MediaPlan(listOf(Piece.Source(0, size)))

        /** The source cut at [length], with [edits] — the shape of every same-length scrubber. */
        fun edited(length: Long, edits: List<MediaEdit>): MediaPlan = MediaPlan(listOf(Piece.Source(0, length)), edits)
    }
}

/** Applies the part of this edit that falls in the source window `[windowStart, windowStart + count)` held by [buffer]. */
internal fun MediaEdit.applyTo(buffer: ByteArray, windowStart: Long, count: Int) {
    val windowEnd = windowStart + count
    when (this) {
        is MediaEdit.Overwrite -> {
            val from = maxOf(at, windowStart)
            val to = minOf(at + bytes.size, windowEnd)
            if (from < to) bytes.copyInto(buffer, (from - windowStart).toInt(), (from - at).toInt(), (to - at).toInt())
        }
        is MediaEdit.Zero -> {
            val from = maxOf(this.from, windowStart)
            val to = minOf(this.to, windowEnd)
            if (from < to) buffer.fill(0, (from - windowStart).toInt(), (to - windowStart).toInt())
        }
    }
}

internal val MediaEdit.start: Long get() = when (this) {
    is MediaEdit.Overwrite -> at
    is MediaEdit.Zero -> from
}

internal val MediaEdit.end: Long get() = when (this) {
    is MediaEdit.Overwrite -> at + bytes.size
    is MediaEdit.Zero -> to
}
