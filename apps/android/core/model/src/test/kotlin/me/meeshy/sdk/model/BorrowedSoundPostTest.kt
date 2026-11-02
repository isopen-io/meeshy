package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BorrowedSoundPostTest {
    private fun sound(durationMs: Long? = 5000, title: String = "Mon son") = BorrowedSound(
        id = "s1", title = title, fileUrl = "https://cdn/s1.mp3", durationMs = durationMs,
        waveform = listOf(0.1f), uploaderUsername = "ana", createdAt = "2026-01-01T00:00:00.000Z",
    )

    @Test
    fun `the blob carries a single track with server url and sound identity`() {
        val tracks = BorrowedSoundPost.effects(sound()).audioPlayerObjects!!
        assertThat(tracks).hasSize(1)
        val track = tracks.single()
        assertThat(track.soundId).isEqualTo("s1")
        assertThat(track.mediaURL).isEqualTo("https://cdn/s1.mp3")
        assertThat(track.postMediaId).isEmpty()
        assertThat(track.placement).isEqualTo("overlay")
        assertThat(track.isBackground).isTrue()
        assertThat(track.duration).isEqualTo(5f)
        assertThat(track.soundAuthorUsername).isEqualTo("ana")
        assertThat(track.name).isEqualTo("Mon son")
    }

    @Test
    fun `an untitled sound carries no name`() {
        assertThat(BorrowedSoundPost.effects(sound(title = "  ")).audioPlayerObjects!!.single().name).isNull()
    }

    @Test
    fun `three seconds qualifies a reel and under does not`() {
        assertThat(BorrowedSoundPost.type(sound(3000), false)).isEqualTo(PostType.REEL)
        assertThat(BorrowedSoundPost.type(sound(2999), false)).isEqualTo(PostType.POST)
        assertThat(BorrowedSoundPost.type(sound(null), false)).isEqualTo(PostType.POST)
    }

    @Test
    fun `forcePlainPost wins`() {
        assertThat(BorrowedSoundPost.type(sound(9000), true)).isEqualTo(PostType.POST)
    }
}
