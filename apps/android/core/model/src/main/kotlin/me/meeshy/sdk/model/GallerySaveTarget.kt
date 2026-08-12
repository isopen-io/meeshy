package me.meeshy.sdk.model

/**
 * Everything a MediaStore insert needs to save a viewed media into the device
 * gallery: a sanitized [displayName] that always ends in a real extension, the
 * resolved [mimeType], and the album [relativePath] (`Pictures/Meeshy` for
 * images, `Movies/Meeshy` for videos).
 *
 * Pure data — the actual `ContentResolver`/`MediaStore` write is exempt Android
 * glue that lives next to the image viewer. This mirrors iOS splitting the pure
 * `MediaSaveDestination` rule from the imperative `PhotoLibraryManager`.
 */
data class GallerySaveTarget(
    val displayName: String,
    val mimeType: String,
    val relativePath: String,
)

/**
 * Resolves a media URL (+ an optional MIME hint) into a [GallerySaveTarget].
 *
 * Kept a pure object in `:core:model`, off any Android runtime, so the branch
 * table is fully JVM-testable. The gallery only accepts images and videos (the
 * MediaStore constraint iOS encodes as `MediaSaveDestination.accepts`); every
 * other decision — which name, which MIME, which album — is derived here so the
 * write-side glue stays a dumb executor.
 */
object GallerySaveTargetResolver {

    private const val DEFAULT_BASE = "meeshy-image"
    private const val DEFAULT_MIME = "image/jpeg"
    private const val IMAGE_DIR = "Pictures/Meeshy"
    private const val VIDEO_DIR = "Movies/Meeshy"

    private val ILLEGAL_CHARS = "/\\:*?\"<>|".toSet()

    private val EXTENSION_TO_MIME = mapOf(
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "png" to "image/png",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "heic" to "image/heic",
        "heif" to "image/heif",
        "bmp" to "image/bmp",
        "mp4" to "video/mp4",
        "mov" to "video/quicktime",
        "webm" to "video/webm",
        "mkv" to "video/x-matroska",
        "3gp" to "video/3gpp",
    )

    private val MIME_TO_EXTENSION = mapOf(
        "image/jpeg" to "jpg",
        "image/png" to "png",
        "image/gif" to "gif",
        "image/webp" to "webp",
        "image/heic" to "heic",
        "image/heif" to "heif",
        "image/bmp" to "bmp",
        "video/mp4" to "mp4",
        "video/quicktime" to "mov",
        "video/webm" to "webm",
        "video/x-matroska" to "mkv",
        "video/3gpp" to "3gp",
    )

    fun resolve(url: String, mimeHint: String? = null): GallerySaveTarget {
        val rawName = sanitize(nameSegment(url))
        val extension = extensionToken(rawName)
        val mimeType = resolveMime(mimeHint, extension)
        val displayName = resolveDisplayName(rawName, extension, mimeType)
        val relativePath = if (mimeType.startsWith("video/")) VIDEO_DIR else IMAGE_DIR
        return GallerySaveTarget(displayName = displayName, mimeType = mimeType, relativePath = relativePath)
    }

    private fun nameSegment(url: String): String =
        url.substringBefore('?').substringBefore('#').substringAfterLast('/')

    private fun sanitize(name: String): String =
        name.map { c -> if (c.isISOControl() || c in ILLEGAL_CHARS) '_' else c }.joinToString("").trim()

    /** The lowercased trailing `.ext` token (known or not), or `null` when the name carries no real extension. */
    private fun extensionToken(name: String): String? {
        val dot = name.lastIndexOf('.')
        if (dot <= 0 || dot == name.lastIndex) return null
        return name.substring(dot + 1).lowercase()
    }

    private fun resolveMime(mimeHint: String?, extension: String?): String {
        val normalizedHint = mimeHint?.substringBefore(';')?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
        return when {
            normalizedHint != null && normalizedHint in MIME_TO_EXTENSION -> normalizedHint
            extension != null && extension in EXTENSION_TO_MIME -> EXTENSION_TO_MIME.getValue(extension)
            else -> DEFAULT_MIME
        }
    }

    private fun resolveDisplayName(rawName: String, extension: String?, mimeType: String): String {
        if (extension != null && isMeaningful(rawName)) return rawName
        val base = if (isMeaningful(rawName)) rawName else DEFAULT_BASE
        return "$base.${MIME_TO_EXTENSION.getValue(mimeType)}"
    }

    /** A name is meaningful when it carries a real character — not blank, not all-underscore padding. */
    private fun isMeaningful(name: String): Boolean =
        name.any { it != '_' && it != '.' && !it.isWhitespace() }
}
