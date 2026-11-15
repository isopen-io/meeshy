package me.meeshy.app.talkie

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import me.meeshy.sdk.model.relation.TALKIE_EXPIRY_GRACE_MS
import me.meeshy.sdk.model.relation.TalkieChunk
import me.meeshy.sdk.model.relation.TalkieEnded
import me.meeshy.sdk.model.relation.TalkieEvent
import me.meeshy.sdk.model.relation.TalkieIncoming
import org.junit.Test

/** Le centre du talkie reçu sur Android (#16675) : la loi pure nourrie par la socket, nommée par les caches, expirée. */
@OptIn(ExperimentalCoroutinesApi::class)
class TalkieCenterTest {

    private class RecordingSink : TalkieSink {
        val log = mutableListOf<String>()
        override fun play(talkieId: String, data: ByteArray) { log += "play:$talkieId:${data[0]}" }
        override fun silence(talkieId: String) { log += "silence:$talkieId" }
        override fun release(talkieId: String) { log += "release:$talkieId" }
    }

    private class Harness {
        val scope = TestScope(StandardTestDispatcher())
        val events = MutableSharedFlow<TalkieEvent>(extraBufferCapacity = 16)
        val sink = RecordingSink()
        val center = TalkieCenter(
            sink = sink,
            nameOf = { if (it == "alice") "Alice" else null },
            viewerId = { "me" },
            events = events,
            scope = scope,
            now = { scope.testScheduler.currentTime },
        )

        fun send(event: TalkieEvent) {
            events.tryEmit(event)
            scope.runCurrent()
        }

        init {
            scope.runCurrent()
        }
    }

    private fun opened(from: String = "alice") =
        TalkieEvent.Opened(TalkieIncoming("t1", from, startedAt = "2026-11-08T05:00:00Z", maxDurationMs = 30_000))

    private fun spoken(seq: Int) = TalkieEvent.Spoken(TalkieChunk("t1", "alice", seq, byteArrayOf(seq.toByte())))

    @Test
    fun `une prise de parole s'ouvre, se nomme par les caches et joue ses fragments dans l'ordre`() {
        val harness = Harness()

        harness.send(opened())
        harness.send(spoken(0))
        harness.send(spoken(0))
        harness.send(spoken(1))

        assertThat(harness.center.floor.value.active.single().name).isEqualTo("Alice")
        assertThat(harness.sink.log).containsExactly("play:t1:0", "play:t1:1").inOrder()
    }

    @Test
    fun `couper fait taire ici et retire l'indicateur`() {
        val harness = Harness()
        harness.send(opened())

        harness.center.mute("t1")

        assertThat(harness.sink.log).containsExactly("silence:t1")
        assertThat(harness.center.floor.value.active).isEmpty()
    }

    @Test
    fun `une coupure servie fait taire, une fin ordinaire laisse finir`() {
        val harness = Harness()
        harness.send(opened())
        harness.send(TalkieEvent.Closed(TalkieEnded("t1", "alice", "me", "sender")))

        assertThat(harness.sink.log).containsExactly("release:t1")
        assertThat(harness.center.floor.value.active).isEmpty()
    }

    @Test
    fun `sans fin servie, la prise de parole se ferme seule passe sa duree et sa marge`() {
        val harness = Harness()
        harness.send(opened())

        harness.scope.advanceTimeBy(30_000 + TALKIE_EXPIRY_GRACE_MS - 1)
        harness.scope.runCurrent()
        assertThat(harness.center.floor.value.active).hasSize(1)

        harness.scope.advanceTimeBy(2)
        harness.scope.runCurrent()
        assertThat(harness.center.floor.value.active).isEmpty()
        assertThat(harness.sink.log).containsExactly("release:t1")
    }

    @Test
    fun `ma propre voix, depuis un autre de mes appareils, ne s'ouvre pas`() {
        val harness = Harness()
        harness.send(opened(from = "me"))

        assertThat(harness.center.floor.value.active).isEmpty()
    }
}
