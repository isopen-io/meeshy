package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioQueueTest {

    private fun message(
        id: String,
        at: Long,
        sender: String = "other",
        vararg audios: String,
    ) = AudioQueueMessage(
        messageId = id,
        conversationId = "c",
        senderId = sender,
        senderName = "N",
        senderAvatarUrl = null,
        createdAtEpochMs = at,
        audios = audios.map { AudioQueueAttachment(it, "u/$it.mp3", 1_000L) },
    )

    private fun ids(queue: List<QueuedAudio>) = queue.map { it.attachmentId }

    private fun build(
        messages: List<AudioQueueMessage>,
        after: String? = null,
        listened: Set<String> = emptySet(),
    ) = AudioQueueBuilder.build(messages, after, currentUserId = "me", listenedAttachmentIds = listened)

    @Test
    fun `la file est triee par date puis par identifiant`() {
        val queue = build(listOf(message("m2", 20L, audios = arrayOf("b")), message("m1", 10L, audios = arrayOf("z"))))

        assertThat(ids(queue)).containsExactly("z", "b").inOrder()
    }

    @Test
    fun `les vocaux de l'utilisateur et les vocaux ecoutes sont exclus`() {
        val queue = build(
            listOf(
                message("m1", 10L, sender = "me", audios = arrayOf("mine")),
                message("m2", 20L, audios = arrayOf("heard", "fresh")),
            ),
            listened = setOf("heard"),
        )

        assertThat(ids(queue)).containsExactly("fresh")
    }

    @Test
    fun `avec un curseur seuls les vocaux strictement apres lui restent`() {
        val queue = build(
            listOf(
                message("m1", 10L, audios = arrayOf("a")),
                message("m2", 20L, audios = arrayOf("b")),
                message("m3", 30L, audios = arrayOf("c")),
            ),
            after = "b",
        )

        assertThat(ids(queue)).containsExactly("c")
    }

    @Test
    fun `le message du curseur reste lisible meme s'il est de l'utilisateur`() {
        val queue = build(
            listOf(
                message("m1", 10L, sender = "me", audios = arrayOf("t1", "t2", "t3")),
                message("m0", 5L, sender = "me", audios = arrayOf("old")),
            ),
            after = "t1",
        )

        assertThat(ids(queue)).containsExactly("t2", "t3").inOrder()
    }

    @Test
    fun `dans un message l'ordre des pieces jointes l'emporte sur l'ordre lexical`() {
        val queue = build(listOf(message("m1", 10L, audios = arrayOf("z", "a"))))

        assertThat(ids(queue)).containsExactly("z", "a").inOrder()
    }

    @Test
    fun `le resolveur de piste choisit l'url jouee`() {
        val queue = AudioQueueBuilder.build(
            listOf(message("m1", 10L, audios = arrayOf("a"))),
            null,
            "me",
            emptySet(),
        ) { _, audio -> "translated/${audio.attachmentId}.mp3" }

        assertThat(queue.single().fileUrl).isEqualTo("translated/a.mp3")
    }

    @Test
    fun `un curseur inconnu ne filtre rien`() {
        val queue = build(listOf(message("m1", 10L, audios = arrayOf("a"))), after = "ghost")

        assertThat(ids(queue)).containsExactly("a")
    }
}

class AudioPlayQueueTest {

    private fun item(id: String, message: String = "m$id") = QueuedAudio(
        attachmentId = id, messageId = message, conversationId = "c", fileUrl = "u/$id", durationMs = 1_000L,
        senderName = "N", senderAvatarUrl = null, receivedAtEpochMs = 0L,
    )

    @Test
    fun `demarrer pose le courant et dedoublonne la suite`() {
        val queue = AudioPlayQueue().started(item("a"), listOf(item("b"), item("b"), item("a")))

        assertThat(queue.current?.attachmentId).isEqualTo("a")
        assertThat(queue.upcoming.map { it.attachmentId }).containsExactly("b")
    }

    @Test
    fun `un vocal arrive pendant la lecture rejoint la fin, une file vide l'ignore`() {
        val queue = AudioPlayQueue().started(item("a"), emptyList())

        assertThat(queue.appended(item("b")).upcoming.map { it.attachmentId }).containsExactly("b")
        assertThat(queue.appended(item("b")).appended(item("b")).upcoming).hasSize(1)
        assertThat(queue.appended(item("a")).upcoming).isEmpty()
        assertThat(AudioPlayQueue().appended(item("b"))).isEqualTo(AudioPlayQueue())
    }

    @Test
    fun `avancer puis reculer retrouve le vocal precedent`() {
        val start = AudioPlayQueue().started(item("a"), listOf(item("b"), item("c")))

        val advanced = start.advanced()
        assertThat(advanced.current?.attachmentId).isEqualTo("b")
        assertThat(advanced.hasPrevious).isTrue()

        val rewound = advanced.rewound()
        assertThat(rewound.current?.attachmentId).isEqualTo("a")
        assertThat(rewound.upcoming.map { it.attachmentId }).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `avancer au bout vide la file, reculer sans historique ne change rien`() {
        val single = AudioPlayQueue().started(item("a"), emptyList())

        assertThat(single.advanced()).isEqualTo(AudioPlayQueue())
        assertThat(single.rewound()).isEqualTo(single)
    }

    @Test
    fun `supprimer un message retire ses vocaux`() {
        val queue = AudioPlayQueue().started(item("a", "m1"), listOf(item("b", "m2"), item("c", "m1")))

        val cleaned = queue.withoutMessage("m1")

        assertThat(cleaned.current).isNull()
        assertThat(cleaned.upcoming.map { it.attachmentId }).containsExactly("b")
    }

    @Test
    fun `le cycle de vitesse du coordinateur fait x1 x1,5 x2 puis reboucle`() {
        val speeds = generateSequence(me.meeshy.sdk.model.media.PlaybackSpeed.X1_0) { CoordinatorSpeedCycle.next(it) }.take(4).toList()

        assertThat(speeds.map { it.rate }).containsExactly(1.0f, 1.5f, 2.0f, 1.0f).inOrder()
        assertThat(CoordinatorSpeedCycle.next(me.meeshy.sdk.model.media.PlaybackSpeed.X0_8).rate).isEqualTo(1.0f)
    }
}
