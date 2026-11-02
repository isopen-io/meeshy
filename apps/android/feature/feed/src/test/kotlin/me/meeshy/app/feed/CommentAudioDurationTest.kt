package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentAudioDurationTest {
    @Test fun `la durée d'un vocal se lit en minutes et secondes`() {
        assertThat(commentAudioDuration(12_000)).isEqualTo("0:12")
        assertThat(commentAudioDuration(75_400)).isEqualTo("1:15")
        assertThat(commentAudioDuration(599)).isEqualTo("0:01")
    }
}
