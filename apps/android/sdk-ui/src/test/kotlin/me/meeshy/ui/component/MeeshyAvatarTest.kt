package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.component.avatar.SocialChromeEnvironment
import me.meeshy.ui.component.avatar.storyRingRotates
import org.junit.Test

/**
 * Central presence dot rule 1/3/5 (parity web/iOS): online -> green (Success),
 * away -> orange (Warning), idle -> grey DISPLAYED (Neutral400),
 * offline / no data -> no dot (null).
 */
class MeeshyAvatarTest {

    @Test
    fun `online presence is the green success colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.ONLINE)).isEqualTo(MeeshyPalette.Success)
    }

    @Test
    fun `away presence is the orange warning colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.AWAY)).isEqualTo(MeeshyPalette.Warning)
    }

    @Test
    fun `idle presence is the grey neutral colour (displayed)`() {
        assertThat(meeshyPresenceDotColor(PresenceState.IDLE)).isEqualTo(MeeshyPalette.Neutral400)
    }

    @Test
    fun `offline presence shows no dot`() {
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isNull()
    }

    @Test
    fun `missing presence data shows no dot`() {
        assertThat(meeshyPresenceDotColor(null)).isNull()
    }

    @Test
    fun `dot tones map to the central palette and here is the primary colour`() {
        assertThat(meeshyDotToneColor(me.meeshy.sdk.model.avatar.AvatarDotTone.HERE)).isEqualTo(MeeshyPalette.Indigo500)
        assertThat(meeshyDotToneColor(me.meeshy.sdk.model.avatar.AvatarDotTone.ONLINE)).isEqualTo(MeeshyPalette.Success)
        assertThat(meeshyDotToneColor(me.meeshy.sdk.model.avatar.AvatarDotTone.AWAY)).isEqualTo(MeeshyPalette.Warning)
        assertThat(meeshyDotToneColor(me.meeshy.sdk.model.avatar.AvatarDotTone.IDLE)).isEqualTo(MeeshyPalette.Neutral400)
    }

    @Test
    fun `l anneau non lu tourne seulement hors listes et hors reduction de mouvement`() {
        assertThat(storyRingRotates(StoryRingState.Unread, contextAnimates = true, reduceMotion = false)).isTrue()
        assertThat(storyRingRotates(StoryRingState.Unread, contextAnimates = false, reduceMotion = false)).isFalse()
        assertThat(storyRingRotates(StoryRingState.Unread, contextAnimates = true, reduceMotion = true)).isFalse()
        assertThat(storyRingRotates(StoryRingState.Read, contextAnimates = true, reduceMotion = false)).isFalse()
    }

    @Test
    fun `un chrome social absent ne sert ni humeur ni anneau ni ouvreur`() {
        val absent = SocialChromeEnvironment.Absent
        assertThat(absent.moodFor("u1")).isNull()
        assertThat(absent.ringFor("u1")).isEqualTo(StoryRingState.None)
        assertThat(absent.moodTapFor("u1")).isNull()
        assertThat(absent.storyOpenerFor("u1")).isNull()
    }

    @Test
    fun `un chrome social pose sert l humeur l anneau et ouvre le lecteur`() {
        var opened: String? = null
        val env = SocialChromeEnvironment(
            moodEmoji = { if (it == "u1") "😀" else "" },
            storyRing = { StoryRingState.Unread },
            openStoryViewer = { opened = it },
        )
        assertThat(env.moodFor("u1")).isEqualTo("😀")
        assertThat(env.moodFor("u2")).isNull()
        assertThat(env.moodFor(null)).isNull()
        assertThat(env.ringFor("u1")).isEqualTo(StoryRingState.Unread)
        assertThat(env.ringFor(null)).isEqualTo(StoryRingState.None)
        env.storyOpenerFor("u1")!!.invoke()
        assertThat(opened).isEqualTo("u1")
        assertThat(env.storyOpenerFor(null)).isNull()
    }
}
