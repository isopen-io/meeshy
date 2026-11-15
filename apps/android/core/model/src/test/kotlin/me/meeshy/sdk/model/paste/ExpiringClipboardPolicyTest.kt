package me.meeshy.sdk.model.paste

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ExpiringClipboardPolicyTest {
    @Test
    fun `la durée de vie est de 30 secondes`() {
        assertThat(ExpiringClipboardPolicy.LIFETIME_MS).isEqualTo(30_000L)
    }

    @Test
    fun `l'empreinte ne contient pas le secret et est stable`() {
        val f = ExpiringClipboardPolicy.fingerprint("JBSWY3DP")
        assertThat(f).doesNotContain("JBSWY3DP")
        assertThat(f).isEqualTo(ExpiringClipboardPolicy.fingerprint("JBSWY3DP"))
        assertThat(f).hasLength(64)
    }

    @Test
    fun `on efface seulement si le secret est encore là`() {
        val f = ExpiringClipboardPolicy.fingerprint("JBSWY3DP")
        assertThat(ExpiringClipboardPolicy.shouldClear(f, "JBSWY3DP")).isTrue()
        assertThat(ExpiringClipboardPolicy.shouldClear(f, "autre")).isFalse()
        assertThat(ExpiringClipboardPolicy.shouldClear(f, null)).isFalse()
    }
}
