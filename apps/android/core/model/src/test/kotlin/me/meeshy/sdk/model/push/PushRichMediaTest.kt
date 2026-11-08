package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushRichMediaTest {

    private fun payload(vararg pairs: Pair<String, String>) = PushPayload.decode(pairs.toMap())

    @Test
    fun `une image du fil devient la grande image`() {
        val media = PushRichMedia.of(payload("attachmentUrl" to "https://gate.meeshy.me/a.jpg", "attachmentMimeType" to "image/jpeg"))
        assertThat(media).isEqualTo(PushRichMedia.Picture("https://gate.meeshy.me/a.jpg", "image/jpeg"))
    }

    @Test
    fun `une image plus grosse que le plafond ne voyage pas`() {
        val media = PushRichMedia.of(
            payload("attachmentUrl" to "u", "attachmentMimeType" to "image/png", "attachmentFileSize" to "9000000"),
        )
        assertThat(media).isEqualTo(PushRichMedia.None)
    }

    @Test
    fun `un AVIF n est pas ouvert comme sur iOS`() {
        val media = PushRichMedia.of(payload("attachmentUrl" to "u", "attachmentMimeType" to "image/avif"))
        assertThat(media).isEqualTo(PushRichMedia.None)
    }

    @Test
    fun `une video n obtient que la vignette du serveur`() {
        val media = PushRichMedia.of(
            payload("attachmentUrl" to "https://gate.meeshy.me/v.mp4", "attachmentMimeType" to "video/mp4", "thumbnailUrl" to "https://gate.meeshy.me/t.webp"),
        )
        assertThat(media).isEqualTo(PushRichMedia.VideoThumbnail("https://gate.meeshy.me/t.webp", "image/webp"))
    }

    @Test
    fun `une video sans vignette ne montre rien et jamais le fichier`() {
        val media = PushRichMedia.of(payload("attachmentUrl" to "https://gate.meeshy.me/v.mp4", "attachmentMimeType" to "video/mp4"))
        assertThat(media).isEqualTo(PushRichMedia.None)
    }

    @Test
    fun `un vocal porte sa duree`() {
        val media = PushRichMedia.of(
            payload("attachmentUrl" to "u", "attachmentMimeType" to "audio/mp4; codecs=mp4a.40.2", "attachmentDurationMs" to "12000"),
        )
        assertThat(media).isEqualTo(PushRichMedia.Voice(12_000))
    }

    @Test
    fun `un vocal sans adresse ne voyage pas`() {
        val media = PushRichMedia.of(payload("attachmentUrl" to "", "attachmentMimeType" to "audio/mp4"))
        assertThat(media).isEqualTo(PushRichMedia.None)
    }

    @Test
    fun `un message protege n obtient ni image ni vignette ni vocal`() {
        val protections = listOf(
            "notificationLocKey" to "message.view_once",
            "effectFlags" to "4",
            "ephemeralDuration" to "30",
        )
        val media = listOf(
            "image/jpeg" to "attachmentUrl",
            "video/mp4" to "thumbnailUrl",
            "audio/mp4" to "attachmentUrl",
        )
        for (protection in protections) for ((mime, urlKey) in media) {
            val result = PushRichMedia.of(
                payload(protection, "attachmentMimeType" to mime, "attachmentUrl" to "u", urlKey to "t.jpg", "attachmentDurationMs" to "5000"),
            )
            assertThat(result).isEqualTo(PushRichMedia.None)
        }
    }

    @Test
    fun `une vignette de contenu social sans mime reste une image`() {
        val media = PushRichMedia.of(payload("thumbnailUrl" to "https://gate.meeshy.me/p.png"))
        assertThat(media).isEqualTo(PushRichMedia.Picture("https://gate.meeshy.me/p.png", "image/png"))
    }

    @Test
    fun `la duree se formate en minutes et secondes`() {
        assertThat(PushRichMedia.formatDuration(12_000)).isEqualTo("0:12")
        assertThat(PushRichMedia.formatDuration(754_000)).isEqualTo("12:34")
        assertThat(PushRichMedia.formatDuration(3_725_000)).isEqualTo("1:02:05")
        assertThat(PushRichMedia.formatDuration(0)).isNull()
        assertThat(PushRichMedia.formatDuration(null)).isNull()
    }

    @Test
    fun `l avatar cede du temps a l image mais jamais sous le seuil utile`() {
        assertThat(PushMediaBudget.avatarMillis(9_000, pictureWanted = true)).isEqualTo(2_500)
        assertThat(PushMediaBudget.avatarMillis(3_000, pictureWanted = true)).isEqualTo(1_000)
        assertThat(PushMediaBudget.avatarMillis(3_000, pictureWanted = false)).isEqualTo(2_500)
        assertThat(PushMediaBudget.avatarMillis(800, pictureWanted = true)).isEqualTo(0)
        assertThat(PushMediaBudget.avatarMillis(-5, pictureWanted = false)).isEqualTo(0)
    }
}
