package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Instant

class UnclaimedMediaSweepTest {

    private val saved = Instant.parse("2026-10-27T10:00:00Z")

    @Test
    fun `a draft saved over a day ago holds server media the gateway already swept`() {
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBefore(saved, saved.plusSeconds(24 * 3600))).isTrue()
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBefore(saved, saved.plusSeconds(3 * 24 * 3600))).isTrue()
    }

    @Test
    fun `a draft saved within the window still holds its uploads`() {
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBefore(saved, saved.plusSeconds(24 * 3600 - 1))).isFalse()
    }

    @Test
    fun `an unreadable or absent save date never condemns media`() {
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBefore(null, saved)).isFalse()
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBefore(saved.plusSeconds(10), saved)).isFalse()
    }

    @Test
    fun `an iso date string is read and garbage is ignored`() {
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBeforeIso("2026-10-27T10:00:00Z", saved.plusSeconds(90_000))).isTrue()
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBeforeIso("not a date", saved.plusSeconds(90_000))).isFalse()
        assertThat(UnclaimedMediaSweep.hasSweptMediaUploadedBeforeIso(null, saved)).isFalse()
    }
}
