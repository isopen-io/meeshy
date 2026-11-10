package me.meeshy.sdk.talkie

import com.google.common.truth.Truth.assertThat
import kotlin.math.ceil
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.TalkieContract
import me.meeshy.sdk.model.relation.TalkieDelivery
import me.meeshy.sdk.model.relation.TalkieEndReason
import me.meeshy.sdk.model.relation.TalkieEnded
import me.meeshy.sdk.model.relation.TalkieLatencyStep
import me.meeshy.sdk.model.relation.TalkieOpened
import me.meeshy.sdk.model.relation.TalkieSendOutcome
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.sdk.model.relation.TalkieStartVerdict
import org.junit.Test

/**
 * Émettre le talkie depuis Android (#17150, iso `TalkieSenderTests.swift`) : ce qui est capté avant l'accusé part après,
 * dans l'ordre ; relâcher vide le reste puis ferme ; un refus arrête le micro sans `talkie:end` et se dit sans fuite ; la
 * durée maximale et une fin servie pour MA prise de parole arrêtent tout ; une voix réveillée que personne n'a rejointe
 * part en copie vocale.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TalkieSenderTest {

    private companion object {
        const val FRAME_MS = 1_024.0 * 1_000.0 / 48_000
        val FRAMES_PER_FRAGMENT = ceil(TalkieContract.FRAGMENT_DURATION_MS / FRAME_MS).toInt()
        val TALKIE = "a".repeat(24)
        val OPENED = TalkieOpened(TALKIE, 30_000, 16_384)
        val WAKING = OPENED.copy(delivery = TalkieDelivery.WAKING)
    }

    private data class Chunk(val talkieId: String, val seq: Int, val bytes: Int)

    private class FakeEmitter : TalkieEmitting {
        override var isConnected = true
        val startCalls = mutableListOf<String>()
        val chunks = mutableListOf<Chunk>()
        val ends = mutableListOf<String>()
        private var pending = CompletableDeferred<TalkieStartVerdict>()

        override suspend fun start(toUserId: String): TalkieStartVerdict {
            startCalls += toUserId
            return pending.await()
        }

        fun resolve(verdict: TalkieStartVerdict) {
            pending.complete(verdict)
            pending = CompletableDeferred()
        }

        override fun sendChunk(talkieId: String, seq: Int, capturedAtMs: Long, data: ByteArray) {
            chunks += Chunk(talkieId, seq, data.size)
        }

        override fun end(talkieId: String) {
            ends += talkieId
        }
    }

    private class FakeCapture : TalkieCapturing {
        var allow = true
        var stops = 0
        var onStart: () -> Unit = {}
        var holdStop: CompletableDeferred<Unit>? = null
        private var onFrame: ((ByteArray, Double) -> Unit)? = null

        override suspend fun start(onFrame: (ByteArray, Double) -> Unit): Boolean {
            onStart()
            if (!allow) return false
            this.onFrame = onFrame
            return true
        }

        override suspend fun stop() {
            stops += 1
            holdStop?.await()
        }

        fun speak(frames: Int, bytes: Int = 10) = repeat(frames) { onFrame?.invoke(ByteArray(bytes), FRAME_MS) }
    }

    private class FakeCopier : TalkieVoiceCopying {
        val sent = mutableListOf<Pair<List<ByteArray>, String>>()
        val conversations = mutableListOf<String?>()
        var succeeds = true

        override suspend fun send(frames: List<ByteArray>, toUserId: String, conversationId: String?): Boolean {
            sent += frames to toUserId
            conversations += conversationId
            return succeeds
        }
    }

    private class Rig(
        val sut: TalkieSender,
        val emitter: FakeEmitter,
        val capture: FakeCapture,
        val copier: FakeCopier,
        val ended: MutableSharedFlow<TalkieEnded>,
        val delays: MutableList<Long>,
        val deadline: Array<(() -> Unit)?>,
        val clock: LongArray,
    )

    private fun TestScope.rig(): Rig {
        val emitter = FakeEmitter()
        val capture = FakeCapture()
        val copier = FakeCopier()
        val ended = MutableSharedFlow<TalkieEnded>(extraBufferCapacity = 8)
        val delays = mutableListOf<Long>()
        val deadline = arrayOf<(() -> Unit)?>(null)
        val clock = longArrayOf(1_800_000_000_000)
        val sut = TalkieSender(
            emitter = emitter,
            capture = capture,
            copier = copier,
            endedEvents = ended,
            scope = backgroundScope,
            now = { clock[0] },
            schedule = { delay, run ->
                delays += delay
                deadline[0] = run
                ({ })
            },
        )
        runCurrent()
        return Rig(sut, emitter, capture, copier, ended, delays, deadline, clock)
    }

    private val Rig.copiedBytes: Int? get() = copier.sent.firstOrNull()?.first?.sumOf { it.size }

    private fun TestScope.wakingTalk(rig: Rig) {
        rig.sut.press("bob")
        runCurrent()
        rig.emitter.resolve(TalkieStartVerdict.Opened(WAKING))
        runCurrent()
    }

    @Test
    fun `ce qui est capte avant l'accuse part apres, dans l'ordre, puis relacher ferme`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Starting("bob"))
        val fragmentBytes = FRAMES_PER_FRAGMENT * 10
        rig.capture.speak(FRAMES_PER_FRAGMENT)
        assertThat(rig.emitter.chunks).isEmpty()

        rig.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Talking("bob", TALKIE))
        assertThat(rig.emitter.chunks).containsExactly(Chunk(TALKIE, 0, fragmentBytes))
        assertThat(rig.delays).containsExactly(30_000L)

        rig.capture.speak(FRAMES_PER_FRAGMENT * 2 + 1)
        rig.sut.release()

        assertThat(rig.emitter.chunks.map { it.seq }).containsExactly(0, 1, 2, 3).inOrder()
        assertThat(rig.emitter.chunks.map { it.bytes }).containsExactly(fragmentBytes, fragmentBytes, fragmentBytes, 10).inOrder()
        assertThat(rig.emitter.ends).containsExactly(TALKIE)
        assertThat(rig.capture.stops).isEqualTo(1)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
        assertThat(rig.sut.notice.value).isNull()
    }

    @Test
    fun `talkie start part avant que le micro ne s'ouvre`() = runTest {
        val rig = rig()
        val seen = mutableListOf<Int>()
        rig.capture.onStart = { seen += rig.emitter.startCalls.size }
        rig.sut.press("bob")
        runCurrent()
        assertThat(seen).containsExactly(1)
    }

    @Test
    fun `les temps se mesurent depuis l'appui jusqu'au premier fragment parti`() = runTest {
        val rig = rig()
        val pressedAt = rig.clock[0]
        rig.sut.press("bob")
        rig.clock[0] = pressedAt + 200
        runCurrent()
        rig.clock[0] = pressedAt + 350
        rig.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        assertThat(rig.sut.lastLatency).isNull()
        rig.clock[0] = pressedAt + 500
        rig.capture.speak(FRAMES_PER_FRAGMENT)
        val marks = rig.sut.lastLatency!!.marks
        assertThat(marks[TalkieLatencyStep.MIC_READY]).isEqualTo(200)
        assertThat(marks[TalkieLatencyStep.OPENED]).isEqualTo(350)
        assertThat(marks[TalkieLatencyStep.FIRST_CHUNK]).isEqualTo(500)
    }

    @Test
    fun `relacher avant l'accuse envoie toute la parole une fois ouverte, puis ferme`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        rig.capture.speak(3)
        rig.sut.release()
        assertThat(rig.emitter.ends).isEmpty()
        rig.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        assertThat(rig.emitter.chunks).containsExactly(Chunk(TALKIE, 0, 30))
        assertThat(rig.emitter.ends).containsExactly(TALKIE)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `un repli continue d'enregistrer et la voix part en copie vocale au relachement`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        rig.capture.speak(FRAMES_PER_FRAGMENT * 2)
        rig.emitter.resolve(TalkieStartVerdict.Refused(TalkieSendOutcome.VOICE))
        runCurrent()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.RecordingCopy("bob"))
        assertThat(rig.sut.notice.value).isNull()
        assertThat(rig.capture.stops).isEqualTo(0)
        assertThat(rig.delays).containsExactly(TalkieContract.MAX_DURATION_MS)

        rig.capture.speak(3)
        rig.sut.release()
        assertThat(rig.copier.sent.map { it.second }).containsExactly("bob")
        assertThat(rig.copiedBytes).isEqualTo((FRAMES_PER_FRAGMENT * 2 + 3) * 10)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
        assertThat(rig.emitter.chunks).isEmpty()
        assertThat(rig.emitter.ends).isEmpty()
        assertThat(rig.capture.stops).isEqualTo(1)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `un repli apres relachement envoie aussitot ce qui a ete capte`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        rig.capture.speak(3)
        rig.sut.release()
        rig.emitter.resolve(TalkieStartVerdict.Refused(TalkieSendOutcome.VOICE))
        runCurrent()
        assertThat(rig.copiedBytes).isEqualTo(30)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `la copie vocale se ferme seule a la duree maximale, et une copie qui ne part pas est un echec`() = runTest {
        val rig = rig()
        rig.copier.succeeds = false
        rig.sut.press("bob")
        runCurrent()
        rig.capture.speak(3)
        rig.emitter.resolve(TalkieStartVerdict.Refused(TalkieSendOutcome.VOICE))
        runCurrent()
        rig.deadline[0]!!.invoke()
        runCurrent()
        assertThat(rig.copier.sent).hasSize(1)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.FAILED)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `un repli dont le micro est refuse dit le micro et ne copie rien`() = runTest {
        val rig = rig()
        rig.capture.allow = false
        rig.sut.press("bob")
        runCurrent()
        rig.emitter.resolve(TalkieStartVerdict.Refused(TalkieSendOutcome.VOICE))
        runCurrent()
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.MIC_DENIED)
        assertThat(rig.copier.sent).isEmpty()
    }

    @Test
    fun `un repli qui nomme sa conversation y envoie la copie`() = runTest {
        val rig = rig()
        val conversation = "c".repeat(24)
        rig.sut.press("bob")
        runCurrent()
        rig.capture.speak(3)
        rig.emitter.resolve(TalkieStartVerdict.VoiceInto(conversation))
        runCurrent()
        rig.sut.release()
        assertThat(rig.copier.conversations).containsExactly(conversation)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
    }

    @Test
    fun `un reveil se dit pendant la parole et s'efface a la fin, le direct ne reveille pas`() = runTest {
        val rig = rig()
        wakingTalk(rig)
        assertThat(rig.sut.waking.value).isTrue()
        rig.sut.release()
        assertThat(rig.sut.waking.value).isFalse()

        val live = rig()
        live.sut.press("bob")
        runCurrent()
        live.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        assertThat(live.sut.waking.value).isFalse()
    }

    @Test
    fun `une voix reveillee que personne n'a rejointe part en copie vocale`() = runTest {
        val rig = rig()
        wakingTalk(rig)
        rig.capture.speak(FRAMES_PER_FRAGMENT * 2)
        rig.sut.release()
        assertThat(rig.copier.sent).isEmpty()

        rig.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = false)
        assertThat(rig.copier.sent.map { it.second }).containsExactly("bob")
        assertThat(rig.copiedBytes).isEqualTo(rig.emitter.chunks.sumOf { it.bytes })
        assertThat(rig.copier.conversations).containsExactly(null)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
    }

    @Test
    fun `une voix reveillee rejointe, ou une voix en direct, n'est jamais copiee`() = runTest {
        val joined = rig()
        wakingTalk(joined)
        joined.capture.speak(FRAMES_PER_FRAGMENT * 2)
        joined.sut.release()
        joined.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = true)
        joined.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = false)
        assertThat(joined.copier.sent).isEmpty()

        val live = rig()
        live.sut.press("bob")
        runCurrent()
        live.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        live.capture.speak(FRAMES_PER_FRAGMENT)
        live.sut.release()
        live.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = false)
        assertThat(live.copier.sent).isEmpty()
    }

    @Test
    fun `un refus not allowed se dit, pour que la ligne se retire`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        rig.emitter.resolve(TalkieStartVerdict.Refused(TalkieSendOutcome.NOT_ALLOWED))
        runCurrent()
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.NOT_ALLOWED)
    }

    @Test
    fun `une fin servie pour une autre parole n'arrete rien, la mienne arrete sans talkie end`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        rig.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        rig.ended.emit(TalkieEnded("b".repeat(24), "me", "bob", reason = "cut"))
        runCurrent()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Talking("bob", TALKIE))

        rig.ended.emit(TalkieEnded(TALKIE, "me", "bob", reason = "limit"))
        runCurrent()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.LIMIT)
        assertThat(rig.emitter.ends).isEmpty()
        assertThat(rig.capture.stops).isEqualTo(1)
    }

    @Test
    fun `la duree maximale servie ferme la parole d'elle-meme`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        rig.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        rig.deadline[0]!!.invoke()
        runCurrent()
        assertThat(rig.emitter.ends).containsExactly(TALKIE)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.LIMIT)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `un micro refuse ferme la parole ouverte et le dit`() = runTest {
        val rig = rig()
        rig.capture.allow = false
        rig.sut.press("bob")
        runCurrent()
        rig.emitter.resolve(TalkieStartVerdict.Opened(OPENED))
        runCurrent()
        assertThat(rig.emitter.ends).containsExactly(TALKIE)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.MIC_DENIED)
        assertThat(rig.capture.stops).isEqualTo(0)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `hors ligne, l'appui le dit sans rien ouvrir, et un second appui n'ouvre rien de plus`() = runTest {
        val offline = rig()
        offline.emitter.isConnected = false
        offline.sut.press("bob")
        runCurrent()
        assertThat(offline.sut.notice.value).isEqualTo(TalkieSendOutcome.OFFLINE)
        assertThat(offline.emitter.startCalls).isEmpty()
        assertThat(offline.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)

        val twice = rig()
        twice.sut.press("bob")
        twice.sut.press("bob")
        runCurrent()
        assertThat(twice.emitter.startCalls).containsExactly("bob")
    }

    @Test
    fun `un verdict personne n'a rejoint arrive pendant l'arret du micro attend la voix, sans doublon`() = runTest {
        val rig = rig()
        wakingTalk(rig)
        rig.capture.speak(FRAMES_PER_FRAGMENT * 2)
        val hold = CompletableDeferred<Unit>()
        rig.capture.holdStop = hold
        val releasing = backgroundScope.launch { rig.sut.release() }
        runCurrent()
        rig.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = false)
        rig.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = false)
        hold.complete(Unit)
        releasing.join()
        runCurrent()
        assertThat(rig.copier.sent.map { it.second }).containsExactly("bob")
        rig.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = false)
        assertThat(rig.copier.sent).hasSize(1)
        assertThat(rig.copiedBytes).isEqualTo(rig.emitter.chunks.sumOf { it.bytes })
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
    }

    @Test
    fun `un verdict precoce rejoint ne copie rien`() = runTest {
        val rig = rig()
        wakingTalk(rig)
        rig.capture.speak(FRAMES_PER_FRAGMENT * 2)
        val hold = CompletableDeferred<Unit>()
        rig.capture.holdStop = hold
        val releasing = backgroundScope.launch { rig.sut.release() }
        runCurrent()
        rig.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = true)
        hold.complete(Unit)
        releasing.join()
        rig.sut.ended(TALKIE, TalkieEndReason.SENDER, joined = false)
        assertThat(rig.copier.sent).isEmpty()
    }

    @Test
    fun `une voix reveillee fermee par la passerelle copie aussi la fin non partie`() = runTest {
        val rig = rig()
        wakingTalk(rig)
        val frames = FRAMES_PER_FRAGMENT * 2 + 3
        rig.capture.speak(frames)
        rig.sut.ended(TALKIE, TalkieEndReason.LIMIT, joined = false)
        assertThat(rig.copiedBytes).isEqualTo(frames * 10)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
    }
}
