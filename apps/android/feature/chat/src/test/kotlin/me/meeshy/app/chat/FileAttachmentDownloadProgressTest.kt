package me.meeshy.app.chat

import android.app.DownloadManager
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FileAttachmentDownloadProgressTest {

    private fun state(
        status: Int = DownloadManager.STATUS_RUNNING,
        reason: Int = 0,
        bytesDownloaded: Long = 0,
        bytesTotal: Long = 0,
        localUri: String? = null,
        mimeType: String = "application/pdf",
    ) = FileAttachmentDownloadProgress.fromCursorColumns(
        status = status,
        reason = reason,
        bytesDownloaded = bytesDownloaded,
        bytesTotal = bytesTotal,
        localUri = localUri,
        mimeType = mimeType,
    )

    // MARK: - in progress

    @Test
    fun a_running_download_with_a_known_total_reports_a_percent() {
        val result = state(status = DownloadManager.STATUS_RUNNING, bytesDownloaded = 25, bytesTotal = 100)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.InProgress(progressPercent = 25))
    }

    @Test
    fun a_running_download_with_an_unknown_total_reports_no_percent() {
        val result = state(status = DownloadManager.STATUS_RUNNING, bytesDownloaded = 25, bytesTotal = 0)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.InProgress(progressPercent = null))
    }

    @Test
    fun a_pending_download_is_reported_as_in_progress_too() {
        val result = state(status = DownloadManager.STATUS_PENDING)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.InProgress(progressPercent = null))
    }

    @Test
    fun a_paused_download_is_reported_as_in_progress_too() {
        val result = state(status = DownloadManager.STATUS_PAUSED)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.InProgress(progressPercent = null))
    }

    // MARK: - success

    @Test
    fun a_successful_download_with_a_local_uri_completes() {
        val result = state(
            status = DownloadManager.STATUS_SUCCESSFUL,
            localUri = "content://downloads/my_downloads/42",
            mimeType = "application/pdf",
        )
        assertThat(result).isEqualTo(
            FileAttachmentDownloadState.Completed(
                localUri = "content://downloads/my_downloads/42",
                mimeType = "application/pdf",
            ),
        )
    }

    @Test
    fun a_successful_download_without_a_local_uri_fails_as_a_server_error() {
        val result = state(status = DownloadManager.STATUS_SUCCESSFUL, localUri = null)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.ServerError))
    }

    // MARK: - failure reasons

    @Test
    fun a_404_reason_maps_to_expired() {
        val result = state(status = DownloadManager.STATUS_FAILED, reason = 404)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.Expired))
    }

    @Test
    fun a_410_reason_maps_to_expired() {
        val result = state(status = DownloadManager.STATUS_FAILED, reason = 410)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.Expired))
    }

    @Test
    fun an_http_data_error_maps_to_a_network_error() {
        val result = state(status = DownloadManager.STATUS_FAILED, reason = DownloadManager.ERROR_HTTP_DATA_ERROR)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.NetworkError))
    }

    @Test
    fun a_500_reason_maps_to_a_server_error() {
        val result = state(status = DownloadManager.STATUS_FAILED, reason = 500)
        assertThat(result).isEqualTo(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.ServerError))
    }
}
