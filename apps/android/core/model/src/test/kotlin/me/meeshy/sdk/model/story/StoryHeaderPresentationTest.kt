package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryHeaderPresentationTest {
    private val now = 10_000_000_000L
    private fun ago(minutes: Long) = StoryHeaderPresentation.age(now - minutes * 60_000L, now)

    @Test
    fun `sans date aucune anciennete`() {
        assertThat(StoryHeaderPresentation.age(null, now)).isNull()
    }

    @Test
    fun `l anciennete passe de maintenant aux minutes aux heures aux jours`() {
        assertThat(ago(0)).isEqualTo(StoryHeaderPresentation.Age.Now)
        assertThat(ago(5)).isEqualTo(StoryHeaderPresentation.Age.Minutes(5))
        assertThat(ago(59)).isEqualTo(StoryHeaderPresentation.Age.Minutes(59))
        assertThat(ago(60)).isEqualTo(StoryHeaderPresentation.Age.Hours(1))
        assertThat(ago(23 * 60 + 59)).isEqualTo(StoryHeaderPresentation.Age.Hours(23))
        assertThat(ago(24 * 60)).isEqualTo(StoryHeaderPresentation.Age.Days(1))
    }

    @Test
    fun `une horloge en retard compte maintenant`() {
        assertThat(StoryHeaderPresentation.age(now + 5 * 60_000L, now)).isEqualTo(StoryHeaderPresentation.Age.Now)
    }

    @Test
    fun `le handle d attribution est rogne et sans arobase double`() {
        assertThat(StoryHeaderPresentation.repostHandle(" @alice ")).isEqualTo("alice")
        assertThat(StoryHeaderPresentation.repostHandle("alice")).isEqualTo("alice")
        assertThat(StoryHeaderPresentation.repostHandle("  ")).isNull()
        assertThat(StoryHeaderPresentation.repostHandle("@")).isNull()
        assertThat(StoryHeaderPresentation.repostHandle(null)).isNull()
    }

    @Test
    fun `l appui long sur l identite dure 0,4 s`() {
        assertThat(StoryHeaderPresentation.PROFILE_LONG_PRESS_MILLIS).isEqualTo(400L)
    }
}
