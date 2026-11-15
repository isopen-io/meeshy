package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class LocalMediaFileResolverTest {
    @get:Rule val folder = TemporaryFolder()

    private val url = "https://cdn.meeshy.me/a/photo.jpg"

    private fun dirs() = MediaCacheDirs(folder.root, folder.root)

    private fun put(category: MediaCacheCategory, bytes: ByteArray) {
        val dir = dirs().dirFor(category).apply { mkdirs() }
        File(dir, MediaCacheKey.of(url)).writeBytes(bytes)
    }

    @Test
    fun `un fichier sous sa cle canonique est en cache`() {
        put(MediaCacheCategory.IMAGES, byteArrayOf(1, 2, 3))
        val resolver = LocalMediaFileResolver(dirs())
        assertThat(resolver.isCached(MediaCacheCategory.IMAGES, url)).isTrue()
        assertThat(resolver.fileFor(MediaCacheCategory.IMAGES, url)).isNotNull()
    }

    @Test
    fun `un fichier vide ou absent n'est pas en cache`() {
        put(MediaCacheCategory.IMAGES, byteArrayOf())
        val resolver = LocalMediaFileResolver(dirs())
        assertThat(resolver.isCached(MediaCacheCategory.IMAGES, url)).isFalse()
        assertThat(resolver.isCached(MediaCacheCategory.AUDIO, url)).isFalse()
    }

    @Test
    fun `l'audio par troncons est interroge par la sonde sous la cle canonique`() {
        val asked = mutableListOf<Pair<MediaCacheCategory, String>>()
        val resolver = LocalMediaFileResolver(dirs()) { category, key -> asked += category to key; true }
        assertThat(resolver.isCached(MediaCacheCategory.AUDIO, url)).isTrue()
        assertThat(asked).containsExactly(MediaCacheCategory.AUDIO to MediaCacheKey.of(url))
        assertThat(resolver.fileFor(MediaCacheCategory.AUDIO, url)).isNull()
    }
}
