package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerPresetTest {
    private fun gates(p: ComposerPreset) = buildList {
        if (p.showVoice) add("voice")
        if (p.showAttachment) add("attachment")
        if (p.showLanguageSelector) add("language")
        if (p.showEphemeral) add("ephemeral")
        if (p.showViewOnce) add("viewOnce")
        if (p.showEffectsSheet) add("effects")
        if (p.showPermanentEffects) add("permanentEffects")
    }

    @Test fun `la conversation montre toutes les portes de message`() {
        assertThat(gates(ComposerPreset.CONVERSATION))
            .containsExactly("voice", "attachment", "language", "ephemeral", "viewOnce", "effects")
        assertThat(ComposerPreset.CONVERSATION.placeholder).isEqualTo(ComposerPlaceholder.MESSAGE)
        assertThat(ComposerPreset.CONVERSATION.maxLength).isNull()
    }

    @Test fun `le commentaire garde la langue et les effets permanents`() {
        assertThat(gates(ComposerPreset.COMMENT)).containsExactly("language", "permanentEffects")
        assertThat(ComposerPreset.COMMENT.placeholder).isEqualTo(ComposerPlaceholder.COMMENT)
        assertThat(ComposerPreset.COMMENT.maxLength).isEqualTo(2_000)
    }

    @Test fun `la reponse a un media garde la voix et mille caracteres`() {
        assertThat(gates(ComposerPreset.MEDIA_REPLY)).containsExactly("voice")
        assertThat(ComposerPreset.MEDIA_REPLY.placeholder).isEqualTo(ComposerPlaceholder.REPLY)
        assertThat(ComposerPreset.MEDIA_REPLY.maxLength).isEqualTo(1_000)
    }

    @Test fun `le canevas de story n'a aucune porte et une legende de 500`() {
        assertThat(gates(ComposerPreset.STORY_CANVAS)).isEmpty()
        assertThat(ComposerPreset.STORY_CANVAS.placeholder).isEqualTo(ComposerPlaceholder.CAPTION)
        assertThat(ComposerPreset.STORY_CANVAS.maxLength).isEqualTo(500)
    }

    @Test fun `l'apercu de notification est en lecture seule sans porte`() {
        assertThat(gates(ComposerPreset.NOTIFICATION_PREVIEW)).isEmpty()
        assertThat(ComposerPreset.NOTIFICATION_PREVIEW.isReadOnly).isTrue()
        assertThat(ComposerPreset.entries.filter { it.isReadOnly }).containsExactly(ComposerPreset.NOTIFICATION_PREVIEW)
    }

    @Test fun `la longueur max tronque et detecte le depassement`() {
        assertThat(ComposerPreset.STORY_CANVAS.clamp("a".repeat(600))).hasLength(500)
        assertThat(ComposerPreset.STORY_CANVAS.exceeds(501)).isTrue()
        assertThat(ComposerPreset.STORY_CANVAS.exceeds(500)).isFalse()
        assertThat(ComposerPreset.CONVERSATION.exceeds(1_000_000)).isFalse()
        assertThat(ComposerPreset.CONVERSATION.clamp("abc")).isEqualTo("abc")
    }
}
