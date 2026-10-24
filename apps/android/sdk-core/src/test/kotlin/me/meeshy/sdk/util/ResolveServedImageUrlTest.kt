package me.meeshy.sdk.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ResolveServedImageUrlTest {
    private val base = "https://gate.meeshy.me/api/v1"

    @Test
    fun `un URI local servi ne charge jamais un fichier de l'appareil`() {
        listOf("file:///data/x.png", "FILE:///etc/hosts", "content://media/1").forEach {
            assertThat(resolveServedImageUrl(it, base)).isNull()
        }
    }

    @Test
    fun `un hote hors politique est refuse`() {
        assertThat(resolveServedImageUrl("http://evil.example/a.png", base)).isNull()
        assertThat(resolveServedImageUrl("https://192.168.1.2/a.png", base)).isNull()
    }

    @Test
    fun `rien de servi donne null`() {
        assertThat(resolveServedImageUrl(null, base)).isNull()
        assertThat(resolveServedImageUrl("  ", base)).isNull()
    }

    @Test
    fun `une cle valide se resout`() {
        assertThat(resolveServedImageUrl("2026/09/a/b.png", base))
            .isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/2026/09/a/b.png")
    }
}
