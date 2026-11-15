package me.meeshy.sdk.talkie

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.TalkieCopyCandidate
import me.meeshy.sdk.model.relation.TalkieDelivery
import me.meeshy.sdk.model.relation.TalkieOpened
import me.meeshy.sdk.model.relation.TalkieStartVerdict
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.socket.AckTransport
import me.meeshy.sdk.socket.SocketAckEmitter
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** La socket du talkie émis et la copie vocale de son repli (#17150). */
@RunWith(RobolectricTestRunner::class)
class TalkieEmitAndCopyTest {

    @get:Rule
    val folder = TemporaryFolder()

    private class Wire(var connected: Boolean = true, var ack: JSONObject? = null) : TalkieSocketEmitter.Transport, AckTransport {
        val sent = mutableListOf<Pair<String, JSONObject>>()
        override val isConnected: Boolean get() = connected
        override fun emit(event: String, data: JSONObject) {
            sent += event to data
        }

        override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
            sent += event to data
            this.ack?.let { ack(arrayOf(it)) }
        }
    }

    private fun emitter(wire: Wire) = TalkieSocketEmitter(wire, SocketAckEmitter(wire))

    @Test
    fun `talkie start porte le destinataire et l'encodage, et lit l'accuse`() = runTest {
        val wire = Wire(ack = JSONObject("""{"success":true,"data":{"talkieId":"t1","delivery":"waking"}}"""))
        val verdict = emitter(wire).start("bob")
        assertThat(wire.sent.single().first).isEqualTo(SocketEventNames.TALKIE_START)
        assertThat(wire.sent.single().second.toString()).isEqualTo("""{"toUserId":"bob","codec":"aac-adts"}""")
        assertThat(verdict).isEqualTo(TalkieStartVerdict.Opened(TalkieOpened("t1", delivery = TalkieDelivery.WAKING)))
    }

    @Test
    fun `un fragment part en binaire natif avec son seq, et rien ne part hors ligne`() {
        val wire = Wire()
        val sut = emitter(wire)
        sut.sendChunk("t1", seq = 3, capturedAtMs = 42, data = byteArrayOf(1, 2))
        sut.end("t1")
        val (event, chunk) = wire.sent[0]
        assertThat(event).isEqualTo(SocketEventNames.TALKIE_SEND_CHUNK)
        assertThat(chunk.getInt("seq")).isEqualTo(3)
        assertThat(chunk.getLong("capturedAt")).isEqualTo(42)
        assertThat((chunk.get("data") as ByteArray).toList()).containsExactly(1.toByte(), 2.toByte()).inOrder()
        assertThat(wire.sent[1].first).isEqualTo(SocketEventNames.TALKIE_END)
        wire.connected = false
        sut.end("t1")
        assertThat(wire.sent).hasSize(2)
    }

    private class FakePorts(
        val candidates: List<TalkieCopyCandidate> = emptyList(),
        val direct: String? = "direct",
        val writes: Boolean = true,
        val accepts: Boolean = true,
    ) : TalkieCopyPorts {
        val enqueued = mutableListOf<Triple<String, String, String>>()
        val openedDirect = mutableListOf<String>()
        override val exhausted = MutableSharedFlow<String>(extraBufferCapacity = 4)

        override fun write(frames: List<ByteArray>, file: File): Long? = if (writes) 1_000L.also { file.writeBytes(frames.first()) } else null
        override suspend fun shared(userId: String) = candidates
        override suspend fun openDirect(userId: String): String? = direct.also { openedDirect += userId }
        override suspend fun enqueue(file: File, durationMs: Long, conversationId: String, clientMessageId: String, name: String): Boolean {
            enqueued += Triple(conversationId, clientMessageId, name)
            return accepts
        }
    }

    private fun copier(ports: FakePorts) = TalkieVoiceCopySender(ports, folder.root, newClientMessageId = { "cid_x" }, now = { 0L })

    @Test
    fun `la copie part dans la conversation partagee la plus recente, sinon dans le direct`() = runTest {
        val shared = FakePorts(candidates = listOf(TalkieCopyCandidate("g", "group", rankAtMs = 5)))
        assertThat(copier(shared).send(listOf(byteArrayOf(1)), "bob", null)).isTrue()
        assertThat(shared.enqueued.single().first).isEqualTo("g")
        assertThat(shared.enqueued.single().third).startsWith("talkie_")

        val direct = FakePorts()
        assertThat(copier(direct).send(listOf(byteArrayOf(1)), "bob", null)).isTrue()
        assertThat(direct.enqueued.single().first).isEqualTo("direct")
        assertThat(direct.openedDirect).containsExactly("bob")

        val named = FakePorts()
        copier(named).send(listOf(byteArrayOf(1)), "bob", "named")
        assertThat(named.enqueued.single().first).isEqualTo("named")
        assertThat(named.openedDirect).isEmpty()
    }

    @Test
    fun `rien a ecrire, aucune conversation ou une file qui refuse, rien ne part et le fichier est retire`() = runTest {
        assertThat(copier(FakePorts()).send(emptyList(), "bob", null)).isFalse()
        assertThat(copier(FakePorts(writes = false)).send(listOf(byteArrayOf(1)), "bob", null)).isFalse()
        assertThat(copier(FakePorts(direct = null)).send(listOf(byteArrayOf(1)), "bob", null)).isFalse()
        assertThat(copier(FakePorts(accepts = false)).send(listOf(byteArrayOf(1)), "bob", null)).isFalse()
        assertThat(folder.root.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `seul l'abandon d'une copie confiee se dit en echec`() = runTest {
        val ports = FakePorts()
        val sut = copier(ports)
        sut.send(listOf(byteArrayOf(1)), "bob", null)
        val failures = mutableListOf<Unit>()
        backgroundScope.launch { sut.failures.collect { failures += it } }
        runCurrent()
        ports.exhausted.emit("cid_other")
        ports.exhausted.emit("cid_x")
        ports.exhausted.emit("cid_x")
        runCurrent()
        assertThat(failures).hasSize(1)
    }
}
