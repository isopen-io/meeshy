package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PublicDownloadsTest {

    @Test
    fun `android 8 and 9 save the historical way and android 10 onwards through MediaStore`() {
        assertThat(PublicDownloadsRoute.of(26)).isEqualTo(PublicDownloadsRoute.LEGACY)
        assertThat(PublicDownloadsRoute.of(28)).isEqualTo(PublicDownloadsRoute.LEGACY)
        assertThat(PublicDownloadsRoute.of(29)).isEqualTo(PublicDownloadsRoute.SCOPED)
    }

    @Test
    fun `a hostile name is reduced to its last safe component keeping its extension`() {
        assertThat(PublicDownloadName.safe("../../etc/passwd.sh", "application/x-sh")).isEqualTo("passwd.sh")
        assertThat(PublicDownloadName.safe("photo‮gpj.exe", "image/jpeg")).isEqualTo("photogpj.exe")
        assertThat(PublicDownloadName.safe("a\u0000b.pdf", "application/pdf")).isEqualTo("ab.pdf")
    }

    @Test
    fun `an unusable name falls back to a generic one with the extension of its type`() {
        assertThat(PublicDownloadName.safe("‮", "application/pdf")).isEqualTo("attachment.pdf")
        assertThat(PublicDownloadName.safe(null, "application/octet-stream")).startsWith("attachment.")
    }

    @Test
    fun `a name is capped at 120 bytes`() {
        val name = PublicDownloadName.safe("é".repeat(200) + ".pdf", "application/pdf")
        assertThat(name.toByteArray().size).isAtMost(IncomingFileName.MAX_BYTES)
        assertThat(name).endsWith(".pdf")
    }

    @Test
    fun `a colliding name gets the first free suffix and nothing is overwritten`() {
        val taken = setOf("contrat.pdf", "contrat (1).pdf")
        assertThat(PublicDownloadName.unique("contrat.pdf") { it in taken }).isEqualTo("contrat (2).pdf")
        assertThat(PublicDownloadName.unique("libre.pdf") { it in taken }).isEqualTo("libre.pdf")
        assertThat(PublicDownloadName.unique("notes") { it == "notes" }).isEqualTo("notes (1)")
    }
}
