package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.AttachmentKind
import org.junit.Test

class DocumentKindResolverTest {

    @Test
    fun `un PDF et un Word sont deux familles distinctes`() {
        assertThat(DocumentKindResolver.kindOf("application/pdf", "a.pdf")).isEqualTo(AttachmentKind.PDF)
        assertThat(DocumentKindResolver.kindOf("application/msword", "a.doc")).isEqualTo(AttachmentKind.DOCUMENT)
    }

    @Test
    fun `un type generique retombe sur l'extension du nom`() {
        assertThat(DocumentKindResolver.kindOf("application/octet-stream", "Budget.XLSX")).isEqualTo(AttachmentKind.SPREADSHEET)
        assertThat(DocumentKindResolver.kindOf(null, "deck.pptx")).isEqualTo(AttachmentKind.PRESENTATION)
        assertThat(DocumentKindResolver.kindOf("", "lettre.docx")).isEqualTo(AttachmentKind.DOCUMENT)
        assertThat(DocumentKindResolver.kindOf(null, "rapport.pdf")).isEqualTo(AttachmentKind.PDF)
        assertThat(DocumentKindResolver.kindOf(null, "photos.zip")).isEqualTo(AttachmentKind.ARCHIVE)
    }

    @Test
    fun `un fichier de code est reconnu par son nom meme sans type`() {
        assertThat(DocumentKindResolver.kindOf("application/octet-stream", "main.kt")).isEqualTo(AttachmentKind.CODE)
        assertThat(DocumentKindResolver.kindOf(null, "Dockerfile")).isEqualTo(AttachmentKind.CODE)
    }

    @Test
    fun `une vCard n'est jamais avalee par le code ni par le texte`() {
        assertThat(DocumentKindResolver.kindOf("text/vcard", "Zoe.vcf")).isEqualTo(AttachmentKind.OTHER)
        assertThat(DocumentKindResolver.kindOf("text/x-vcard", "contact.vcf")).isEqualTo(AttachmentKind.OTHER)
    }

    @Test
    fun `un inconnu reste autre`() {
        assertThat(DocumentKindResolver.kindOf(null, null)).isEqualTo(AttachmentKind.OTHER)
        assertThat(DocumentKindResolver.kindOf("application/octet-stream", "blob")).isEqualTo(AttachmentKind.OTHER)
    }
}
