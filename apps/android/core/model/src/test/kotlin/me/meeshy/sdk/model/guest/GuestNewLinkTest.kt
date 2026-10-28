package me.meeshy.sdk.model.guest

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GuestNewLinkTest {
    @Test
    fun `un lien join ou chat de Meeshy donne l identifiant`() {
        assertThat(GuestNewLink.identifier("https://meeshy.me/chat/abc123")).isEqualTo("abc123")
        assertThat(GuestNewLink.identifier("  https://www.meeshy.me/join/abc123  ")).isEqualTo("abc123")
        assertThat(GuestNewLink.identifier("meeshy://join/abc123")).isEqualTo("abc123")
    }

    @Test
    fun `rien d autre n ouvre une session d invite`() {
        listOf(
            "", "abc123", "https://evil.com/chat/abc", "https://meeshy.me/post/abc", "https://meeshy.me/chat/",
            "https://meeshy.me/chat/a/b", "http://meeshy.me/chat/abc", "https://meeshy.me/auth/reset-password?token=x",
        ).forEach { assertThat(GuestNewLink.identifier(it)).isNull() }
    }
}
