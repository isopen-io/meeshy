package me.meeshy.sdk.model

/**
 * Single source of truth for file-extension ↔ mimeType conversions. Faithful port
 * of the iOS `MimeTypeResolver` (MeeshySDK `Utils/MimeTypeResolver.swift`) — the
 * same forward (extension → mime) and reverse (mime → preferred extension) tables,
 * including the synonym couples (jpg/jpeg, mp4/m4v, heic/heif, ogg/oga …) that
 * point at one canonical mime.
 *
 * A pure, stateless building block: it takes opaque strings and returns strings,
 * with no product decision baked in — so it belongs in `:core:model`. The
 * "which picker / when to upload" orchestration lives in the feature layer.
 */
object MimeTypeResolver {

    private const val OCTET_STREAM = "application/octet-stream"

    /**
     * Converts a file extension (with or without a leading `.`, case-insensitive)
     * to its canonical mime type. Returns [OCTET_STREAM] — the RFC-compliant value
     * for "opaque bytes" — for unknown extensions.
     */
    fun mimeTypeForExtension(ext: String): String =
        FORWARD_TABLE[normalizeExtension(ext)] ?: OCTET_STREAM

    /**
     * Converts the last extension of a filename to its mime type. A name with no
     * extension — or one ending in a bare `.` — falls back to [OCTET_STREAM].
     */
    fun mimeTypeForFilename(fileName: String): String {
        val lastDot = fileName.lastIndexOf('.')
        if (lastDot < 0 || lastDot == fileName.length - 1) return OCTET_STREAM
        return mimeTypeForExtension(fileName.substring(lastDot + 1))
    }

    /**
     * Reverse direction: from a mime type, the most natural extension (without the
     * `.`) to materialise a file. Returns `null` for mimes absent from the table so
     * the caller can pick its own generic fallback. Case-insensitive on the input.
     */
    fun preferredExtensionForMime(mime: String): String? =
        REVERSE_TABLE[mime.lowercase()]

    /**
     * Chooses the best mime for a picked attachment: a meaningful [declaredType]
     * (what the platform's content resolver reported — non-blank and not the opaque
     * [OCTET_STREAM]) wins; otherwise the [fileName]'s extension is consulted. This
     * mirrors the iOS picker, which always derives the mime from the URL extension,
     * but prefers a real declared content-type when Android supplies one.
     */
    fun resolve(declaredType: String?, fileName: String): String {
        val declared = declaredType?.trim().orEmpty()
        if (declared.isNotEmpty() && !declared.equals(OCTET_STREAM, ignoreCase = true)) {
            return declared
        }
        return mimeTypeForFilename(fileName)
    }

    private fun normalizeExtension(ext: String): String =
        ext.lowercase().removePrefix(".")

    private val FORWARD_TABLE: Map<String, String> = mapOf(
        // Images
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "png" to "image/png",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "heic" to "image/heic",
        "heif" to "image/heic",
        "svg" to "image/svg+xml",
        "bmp" to "image/bmp",
        "tiff" to "image/tiff",
        "tif" to "image/tiff",
        // Video
        "mp4" to "video/mp4",
        "m4v" to "video/mp4",
        "mov" to "video/quicktime",
        "avi" to "video/x-msvideo",
        "mkv" to "video/x-matroska",
        "webm" to "video/webm",
        // Audio
        "mp3" to "audio/mpeg",
        "m4a" to "audio/mp4",
        "aac" to "audio/mp4",
        "wav" to "audio/wav",
        "ogg" to "audio/ogg",
        "oga" to "audio/ogg",
        "flac" to "audio/flac",
        "wma" to "audio/x-ms-wma",
        // Documents
        "pdf" to "application/pdf",
        "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" to "application/vnd.ms-powerpoint",
        "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "rtf" to "application/rtf",
        // iWork
        "pages" to "application/x-iwork-pages-sffpages",
        "numbers" to "application/x-iwork-numbers-sffnumbers",
        "keynote" to "application/x-iwork-keynote-sffkey",
        // Text & Code
        "txt" to "text/plain",
        "log" to "text/plain",
        "csv" to "text/csv",
        "html" to "text/html",
        "htm" to "text/html",
        "css" to "text/css",
        "md" to "text/markdown",
        "markdown" to "text/markdown",
        "json" to "application/json",
        "xml" to "application/xml",
        "js" to "application/javascript",
        "ts" to "application/typescript",
        "py" to "text/x-python",
        "swift" to "text/x-swift",
        // Archives
        "zip" to "application/zip",
        "rar" to "application/x-rar-compressed",
        "7z" to "application/x-7z-compressed",
        "tar" to "application/x-tar",
        "gz" to "application/gzip",
        "gzip" to "application/gzip",
    )

    private val REVERSE_TABLE: Map<String, String> = mapOf(
        "image/jpeg" to "jpg",
        "image/png" to "png",
        "image/gif" to "gif",
        "image/webp" to "webp",
        "image/heic" to "heic",
        "image/svg+xml" to "svg",
        "image/bmp" to "bmp",
        "image/tiff" to "tiff",
        "video/mp4" to "mp4",
        "video/quicktime" to "mov",
        "video/x-msvideo" to "avi",
        "video/x-matroska" to "mkv",
        "video/webm" to "webm",
        "audio/mpeg" to "mp3",
        "audio/mp4" to "m4a",
        "audio/wav" to "wav",
        "audio/ogg" to "ogg",
        "audio/flac" to "flac",
        "audio/x-ms-wma" to "wma",
        "application/pdf" to "pdf",
        "application/msword" to "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" to "docx",
        "application/vnd.ms-excel" to "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to "xlsx",
        "application/vnd.ms-powerpoint" to "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" to "pptx",
        "application/rtf" to "rtf",
        "application/x-iwork-pages-sffpages" to "pages",
        "application/x-iwork-numbers-sffnumbers" to "numbers",
        "application/x-iwork-keynote-sffkey" to "keynote",
        "text/plain" to "txt",
        "text/csv" to "csv",
        "text/html" to "html",
        "text/css" to "css",
        "text/markdown" to "md",
        "text/x-python" to "py",
        "text/x-swift" to "swift",
        "application/json" to "json",
        "application/xml" to "xml",
        "application/javascript" to "js",
        "application/typescript" to "ts",
        "application/zip" to "zip",
        "application/x-rar-compressed" to "rar",
        "application/x-7z-compressed" to "7z",
        "application/x-tar" to "tar",
        "application/gzip" to "gz",
    )
}
