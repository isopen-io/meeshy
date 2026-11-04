package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les pages du plein écran audio du fil (iOS `QuotedAudioFullscreen.sources`). */
class ChatAudioFullscreenSourcesTest {

    private val thread = listOf(
        voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a")),
        voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b"), voice("p", isProtected = true)),
        voiceMessage("m3", "2026-11-04T08:02:00Z", voice("v"), isViewOnce = true),
        voiceMessage("m4", "2026-11-04T08:03:00Z", voice("c")),
    )

    @Test
    fun `un vocal du fil ouvre tous les vocaux du fil, sans aucune piece protegee`() {
        val pages = ChatAudioFullscreenSources.of("b", thread, "conv", "Famille")!!

        assertThat(pages.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(pages.all { it.conversationId == "conv" && it.contextName == "Famille" }).isTrue()
    }

    @Test
    fun `un vocal protege n ouvre rien`() {
        assertThat(ChatAudioFullscreenSources.of("p", thread, "conv", "Famille")).isNull()
        assertThat(ChatAudioFullscreenSources.of("v", thread, "conv", "Famille")).isNull()
    }

    @Test
    fun `un vocal cite hors de la fenetre s ouvre seul, l auteur relu dans la citation`() {
        val quoting = voiceMessage("m5", "2026-11-04T08:04:00Z").copy(
            replyToId = "gone",
            replyToText = "",
            replyToSenderName = "Lina",
            replyToAudio = voice("x"),
        )

        val pages = ChatAudioFullscreenSources.of("x", thread + quoting, "conv", "Famille")!!

        assertThat(pages.single().id).isEqualTo("x")
        assertThat(pages.single().authorName).isEqualTo("Lina")
        assertThat(pages.single().carrierId).isEqualTo("gone")
    }

    @Test
    fun `un vocal inconnu du fil n ouvre rien`() {
        assertThat(ChatAudioFullscreenSources.of("nowhere", thread, "conv", "Famille")).isNull()
    }

    @Test
    fun `la citation d un vocal designe sa piece citee, sinon le premier vocal du cite`() {
        val quoting = voiceMessage("m6", "2026-11-04T08:05:00Z").copy(replyToId = "m1", replyToAudio = voice("a"))

        assertThat(ChatAudioFullscreenSources.quotedVoiceId(quoting, thread[0])).isEqualTo("a")
        assertThat(ChatAudioFullscreenSources.quotedVoiceId(quoting.copy(replyToAudio = null), thread[3])).isEqualTo("c")
        assertThat(ChatAudioFullscreenSources.quotedVoiceId(null, null)).isNull()
    }
}
