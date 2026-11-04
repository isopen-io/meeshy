package me.meeshy.app.share

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ShareStagingSweeperTest {
    @get:Rule val folder = TemporaryFolder()
    private val day = 24L * 60 * 60 * 1000
    private val now = 100 * day

    private fun share(name: String, ageMillis: Long): File = File(folder.root, name).also { dir ->
        dir.mkdirs()
        File(dir, "0.jpg").apply { writeText("x"); setLastModified(now - ageMillis) }
        dir.setLastModified(now - ageMillis)
    }

    private fun sweeper(records: Set<String> = emptySet()) =
        ShareStagingSweeper(mediaRoot = { folder.root }, holdsPendingRecord = { it in records }, clock = { now })

    @Test
    fun `an orphan folder older than 7 days is swept`() {
        val old = share("old", 8 * day)

        assertThat(sweeper().sweep()).isEqualTo(1)
        assertThat(old.exists()).isFalse()
    }

    @Test
    fun `a folder younger than 7 days is kept`() {
        val young = share("young", 2 * day)

        assertThat(sweeper().sweep()).isEqualTo(0)
        assertThat(young.exists()).isTrue()
    }

    @Test
    fun `a folder described by a live record survives however old`() {
        val described = share("described", 30 * day)

        assertThat(sweeper(records = setOf("described")).sweep()).isEqualTo(0)
        assertThat(described.exists()).isTrue()
    }

    @Test
    fun `a folder whose newest file is recent is not abandoned`() {
        val active = share("active", 9 * day)
        File(active, "1.jpg").apply { writeText("y"); setLastModified(now - day) }

        assertThat(sweeper().sweep()).isEqualTo(0)
        assertThat(active.exists()).isTrue()
    }

    @Test
    fun `sweeping a missing root is harmless`() {
        val sweeper = ShareStagingSweeper({ File(folder.root, "absent") }, { false }, { now })

        assertThat(sweeper.sweep()).isEqualTo(0)
    }
}
