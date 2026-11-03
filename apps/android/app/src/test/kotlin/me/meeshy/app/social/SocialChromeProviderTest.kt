package me.meeshy.app.social

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.StoryRingState
import org.junit.Test

class SocialChromeProviderTest {

    @Test
    fun `sans sources aucun resolveur n est servi et rien ne plante`() {
        val env = socialChromeEnvironment(null)
        assertThat(env.moodFor("u1")).isNull()
        assertThat(env.ringFor("u1")).isEqualTo(StoryRingState.None)
        assertThat(env.storyOpenerFor("u1")).isNull()
        assertThat(env.publishStory).isNull()
        assertThat(env.openComposer).isNull()
    }

    @Test
    fun `des sources fournies servent l humeur et l anneau`() {
        val env = socialChromeEnvironment(object : SocialChromeSources {
            override fun moodEmoji(userId: String) = "🔥"
            override fun storyRing(userId: String) = StoryRingState.Read
        })
        assertThat(env.moodFor("u1")).isEqualTo("🔥")
        assertThat(env.ringFor("u1")).isEqualTo(StoryRingState.Read)
        assertThat(env.storyOpenerFor("u1")).isNull()
    }

    @Test
    fun `le lecteur de stories s ouvre quand la source le declare`() {
        var opened: String? = null
        val env = socialChromeEnvironment(object : SocialChromeSources {
            override val canOpenStoryViewer = true
            override fun openStoryViewer(userId: String) { opened = userId }
        })
        env.storyOpenerFor("u9")!!.invoke()
        assertThat(opened).isEqualTo("u9")
    }
}
