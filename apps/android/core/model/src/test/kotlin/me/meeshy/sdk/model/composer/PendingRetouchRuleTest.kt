package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PendingRetouchRuleTest {

    private fun item(type: PendingAttachmentType = PendingAttachmentType.IMAGE, path: String? = "/cache/p.jpg", ready: Boolean = true, mime: String? = "image/jpeg") =
        PendingAttachment(
            id = "p1",
            type = type,
            fileName = "p.jpg",
            mimeType = mime,
            localPath = path,
            phase = if (ready) PendingAttachmentPhase.Ready else PendingAttachmentPhase.Preparing,
        )

    @Test
    fun `une image prete avec son fichier s ouvre dans la retouche`() {
        assertThat(PendingRetouchRule.opens(item())).isTrue()
    }

    @Test
    fun `une video prete avec son fichier s ouvre dans la retouche video`() {
        assertThat(PendingRetouchRule.opens(item(type = PendingAttachmentType.VIDEO))).isTrue()
        assertThat(PendingRetouchRule.opens(item(type = PendingAttachmentType.VIDEO, ready = false))).isFalse()
    }

    @Test
    fun `une piece qui se prepare, sans fichier, un son ou un fichier ne s ouvrent pas`() {
        assertThat(PendingRetouchRule.opens(item(ready = false))).isFalse()
        assertThat(PendingRetouchRule.opens(item(path = null))).isFalse()
        assertThat(PendingRetouchRule.opens(item(type = PendingAttachmentType.AUDIO))).isFalse()
        assertThat(PendingRetouchRule.opens(item(type = PendingAttachmentType.FILE))).isFalse()
    }

    @Test
    fun `un GIF ne s ouvre pas en retouche, la scene le figerait (iOS offersRetouche)`() {
        assertThat(PendingRetouchRule.opens(item(mime = "image/gif"))).isFalse()
        assertThat(PendingRetouchRule.opens(item(mime = "IMAGE/GIF"))).isFalse()
        assertThat(PendingRetouchRule.opens(item(mime = "image/png"))).isTrue()
        assertThat(PendingRetouchRule.opens(item(mime = null))).isTrue()
    }
}
