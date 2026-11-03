package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class StoryCoverCacheKeyTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `la clé porte le schéma story-cover et l'id`() {
        assertThat(StoryCoverCacheKey.key("abc123")).isEqualTo("story-cover:abc123")
    }

    @Test
    fun `la taille de rendu est un 9 sur 16 fixe`() {
        assertThat(StoryCoverCacheKey.RENDER_WIDTH).isEqualTo(270)
        assertThat(StoryCoverCacheKey.RENDER_HEIGHT).isEqualTo(480)
        assertThat(StoryCoverCacheKey.RENDER_WIDTH * 16).isEqualTo(StoryCoverCacheKey.RENDER_HEIGHT * 9)
    }

    @Test
    fun `une couverture écrite se retrouve par son id publié puis se retire`() = runTest {
        val cache = StoryCoverCache.forTest(File(tmp.root, "covers"), StandardTestDispatcher(testScheduler))
        assertThat(cache.localPath("s1")).isNull()
        assertThat(cache.store("s1", byteArrayOf(1, 2, 3))).isTrue()
        assertThat(File(cache.localPath("s1")!!).readBytes()).isEqualTo(byteArrayOf(1, 2, 3))
        assertThat(cache.localPath("s2")).isNull()
        cache.remove("s1")
        assertThat(cache.localPath("s1")).isNull()
    }

    @Test
    fun `la déconnexion efface toutes les couvertures`() = runTest {
        val cache = StoryCoverCache.forTest(File(tmp.root, "covers"), StandardTestDispatcher(testScheduler))
        cache.store("a", byteArrayOf(1))
        cache.store("b", byteArrayOf(2))
        cache.clear()
        assertThat(cache.localPath("a")).isNull()
        assertThat(cache.localPath("b")).isNull()
    }
}
