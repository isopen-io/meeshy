package me.meeshy.sdk.media

import okhttp3.MediaType
import okhttp3.RequestBody
import java.io.File

/**
 * One file to upload: its [source], the [fileName] to advertise and a [mimeType]. A blank [fileName] or
 * [mimeType] is replaced with a sane default by [MediaUpload.formPart] so a missing value never produces a
 * malformed part.
 *
 * The octets are READ from [source], never required in memory (#13551): an item made with [onDisk] streams its
 * multipart part ([requestBody]) and its TUS slices ([rangeBody]) from the file. The `ByteArray` constructor and
 * [bytes] remain for the producers and scrubbers not yet moved to files; [bytes] on a file-backed item reads
 * the whole file, so the paths that send never call it.
 *
 * [durationMs] is the length of a video or audio, probed once at intake (#13606): it rides with the item so an
 * offline publication can publish the duration of a media the server has not yet measured. `null` = unknown.
 *
 * Plain class (not a `data class`): the type is never compared by value.
 */
public class MediaUploadItem(
    public val source: MediaUploadSource,
    public val fileName: String,
    public val mimeType: String,
    public val durationMs: Long? = null,
) {
    public constructor(bytes: ByteArray, fileName: String, mimeType: String, durationMs: Long? = null) :
        this(MediaUploadSource.InMemory(bytes), fileName, mimeType, durationMs)

    /** The exact number of octets that leave — known without reading the media. */
    public val sizeBytes: Long get() = source.size

    /** The whole content. In memory: the same array, every time. On disk: a full read — transitional callers only. */
    public val bytes: ByteArray get() = source.readAll()

    /** The whole content as a streamed, replayable body. */
    public fun requestBody(contentType: MediaType?): RequestBody = rangeBody(0L, sizeBytes, contentType)

    /** [length] octets from [offset] as a streamed, replayable body — a TUS `PATCH` slice. */
    public fun rangeBody(offset: Long, length: Long, contentType: MediaType?): RequestBody =
        SourceRequestBody(source, offset, length, contentType)

    public companion object {
        /** An item whose octets stay in [file] (the app's private storage) until they are sent. */
        public fun onDisk(file: File, fileName: String, mimeType: String, durationMs: Long? = null): MediaUploadItem =
            MediaUploadItem(MediaUploadSource.OnDisk(file), fileName, mimeType, durationMs)
    }
}
