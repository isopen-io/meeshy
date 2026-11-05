package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AudioQueueAttachment
import me.meeshy.sdk.model.AudioQueueBuilder
import me.meeshy.sdk.model.AudioQueueMessage
import org.junit.Test

/**
 * La protection d'un vocal se mesure de la FILE au LECTEUR : bâtie par [AudioQueueBuilder] depuis le message, jamais
 * posée à la main, elle doit atteindre la source chargée — c'est elle qui tient le vocal hors du disque.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class QueuedVoiceProtectionTest {

    private class Rig(scope: TestScope) {
        val port = FakeAudioPlayerPort()
        private val dispatcher = StandardTestDispatcher(scope.testScheduler)
        val engine = Media3AudioPlaybackEngine(
            portFactory = { port },
            positions = InMemoryPositionStore(),
            reportSink = RecordingSink(),
            callActive = { false },
            dispatcher = dispatcher,
            nowEpochMs = { 1_000L },
        )
        val coordinator = ConversationAudioCoordinator(engine, dispatcher)
    }

    private fun message(
        id: String,
        at: Long,
        vararg audios: String,
        protectedMessage: Boolean = false,
        protectedPieces: Set<String> = emptySet(),
    ) = AudioQueueMessage(
        messageId = id,
        conversationId = "c1",
        senderId = "other",
        senderName = "Nour",
        senderAvatarUrl = null,
        createdAtEpochMs = at,
        isProtected = protectedMessage,
        audios = audios.map { AudioQueueAttachment(it, url(it), 5_000L, isProtected = it in protectedPieces) },
    )

    private fun url(id: String) = "https://cdn.meeshy.me/$id.m4a"

    private fun protectionTest(body: suspend TestScope.(Rig) -> Unit) = runTest {
        val rig = Rig(this)
        try {
            body(rig)
        } finally {
            rig.engine.release()
        }
    }

    private fun TestScope.finishCurrent(rig: Rig) {
        rig.port.prepare(5_000L)
        runCurrent()
        rig.port.end()
        runCurrent()
    }

    @Test
    fun `un vocal protege au milieu de la file est charge protege apres l'auto-avance`() = protectionTest { rig ->
        runCurrent()
        val queue = AudioQueueBuilder.build(
            listOf(
                message("m1", 10L, "a"),
                message("m2", 20L, "b", protectedMessage = true),
                message("m3", 30L, "c"),
            ),
            startingAfterAttachmentId = null,
            currentUserId = "me",
            listenedAttachmentIds = emptySet(),
        )

        rig.coordinator.play(queue.first(), queue.drop(1), "Famille", null)
        finishCurrent(rig)
        finishCurrent(rig)

        assertThat(rig.port.loads.map { it.first }).containsExactly(
            AudioSource.Remote(url("a"), isProtected = false),
            AudioSource.Remote(url("b"), isProtected = true),
            AudioSource.Remote(url("c"), isProtected = false),
        ).inOrder()
    }

    @Test
    fun `une piece protegee d'un message ordinaire est chargee protegee, sa soeur non`() = protectionTest { rig ->
        runCurrent()
        val queue = AudioQueueBuilder.build(
            listOf(message("m1", 10L, "x", "y", protectedPieces = setOf("y"))),
            startingAfterAttachmentId = null,
            currentUserId = "me",
            listenedAttachmentIds = emptySet(),
        )

        rig.coordinator.play(queue.first(), queue.drop(1), "Famille", null)
        finishCurrent(rig)

        assertThat(rig.port.loads.map { it.first }).containsExactly(
            AudioSource.Remote(url("x"), isProtected = false),
            AudioSource.Remote(url("y"), isProtected = true),
        ).inOrder()
    }
}
