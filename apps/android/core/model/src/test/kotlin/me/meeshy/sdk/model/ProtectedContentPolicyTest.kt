package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProtectedContentPolicyTest {
    @Test
    fun `each protection veils the window`() {
        listOf(
            ContentProtection(isEphemeral = true),
            ContentProtection(isViewOnce = true),
            ContentProtection(isBlurred = true),
            ContentProtection(isEncrypted = true),
        ).forEach { assertThat(ProtectedContentPolicy.requiresVeil(it)).isTrue() }
    }

    @Test
    fun `ordinary content does not`() {
        assertThat(ProtectedContentPolicy.requiresVeil(ContentProtection())).isFalse()
    }
}
