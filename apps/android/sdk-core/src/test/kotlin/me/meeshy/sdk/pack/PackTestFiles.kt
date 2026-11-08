package me.meeshy.sdk.pack

import me.meeshy.sdk.model.pack.PackAssetRef

/** Un fichier de pack dont la référence est vraie pour [content]. */
internal fun packRef(content: String, extension: String = "json"): PackAssetRef {
    val bytes = content.toByteArray()
    val sha = ContentAddressedStore.sha256Hex(bytes)
    return PackAssetRef.of("${sha.take(16)}.$extension", bytes.size.toLong(), sha)!!
}

internal class FakePackFetcher(private val served: Map<String, ByteArray>) : PackAssetFetching {
    var calls = 0
        private set
    var gate: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    override suspend fun fetch(ref: PackAssetRef): ByteArray {
        calls++
        gate?.await()
        return served[ref.src] ?: throw PackAssetFetchException.NotFound(ref.src)
    }
}
