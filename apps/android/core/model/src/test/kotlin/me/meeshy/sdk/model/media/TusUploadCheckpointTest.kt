package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TusCheckpointKeyTest {

    @Test
    fun `same context, file name, mime type and total bytes produce the same key`() {
        val a = TusCheckpointKey.of(TusUploadContext.POST, "video.mp4", "video/mp4", 25L)
        val b = TusCheckpointKey.of(TusUploadContext.POST, "video.mp4", "video/mp4", 25L)

        assertThat(a).isEqualTo(b)
    }

    @Test
    fun `a different context changes the key`() {
        val post = TusCheckpointKey.of(TusUploadContext.POST, "video.mp4", "video/mp4", 25L)
        val story = TusCheckpointKey.of(TusUploadContext.STORY, "video.mp4", "video/mp4", 25L)

        assertThat(post).isNotEqualTo(story)
    }

    @Test
    fun `a different file name changes the key`() {
        val a = TusCheckpointKey.of(TusUploadContext.POST, "a.mp4", "video/mp4", 25L)
        val b = TusCheckpointKey.of(TusUploadContext.POST, "b.mp4", "video/mp4", 25L)

        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `a different mime type changes the key`() {
        val a = TusCheckpointKey.of(TusUploadContext.POST, "clip", "video/mp4", 25L)
        val b = TusCheckpointKey.of(TusUploadContext.POST, "clip", "audio/mp4", 25L)

        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `a different total byte count changes the key`() {
        val a = TusCheckpointKey.of(TusUploadContext.POST, "video.mp4", "video/mp4", 25L)
        val b = TusCheckpointKey.of(TusUploadContext.POST, "video.mp4", "video/mp4", 26L)

        assertThat(a).isNotEqualTo(b)
    }
}

class TusResumePlannerTest {

    @Test
    fun `no existing checkpoint (null location) starts fresh`() {
        val decision = TusResumePlanner.plan(existingLocation = null, existingUploadedBytes = 5L, totalBytes = 25L)

        assertThat(decision).isEqualTo(TusResumeDecision.Fresh)
    }

    @Test
    fun `a blank location starts fresh`() {
        val decision = TusResumePlanner.plan(existingLocation = "", existingUploadedBytes = 5L, totalBytes = 25L)

        assertThat(decision).isEqualTo(TusResumeDecision.Fresh)
    }

    @Test
    fun `zero confirmed bytes starts fresh rather than resuming an unconfirmed session`() {
        val decision = TusResumePlanner.plan(
            existingLocation = "https://gate.meeshy.me/api/v1/uploads/abc",
            existingUploadedBytes = 0L,
            totalBytes = 25L,
        )

        assertThat(decision).isEqualTo(TusResumeDecision.Fresh)
    }

    @Test
    fun `negative uploaded bytes (defensive) starts fresh`() {
        val decision = TusResumePlanner.plan(
            existingLocation = "https://gate.meeshy.me/api/v1/uploads/abc",
            existingUploadedBytes = -1L,
            totalBytes = 25L,
        )

        assertThat(decision).isEqualTo(TusResumeDecision.Fresh)
    }

    @Test
    fun `uploaded bytes equal to the total (already complete, stale row) starts fresh`() {
        val decision = TusResumePlanner.plan(
            existingLocation = "https://gate.meeshy.me/api/v1/uploads/abc",
            existingUploadedBytes = 25L,
            totalBytes = 25L,
        )

        assertThat(decision).isEqualTo(TusResumeDecision.Fresh)
    }

    @Test
    fun `uploaded bytes past the total (corrupted row) starts fresh`() {
        val decision = TusResumePlanner.plan(
            existingLocation = "https://gate.meeshy.me/api/v1/uploads/abc",
            existingUploadedBytes = 30L,
            totalBytes = 25L,
        )

        assertThat(decision).isEqualTo(TusResumeDecision.Fresh)
    }

    @Test
    fun `progress strictly between zero and the total resumes at the confirmed offset`() {
        val decision = TusResumePlanner.plan(
            existingLocation = "https://gate.meeshy.me/api/v1/uploads/abc",
            existingUploadedBytes = 10L,
            totalBytes = 25L,
        )

        assertThat(decision).isEqualTo(
            TusResumeDecision.Resume(location = "https://gate.meeshy.me/api/v1/uploads/abc", resumeOffsetBytes = 10L),
        )
    }

    @Test
    fun `one byte short of the total still resumes (boundary)`() {
        val decision = TusResumePlanner.plan(
            existingLocation = "https://gate.meeshy.me/api/v1/uploads/abc",
            existingUploadedBytes = 24L,
            totalBytes = 25L,
        )

        assertThat(decision).isEqualTo(
            TusResumeDecision.Resume(location = "https://gate.meeshy.me/api/v1/uploads/abc", resumeOffsetBytes = 24L),
        )
    }
}
