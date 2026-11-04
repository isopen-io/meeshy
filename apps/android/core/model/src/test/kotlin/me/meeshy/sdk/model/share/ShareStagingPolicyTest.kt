package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareStagingPolicyTest {
    private val mib = 1024L * 1024L
    private val week = 7L * 24 * 60 * 60 * 1000

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
    fun `a folder with no record and untouched for 7 days is an orphan`() {
        assertThat(ShareStagingPolicy.isOrphan(lastActivityEpochMillis = 0L, nowEpochMillis = week, holdsPendingRecord = false)).isTrue()
    }

    @Test
    fun `a folder younger than 7 days is kept`() {
        assertThat(ShareStagingPolicy.isOrphan(lastActivityEpochMillis = 1L, nowEpochMillis = week, holdsPendingRecord = false)).isFalse()
    }

    @Test
    fun `a folder described by a live record is never an orphan however old`() {
        assertThat(ShareStagingPolicy.isOrphan(lastActivityEpochMillis = 0L, nowEpochMillis = 10 * week, holdsPendingRecord = true)).isFalse()
    }
}
