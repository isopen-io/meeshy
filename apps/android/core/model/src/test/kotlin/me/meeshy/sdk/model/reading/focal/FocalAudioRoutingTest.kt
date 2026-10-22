package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalAudioRoutingTest {

    private fun input(
        shape: FocalAttachmentShape = FocalAttachmentShape.None,
        audio: Int = 0,
        visual: Int = 0,
        emojiOnly: Boolean = false,
        text: Boolean = false,
        reply: Boolean = false,
    ) = FocalAudioRoutingInput(shape, audio, visual, emojiOnly, text, reply)

    private fun mode(input: FocalAudioRoutingInput) = FocalAudioRouting.mode(input)

    @Test
    fun `sans audio le mode est aucun`() {
        assertThat(mode(input())).isEqualTo(FocalAudioMode.None)
        assertThat(mode(input(text = true))).isEqualTo(FocalAudioMode.None)
        assertThat(mode(input(FocalAttachmentShape.VisualGrid, visual = 2))).isEqualTo(FocalAudioMode.None)
    }

    @Test
    fun `un audio pur multi-pistes est une pile`() {
        assertThat(mode(input(FocalAttachmentShape.Audio, audio = 2))).isEqualTo(FocalAudioMode.Stack)
    }

    @Test
    fun `un mixte multi-pistes n'est jamais une pile`() {
        assertThat(mode(input(FocalAttachmentShape.Mixed, audio = 2))).isNotEqualTo(FocalAudioMode.Stack)
    }

    @Test
    fun `une piste seule n'est jamais une pile`() {
        assertThat(mode(input(FocalAttachmentShape.Audio, audio = 1))).isEqualTo(FocalAudioMode.SoleWithFooter)
    }

    @Test
    fun `un audio pur dont le texte est la transcription reste seul avec pied`() {
        // hasTextOrNonMediaContent est faux pour un audio pur : le widget rend la transcription.
        assertThat(mode(input(FocalAttachmentShape.Audio, audio = 1, text = false)))
            .isEqualTo(FocalAudioMode.SoleWithFooter)
    }

    @Test
    fun `un audio qui répond sans texte héberge la réponse`() {
        assertThat(mode(input(FocalAttachmentShape.Audio, audio = 1, reply = true)))
            .isEqualTo(FocalAudioMode.HostsReply)
    }

    @Test
    fun `audio et texte dans un mixte sans visuel héberge la légende`() {
        assertThat(mode(input(FocalAttachmentShape.Mixed, audio = 1, text = true)))
            .isEqualTo(FocalAudioMode.HostsCaption)
    }

    @Test
    fun `audio texte et grille visuelle est autonome`() {
        assertThat(mode(input(FocalAttachmentShape.Mixed, audio = 1, visual = 2, text = true)))
            .isEqualTo(FocalAudioMode.Standalone)
    }

    @Test
    fun `audio texte et réponse est autonome`() {
        assertThat(mode(input(FocalAttachmentShape.Mixed, audio = 1, text = true, reply = true)))
            .isEqualTo(FocalAudioMode.Standalone)
    }

    @Test
    fun `un emoji seul avec audio n'est pas un pied seul`() {
        assertThat(mode(input(FocalAttachmentShape.Mixed, audio = 1, emojiOnly = true)))
            .isEqualTo(FocalAudioMode.Standalone)
    }

    @Test
    fun `l'hôte de réponse visuel est distinct de l'hôte audio`() {
        val visual = input(FocalAttachmentShape.VisualGrid, visual = 1, reply = true)
        assertThat(FocalAudioRouting.visualHostsReply(visual)).isTrue()
        assertThat(FocalAudioRouting.audioHostsReply(visual)).isFalse()
    }
}
