package me.meeshy.sdk.media

import me.meeshy.sdk.net.NetworkResult

/**
 * The bridge between a file-backed [MediaUploadItem] and the array-based [OutgoingMediaSanitizer] (#13551). An item
 * in memory goes through unchanged. An item on disk is read ONCE and sanitized as today; when the sanitizer hands
 * the very same octets back (nothing to remove, or the author keeps the location), the ORIGINAL file-backed item
 * leaves, so the upload itself streams from the file. Same guarantee as before: whatever leaves went through the
 * sanitizer's verdict.
 */
internal suspend fun OutgoingMediaSanitizer.sanitizeSource(item: MediaUploadItem): NetworkResult<MediaUploadItem> {
    if (item.source is MediaUploadSource.InMemory) return sanitize(item)
    val loaded = MediaUploadItem(item.bytes, item.fileName, item.mimeType)
    return when (val result = sanitize(loaded)) {
        is NetworkResult.Failure -> result
        is NetworkResult.Success -> NetworkResult.Success(if (result.data.isUnchanged(loaded)) item else result.data)
    }
}

private fun MediaUploadItem.isUnchanged(from: MediaUploadItem): Boolean =
    this === from || (bytes === from.bytes && fileName == from.fileName && mimeType == from.mimeType)
