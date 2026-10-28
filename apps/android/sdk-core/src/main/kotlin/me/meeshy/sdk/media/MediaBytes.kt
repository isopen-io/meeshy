package me.meeshy.sdk.media

import java.io.EOFException

/**
 * Random READ access to the octets of a media, whatever holds them (#13551) — an array, or a [MediaUploadSource] (a file,
 * a sealed blob) read through a small block cache. A scrubber walks boxes and elements BY THEIR HEADERS through this
 * interface, so it never needs the media in memory: what it holds is the cache ([SourceMediaBytes.CACHED_BLOCKS] ×
 * [SourceMediaBytes.BLOCK_BYTES]), never the file.
 *
 * Every position is a `Long`: a media is not bounded by `Int.MAX_VALUE` octets.
 */
internal interface MediaBytes {
    val size: Long

    /** The octet at [at] as `0..255`, or `-1` at or past [size] (a pattern matcher reads past the end without a check). */
    fun byteAt(at: Long): Int

    /** Copies [length] octets from [at] into [target]; [EOFException] when the media ends first. */
    fun read(at: Long, target: ByteArray, offset: Int = 0, length: Int = target.size - offset)
}

internal fun MediaBytes.bytes(at: Long, count: Int): ByteArray = ByteArray(count).also { read(at, it) }

/** Big-endian unsigned 32-bit value at [at]. */
internal fun MediaBytes.u32At(at: Long): Long = bytes(at, 4).fold(0L) { acc, b -> (acc shl 8) or (b.toLong() and 0xFF) }

/** Big-endian signed 32-bit value at [at]. */
internal fun MediaBytes.i32At(at: Long): Int = u32At(at).toInt()

/** Big-endian 64-bit value at [at]. */
internal fun MediaBytes.i64At(at: Long): Long = bytes(at, 8).fold(0L) { acc, b -> (acc shl 8) or (b.toLong() and 0xFF) }

/** [count] octets at [at] read as ISO-8859-1 — a four-character box type, a codec id. */
internal fun MediaBytes.ascii(at: Long, count: Int): String = String(bytes(at, count), Charsets.ISO_8859_1)

/** Whether every octet of `[from, to)` is zero, read through a bounded buffer. */
internal fun MediaBytes.isZero(from: Long, to: Long): Boolean {
    if (from >= to) return true
    val buffer = ByteArray(minOf(ZERO_SCAN_BYTES.toLong(), to - from).toInt())
    var at = from
    while (at < to) {
        val count = minOf(buffer.size.toLong(), to - at).toInt()
        read(at, buffer, 0, count)
        for (i in 0 until count) if (buffer[i].toInt() != 0) return false
        at += count
    }
    return true
}

private const val ZERO_SCAN_BYTES = 64 * 1024

/** An array as [MediaBytes] — the shape the scrubbers keep for the producers still in memory, and for tests. */
internal class ArrayMediaBytes(private val array: ByteArray) : MediaBytes {
    override val size: Long get() = array.size.toLong()

    override fun byteAt(at: Long): Int = if (at in 0 until size) array[at.toInt()].toInt() and 0xFF else -1

    override fun read(at: Long, target: ByteArray, offset: Int, length: Int) {
        if (at < 0 || at + length > size) throw EOFException("read $at+$length past $size")
        array.copyInto(target, offset, at.toInt(), (at + length).toInt())
    }
}

/**
 * A [MediaUploadSource] as [MediaBytes]: blocks of [BLOCK_BYTES] read on demand through [MediaUploadSource.open], at most
 * [CACHED_BLOCKS] of them held (least recently used leaves first). A sequential walk, a box header that straddles two
 * blocks and a matcher that looks a few octets ahead all stay within that bound — 256 KiB, whatever the size of the media.
 */
internal class SourceMediaBytes(private val source: MediaUploadSource) : MediaBytes {
    override val size: Long = source.size

    private class Block(val index: Long, val data: ByteArray, val length: Int)

    private val blocks = ArrayDeque<Block>()

    override fun byteAt(at: Long): Int {
        if (at < 0 || at >= size) return -1
        val block = block(at / BLOCK_BYTES)
        return block.data[(at % BLOCK_BYTES).toInt()].toInt() and 0xFF
    }

    override fun read(at: Long, target: ByteArray, offset: Int, length: Int) {
        if (at < 0 || at + length > size) throw EOFException("read $at+$length past $size")
        var done = 0
        while (done < length) {
            val position = at + done
            val block = block(position / BLOCK_BYTES)
            val inBlock = (position % BLOCK_BYTES).toInt()
            val count = minOf(length - done, block.length - inBlock)
            block.data.copyInto(target, offset + done, inBlock, inBlock + count)
            done += count
        }
    }

    private fun block(index: Long): Block {
        blocks.firstOrNull { it.index == index }?.let { hit ->
            if (blocks.first() !== hit) {
                blocks.remove(hit)
                blocks.addFirst(hit)
            }
            return hit
        }
        val start = index * BLOCK_BYTES
        val length = minOf(BLOCK_BYTES.toLong(), size - start).toInt()
        val data = if (blocks.size >= CACHED_BLOCKS) blocks.removeLast().data else ByteArray(BLOCK_BYTES)
        source.open(start).use { input ->
            var done = 0
            while (done < length) {
                val read = input.read(data, done, length - done)
                if (read < 0) throw EOFException("source ended at ${start + done}, $size announced")
                done += read
            }
        }
        return Block(index, data, length).also { blocks.addFirst(it) }
    }

    companion object {
        const val BLOCK_BYTES: Int = 64 * 1024
        const val CACHED_BLOCKS: Int = 4
    }
}
