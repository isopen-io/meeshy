package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioPlayQueueUpcomingTest {

    private fun item(id: String) = QueuedAudio(
        attachmentId = id,
        messageId = "m$id",
        conversationId = "c",
        fileUrl = "u/$id.mp3",
        durationMs = 1_000L,
        senderName = "N",
        senderAvatarUrl = null,
        receivedAtEpochMs = 0L,
        isProtected = false,
    )

    @Test
    fun `un vocal mis en file ne porte aucune consommation servie par defaut`() {
        assertThat(item("a").servedConsumption).isNull()
    }

    @Test
    fun `remplacer la suite garde le courant et l historique`() {
        val queue = AudioPlayQueue().started(item("a"), listOf(item("b"))).advanced()

        val replaced = queue.withUpcoming(listOf(item("x"), item("y")))

        assertThat(replaced.current?.attachmentId).isEqualTo("b")
        assertThat(replaced.played.map { it.attachmentId }).containsExactly("a")
        assertThat(replaced.upcoming.map { it.attachmentId }).containsExactly("x", "y").inOrder()
    }

    @Test
    fun `la suite ne repete ni le courant ni un doublon`() {
        val queue = AudioPlayQueue().started(item("a"), emptyList())

        val replaced = queue.withUpcoming(listOf(item("a"), item("b"), item("b"), item("c")))

        assertThat(replaced.upcoming.map { it.attachmentId }).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `une file sans courant ne prend aucune suite`() {
        assertThat(AudioPlayQueue().withUpcoming(listOf(item("a")))).isEqualTo(AudioPlayQueue())
    }

    @Test
    fun `la file porte la consommation servie de chaque vocal jusqu au moteur`() {
        val message = AudioQueueMessage(
            messageId = "m1",
            conversationId = "c",
            senderId = "other",
            senderName = "N",
            senderAvatarUrl = null,
            createdAtEpochMs = 10L,
            isProtected = false,
            audios = listOf(
                AudioQueueAttachment("a", "u/a.mp3", 10_000L, isProtected = false, lastPlayPositionMs = 4_000),
                AudioQueueAttachment("b", "u/b.mp3", 10_000L, isProtected = false),
            ),
        )

        val queue = AudioQueueBuilder.build(listOf(message), null, currentUserId = "me", listenedAttachmentIds = emptySet())

        assertThat(queue.map { it.servedConsumption }).containsExactly(MeeshyMediaConsumption(lastPlayPositionMs = 4_000), null).inOrder()
    }
}
