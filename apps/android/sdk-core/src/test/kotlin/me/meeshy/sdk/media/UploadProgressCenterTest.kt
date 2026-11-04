package me.meeshy.sdk.media

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.media.UploadFileState
import org.junit.Test

class UploadProgressCenterTest {
    @Test
    fun `a file goes queued, uploading, resuming, failed then leaves the map when done`() = runTest {
        val center = UploadProgressCenter()

        center.files.test {
            assertThat(awaitItem()).isEmpty()
            center.queued("a"); assertThat(awaitItem()["a"]).isEqualTo(UploadFileState.Queued)
            center.uploading("a", 5, 10); assertThat(awaitItem()["a"]).isEqualTo(UploadFileState.Uploading(5, 10))
            center.resuming("a", 5, 10); assertThat(awaitItem()["a"]).isEqualTo(UploadFileState.Resuming(5, 10))
            center.failed("a", retryable = true); assertThat(awaitItem()["a"]).isEqualTo(UploadFileState.Failed(true))
            center.done("a"); assertThat(awaitItem()).isEmpty()
        }
    }

    @Test
    fun `the queue aggregates every file and is indeterminate until a total is known`() = runTest {
        val center = UploadProgressCenter()
        center.queued("a")
        assertThat(center.queue.value.fraction).isNull()

        center.uploading("a", 10, 40)
        center.uploading("b", 10, 60)

        assertThat(center.queue.value.fraction).isEqualTo(0.2f)
        assertThat(center.queue.value.pending).isEqualTo(2)
    }
}

class UploadProgressCenterBarTest {
    @Test
    fun `la barre compte les fichiers termines tant qu'un autre monte, puis se vide`() {
        val center = UploadProgressCenter()
        center.announce("a", "a.jpg", 100)
        center.announce("b", "b.mp4", 300)
        center.uploading("a", 100, 100)
        center.done("a")
        center.uploading("b", 150, 300)

        val bar = center.bar.value
        assertThat(bar.totalFiles).isEqualTo(2)
        assertThat(bar.completedFiles).isEqualTo(1)
        assertThat(bar.currentFileName).isEqualTo("b.mp4")
        assertThat(bar.percentage).isEqualTo(62)

        center.done("b")

        assertThat(center.bar.value.files).isEmpty()
    }

    @Test
    fun `un fichier annonce pese dans le total avant meme de monter`() {
        val center = UploadProgressCenter()
        center.announce("a", "a.jpg", 100)
        center.announce("b", "b.mp4", 300)
        center.uploading("a", 100, 100)

        assertThat(center.bar.value.percentage).isEqualTo(25)
    }
}
