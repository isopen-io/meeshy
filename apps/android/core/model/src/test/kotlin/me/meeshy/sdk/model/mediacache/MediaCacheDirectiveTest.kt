package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaCacheDirectiveTest {
    @Test
    fun `no-store ne persiste rien et gagne sur no-cache`() {
        assertThat(MediaCacheDirective.fromCacheControl("private, no-store")).isEqualTo(MediaCacheDirective.NEVER_STORE)
        assertThat(MediaCacheDirective.fromCacheControl("no-cache, no-store")).isEqualTo(MediaCacheDirective.NEVER_STORE)
    }

    @Test
    fun `no-cache revalide a chaque usage donc ne persiste pas`() {
        val directive = MediaCacheDirective.fromCacheControl("Private, No-Cache")
        assertThat(directive).isEqualTo(MediaCacheDirective.REVALIDATE_EACH_USE)
        assertThat(directive.mayPersist).isFalse()
    }

    @Test
    fun `un cache long ou un en-tete absent persistent`() {
        assertThat(MediaCacheDirective.fromCacheControl("public, max-age=31536000").mayPersist).isTrue()
        assertThat(MediaCacheDirective.fromCacheControl(null).mayPersist).isTrue()
        assertThat(MediaCacheDirective.fromCacheControl("").mayPersist).isTrue()
    }

    @Test
    fun `404 et 410 disent que le media n'existe plus, une panne ou un refus non`() {
        assertThat(MediaCacheDirective.meansGone(404)).isTrue()
        assertThat(MediaCacheDirective.meansGone(410)).isTrue()
        assertThat(MediaCacheDirective.meansGone(500)).isFalse()
        assertThat(MediaCacheDirective.meansGone(401)).isFalse()
        assertThat(MediaCacheDirective.meansGone(403)).isFalse()
    }
}
