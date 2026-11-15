package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SavedDocumentTest {

    @Test
    fun `un nom ordinaire est propose tel quel`() {
        assertThat(SavedDocument.fileName("rapport 2026.pdf", fallback = "document")).isEqualTo("rapport 2026.pdf")
    }

    @Test
    fun `un nom de l'expediteur ne remonte jamais l'arborescence`() {
        assertThat(SavedDocument.fileName("../../etc/passwd", fallback = "document")).isEqualTo("passwd")
        assertThat(SavedDocument.fileName("..\\..\\win.ini", fallback = "document")).isEqualTo("win.ini")
        assertThat(SavedDocument.fileName("..", fallback = "document")).isEqualTo("document")
    }

    @Test
    fun `les caracteres de controle et reserves sont retires`() {
        val name = SavedDocument.fileName("fac\u0000tu‮re\u0007<>:\"|?*.pdf", fallback = "document")
        assertThat(name).isEqualTo("facture.pdf")
    }

    @Test
    fun `un nom vide ou blanc retombe sur le repli`() {
        assertThat(SavedDocument.fileName("   ", fallback = "document")).isEqualTo("document")
        assertThat(SavedDocument.fileName(" . ", fallback = "document")).isEqualTo("document")
    }

    @Test
    fun `un nom demesure est borne en gardant son extension`() {
        val name = SavedDocument.fileName("a".repeat(500) + ".pdf", fallback = "document")
        assertThat(name.length).isAtMost(SavedDocument.MAX_NAME_CHARS)
        assertThat(name).endsWith(".pdf")
    }

    @Test
    fun `un type MIME invalide devient un flux d'octets`() {
        assertThat(SavedDocument.mimeType("application/pdf")).isEqualTo("application/pdf")
        assertThat(SavedDocument.mimeType("text/plain; charset=utf-8")).isEqualTo("text/plain")
        assertThat(SavedDocument.mimeType("n'importe quoi")).isEqualTo("application/octet-stream")
        assertThat(SavedDocument.mimeType("")).isEqualTo("application/octet-stream")
        assertThat(SavedDocument.mimeType("*/*")).isEqualTo("application/octet-stream")
    }
}
