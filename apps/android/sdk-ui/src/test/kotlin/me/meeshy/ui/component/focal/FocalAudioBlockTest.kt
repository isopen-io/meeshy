package me.meeshy.ui.component.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.FocalAudioMode
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import me.meeshy.ui.component.bubble.showsVoiceConsentNotice
import org.junit.Test

class FocalAudioBlockTest {

    private fun content(
        text: String = "",
        audios: Int = 0,
        images: Int = 0,
        files: Int = 0,
        replyToText: String? = null,
        consentMissing: Boolean = false,
        isOutgoing: Boolean = false,
    ) = BubbleContent(
        messageId = "m1", text = text, isOutgoing = isOutgoing, isTranslated = false, originalText = null,
        senderName = null, showSenderName = false, isEdited = false, isDeleted = false, createdAtIso = null,
        audios = List(audios) { BubbleAudio(attachmentId = "a$it", url = "https://x/a$it.m4a") },
        images = List(images) { BubbleImage(attachmentId = "i$it", url = "https://x/i$it.jpg") },
        files = List(files) { BubbleFile(attachmentId = "f$it", name = "f$it.pdf") },
        replyToText = replyToText,
        voiceConsentMissing = consentMissing,
    )

    @Test fun `aucun audio ne monte aucun bloc`() {
        assertThat(content(text = "salut").focalAudioMode()).isEqualTo(FocalAudioMode.None)
    }

    @Test fun `plusieurs pistes pures forment une pile`() {
        assertThat(content(audios = 3).focalAudioMode()).isEqualTo(FocalAudioMode.Stack)
    }

    @Test fun `un audio seul garde son pied`() {
        assertThat(content(audios = 1).focalAudioMode()).isEqualTo(FocalAudioMode.SoleWithFooter)
    }

    @Test fun `un audio pur avec texte reste seul avec pied car le texte est sa transcription`() {
        assertThat(content(audios = 1, text = "bonjour tout le monde").focalAudioMode()).isEqualTo(FocalAudioMode.SoleWithFooter)
    }

    @Test fun `un audio qui repond heberge la citation`() {
        assertThat(content(audios = 1, replyToText = "avant").focalAudioMode()).isEqualTo(FocalAudioMode.HostsReply)
    }

    @Test fun `un audio avec un fichier et un texte heberge la legende`() {
        assertThat(content(audios = 1, files = 1, text = "voir").focalAudioMode()).isEqualTo(FocalAudioMode.HostsCaption)
    }

    @Test fun `un audio avec une image est autonome`() {
        assertThat(content(audios = 1, images = 1, text = "voir").focalAudioMode()).isEqualTo(FocalAudioMode.Standalone)
    }

    @Test fun `le consentement vocal ne se propose que sous mon audio`() {
        assertThat(content(audios = 1, consentMissing = true, isOutgoing = true).showsVoiceConsentNotice()).isTrue()
        assertThat(content(consentMissing = true, text = "x", isOutgoing = true).showsVoiceConsentNotice()).isFalse()
        assertThat(content(audios = 1, isOutgoing = true).showsVoiceConsentNotice()).isFalse()
        assertThat(content(audios = 1, consentMissing = true, isOutgoing = false).showsVoiceConsentNotice()).isFalse()
    }
}
