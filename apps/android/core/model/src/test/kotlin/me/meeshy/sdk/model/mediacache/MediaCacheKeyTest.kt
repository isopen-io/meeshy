package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaCacheKeyTest {
    @Test
    fun `vecteurs SHA-256 figes`() {
        // sha256("abc") = ba7816bf8f01cfea414140de5dae2223...
        assertThat(MediaCacheKey.of("abc")).isEqualTo("ba7816bf8f01cfea")
        // sha256("") = e3b0c44298fc1c149afbf4c8996fb924...
        assertThat(MediaCacheKey.of("")).isEqualTo("e3b0c44298fc1c14")
    }

    @Test
    fun `la cle est stable et garde l'extension du chemin sans la requete`() {
        val url = "https://cdn.meeshy.me/a/photo.JPG?sig=1.2#frag"
        assertThat(MediaCacheKey.of(url)).isEqualTo(MediaCacheKey.of(url))
        assertThat(MediaCacheKey.of(url)).endsWith(".JPG")
        assertThat(MediaCacheKey.of("https://x.me/a.b/noext")).doesNotContain(".")
        assertThat(MediaCacheKey.of("https://x.me")).doesNotContain(".")
    }

    @Test
    fun `no-store n'ecrit rien et no-cache ne persiste pas`() {
        assertThat(MediaCacheDirective.fromCacheControl("private, no-store")).isEqualTo(MediaCacheDirective.NEVER_STORE)
        assertThat(MediaCacheDirective.fromCacheControl("Private, No-Cache")).isEqualTo(MediaCacheDirective.REVALIDATE_EACH_USE)
        assertThat(MediaCacheDirective.fromCacheControl("max-age=3600").mayPersist).isTrue()
        assertThat(MediaCacheDirective.fromCacheControl(null).mayPersist).isTrue()
        assertThat(MediaCacheDirective.NEVER_STORE.mayPersist).isFalse()
        assertThat(MediaCacheDirective.meansGone(410)).isTrue()
        assertThat(MediaCacheDirective.meansGone(503)).isFalse()
    }

    @Test
    fun `budgets par type et L1 reduit pour audio et video`() {
        assertThat(MediaCacheBudget.of(MediaCacheCategory.IMAGES).diskMaxBytes).isEqualTo(300_000_000L)
        assertThat(MediaCacheBudget.of(MediaCacheCategory.AUDIO).diskMaxBytes).isEqualTo(200_000_000L)
        assertThat(MediaCacheBudget.of(MediaCacheCategory.VIDEO).diskMaxBytes).isEqualTo(1_000_000_000L)
        assertThat(MediaCacheBudget.of(MediaCacheCategory.THUMBNAILS).diskMaxBytes).isEqualTo(150_000_000L)
        assertThat(MediaCacheBudget.of(MediaCacheCategory.IMAGES).memoryMaxBytes).isEqualTo(80L * 1024 * 1024)
        assertThat(MediaCacheBudget.of(MediaCacheCategory.VIDEO).memoryMaxBytes).isEqualTo(8L * 1024 * 1024)
        assertThat(MediaCacheBudget.of(MediaCacheCategory.VIDEO).fitsInMemory(5L * 1024 * 1024)).isFalse()
        assertThat(MediaCacheBudget.of(MediaCacheCategory.VIDEO).fitsInMemory(4L * 1024 * 1024)).isTrue()
    }
}
