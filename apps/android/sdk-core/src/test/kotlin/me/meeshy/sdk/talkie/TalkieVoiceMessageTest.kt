package me.meeshy.sdk.talkie

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.TalkieEnded
import me.meeshy.sdk.model.relation.TalkieHoldDelivery
import me.meeshy.sdk.model.relation.TalkieSendOutcome
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.sdk.model.relation.TalkieStartVerdict
import org.junit.Test

/**
 * Le talkie vers un téléphone injoignable depuis plusieurs minutes (#20241, iso `TalkieUnreachableTests.swift`) : aucun
 * `talkie:start`, le micro s'ouvre, la voix s'enregistre tant que le doigt tient et part en message vocal dans le DIRECT ;
 * un simple toucher n'envoie rien et ne dit rien ; un micro refusé se dit.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TalkieVoiceMessageTest {

    private class Emitter : TalkieEmitting {
        override var isConnected = true
        val starts = mutableListOf<String>()
        override suspend fun start(toUserId: String): TalkieStartVerdict {
            starts += toUserId
            return TalkieStartVerdict.Refused(TalkieSendOutcome.FAILED)
        }
        override fun sendChunk(talkieId: String, seq: Int, capturedAtMs: Long, data: ByteArray) = Unit
        override fun end(talkieId: String) = Unit
    }

    private class Capture : TalkieCapturing {
        var allow = true
        var stops = 0
        private var onFrame: ((ByteArray, Double) -> Unit)? = null
        override suspend fun start(onFrame: (ByteArray, Double) -> Unit): Boolean {
            if (!allow) return false
            this.onFrame = onFrame
            return true
        }
        override suspend fun stop() {
            stops += 1
        }
        fun speak(frames: Int) = repeat(frames) { onFrame?.invoke(ByteArray(10), 21.3) }
    }

    private class Copier : TalkieVoiceCopying {
        val direct = mutableListOf<Pair<Int, String>>()
        val fallback = mutableListOf<String>()
        override suspend fun send(frames: List<ByteArray>, toUserId: String, conversationId: String?): Boolean {
            fallback += toUserId
            return true
        }
        override suspend fun sendDirect(frames: List<ByteArray>, toUserId: String): Boolean {
            direct += frames.sumOf { it.size } to toUserId
            return true
        }
    }

    private class Rig(val sut: TalkieSender, val emitter: Emitter, val capture: Capture, val copier: Copier)

    private fun TestScope.rig(): Rig {
        val emitter = Emitter()
        val capture = Capture()
        val copier = Copier()
        val sut = TalkieSender(
            emitter = emitter,
            capture = capture,
            copier = copier,
            endedEvents = MutableSharedFlow<TalkieEnded>(),
            scope = backgroundScope,
            now = { 1_800_000_000_000 },
            schedule = { _, _ -> ({ }) },
        )
        runCurrent()
        return Rig(sut, emitter, capture, copier)
    }

    @Test
    fun `maintenir enregistre sans talkie start puis depose un message vocal dans le direct`() = runTest {
        val rig = rig()
        rig.sut.press("bob", TalkieHoldDelivery.VOICE_MESSAGE)
        runCurrent()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.RecordingCopy("bob"))
        rig.capture.speak(frames = 5)
        rig.sut.release()
        runCurrent()
        assertThat(rig.emitter.starts).isEmpty()
        assertThat(rig.copier.direct).containsExactly(50 to "bob")
        assertThat(rig.copier.fallback).isEmpty()
        assertThat(rig.capture.stops).isEqualTo(1)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `le message vocal part meme hors ligne, la file d'envoi le portera`() = runTest {
        val rig = rig()
        rig.emitter.isConnected = false
        rig.sut.press("bob", TalkieHoldDelivery.VOICE_MESSAGE)
        runCurrent()
        rig.capture.speak(frames = 2)
        rig.sut.release()
        runCurrent()
        assertThat(rig.copier.direct).hasSize(1)
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.VOICE)
    }

    @Test
    fun `un simple toucher sans trame n'envoie rien et ne dit rien`() = runTest {
        val rig = rig()
        rig.sut.press("bob", TalkieHoldDelivery.VOICE_MESSAGE)
        runCurrent()
        rig.sut.release()
        runCurrent()
        assertThat(rig.copier.direct).isEmpty()
        assertThat(rig.sut.notice.value).isNull()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `un micro refuse se dit et rien ne part`() = runTest {
        val rig = rig()
        rig.capture.allow = false
        rig.sut.press("bob", TalkieHoldDelivery.VOICE_MESSAGE)
        runCurrent()
        assertThat(rig.sut.notice.value).isEqualTo(TalkieSendOutcome.MIC_DENIED)
        assertThat(rig.copier.direct).isEmpty()
        assertThat(rig.emitter.starts).isEmpty()
        assertThat(rig.sut.phase.value).isEqualTo(TalkieSendPhase.Idle)
    }

    @Test
    fun `sans etat servi le geste reste le talkie en direct`() = runTest {
        val rig = rig()
        rig.sut.press("bob")
        runCurrent()
        assertThat(rig.emitter.starts).containsExactly("bob")
    }
}
