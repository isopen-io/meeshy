package me.meeshy.sdk.share

import androidx.work.NetworkType
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.share.SharePendingShare
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class SharePendingSendWorkerTest {

    @get:Rule val tmp = TemporaryFolder()

    @Test
    fun `the resume waits for the network and runs expedited`() {
        val spec = SharePendingSendWorker.buildRequest().workSpec

        assertThat(spec.constraints.requiredNetworkType).isEqualTo(NetworkType.CONNECTED)
        assertThat(spec.expedited).isTrue()
    }

    @Test
    fun `a share older than seven days is swept with its copies and never resumed`() = runTest {
        var now = 1_000L
        val store = SharePendingShareStore(File(tmp.root, "root"), clock = { now })
        store.commit(SharePendingShare.make("old", now, "u1", "hi", emptyList(), listOf("c1")))
        File(store.mediaDirectory("old"), "a.jpg").apply { parentFile!!.mkdirs(); writeText("x") }
        assertThat(store.pending("u1")).hasSize(1)

        now += SharePendingShare.EXPIRY_MILLIS

        assertThat(store.pending("u1")).isEmpty()
        assertThat(store.mediaDirectory("old").exists()).isFalse()
    }

    @Test
    fun `a share of another account is never resumed under this one`() = runTest {
        val store = SharePendingShareStore(File(tmp.root, "root"), clock = { 1_000L })
        store.commit(SharePendingShare.make("s1", 1_000L, "u1", "hi", emptyList(), listOf("c1")))

        assertThat(store.pending("u2")).isEmpty()
        assertThat(store.pending("u1")).hasSize(1)
    }
}
