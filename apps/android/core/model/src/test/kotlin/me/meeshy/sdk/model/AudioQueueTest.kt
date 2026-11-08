package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioQueueTest {

    private fun message(
        id: String,
        at: Long,
        sender: String = "other",
        vararg audios: String,
        protectedMessage: Boolean = false,
        protectedPieces: Set<String> = emptySet(),
    ) = AudioQueueMessage(
        messageId = id,
        conversationId = "c",
        senderId = sender,
        senderName = "N",
        senderAvatarUrl = null,
        createdAtEpochMs = at,
        isProtected = protectedMessage,
        audios = audios.map { AudioQueueAttachment(it, "u/$it.mp3", 1_000L, isProtected = it in protectedPieces) },
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
    fun `un vocal protege au milieu de la file arrive protege, ses voisins restent ordinaires`() {
        val queue = build(
            listOf(
                message("m1", 10L, audios = arrayOf("a")),
                message("m2", 20L, audios = arrayOf("b"), protectedMessage = true),
                message("m3", 30L, audios = arrayOf("c")),
            ),
        )

        assertThat(queue.map { it.attachmentId to it.isProtected })
            .containsExactly("a" to false, "b" to true, "c" to false).inOrder()
    }

    @Test
    fun `apres le curseur la protection du message suit chacun de ses vocaux`() {
        val queue = build(
            listOf(
                message("m1", 10L, audios = arrayOf("a")),
                message("m2", 20L, audios = arrayOf("b1", "b2"), protectedMessage = true),
            ),
            after = "a",
        )

        assertThat(queue.map { it.attachmentId to it.isProtected })
            .containsExactly("b1" to true, "b2" to true).inOrder()
    }

    @Test
    fun `une piece protegee protege son vocal sans proteger ses soeurs`() {
        val queue = build(listOf(message("m1", 10L, audios = arrayOf("x", "y", "z"), protectedPieces = setOf("y"))))

        assertThat(queue.map { it.attachmentId to it.isProtected })
            .containsExactly("x" to false, "y" to true, "z" to false).inOrder()
    }

    @Test
    fun `le resolveur de piste ne retire pas la protection`() {
        val queue = AudioQueueBuilder.build(
            listOf(message("m1", 10L, audios = arrayOf("a"), protectedMessage = true)),
            null,
            "me",
            emptySet(),
        ) { _, audio -> "translated/${audio.attachmentId}.mp3" }

        assertThat(queue.single().isProtected).isTrue()
    }

    @Test
    fun `une piece servie ecoutee jusqu'au bout ne rejoint pas la file`() {
        val heard = message("m1", 10L, audios = arrayOf("heard", "fresh"))
            .let { it.copy(audios = it.audios.map { piece -> piece.copy(listenedComplete = piece.attachmentId == "heard") }) }

        assertThat(ids(build(listOf(heard)))).containsExactly("fresh")
    }

    @Test
    fun `les pistes suivantes de mon propre message touche suivent, mes autres messages non`() {
        val queue = build(
            listOf(
                message("m1", 10L, sender = "me", audios = arrayOf("a1", "a2", "a3")),
                message("m3", 30L, sender = "me", audios = arrayOf("late")),
                message("m4", 40L, audios = arrayOf("theirs")),
            ),
            after = "a1",
        )

        assertThat(ids(queue)).containsExactly("a2", "a3", "theirs").inOrder()
    }

    @Test
    fun `la file porte la langue et la piste servies`() {
        val served = message("m1", 10L, audios = arrayOf("a"))
            .let { it.copy(audios = it.audios.map { piece -> piece.copy(trackLanguage = "en", isTranslatedTrack = true) }) }

        val queued = build(listOf(served)).single()

        assertThat(queued.trackLanguage).isEqualTo("en")
        assertThat(queued.isTranslatedTrack).isTrue()
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
        senderName = "N", senderAvatarUrl = null, receivedAtEpochMs = 0L, isProtected = false,
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
    fun `le vocal courant accuse prend son id serveur et son adresse servie, la suite ne bouge pas`() {
        val queue = AudioPlayQueue().started(item("cmid"), listOf(item("b")))

        val followed = queue.followed(fromAttachmentId = "cmid", toAttachmentId = "att_server", fileUrl = "https://gate/voice.m4a")

        assertThat(followed.current?.attachmentId).isEqualTo("att_server")
        assertThat(followed.current?.fileUrl).isEqualTo("https://gate/voice.m4a")
        assertThat(followed.current?.messageId).isEqualTo("mcmid")
        assertThat(followed.upcoming.map { it.attachmentId }).containsExactly("b")
        assertThat(queue.followed("cmid", "att_server", "https://gate/voice.m4a", messageId = "m_server").current?.messageId)
            .isEqualTo("m_server")
    }

    @Test
    fun `suivre une piece qui n'est pas la courante ne change rien`() {
        val queue = AudioPlayQueue().started(item("a"), listOf(item("b")))

        assertThat(queue.followed("b", "att_b", "https://gate/b.m4a")).isEqualTo(queue)
        assertThat(AudioPlayQueue().followed("a", "att_a", "https://gate/a.m4a")).isEqualTo(AudioPlayQueue())
    }

    @Test
    fun `le cycle de vitesse du coordinateur fait x1 x1,5 x2 puis reboucle`() {
        val speeds = generateSequence(me.meeshy.sdk.model.media.PlaybackSpeed.X1_0) { CoordinatorSpeedCycle.next(it) }.take(4).toList()

        assertThat(speeds.map { it.rate }).containsExactly(1.0f, 1.5f, 2.0f, 1.0f).inOrder()
        assertThat(CoordinatorSpeedCycle.next(me.meeshy.sdk.model.media.PlaybackSpeed.X0_8).rate).isEqualTo(1.0f)
    }

    private fun queued(id: String, url: String, language: String? = null) = QueuedAudio(
        attachmentId = id, messageId = "m$id", conversationId = "c", fileUrl = url, durationMs = 1_000L,
        senderName = "N", senderAvatarUrl = null, receivedAtEpochMs = 0L, trackLanguage = language,
        isTranslatedTrack = language != null, isProtected = false,
    )

    @Test
    fun `la variante d'une autre langue remplace le vocal courant sans toucher la suite`() {
        val queue = AudioPlayQueue().started(queued("a", "u/a.mp3"), listOf(queued("b", "u/b.mp3")))

        val switched = queue.withVariant(queued("a", "u/a-es.mp3", language = "es"))

        assertThat(switched.current?.fileUrl).isEqualTo("u/a-es.mp3")
        assertThat(switched.current?.trackLanguage).isEqualTo("es")
        assertThat(switched.upcoming.map { it.attachmentId }).containsExactly("b")
    }

    @Test
    fun `la variante d'un autre vocal laisse la file telle quelle`() {
        val queue = AudioPlayQueue().started(queued("a", "u/a.mp3"), emptyList())

        assertThat(queue.withVariant(queued("b", "u/b-es.mp3", language = "es"))).isEqualTo(queue)
    }
}
