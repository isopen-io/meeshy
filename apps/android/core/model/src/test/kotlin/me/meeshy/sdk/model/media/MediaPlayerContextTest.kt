package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaPlayerContextTest {
    @Test fun `rayons par contexte`() {
        assertThat(MediaPlayerContext.MESSAGE_BUBBLE.cornerRadiusDp).isEqualTo(14)
        assertThat(MediaPlayerContext.COMPOSER_ATTACHMENT.cornerRadiusDp).isEqualTo(12)
        assertThat(MediaPlayerContext.FEED_POST.cornerRadiusDp).isEqualTo(18)
        assertThat(MediaPlayerContext.STORY_OVERLAY.cornerRadiusDp).isEqualTo(0)
        assertThat(MediaPlayerContext.FULLSCREEN.cornerRadiusDp).isEqualTo(0)
    }

    @Test fun `seule la bulle est compacte`() {
        assertThat(MediaPlayerContext.entries.filter { it.isCompact })
            .containsExactly(MediaPlayerContext.MESSAGE_BUBBLE)
    }

    @Test fun `capacites par contexte`() {
        assertThat(MediaPlayerContext.COMPOSER_ATTACHMENT.showsDeleteButton).isTrue()
        assertThat(MediaPlayerContext.FEED_POST.showsSocialActions).isTrue()
        assertThat(MediaPlayerContext.FULLSCREEN.isImmersive).isTrue()
        assertThat(MediaPlayerContext.MESSAGE_BUBBLE.isImmersive).isFalse()
    }
}
