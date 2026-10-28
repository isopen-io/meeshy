package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaUploadProgressTest {

    @Test
    fun `an upload in flight shows a fraction clamped between zero and one`() {
        assertThat(MediaUploadProgress.Uploading(sent = 34, total = 100).fraction).isWithin(1e-9).of(0.34)
        assertThat(MediaUploadProgress.Uploading(sent = 500, total = 100).fraction).isEqualTo(1.0)
        assertThat(MediaUploadProgress.Uploading(sent = -5, total = 100).fraction).isEqualTo(0.0)
    }

    @Test
    fun `a bar with nothing to measure is not drawn rather than drawn at zero`() {
        assertThat(MediaUploadProgress.Uploading(sent = 0, total = 0).fraction).isNull()
        assertThat(MediaUploadProgress.Idle.fraction).isNull()
        assertThat(MediaUploadProgress.Failed.fraction).isNull()
    }

    @Test
    fun `only an upload in flight shows progress and only a ready one can be skipped`() {
        assertThat(MediaUploadProgress.Uploading(1, 2).showsProgress).isTrue()
        assertThat(MediaUploadProgress.Ready("pm1").showsProgress).isFalse()
        assertThat(MediaUploadProgress.Ready("pm1").isReady).isTrue()
        assertThat(MediaUploadProgress.Uploading(2, 2).isReady).isFalse()
    }

    @Test
    fun `bytes are read on the scale of the total with the unit said once`() {
        val reading = UploadByteReading.of(sent = 4_800_000, total = 14_200_000)

        assertThat(reading.unit).isEqualTo(UploadByteUnit.MEGABYTES)
        assertThat(reading.sentScaled).isWithin(1e-9).of(4.8)
        assertThat(reading.totalScaled).isWithin(1e-9).of(14.2)
        assertThat(reading.percent).isEqualTo(34)
    }

    @Test
    fun `the first bytes of a large file stay in megabytes instead of mixing scales`() {
        val reading = UploadByteReading.of(sent = 12_000, total = 14_200_000)

        assertThat(reading.unit).isEqualTo(UploadByteUnit.MEGABYTES)
        assertThat(reading.sentScaled).isWithin(1e-9).of(0.012)
    }

    @Test
    fun `scales switch at decimal thresholds`() {
        assertThat(UploadByteReading.of(1, 999_999).unit).isEqualTo(UploadByteUnit.KILOBYTES)
        assertThat(UploadByteReading.of(1, 1_000_000).unit).isEqualTo(UploadByteUnit.MEGABYTES)
        assertThat(UploadByteReading.of(1, 1_000_000_000).unit).isEqualTo(UploadByteUnit.GIGABYTES)
    }

    @Test
    fun `sent bytes beyond the total or below zero never leave the scale`() {
        assertThat(UploadByteReading.of(sent = 9_000, total = 3_000).sentScaled).isWithin(1e-9).of(3.0)
        assertThat(UploadByteReading.of(sent = -1, total = 3_000).sentScaled).isEqualTo(0.0)
        assertThat(UploadByteReading.of(sent = 0, total = 0).percent).isEqualTo(0)
    }
}
