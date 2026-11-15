package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Un double toucher sur la pastille d'un commentaire vocal ne la laisse plus muette (#18271, android-fil-01#21). */
class CommentAudioPlaybackTest {

    @Test
    fun `a second touch while the voice note is still preparing is ignored`() {
        assertThat(CommentAudioPlayback.onTap(CommentAudioPhase.PREPARING)).isEqualTo(CommentAudioTap.IGNORE)
    }

    @Test
    fun `a touch after a playback error prepares a fresh player`() {
        assertThat(CommentAudioPlayback.onTap(CommentAudioPhase.FAILED)).isEqualTo(CommentAudioTap.PREPARE)
    }

    @Test
    fun `the first touch prepares, then touches toggle pause and resume`() {
        assertThat(CommentAudioPlayback.onTap(CommentAudioPhase.IDLE)).isEqualTo(CommentAudioTap.PREPARE)
        assertThat(CommentAudioPlayback.onTap(CommentAudioPhase.PLAYING)).isEqualTo(CommentAudioTap.PAUSE)
        assertThat(CommentAudioPlayback.onTap(CommentAudioPhase.PAUSED)).isEqualTo(CommentAudioTap.RESUME)
    }
}
