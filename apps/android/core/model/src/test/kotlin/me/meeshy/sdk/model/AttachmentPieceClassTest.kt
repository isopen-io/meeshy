package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.AttachmentKind
import org.junit.Test

class AttachmentPieceClassTest {

    @Test
    fun `un text vcard est un contact`() {
        assertThat(AttachmentPieceClass.classify("text/vcard", "x")).isEqualTo(AttachmentPieceClass.Contact)
    }

    @Test
    fun `un fichier vcf est un contact meme sous un type de code`() {
        assertThat(AttachmentPieceClass.classify("application/json", "Marie.VCF")).isEqualTo(AttachmentPieceClass.Contact)
        assertThat(AttachmentPieceClass.classify("application/octet-stream", "marie.vcf")).isEqualTo(AttachmentPieceClass.Contact)
    }

    @Test
    fun `les classes de rendu suivent le type MIME`() {
        assertThat(AttachmentPieceClass.classify("image/png")).isEqualTo(AttachmentPieceClass.Image)
        assertThat(AttachmentPieceClass.classify("Video/mp4; codecs=avc1")).isEqualTo(AttachmentPieceClass.Video)
        assertThat(AttachmentPieceClass.classify("audio/mpeg")).isEqualTo(AttachmentPieceClass.Audio)
        assertThat(AttachmentPieceClass.classify("application/x-location")).isEqualTo(AttachmentPieceClass.Location)
        assertThat(AttachmentPieceClass.classify("application/pdf", "a.pdf")).isEqualTo(AttachmentPieceClass.File)
        assertThat(AttachmentPieceClass.classify(null)).isEqualTo(AttachmentPieceClass.File)
    }

    @Test
    fun `les onze familles se resolvent par MIME`() {
        val expected = mapOf(
            "image/jpeg" to AttachmentKind.IMAGE, "video/mp4" to AttachmentKind.VIDEO, "audio/aac" to AttachmentKind.AUDIO,
            "application/pdf" to AttachmentKind.PDF, "text/csv" to AttachmentKind.SPREADSHEET,
            "application/msword" to AttachmentKind.DOCUMENT, "application/vnd.ms-powerpoint" to AttachmentKind.PRESENTATION,
            "application/zip" to AttachmentKind.ARCHIVE, "application/json" to AttachmentKind.CODE,
            "text/plain" to AttachmentKind.TEXT, "application/x-unknown" to AttachmentKind.OTHER,
        )
        expected.forEach { (mime, kind) -> assertThat(AttachmentPieceClass.familyOf(mime, null)).isEqualTo(kind) }
    }

    @Test
    fun `un type generique retombe sur l extension`() {
        assertThat(AttachmentPieceClass.familyOf("application/octet-stream", "data.JSON")).isEqualTo(AttachmentKind.CODE)
        assertThat(AttachmentPieceClass.familyOf("", "deck.pptx")).isEqualTo(AttachmentKind.PRESENTATION)
        assertThat(AttachmentPieceClass.familyOf("application/octet-stream", "noext")).isEqualTo(AttachmentKind.OTHER)
    }

    @Test
    fun `un type precis l emporte sur l extension`() {
        assertThat(AttachmentPieceClass.familyOf("application/pdf", "photo.png")).isEqualTo(AttachmentKind.PDF)
    }
}
