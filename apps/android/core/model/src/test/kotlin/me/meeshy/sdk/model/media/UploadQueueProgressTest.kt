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

class UploadBarProgressTest {
    private fun file(name: String, sent: Long, total: Long, status: UploadBarStatus) = UploadBarFile(name, sent, total, status)

    @Test
    fun `le pourcentage compte tous les octets annonces, les fichiers termines pour leur poids entier`() {
        val progress = UploadBarProgress(
            listOf(
                file("a.jpg", 100, 100, UploadBarStatus.COMPLETED),
                file("b.mp4", 50, 200, UploadBarStatus.UPLOADING),
                file("c.pdf", 0, 100, UploadBarStatus.QUEUED),
            ),
        )

        assertThat(progress.percentage).isEqualTo(37)
        assertThat(progress.uploadedBytes).isEqualTo(150)
        assertThat(progress.totalBytes).isEqualTo(400)
    }

    @Test
    fun `le fichier courant est le premier qui monte`() {
        val progress = UploadBarProgress(
            listOf(file("a.jpg", 100, 100, UploadBarStatus.COMPLETED), file("b.mp4", 1, 2, UploadBarStatus.UPLOADING), file("c.pdf", 1, 2, UploadBarStatus.UPLOADING)),
        )

        assertThat(progress.currentFileName).isEqualTo("b.mp4")
        assertThat(progress.completedFiles).isEqualTo(1)
        assertThat(progress.totalFiles).isEqualTo(3)
    }

    @Test
    fun `rien ne monte, aucun nom`() {
        assertThat(UploadBarProgress(listOf(file("a", 0, 10, UploadBarStatus.QUEUED))).currentFileName).isNull()
        assertThat(UploadBarProgress(emptyList()).isVisible).isFalse()
        assertThat(UploadBarProgress(emptyList()).percentage).isEqualTo(0)
    }

    @Test
    fun `tout termine fait cent pour cent, des octets sans total retombent sur les fichiers`() {
        val done = UploadBarProgress(listOf(file("a", 10, 10, UploadBarStatus.COMPLETED)))
        val unknown = UploadBarProgress(
            listOf(file("a", 0, 0, UploadBarStatus.COMPLETED), file("b", 0, 0, UploadBarStatus.UPLOADING)),
        )

        assertThat(done.percentage).isEqualTo(100)
        assertThat(done.isComplete).isTrue()
        assertThat(unknown.percentage).isEqualTo(50)
    }

    @Test
    fun `un envoi qui depasse son total reste borne a cent`() {
        val over = UploadBarProgress(listOf(file("a", 500, 100, UploadBarStatus.UPLOADING)))

        assertThat(over.percentage).isEqualTo(100)
    }
}
