package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UploadQueueProgressTest {
    @Test
    fun `a queue with nothing measured yet is indeterminate`() {
        val progress = UploadQueueProgress.of(listOf(UploadFileState.Queued))

        assertThat(progress.fraction).isNull()
        assertThat(progress.pending).isEqualTo(1)
    }

    @Test
    fun `sent over announced octets, resuming files counted from their accepted offset`() {
        val progress = UploadQueueProgress.of(
            listOf(UploadFileState.Uploading(10, 40), UploadFileState.Resuming(30, 60), UploadFileState.Queued),
        )

        assertThat(progress.sent).isEqualTo(40)
        assertThat(progress.total).isEqualTo(100)
        assertThat(progress.fraction).isEqualTo(0.4f)
        assertThat(progress.pending).isEqualTo(3)
    }

    @Test
    fun `a failed file is not pending but is counted`() {
        val progress = UploadQueueProgress.of(listOf(UploadFileState.Failed(retryable = true)))

        assertThat(progress.failed).isEqualTo(1)
        assertThat(progress.pending).isEqualTo(0)
    }
}
