package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

class StoryPostCacheTest {
    private fun post(id: String) = ApiPost(id = id, type = "STORY")

    @Test
    fun `le cache est borne a 500 et evince la plus ancienne insertion`() {
        val cache = StoryPostCache()
        (1..501).forEach { cache.put(post("s$it")) }

        assertThat(cache.size()).isEqualTo(500)
        assertThat(cache.get("s1")).isNull()
        assertThat(cache.get("s2")).isNotNull()
        assertThat(cache.get("s501")).isNotNull()
    }

    @Test
    fun `remettre un id deja tenu ne le rajeunit pas`() {
        val cache = StoryPostCache()
        (1..500).forEach { cache.put(post("s$it")) }
        cache.put(post("s1"))
        cache.put(post("s501"))

        assertThat(cache.get("s1")).isNull()
    }

    @Test
    fun `invalidate retire les ids et ignore les inconnus`() {
        val cache = StoryPostCache()
        cache.putAll(listOf(post("a"), post("b")))

        cache.invalidate(setOf("a", "zzz"))

        assertThat(cache.get("a")).isNull()
        assertThat(cache.get("b")).isNotNull()
    }

    @Test
    fun `clear vide le cache a la deconnexion`() = runTest {
        val cache = StoryPostCache()
        cache.put(post("a"))

        cache.clear()

        assertThat(cache.size()).isEqualTo(0)
    }
}
