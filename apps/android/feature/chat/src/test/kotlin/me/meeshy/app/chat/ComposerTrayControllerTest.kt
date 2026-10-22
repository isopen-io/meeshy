package me.meeshy.app.chat

import android.net.Uri
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.composer.AttachmentIngesting
import me.meeshy.sdk.composer.AttachmentSourceInfo
import me.meeshy.sdk.composer.IngestedFile
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.composer.PendingAttachmentPhase
import me.meeshy.sdk.model.composer.PendingAttachmentType
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ComposerTrayControllerTest {

    private class FakeIngestor : AttachmentIngesting {
        val infos = mutableMapOf<String, AttachmentSourceInfo>()
        val failing = mutableSetOf<String>()
        val gates = mutableMapOf<String, CompletableDeferred<Unit>>()
        val deleted = mutableListOf<String>()

        override suspend fun describe(uri: Uri): AttachmentSourceInfo =
            infos[uri.toString()] ?: AttachmentSourceInfo(null, "application/octet-stream", 0L)

        override suspend fun ingest(uri: Uri, id: String, info: AttachmentSourceInfo): IngestedFile? {
            gates[uri.toString()]?.await()
            if (uri.toString() in failing) return null
            return IngestedFile("/work/${id}_${info.fileName}", info.sizeBytes)
        }

        override suspend fun ingestBytes(bytes: ByteArray, id: String, fileName: String?, mimeType: String) =
            if (bytes.isEmpty()) null else IngestedFile("/work/${id}_$fileName", bytes.size.toLong())

        override suspend fun readBytes(path: String): ByteArray? = path.toByteArray()

        override suspend fun delete(paths: Collection<String>) {
            deleted += paths
        }
    }

    private class Host(
        override val scope: CoroutineScope,
    ) : ChatControllerHost {
        val errors = mutableListOf<String?>()
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) {
            errors += message
        }
    }

    private class Rig(val tray: ComposerTrayController, val ingestor: FakeIngestor, val host: Host)

    private fun TestScope.rig(): Rig {
        val ingestor = FakeIngestor()
        val tray = ComposerTrayController(RuntimeEnvironment.getApplication(), ingestor)
        var next = 0
        tray.idFactory = { "id${next++}" }
        val host = Host(this)
        tray.attach(host)
        return Rig(tray, ingestor, host)
    }

    private fun Rig.source(uri: String, name: String, mime: String): Uri {
        ingestor.infos[uri] = AttachmentSourceInfo(name, mime, 10L)
        return Uri.parse(uri)
    }

    @Test
    fun `picking three photos adds three ready pieces and sends nothing`() = runTest {
        val r = rig()

        r.tray.stageUris(listOf(r.source("content://a", "a.jpg", "image/jpeg"), r.source("content://b", "b.jpg", "image/jpeg"), r.source("content://c", "c.jpg", "image/jpeg")))
        advanceUntilIdle()

        val items = r.tray.state.value.items
        assertThat(items.map { it.fileName }).containsExactly("a.jpg", "b.jpg", "c.jpg").inOrder()
        assertThat(items.all { it.phase == PendingAttachmentPhase.Ready }).isTrue()
        assertThat(items.all { it.type == PendingAttachmentType.IMAGE }).isTrue()
    }

    @Test
    fun `a piece is Preparing until its copy finishes`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.ingestor.gates["content://slow"] = gate

        r.tray.state.test {
            assertThat(awaitItem().items).isEmpty()
            r.tray.stageUris(listOf(r.source("content://slow", "slow.jpg", "image/jpeg")))
            assertThat(awaitItem().items.single().phase).isEqualTo(PendingAttachmentPhase.Preparing)
            gate.complete(Unit)
            assertThat(awaitItem().items.single().phase).isEqualTo(PendingAttachmentPhase.Ready)
        }
    }

    @Test
    fun `removing a piece while it prepares never brings it back`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.ingestor.gates["content://slow"] = gate
        r.tray.stageUris(listOf(r.source("content://slow", "slow.jpg", "image/jpeg")))
        advanceUntilIdle()

        r.tray.remove("id0")
        gate.complete(Unit)
        advanceUntilIdle()

        assertThat(r.tray.state.value.items).isEmpty()
        assertThat(r.ingestor.deleted).contains("/work/id0_slow.jpg")
    }

    @Test
    fun `removing a ready piece deletes its working file`() = runTest {
        val r = rig()
        r.tray.stageUris(listOf(r.source("content://a", "a.pdf", "application/pdf")))
        advanceUntilIdle()

        r.tray.remove("id0")
        advanceUntilIdle()

        assertThat(r.tray.state.value.items).isEmpty()
        assertThat(r.ingestor.deleted).containsExactly("/work/id0_a.pdf")
    }

    @Test
    fun `the 200th piece is refused with the cap message and the first 199 stay`() = runTest {
        val r = rig()
        val uris = (0 until 200).map { r.source("content://f$it", "f$it.jpg", "image/jpeg") }

        r.tray.stageUris(uris)
        advanceUntilIdle()

        assertThat(r.tray.state.value.items).hasSize(199)
        assertThat(r.tray.state.value.items.first().fileName).isEqualTo("f0.jpg")
        assertThat(r.host.errors).containsExactly("Limit of 199 media reached")
    }

    @Test
    fun `an unreadable file fails with its name and leaves no phantom piece`() = runTest {
        val r = rig()
        r.ingestor.failing += "content://bad"

        r.tray.stageUris(listOf(r.source("content://bad", "bad.pdf", "application/pdf")))
        advanceUntilIdle()

        assertThat(r.tray.state.value.items).isEmpty()
        assertThat(r.host.errors).containsExactly("Couldn't import bad.pdf")
    }

    @Test
    fun `an unreadable unnamed file falls back to the unnamed item label`() = runTest {
        val r = rig()
        r.ingestor.failing += "content://anon"

        r.tray.stageUris(listOf(Uri.parse("content://anon")))
        advanceUntilIdle()

        assertThat(r.host.errors).containsExactly("Couldn't import unnamed item")
    }

    @Test
    fun `replacing a piece keeps its position and purges the old file`() = runTest {
        val r = rig()
        r.tray.stageUris(listOf(r.source("content://a", "a.jpg", "image/jpeg"), r.source("content://b", "b.jpg", "image/jpeg")))
        advanceUntilIdle()

        r.tray.replace("id0", byteArrayOf(1, 2, 3), "a-edited.jpg", "image/jpeg")
        advanceUntilIdle()

        val items = r.tray.state.value.items
        assertThat(items.map { it.id }).containsExactly("id0", "id1").inOrder()
        assertThat(items.first().fileName).isEqualTo("a-edited.jpg")
        assertThat(items.first().localPath).contains("a-edited.jpg")
        assertThat(r.ingestor.deleted).contains("/work/id0_a.jpg")
    }

    @Test
    fun `replacing a piece that already left is ignored and its new file is discarded`() = runTest {
        val r = rig()
        r.tray.stageBytes(byteArrayOf(1), "a.jpg", "image/jpeg")
        advanceUntilIdle()
        r.tray.remove("id0")

        r.tray.replace("id0", byteArrayOf(2), "b.jpg", "image/jpeg")
        advanceUntilIdle()

        assertThat(r.tray.state.value.items).isEmpty()
    }

    @Test
    fun `taking the tray for a send hands every piece over once and empties it`() = runTest {
        val r = rig()
        r.tray.stageBytes(byteArrayOf(1), "a.jpg", "image/jpeg")
        advanceUntilIdle()

        val batch = r.tray.takeForSend()

        assertThat(batch!!.items.map { it.fileName }).containsExactly("a.jpg")
        assertThat(batch.filesToDelete).containsExactly("/work/id0_a.jpg")
        assertThat(r.tray.state.value.items).isEmpty()
        assertThat(r.tray.takeForSend()).isNull()
    }

    @Test
    fun `the tray refuses to be taken while a piece is still preparing`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.ingestor.gates["content://slow"] = gate
        r.tray.stageUris(listOf(r.source("content://slow", "slow.jpg", "image/jpeg")))
        advanceUntilIdle()

        assertThat(r.tray.takeForSend()).isNull()
        assertThat(r.tray.state.value.items).hasSize(1)
        gate.complete(Unit)
        advanceUntilIdle()
    }

    @Test
    fun `an empty byte pick stages nothing`() = runTest {
        val r = rig()

        r.tray.stageBytes(ByteArray(0), "x.jpg", "image/jpeg")
        advanceUntilIdle()

        assertThat(r.tray.state.value.items).isEmpty()
    }
}
