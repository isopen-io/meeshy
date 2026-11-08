package me.meeshy.sdk.share

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.share.SharePendingShare
import me.meeshy.sdk.model.share.SharePendingShareCodec
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class SharePendingShareStoreTest {

    @get:Rule val tmp = TemporaryFolder()

    private val week = SharePendingShare.EXPIRY_MILLIS

    private fun store(now: () -> Long = { 1_000L }) = SharePendingShareStore(File(tmp.root, "root"), now)

    private fun share(id: String = "s1", owner: String? = "u1", createdAt: Long = 1_000L) =
        SharePendingShare.make(id, createdAt, owner, "hi", emptyList(), listOf("c1", "c2"))

    @Test
    fun `a committed share survives the death of the process`() = runTest {
        store().commit(share())
        val reborn = store().pending("u1")
        assertThat(reborn.map { it.clientMessageId }).containsExactly("s1")
    }

    @Test
    fun `a transition rewrites the share, a half served share stays`() = runTest {
        val s = store()
        s.commit(share())
        s.commit(share().markSent("c1", "m1"))
        val read = s.load("s1", "u1")!!
        assertThat(read.remainingTargets.map { it.conversationId }).containsExactly("c2")
    }

    @Test
    fun `the share and its copies are deleted only when every target is served`() = runTest {
        val s = store()
        s.commit(share())
        File(s.mediaDirectory("s1"), "a.jpg").apply { parentFile!!.mkdirs(); writeText("x") }
        s.commit(share().markSent("c1", "m1"))
        assertThat(s.mediaDirectory("s1").exists()).isTrue()
        s.commit(share().markSent("c1", "m1").markSent("c2", "m2"))
        assertThat(s.pending("u1")).isEmpty()
        assertThat(s.mediaDirectory("s1").exists()).isFalse()
    }

    @Test
    fun `a share is served to its depositor only, a relay share to anyone`() = runTest {
        val s = store()
        s.commit(share("mine", owner = "u1"))
        s.commit(share("relay", owner = null))
        assertThat(s.pending("u1").map { it.clientMessageId }).containsExactly("mine", "relay")
        assertThat(s.pending("u2").map { it.clientMessageId }).containsExactly("relay")
    }

    @Test
    fun `a share older than seven days is swept with its copies`() = runTest {
        var now = 1_000L
        val s = store { now }
        s.commit(share())
        File(s.mediaDirectory("s1"), "a.jpg").apply { parentFile!!.mkdirs(); writeText("x") }
        now = 1_000L + week
        assertThat(s.pending("u1")).isEmpty()
        assertThat(s.mediaDirectory("s1").exists()).isFalse()
    }

    @Test
    fun `a corrupt share is quarantined, not deleted and not served`() = runTest {
        val s = store()
        s.commit(share("ok"))
        val pendingDir = File(tmp.root, "root/pending")
        File(pendingDir, "bad.json").writeText("{truncated")
        assertThat(s.pending("u1").map { it.clientMessageId }).containsExactly("ok")
        assertThat(File(pendingDir, "bad.json").exists()).isFalse()
        assertThat(File(tmp.root, "root/quarantine").listFiles()!!.single().readText()).isEqualTo("{truncated")
    }

    @Test
    fun `a share of an unknown schema is ignored without being deleted`() = runTest {
        val s = store()
        val pendingDir = File(tmp.root, "root/pending").apply { mkdirs() }
        val future = File(pendingDir, "f.json").apply {
            writeText("""{"v":99,"clientMessageId":"f","createdAt":1,"targets":[]}""")
        }
        assertThat(s.pending("u1")).isEmpty()
        assertThat(future.exists()).isTrue()
    }

    @Test
    fun `an interrupted write leaves the previous share intact`() = runTest {
        val s = store()
        s.commit(share())
        val file = File(tmp.root, "root/pending/s1.json")
        android.util.AtomicFile(file).startWrite().write("{half".toByteArray())
        assertThat(s.load("s1", "u1")).isNotNull()
    }

    @Test
    fun `clear wipes shares, copies and quarantine`() = runTest {
        val s = store()
        s.commit(share())
        File(s.mediaDirectory("s1"), "a.jpg").apply { parentFile!!.mkdirs(); writeText("x") }
        File(tmp.root, "root/pending/bad.json").writeText("{")
        s.pending("u1")
        s.clear()
        assertThat(File(tmp.root, "root").exists()).isFalse()
        assertThat(s.pending("u1")).isEmpty()
        s.clear()
    }

    @Test
    fun `the file written is the codec form`() = runTest {
        store().commit(share())
        val text = File(tmp.root, "root/pending/s1.json").readText()
        assertThat(SharePendingShareCodec.decode(text)).isInstanceOf(SharePendingShareCodec.Decoded.Readable::class.java)
    }
}
