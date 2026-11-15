package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TusUploadLeasesTest {
    @Test
    fun `two sends of the same octets are serialised, the second finds the key held`() {
        val leases = TusUploadLeases()

        assertThat(leases.claim("k")).isTrue()
        assertThat(leases.claim("k")).isFalse()
    }

    @Test
    fun `a released key can be claimed again, other keys never collide`() {
        val leases = TusUploadLeases()
        leases.claim("k")

        assertThat(leases.claim("other")).isTrue()
        leases.release("k")
        assertThat(leases.claim("k")).isTrue()
    }
}
