package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La file reconstruite depuis le vocal touché (iOS `AudioQueueBuilder` + `audioQueueTailProvider`). */
class ChatVoiceQueueTest {

    private val thread = listOf(
        voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a1")),
        voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b1"), isOutgoing = true),
        voiceMessage("m3", "2026-11-04T08:02:00Z", voice("c1", listenedComplete = true), voice("c2")),
        voiceMessage("m4", "2026-11-04T08:03:00Z", voice("d1"), isViewOnce = true),
        voiceMessage("m5", "2026-11-04T08:04:00Z", voice("e1", audioLanguage = "fr", url = "https://cdn.meeshy.me/e1-fr.m4a")),
    )

    private fun start(tapped: String, messageId: String, listened: Set<String> = emptySet()) = ChatVoiceQueue.start(
        tapped = thread.first { it.messageId == messageId }.audios.first { it.attachmentId == tapped },
        bubble = thread.first { it.messageId == messageId },
        messages = thread,
        conversationId = "c1",
        listenedAttachmentIds = listened,
    )

    @Test
    fun `le vocal touche joue, puis les non ecoutes recus apres lui dans l'ordre d'arrivee, les miens exclus`() {
        val start = start("a1", "m1")!!

        assertThat(start.current.attachmentId).isEqualTo("a1")
        assertThat(start.current.conversationId).isEqualTo("c1")
        assertThat(start.tail.map { it.attachmentId }).containsExactly("c2", "d1", "e1").inOrder()
    }

    @Test
    fun `un vocal ecoute pendant la session ne revient pas dans la file`() {
        assertThat(start("a1", "m1", listened = setOf("c2"))!!.tail.map { it.attachmentId }).containsExactly("d1", "e1").inOrder()
    }

    @Test
    fun `un vocal protege par son message reste protege dans la file`() {
        val start = start("a1", "m1")!!

        assertThat(start.tail.single { it.attachmentId == "d1" }.isProtected).isTrue()
        assertThat(start.tail.single { it.attachmentId == "c2" }.isProtected).isFalse()
    }

    @Test
    fun `la piste mise en file est la piste servie, avec sa langue`() {
        val e1 = start("a1", "m1")!!.tail.single { it.attachmentId == "e1" }

        assertThat(e1.fileUrl).isEqualTo("https://cdn.meeshy.me/e1-fr.m4a")
        assertThat(e1.trackLanguage).isEqualTo("fr")
        assertThat(e1.isTranslatedTrack).isTrue()
    }

    @Test
    fun `toucher mon propre message a plusieurs pieces enchaine ses pieces suivantes`() {
        val mine = voiceMessage("m9", "2026-11-04T09:00:00Z", voice("x1"), voice("x2"), isOutgoing = true)
        val start = ChatVoiceQueue.start(mine.audios[0], mine, listOf(mine), "c1", emptySet())!!

        assertThat(start.tail.map { it.attachmentId }).containsExactly("x2")
    }

    @Test
    fun `un vocal sans adresse ne demarre aucune file`() {
        val silent = voiceMessage("m0", "2026-11-04T07:00:00Z", voice("z", url = null))

        assertThat(ChatVoiceQueue.start(silent.audios[0], silent, listOf(silent), "c1", emptySet())).isNull()
    }

    @Test
    fun `un vocal touche hors du fil charge joue seul`() {
        val outside = voiceMessage("m8", "2026-11-04T10:00:00Z", voice("y1"))

        val start = ChatVoiceQueue.start(outside.audios[0], outside, emptyList(), "c1", emptySet())!!

        assertThat(start.current.attachmentId).isEqualTo("y1")
        assertThat(start.tail).isEmpty()
    }
}
