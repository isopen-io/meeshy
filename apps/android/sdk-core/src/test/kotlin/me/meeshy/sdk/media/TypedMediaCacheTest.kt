package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.sdk.model.mediacache.MediaPinTable
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class TypedMediaCacheTest {
    @get:Rule val folder = TemporaryFolder()

    private var now = 1_000L
    private val dirs get() = MediaCacheDirs(folder.root, folder.root)
    private fun cache(budget: Long = 100, pins: MediaPinTable = MediaPinTable()) =
        TypedMediaCache(dirs, budgetOf = { budget }, pins = { pins }, clock = { now })

    private fun staged(cache: TypedMediaCache, category: MediaCacheCategory, size: Int): File =
        File(cache.stagingDir(category), "t-${System.nanoTime()}").apply { writeBytes(ByteArray(size) { 7 }) }

    private fun url(name: String) = "https://gate.meeshy.me/u/$name.m4a"

    @Test
    fun `un fichier range est lisible sous sa cle canonique et le transit disparait`() = runBlocking {
        val cache = cache()
        val source = staged(cache, MediaCacheCategory.AUDIO, 10)
        val stored = cache.store(MediaCacheCategory.AUDIO, url("a"), source)
        assertThat(stored.name).isEqualTo(MediaCacheKey.of(url("a")))
        assertThat(source.exists()).isFalse()
        assertThat(cache.contains(MediaCacheCategory.AUDIO, url("a"))).isTrue()
        assertThat(cache.file(MediaCacheCategory.AUDIO, url("a"))?.length()).isEqualTo(10L)
        assertThat(LocalMediaFileResolver(dirs).isCached(MediaCacheCategory.AUDIO, url("a"))).isTrue()
    }

    @Test
    fun `le plafond evince les plus anciens`() = runBlocking {
        val cache = cache(budget = 100)
        listOf("old", "mid", "new").forEach { name ->
            now += 10
            cache.store(MediaCacheCategory.AUDIO, url(name), staged(cache, MediaCacheCategory.AUDIO, 40))
        }
        assertThat(cache.contains(MediaCacheCategory.AUDIO, url("old"))).isFalse()
        assertThat(cache.contains(MediaCacheCategory.AUDIO, url("mid"))).isTrue()
        assertThat(cache.contains(MediaCacheCategory.AUDIO, url("new"))).isTrue()
        assertThat(cache.sizeOf(MediaCacheCategory.AUDIO)).isAtMost(100L)
    }

    @Test
    fun `une lecture rafraichit le rang et sauve le fichier de l'eviction`() = runBlocking {
        val cache = cache(budget = 100)
        now += 10
        cache.store(MediaCacheCategory.AUDIO, url("a"), staged(cache, MediaCacheCategory.AUDIO, 40))
        now += 10
        cache.store(MediaCacheCategory.AUDIO, url("b"), staged(cache, MediaCacheCategory.AUDIO, 40))
        now += 10
        cache.file(MediaCacheCategory.AUDIO, url("a"))
        now += 10
        cache.store(MediaCacheCategory.AUDIO, url("c"), staged(cache, MediaCacheCategory.AUDIO, 40))
        assertThat(cache.contains(MediaCacheCategory.AUDIO, url("a"))).isTrue()
        assertThat(cache.contains(MediaCacheCategory.AUDIO, url("b"))).isFalse()
    }

    @Test
    fun `une epingle active n'est jamais evincee`() = runBlocking {
        val pinned = MediaPinTable().pin(MediaCacheKey.of(url("old")), untilEpochMillis = Long.MAX_VALUE)
        val cache = cache(budget = 100, pins = pinned)
        now += 10
        cache.store(MediaCacheCategory.AUDIO, url("old"), staged(cache, MediaCacheCategory.AUDIO, 60))
        now += 10
        cache.store(MediaCacheCategory.AUDIO, url("new"), staged(cache, MediaCacheCategory.AUDIO, 60))
        assertThat(cache.contains(MediaCacheCategory.AUDIO, url("old"))).isTrue()
    }

    @Test
    fun `les categories sont separees et le balayage vide le transit`() = runBlocking {
        val cache = cache()
        cache.store(MediaCacheCategory.IMAGES, url("a"), staged(cache, MediaCacheCategory.IMAGES, 5))
        assertThat(cache.contains(MediaCacheCategory.VIDEO, url("a"))).isFalse()
        val leftover = staged(cache, MediaCacheCategory.VIDEO, 5)
        cache.sweepStaging()
        assertThat(leftover.exists()).isFalse()
    }
}
