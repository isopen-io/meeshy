package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les arrivées en direct d'un fil dont un vocal joue — port de `AudioQueueAppendTracker` d'iOS. */
class AudioQueueAppendTrackerTest {

    private fun message(
        id: String,
        sender: String = "other",
        conversation: String = "c",
        at: Long = 10L,
        protectedMessage: Boolean = false,
        vararg audios: String,
    ) = AudioQueueMessage(
        messageId = id,
        conversationId = conversation,
        senderId = sender,
        senderName = "N",
        senderAvatarUrl = null,
        createdAtEpochMs = at,
        isProtected = protectedMessage,
        audios = audios.map { AudioQueueAttachment(it, "u/$it.mp3", 1_000L, isProtected = false) },
    )

    private fun AudioQueueAppendTracker.step(
        snapshot: List<AudioQueueMessage>,
        active: String? = "c",
        listened: Set<String> = emptySet(),
    ) = next(snapshot, activeConversationId = active, conversationId = "c", currentUserId = "me", listenedAttachmentIds = listened)

    private fun ids(arrivals: List<QueuedAudio>) = arrivals.map { it.attachmentId }

    @Test
    fun `la premiere emission ne rend rien, jamais l'arriere`() {
        val (arrivals, _) = AudioQueueAppendTracker().step(listOf(message("m1", audios = arrayOf("a"))))

        assertThat(arrivals).isEmpty()
    }

    @Test
    fun `l'arrivee d'un tiers rejoint la file avec toutes ses pieces`() {
        val (_, seeded) = AudioQueueAppendTracker().step(listOf(message("m1", audios = arrayOf("a"))))

        val (arrivals, _) = seeded.step(listOf(message("m1", audios = arrayOf("a")), message("m2", at = 20L, audios = arrayOf("b1", "b2"))))

        assertThat(ids(arrivals)).containsExactly("b1", "b2").inOrder()
        assertThat(arrivals.first().messageId).isEqualTo("m2")
        assertThat(arrivals.first().receivedAtEpochMs).isEqualTo(20L)
    }

    @Test
    fun `mon propre vocal n'est pas une arrivee`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())

        val (arrivals, _) = seeded.step(listOf(message("m2", sender = "me", audios = arrayOf("mine"))))

        assertThat(arrivals).isEmpty()
    }

    @Test
    fun `sans lecture dans ce fil la ligne de base se rebase, puis la lecture ne rejoue pas l'arriere`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())
        val (idle, rebased) = seeded.step(listOf(message("m2", audios = arrayOf("b"))), active = null)

        assertThat(idle).isEmpty()
        assertThat(rebased.step(listOf(message("m2", audios = arrayOf("b")))).first).isEmpty()
    }

    @Test
    fun `une lecture dans une autre conversation ne rend rien`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())

        val (arrivals, _) = seeded.step(listOf(message("m2", audios = arrayOf("b"))), active = "elsewhere")

        assertThat(arrivals).isEmpty()
    }

    @Test
    fun `un message d'une autre conversation n'est pas une arrivee`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())

        val (arrivals, _) = seeded.step(listOf(message("m2", conversation = "other", audios = arrayOf("b"))))

        assertThat(arrivals).isEmpty()
    }

    @Test
    fun `une piece ecoutee ou consommee ne revient pas`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())
        val arrived = message("m2", audios = arrayOf("heard", "consumed", "fresh"))
            .let { it.copy(audios = it.audios.map { piece -> piece.copy(listenedComplete = piece.attachmentId == "consumed") }) }

        val (arrivals, _) = seeded.step(listOf(arrived), listened = setOf("heard"))

        assertThat(ids(arrivals)).containsExactly("fresh")
    }

    @Test
    fun `un message deja vu n'arrive qu'une fois`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())
        val snapshot = listOf(message("m2", audios = arrayOf("b")))

        val (first, afterFirst) = seeded.step(snapshot)
        val (second, _) = afterFirst.step(snapshot)

        assertThat(ids(first)).containsExactly("b")
        assertThat(second).isEmpty()
    }

    @Test
    fun `la protection du message et la piste servie voyagent avec l'arrivee`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())
        val arrived = message("m2", protectedMessage = true, audios = arrayOf("b"))
            .let { it.copy(audios = it.audios.map { piece -> piece.copy(trackLanguage = "en", isTranslatedTrack = true) }) }

        val queued = seeded.step(listOf(arrived)).first.single()

        assertThat(queued.isProtected).isTrue()
        assertThat(queued.trackLanguage).isEqualTo("en")
        assertThat(queued.isTranslatedTrack).isTrue()
    }

    @Test
    fun `un message sans auteur connu n'est pas confondu avec le mien`() {
        val (_, seeded) = AudioQueueAppendTracker().step(emptyList())
        val anonymous = message("m2", audios = arrayOf("b")).copy(senderId = null)

        assertThat(ids(seeded.step(listOf(anonymous)).first)).containsExactly("b")
    }

    @Test
    fun `l'historique pagine par le haut n'est pas une arrivee`() {
        val (_, seeded) = AudioQueueAppendTracker().step(listOf(message("m5", at = 50L, audios = arrayOf("recent"))))

        val (arrivals, _) = seeded.step(listOf(message("m1", at = 10L, audios = arrayOf("old")), message("m5", at = 50L, audios = arrayOf("recent"))))

        assertThat(arrivals).isEmpty()
    }
}
