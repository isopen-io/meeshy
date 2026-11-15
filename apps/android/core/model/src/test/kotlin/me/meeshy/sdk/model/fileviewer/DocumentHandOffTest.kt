package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

/**
 * « Ouvrir avec une autre app » ne prête QUE des documents de bureautique, reconnus à leur EXTENSION, et sous le type
 * que l'extension implique : le type déclaré par l'expéditeur ne choisit jamais le gestionnaire qui va lire le fichier.
 */
class DocumentHandOffTest {

    @Test
    fun `les documents de bureautique sont pretes sous le type de leur extension`() {
        assertThat(DocumentHandOff.mimeFor("rapport.docx"))
            .isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        assertThat(DocumentHandOff.mimeFor("Budget.XLSX"))
            .isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        assertThat(DocumentHandOff.mimeFor("deck.pptx"))
            .isEqualTo("application/vnd.openxmlformats-officedocument.presentationml.presentation")
        assertThat(DocumentHandOff.mimeFor("note.odt")).isEqualTo("application/vnd.oasis.opendocument.text")
        assertThat(DocumentHandOff.mimeFor("lettre.rtf")).isEqualTo("application/rtf")
        assertThat(DocumentHandOff.mimeFor("vieux.doc")).isEqualTo("application/msword")
    }

    @Test
    fun `un type actif ou executable n'est jamais prete quel que soit son nom`() {
        listOf(
            "page.html", "page.htm", "image.svg", "doc.xhtml", "app.apk", "script.js", "a.exe", "b.sh", "c.jar",
            "d.zip", "e.bin", "f", "", ".docx.html", "rapport.docx.apk", "rapport.docm", "x.xlsm",
        ).forEach { name -> assertWithMessage(name).that(DocumentHandOff.mimeFor(name)).isNull() }
        assertThat(DocumentHandOff.mimeFor(null)).isNull()
    }
}
