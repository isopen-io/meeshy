package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NowPlayingArtworkPlanTest {

    @Test
    fun `the sender avatar wins over the conversation avatar`() {
        assertThat(NowPlayingArtworkPlan.source("https://a/s.png", "https://a/c.png"))
            .isEqualTo(NowPlayingArtworkSource.Avatar("https://a/s.png"))
    }

    @Test
    fun `a blank sender avatar falls back to the conversation avatar`() {
        assertThat(NowPlayingArtworkPlan.preferredAvatarUrl("  ", "https://a/c.png")).isEqualTo("https://a/c.png")
        assertThat(NowPlayingArtworkPlan.preferredAvatarUrl("", "https://a/c.png")).isEqualTo("https://a/c.png")
    }

    @Test
    fun `no avatar at all falls back to the app icon`() {
        assertThat(NowPlayingArtworkPlan.source(null, null)).isEqualTo(NowPlayingArtworkSource.AppIcon)
        assertThat(NowPlayingArtworkPlan.source("", " ")).isEqualTo(NowPlayingArtworkSource.AppIcon)
    }

    @Test
    fun `the badge is 26 percent of the side with a 4 percent margin at the bottom left`() {
        val rect = NowPlayingArtworkPlan.badgeRect(hasAvatar = true)!!
        assertThat(rect.size).isEqualTo(156)
        assertThat(rect.left).isEqualTo(24)
        assertThat(rect.top).isEqualTo(600 - 24 - 156)
    }

    @Test
    fun `without an avatar there is no badge`() {
        assertThat(NowPlayingArtworkPlan.badgeRect(hasAvatar = false)).isNull()
    }

    @Test
    fun `the badge corners round at 22 percent of its side`() {
        assertThat(NowPlayingArtworkPlan.badgeCornerRadius(100)).isWithin(0.001f).of(22f)
    }
}
