package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryPostMediaResolverTest {
    private fun item(id: String, vararg media: Pair<String, String?>) =
        StoryItem(id = id, media = media.map { (mid, url) -> FeedMedia(id = mid, url = url) })

    private val absolute: (String) -> String? = { "https://cdn/$it" }

    @Test fun `resout un id de n'importe quelle story de la fenetre`() {
        val resolve = StoryPostMediaResolver.resolver(listOf(item("s1", "m1" to "a.m4a"), item("s2", "m2" to "b.m4a")), absolute)
        assertThat(resolve("m1")).isEqualTo("https://cdn/a.m4a")
        assertThat(resolve("m2")).isEqualTo("https://cdn/b.m4a")
    }

    @Test fun `un id inconnu ou sans url rend null`() {
        val resolve = StoryPostMediaResolver.resolver(listOf(item("s1", "m1" to null, "m3" to "")), absolute)
        assertThat(resolve("m1")).isNull()
        assertThat(resolve("m3")).isNull()
        assertThat(resolve("zz")).isNull()
    }

    @Test fun `une adresse refusee n'entre pas dans l'index`() {
        val resolve = StoryPostMediaResolver.resolver(listOf(item("s1", "m1" to "a.m4a")), { null })
        assertThat(resolve("m1")).isNull()
    }

    @Test fun `la premiere piece gagne a identifiant egal`() {
        val resolve = StoryPostMediaResolver.resolver(listOf(item("s1", "m" to "first"), item("s2", "m" to "second")), absolute)
        assertThat(resolve("m")).isEqualTo("https://cdn/first")
    }
}
