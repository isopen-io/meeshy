package me.meeshy.sdk.media

import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import java.io.InputStream

internal class RecordingUploadedMediaCache : UploadedMediaCache {
    class Adoption(val category: MediaCacheCategory, val url: String, val length: Long, val bytes: ByteArray)

    val adoptions = mutableListOf<Adoption>()

    override fun adopt(category: MediaCacheCategory, url: String, length: Long, open: () -> InputStream): Boolean {
        adoptions += Adoption(category, url, length, open().use { it.readBytes() })
        return true
    }

    fun seeder(apiBaseUrl: String? = "https://gate.meeshy.me/api/v1"): UploadedMediaSeeder =
        UploadedMediaSeeder(this, { apiBaseUrl }, kotlinx.coroutines.Dispatchers.Unconfined)
}
