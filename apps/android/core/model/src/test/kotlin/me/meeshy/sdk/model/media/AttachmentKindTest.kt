package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentKindTest {
    @Test fun `vecteurs MIME`() {
        val cases = mapOf(
            "image/jpeg" to AttachmentKind.IMAGE,
            "video/mp4" to AttachmentKind.VIDEO,
            "audio/mpeg" to AttachmentKind.AUDIO,
            "application/pdf" to AttachmentKind.PDF,
            "text/csv" to AttachmentKind.SPREADSHEET,
            "application/vnd.ms-excel" to AttachmentKind.SPREADSHEET,
            "application/msword" to AttachmentKind.DOCUMENT,
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" to AttachmentKind.PRESENTATION,
            "application/zip" to AttachmentKind.ARCHIVE,
            "application/json" to AttachmentKind.CODE,
            "text/xml" to AttachmentKind.CODE,
            "text/plain" to AttachmentKind.TEXT,
            "application/octet-stream" to AttachmentKind.OTHER,
            "" to AttachmentKind.OTHER,
        )
        cases.forEach { (mime, kind) -> assertThat(AttachmentKind.fromMime(mime)).isEqualTo(kind) }
    }

    @Test fun `insensible a la casse et aux parametres`() {
        assertThat(AttachmentKind.fromMime("Image/JPEG")).isEqualTo(AttachmentKind.IMAGE)
        assertThat(AttachmentKind.fromMime("text/plain; charset=utf-8")).isEqualTo(AttachmentKind.TEXT)
        assertThat(AttachmentKind.fromMime("TEXT/CSV; x=1")).isEqualTo(AttachmentKind.SPREADSHEET)
        assertThat(AttachmentKind.fromMime(null)).isEqualTo(AttachmentKind.OTHER)
    }

    @Test fun `familles multimedia`() {
        assertThat(AttachmentKind.AUDIO.hasTimebasedTrack).isTrue()
        assertThat(AttachmentKind.IMAGE.hasTimebasedTrack).isFalse()
        assertThat(AttachmentKind.PDF.isMedia).isFalse()
    }

    @Test fun `teintes hex par famille`() {
        val tints = AttachmentKind.entries.associateWith { it.hexTintColor }
        assertThat(tints[AttachmentKind.IMAGE]).isEqualTo("4ECDC4")
        assertThat(tints[AttachmentKind.VIDEO]).isEqualTo("FF6B6B")
        assertThat(tints[AttachmentKind.AUDIO]).isEqualTo("9B59B6")
        assertThat(tints[AttachmentKind.PDF]).isEqualTo("F39C12")
        assertThat(tints[AttachmentKind.SPREADSHEET]).isEqualTo("21803D")
        assertThat(tints[AttachmentKind.DOCUMENT]).isEqualTo("2A56B5")
        assertThat(tints[AttachmentKind.PRESENTATION]).isEqualTo("D96921")
        assertThat(tints[AttachmentKind.CODE]).isEqualTo("6366F1")
        assertThat(tints[AttachmentKind.ARCHIVE]).isEqualTo("808080")
        assertThat(tints[AttachmentKind.OTHER]).isEqualTo("808080")
    }
}
