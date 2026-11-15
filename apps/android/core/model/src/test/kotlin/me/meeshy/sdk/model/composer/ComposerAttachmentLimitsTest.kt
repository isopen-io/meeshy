package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerAttachmentLimitsTest {

    @Test
    fun `a file up to the direct upload ceiling is admitted`() {
        assertThat(ComposerAttachmentLimits.admitsUpload(ComposerAttachmentLimits.MAX_UPLOAD_BYTES)).isTrue()
        assertThat(ComposerAttachmentLimits.admitsUpload(0L)).isTrue()
    }

    @Test
    fun `a file above the direct upload ceiling is refused`() {
        assertThat(ComposerAttachmentLimits.admitsUpload(ComposerAttachmentLimits.MAX_UPLOAD_BYTES + 1)).isFalse()
    }

    @Test
    fun `the ceiling is the shared direct-upload threshold of fifty megabytes`() {
        assertThat(ComposerAttachmentLimits.MAX_UPLOAD_BYTES).isEqualTo(50L * 1024 * 1024)
        assertThat(ComposerAttachmentLimits.MAX_UPLOAD_MEGABYTES).isEqualTo(50)
    }
}
