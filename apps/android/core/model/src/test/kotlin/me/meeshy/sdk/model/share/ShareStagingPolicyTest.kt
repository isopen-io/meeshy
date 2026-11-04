package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits
import org.junit.Test

class ShareStagingPolicyTest {
    private val mib = 1024L * 1024L

    @Test
    fun `the copy buffer is 64 KiB so a 400 MB video never sits in memory`() {
        assertThat(ShareStagingPolicy.COPY_BUFFER_BYTES).isEqualTo(64 * 1024)
    }

    @Test
    fun `a copy needs its size plus the 128 MiB margin`() {
        assertThat(ShareStagingPolicy.requiredFreeBytes(400 * mib)).isEqualTo(528 * mib)
    }

    @Test
    fun `an unknown size only asks for the margin`() {
        assertThat(ShareStagingPolicy.requiredFreeBytes(-1L)).isEqualTo(128 * mib)
    }

    @Test
    fun `the disk refuses a copy that would eat the margin`() {
        val refusal = ShareStagingPolicy.spaceRefusal(size = 100 * mib, freeBytes = 200 * mib)

        assertThat(refusal).isEqualTo(ShareStagingError.InsufficientFreeSpace(needed = 228 * mib, free = 200 * mib))
    }

    @Test
    fun `the disk accepts a copy that leaves the margin free`() {
        assertThat(ShareStagingPolicy.spaceRefusal(size = 100 * mib, freeBytes = 228 * mib)).isNull()
    }

    @Test
    fun `a piece is capped at the direct upload ceiling Android can send`() {
        assertThat(ShareStagingPolicy.MAX_FILE_BYTES).isEqualTo(ComposerAttachmentLimits.MAX_UPLOAD_BYTES)
    }

    @Test
    fun `all early copies together stay far below the 5 GiB a share may announce`() {
        assertThat(ShareStagingPolicy.MAX_STAGED_BYTES).isEqualTo(512 * mib)
        assertThat(ShareStagingPolicy.MAX_STAGED_BYTES).isAtMost(ShareLimits.MAX_TOTAL_BYTES / 8)
        assertThat(ShareStagingPolicy.MAX_STAGED_BYTES).isAtLeast(ShareStagingPolicy.MAX_FILE_BYTES)
    }

    @Test
    fun `the disk is checked again at the first step the copy reaches, whatever the size of the reads`() {
        val step = ShareStagingPolicy.SPACE_RECHECK_BYTES

        assertThat(ShareStagingPolicy.nextSpaceCheck(0L)).isEqualTo(step)
        assertThat(ShareStagingPolicy.nextSpaceCheck(step - 1)).isEqualTo(step)
        assertThat(ShareStagingPolicy.nextSpaceCheck(step)).isEqualTo(2 * step)
        assertThat(ShareStagingPolicy.nextSpaceCheck(2 * step + 65_535)).isEqualTo(3 * step)
    }
}
