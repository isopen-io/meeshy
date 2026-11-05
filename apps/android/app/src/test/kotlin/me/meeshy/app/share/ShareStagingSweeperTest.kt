package me.meeshy.app.share

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ShareStagingSweeperTest {
    @get:Rule val folder = TemporaryFolder()

    private val directory get() = File(folder.root, "media-intake").apply { mkdirs() }

    private fun copy(shareId: String, index: Int, bytes: Int = 1, ext: String = "jpg"): File =
        File(directory, ShareStagingNames.fileName(shareId, index, ext)).apply { writeBytes(ByteArray(bytes)) }

    private fun sweeper(live: Set<String> = emptySet()) = ShareStagingSweeper({ directory }, { it in live })

    @Test
    fun `a copy name gives back the share it belongs to, even when the id carries hyphens`() {
        val name = ShareStagingNames.fileName("cid_1b2c-3d4e", 12, "mp4")

        assertThat(name).isEqualTo("share-cid_1b2c-3d4e-12.mp4")
        assertThat(ShareStagingNames.shareIdOf(name)).isEqualTo("cid_1b2c-3d4e")
    }

    @Test
    fun `a name the sender could steer never leaves the staging directory`() {
        assertThat(ShareStagingNames.fileName("../../files/x", 0, "jpg")).isEqualTo("share-______files_x-0.jpg")
    }

    @Test
    fun `a composer copy that is not a share copy is never claimed`() {
        assertThat(ShareStagingNames.shareIdOf("0b7d7d1e-1d2f-4a33-9a0e-7a0f1c7e6b11")).isNull()
    }

    @Test
    fun `a relaunch sweeps the copies of every share that is no longer open`() {
        val abandoned = copy("cid_old", 0)
        val open = copy("cid_live", 0)

        assertThat(sweeper(live = setOf("cid_live")).sweep()).isEqualTo(1)

        assertThat(abandoned.exists()).isFalse()
        assertThat(open.exists()).isTrue()
    }

    @Test
    fun `the sweep leaves the composer's own copies alone`() {
        val composer = File(directory, "0b7d7d1e-1d2f-4a33-9a0e-7a0f1c7e6b11").apply { writeText("x") }

        sweeper().sweep()

        assertThat(composer.exists()).isTrue()
    }

    @Test
    fun `the bytes held by the other open shares count against the global ceiling`() {
        copy("cid_a", 0, bytes = 10)
        copy("cid_a", 1, bytes = 5)
        copy("cid_b", 0, bytes = 7)
        copy("cid_gone", 0, bytes = 1000)

        val held = sweeper(live = setOf("cid_a", "cid_b", "cid_me")).bytesHeldByOthers("cid_me")

        assertThat(held).isEqualTo(22L)
    }

    @Test
    fun `discarding a share deletes all its copies and only its copies`() {
        val mine = listOf(copy("cid_me", 0), copy("cid_me", 1))
        val other = copy("cid_other", 0)

        assertThat(sweeper().discard("cid_me")).isEqualTo(2)

        assertThat(mine.none { it.exists() }).isTrue()
        assertThat(other.exists()).isTrue()
    }

    @Test
    fun `sweeping a missing directory is harmless`() {
        assertThat(ShareStagingSweeper({ File(folder.root, "absent") }, { false }).sweep()).isEqualTo(0)
    }
}
