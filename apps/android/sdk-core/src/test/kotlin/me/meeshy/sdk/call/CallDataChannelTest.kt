package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.webrtc.DataChannel
import java.nio.ByteBuffer

@OptIn(ExperimentalCoroutinesApi::class)
class CallDataChannelTest {

    private class Rig(scope: TestScope, initial: DataChannel.State = DataChannel.State.CONNECTING) {
        var state = initial
        val observer = slot<DataChannel.Observer>()
        val channel: DataChannel = mockk(relaxed = true) {
            every { state() } answers { state }
            every { label() } returns "transcription"
            every { registerObserver(capture(observer)) } returns Unit
            every { send(any()) } returns true
        }
        val received = mutableListOf<ByteArray>()
        val wrapper = CallDataChannel(channel, scope, { received += it }, pingIntervalMillis = 1_000)

        fun open() {
            state = DataChannel.State.OPEN
            observer.captured.onStateChange()
        }
    }

    @Test
    fun `un message recu est remis en octets`() = runTest {
        val rig = Rig(this)

        rig.observer.captured.onMessage(DataChannel.Buffer(ByteBuffer.wrap("salut".encodeToByteArray()), false))

        assertThat(rig.received.single().decodeToString()).isEqualTo("salut")
        rig.wrapper.close()
    }

    @Test
    fun `envoyer avant l'ouverture est refuse`() = runTest {
        val rig = Rig(this)

        assertThat(rig.wrapper.send(byteArrayOf(1))).isFalse()
        verify(exactly = 0) { rig.channel.send(any()) }
        rig.wrapper.close()
    }

    @Test
    fun `ouvert, le canal emet un ping a chaque intervalle`() = runTest {
        val rig = Rig(this)
        rig.open()

        advanceTimeBy(3_500)

        verify(exactly = 3) { rig.channel.send(any()) }
        rig.wrapper.close()
    }

    @Test
    fun `fermer arrete le ping`() = runTest {
        val rig = Rig(this)
        rig.open()
        rig.wrapper.close()

        advanceTimeBy(5_000)

        verify(exactly = 0) { rig.channel.send(any()) }
    }
}
