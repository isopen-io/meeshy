package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FileViewerKindTest {

    @Test
    fun `une carte de visite s'ouvre en fiche`() {
        assertThat(FileViewerKind.of("text/vcard", "Zoé.vcf")).isEqualTo(FileViewerKind.ContactCard)
        assertThat(FileViewerKind.of("application/octet-stream", "Zoé.vcf")).isEqualTo(FileViewerKind.ContactCard)
    }

    @Test
    fun `un fichier de code s'ouvre dans la visionneuse de code avec son langage`() {
        assertThat(FileViewerKind.of("application/octet-stream", "main.kt")).isEqualTo(FileViewerKind.Code(CodeLanguage.KOTLIN))
        assertThat(FileViewerKind.of("text/x-python", "script")).isEqualTo(FileViewerKind.Code(CodeLanguage.PYTHON))
        assertThat(FileViewerKind.of("text/plain", "Dockerfile")).isEqualTo(FileViewerKind.Code(CodeLanguage.DOCKERFILE))
    }

    @Test
    fun `un pdf a son apercu de page`() {
        assertThat(FileViewerKind.of("application/pdf", "a.pdf")).isEqualTo(FileViewerKind.Pdf)
        assertThat(FileViewerKind.of("application/octet-stream", "A.PDF")).isEqualTo(FileViewerKind.Pdf)
    }

    @Test
    fun `tout autre fichier est un document sans apercu de page`() {
        assertThat(FileViewerKind.of("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx"))
            .isEqualTo(FileViewerKind.Document)
        assertThat(FileViewerKind.of(null, null)).isEqualTo(FileViewerKind.Document)
    }

    @Test
    fun `le langage se lit sur le nom avant l'extension puis le type`() {
        assertThat(CodeLanguage.detect("Makefile", "")).isEqualTo(CodeLanguage.MAKEFILE)
        assertThat(CodeLanguage.detect("x.TSX", "")).isEqualTo(CodeLanguage.TYPESCRIPT)
        assertThat(CodeLanguage.detect("noext", "application/json")).isEqualTo(CodeLanguage.JSON)
        assertThat(CodeLanguage.detect("notes.txt", "text/plain")).isNull()
    }
}
