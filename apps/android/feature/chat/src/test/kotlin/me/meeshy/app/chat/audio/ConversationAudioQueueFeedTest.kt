package me.meeshy.app.chat.audio

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.app.chat.ChatVoiceQueue
import me.meeshy.app.chat.ChatVoiceThread
import me.meeshy.app.chat.FakeVoiceEngine
import me.meeshy.app.chat.voice
import me.meeshy.app.chat.voiceMessage
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

/** Les vocaux reçus pendant l'écoute rejoignent la fin de la file — jamais l'arriéré, jamais un consommé (iOS `ConversationAudioQueueFeed`). */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationAudioQueueFeedTest {

    private val m1 = voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a"))

    private class Rig(scope: TestScope, listened: () -> Set<String>) {
        val coordinator = ConversationAudioCoordinator(FakeVoiceEngine(), UnconfinedTestDispatcher(scope.testScheduler))
        val threads = MutableStateFlow<ChatVoiceThread?>(null)

        init {
            val feed = ConversationAudioQueueFeed(coordinator, listened)
            scope.backgroundScope.launch(UnconfinedTestDispatcher(scope.testScheduler)) { feed.follow(threads) }
        }

        fun show(vararg messages: BubbleContent, conversationId: String = "conv") {
            threads.value = ChatVoiceThread(conversationId, "Famille", null, "#6366F1", messages.toList())
        }

        fun play(message: BubbleContent, attachmentId: String, conversationId: String = "conv") {
            val start = ChatVoiceQueue.start(
                tapped = message.audios.first { it.attachmentId == attachmentId },
                bubble = message,
                messages = threads.value?.messages.orEmpty(),
                conversationId = conversationId,
                listenedAttachmentIds = emptySet(),
            )!!
            coordinator.play(start.current, start.tail, "Famille", null)
        }

        val upcoming: List<String> get() = coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }
    }

    @Test
    fun `un vocal recu pendant l'ecoute rejoint la fin de la file`() = runTest {
        val rig = Rig(this) { emptySet() }
        rig.show(m1)
        rig.play(m1, "a")

        rig.show(m1, voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b")))

        assertThat(rig.upcoming).containsExactly("b")
    }

    @Test
    fun `l'arriere present avant la lecture ne rejoint pas la file`() = runTest {
        val rig = Rig(this) { emptySet() }
        rig.show(m1)
        rig.show(m1, voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b")))
        rig.play(m1, "a")

        rig.show(m1, rig.threads.value!!.messages[1], voiceMessage("m3", "2026-11-04T08:02:00Z", voice("c")))

        assertThat(rig.upcoming).containsExactly("c")
    }

    @Test
    fun `un vocal deja consomme ou ecoute dans la session ne revient pas`() = runTest {
        val rig = Rig(this) { setOf("session") }
        rig.show(m1)
        rig.play(m1, "a")

        rig.show(
            m1,
            voiceMessage("m2", "2026-11-04T08:01:00Z", voice("served", listenedComplete = true), voice("session"), voice("fresh")),
        )

        assertThat(rig.upcoming).containsExactly("fresh")
    }

    @Test
    fun `mon propre vocal n'est pas une arrivee`() = runTest {
        val rig = Rig(this) { emptySet() }
        rig.show(m1)
        rig.play(m1, "a")

        rig.show(m1, voiceMessage("m2", "2026-11-04T08:01:00Z", voice("mine"), isOutgoing = true))

        assertThat(rig.upcoming).isEmpty()
    }

    @Test
    fun `une lecture dans une autre conversation ne recoit rien de ce fil`() = runTest {
        val rig = Rig(this) { emptySet() }
        rig.show(m1)
        rig.play(m1, "a", conversationId = "elsewhere")

        rig.show(m1, voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b")))

        assertThat(rig.upcoming).isEmpty()
    }

    @Test
    fun `un vocal protege recu en direct reste protege dans la file`() = runTest {
        val rig = Rig(this) { emptySet() }
        rig.show(m1)
        rig.play(m1, "a")

        rig.show(m1, voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b"), isViewOnce = true))

        assertThat(rig.coordinator.snapshot.value.queue.upcoming.single().isProtected).isTrue()
    }

    @Test
    fun `l'historique pagine par le haut pendant l'ecoute n'est pas une arrivee`() = runTest {
        val rig = Rig(this) { emptySet() }
        rig.show(m1)
        rig.play(m1, "a")

        rig.show(voiceMessage("m0", "2026-11-03T08:00:00Z", voice("old")), m1)

        assertThat(rig.upcoming).isEmpty()
    }

    @Test
    fun `une edition qui ne change pas les messages ne rejoue rien`() = runTest {
        val rig = Rig(this) { emptySet() }
        rig.show(m1)
        rig.play(m1, "a")
        rig.show(m1, voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b")))
        rig.coordinator.next()

        rig.show(m1.copy(isEdited = true), voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b")))

        assertThat(rig.upcoming).isEmpty()
    }
}
