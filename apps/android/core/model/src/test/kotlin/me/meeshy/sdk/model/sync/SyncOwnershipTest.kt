package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncOwnershipTest {

    private fun ownership() = SyncOwnership<String>()

    @Test
    fun `le premier compte prend le verrou, un second appel du meme compte est refuse`() {
        val sync = ownership()
        assertThat(sync.claim("a").claimed).isTrue()
        assertThat(sync.claim("a").claimed).isFalse()
        assertThat(sync.owner).isEqualTo("a")
    }

    @Test
    fun `un autre compte prend la main et libere les attentes du precedent`() {
        val sync = ownership()
        sync.claim("a")
        assertThat(sync.admit("a", "w1")).isFalse()
        assertThat(sync.admit("a", "w2")).isFalse()

        val claim = sync.claim("b")

        assertThat(claim.claimed).isTrue()
        assertThat(claim.released).containsExactly("w1", "w2").inOrder()
        assertThat(sync.owner).isEqualTo("b")
    }

    @Test
    fun `un compte qui ne tient pas le verrou passe sans attendre`() {
        val sync = ownership()
        sync.claim("a")
        assertThat(sync.admit("b", "w")).isTrue()
    }

    @Test
    fun `seul le proprietaire libere le verrou`() {
        val sync = ownership()
        sync.claim("a")
        sync.admit("a", "w")
        assertThat(sync.release("b")).isEmpty()
        assertThat(sync.owner).isEqualTo("a")
        assertThat(sync.release("a")).containsExactly("w")
        assertThat(sync.owner).isNull()
    }

    @Test
    fun `la synchro du compte quitte ne possede plus la session`() {
        val sync = ownership()
        sync.claim("a")
        sync.claim("b")
        assertThat(sync.owns("a")).isFalse()
        assertThat(sync.owns("b")).isTrue()
    }

    @Test
    fun `sans compte connu personne ne dispute la session`() {
        assertThat(ownership().owns(null)).isTrue()
        assertThat(ownership().owns("a")).isTrue()
    }
}
