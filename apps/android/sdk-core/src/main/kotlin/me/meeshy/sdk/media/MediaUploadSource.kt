package me.meeshy.sdk.media

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.ByteArrayInputStream
import java.io.EOFException
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream

/**
 * Where the octets of a [MediaUploadItem] live (#13551). A source is READ, never held: [open] gives a stream
 * positioned at an offset, so a multipart body, a TUS slice or a scrubber walks it through a bounded buffer
 * whatever the size of the media. Every source can be opened again — an OkHttp retry writes its body twice.
 */
public interface MediaUploadSource {
    /** The exact number of octets the source yields. */
    public val size: Long

    /** A stream over the source from [offset]. The caller closes it. */
    public fun open(offset: Long = 0L): InputStream

    /** The octets held in memory — the transitional shape, before every producer hands a file. */
    public class InMemory(public val bytes: ByteArray) : MediaUploadSource {
        override val size: Long get() = bytes.size.toLong()

        override fun open(offset: Long): InputStream {
            require(offset in 0..size) { "offset $offset outside 0..$size" }
            return ByteArrayInputStream(bytes, offset.toInt(), bytes.size - offset.toInt())
        }
    }

    /**
     * A plain file in the app's private storage. [size] is read once, when the item is made: a file that changes
     * under a body already announced fails the request ([IOException]) rather than sending other octets.
     */
    public class OnDisk(public val file: File) : MediaUploadSource {
        override val size: Long = file.length()

        override fun open(offset: Long): InputStream {
            require(offset in 0..size) { "offset $offset outside 0..$size" }
            return FileInputStream(file).also { stream -> stream.channel.position(offset) }
        }
    }
}

/** Reads the whole source — only for the transitional callers that still need an array. */
internal fun MediaUploadSource.readAll(): ByteArray {
    if (this is MediaUploadSource.InMemory) return bytes
    check(size <= Int.MAX_VALUE) { "A source of $size octets does not fit in an array" }
    val out = ByteArray(size.toInt())
    open().use { input -> input.readFully(out, 0, out.size) }
    return out
}

/** The first [count] octets (fewer when the source is shorter): what a sniffer reads. */
internal fun MediaUploadSource.head(count: Int): ByteArray {
    val length = minOf(count.toLong(), size).toInt()
    val out = ByteArray(length)
    open().use { input -> input.readFully(out, 0, length) }
    return out
}

private fun InputStream.readFully(target: ByteArray, offset: Int, length: Int) {
    var done = 0
    while (done < length) {
        val read = read(target, offset + done, length - done)
        if (read < 0) throw EOFException("Source ended after ${offset + done} octets, ${offset + length} announced")
        done += read
    }
}

/**
 * A request body that streams [length] octets of [source] from [offset] through a [COPY_BUFFER_BYTES] buffer.
 * Replayable (not one-shot): each [writeTo] reopens the source. A source shorter than announced throws
 * [EOFException], so the server never receives a truncated body under a full `Content-Length`.
 */
internal class SourceRequestBody(
    private val source: MediaUploadSource,
    private val offset: Long,
    private val length: Long,
    private val contentType: MediaType?,
) : RequestBody() {
    init {
        require(offset >= 0 && length >= 0 && offset + length <= source.size) {
            "range $offset+$length outside a source of ${source.size} octets"
        }
    }

    override fun contentType(): MediaType? = contentType

    override fun contentLength(): Long = length

    override fun isOneShot(): Boolean = false

    override fun writeTo(sink: BufferedSink) {
        source.open(offset).use { input ->
            val buffer = ByteArray(COPY_BUFFER_BYTES)
            var remaining = length
            while (remaining > 0) {
                val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                if (read < 0) throw EOFException("Source ended with $remaining of $length octets unsent")
                sink.write(buffer, 0, read)
                remaining -= read
            }
        }
    }

    private companion object {
        const val COPY_BUFFER_BYTES = 64 * 1024
    }
}
