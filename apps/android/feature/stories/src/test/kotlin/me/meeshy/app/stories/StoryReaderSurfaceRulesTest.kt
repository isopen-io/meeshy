package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryReaderSurfaceRulesTest {
    @Test fun `aucune surface ouverte`() {
        assertThat(StoryReaderSurfaceRules.hasActiveReaderFeature()).isFalse()
    }

    @Test fun `chaque surface suffit seule`() {
        val r = StoryReaderSurfaceRules
        assertThat(r.hasActiveReaderFeature(showLanguageOptions = true)).isTrue()
        assertThat(r.hasActiveReaderFeature(showFullLanguagePicker = true)).isTrue()
        assertThat(r.hasActiveReaderFeature(showEmojiStrip = true)).isTrue()
        assertThat(r.hasActiveReaderFeature(showFullEmojiPicker = true)).isTrue()
        assertThat(r.hasActiveReaderFeature(showCommentsOverlay = true)).isTrue()
        assertThat(r.hasActiveReaderFeature(showAudioTranscript = true)).isTrue()
    }
}
