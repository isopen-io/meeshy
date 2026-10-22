package me.meeshy.ui.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

class ProfileAvatarSignsTest {

    private fun signs(
        ring: StoryRingState = StoryRingState.Unread,
        mood: String? = "😀",
        presence: PresenceState? = PresenceState.ONLINE,
        blockedByMe: Boolean = false,
        blockedByTarget: Boolean = false,
    ) = ProfileAvatarSigns.of(
        storyRing = ring,
        moodEmoji = mood,
        presence = presence,
        isBlockedByMe = blockedByMe,
        isBlockedByTarget = blockedByTarget,
    )

    @Test
    fun `a visible profile carries its real ring, mood and presence`() {
        val s = signs()
        assertThat(s.storyRing).isEqualTo(StoryRingState.Unread)
        assertThat(s.moodEmoji).isEqualTo("😀")
        assertThat(s.presenceDot).isEqualTo(MeeshyPalette.Success)
        assertThat(s.showsDecor).isTrue()
        assertThat(s.isGrayedOut).isFalse()
    }

    @Test
    fun `read ring and no ring are kept as they are`() {
        assertThat(signs(ring = StoryRingState.Read).storyRing).isEqualTo(StoryRingState.Read)
        assertThat(signs(ring = StoryRingState.None).isRingTappable).isFalse()
        assertThat(signs(ring = StoryRingState.Read).isRingTappable).isTrue()
    }

    @Test
    fun `an empty mood is no mood`() {
        assertThat(signs(mood = "").moodEmoji).isNull()
        assertThat(signs(mood = null).isMoodTappable).isFalse()
        assertThat(signs(mood = "😀").isMoodTappable).isTrue()
    }

    @Test
    fun `presence follows the central dot law and never fabricates a dot`() {
        assertThat(signs(presence = PresenceState.AWAY).presenceDot).isEqualTo(MeeshyPalette.Warning)
        assertThat(signs(presence = PresenceState.IDLE).presenceDot).isEqualTo(MeeshyPalette.Neutral400)
        assertThat(signs(presence = PresenceState.OFFLINE).presenceDot).isNull()
        assertThat(signs(presence = null).presenceDot).isNull()
    }

    @Test
    fun `blocked by the target grays everything and shows no sign at all`() {
        val s = signs(blockedByTarget = true)
        assertThat(s.isGrayedOut).isTrue()
        assertThat(s.accent).isEqualTo(MeeshyPalette.BlockedNeutral)
        assertThat(s.showsDecor).isFalse()
        assertThat(s.presenceDot).isNull()
        assertThat(s.storyRing).isEqualTo(StoryRingState.None)
        assertThat(s.moodEmoji).isNull()
        assertThat(s.isRingTappable).isFalse()
        assertThat(s.isMoodTappable).isFalse()
    }

    @Test
    fun `blocked by me removes the story ring but keeps the rest`() {
        val s = signs(blockedByMe = true)
        assertThat(s.storyRing).isEqualTo(StoryRingState.None)
        assertThat(s.moodEmoji).isEqualTo("😀")
        assertThat(s.isGrayedOut).isFalse()
    }
}
