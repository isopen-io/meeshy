package me.meeshy.sdk.media

import me.meeshy.sdk.net.NetworkResult
import java.io.File

/**
 * #13551 — chaque témoin de lieu se rejoue sur les DEUX chemins : l'original en mémoire (réécrit en mémoire) et le même
 * original posé dans un FICHIER (lu par position, réécrit en flux dans le cache privé, revérifié en flux). Les deux verdicts
 * doivent être identiques à l'octet près — sinon le témoin tombe, quel que soit ce qu'il vérifie ensuite.
 */
internal suspend fun OutgoingMediaSanitizer.sanitizeOnBothPaths(bytes: ByteArray, name: String, mime: String): NetworkResult<MediaUploadItem> {
    val inMemory = sanitize(MediaUploadItem(bytes, name, mime))
    val file = File.createTempFile("parity", ".media").also { it.deleteOnExit(); it.writeBytes(bytes) }
    val original = MediaUploadItem.onDisk(file, name, mime)
    val streamed = sanitize(original)
    try {
        when {
            inMemory is NetworkResult.Success && streamed is NetworkResult.Success -> {
                check(inMemory.data.bytes.contentEquals(streamed.data.bytes)) { "the streamed path sent other octets than the in-memory one" }
                check(inMemory.data.fileName == streamed.data.fileName && inMemory.data.mimeType == streamed.data.mimeType) { "name or type differ" }
            }
            inMemory is NetworkResult.Failure && streamed is NetworkResult.Failure ->
                check(inMemory.error.code == streamed.error.code) { "refusals differ: ${inMemory.error.code} / ${streamed.error.code}" }
            else -> error("the two paths disagree: in memory $inMemory, streamed $streamed")
        }
    } finally {
        (streamed as? NetworkResult.Success)?.let { release(it.data, original) }
        file.delete()
    }
    return inMemory
}
