package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.StoryViewerContentRules
import org.junit.Test

class StoryLanguageControllerTest {

    private class Clock(var now: Long = 0L)

    private fun controller(clock: Clock = Clock()) = StoryLanguageController { clock.now }

    @Test
    fun `a chosen language holds on its slide`() {
        val c = controller()
        c.select("s1", "en")
        assertThat(c.overrideFor("s1")).isEqualTo("en")
    }

    @Test
    fun `the override resets when the slide changes`() {
        val c = controller()
        c.select("s1", "en")
        assertThat(c.overrideFor("s2")).isNull()
        assertThat(c.overrideFor("s1")).isNull()
    }

    @Test
    fun `Original is held as a sentinel override`() {
        val c = controller()
        c.select("s1", StoryViewerContentRules.ORIGINAL_LANGUAGE_OVERRIDE)
        assertThat(StoryLanguageOverride.isOriginal(c.overrideFor("s1"))).isTrue()
    }

    @Test
    fun `tapping the active language releases it and another replaces it`() {
        val c = controller()
        c.tap("s1", "en")
        assertThat(c.overrideFor("s1")).isEqualTo("en")
        c.tap("s1", "es")
        assertThat(c.overrideFor("s1")).isEqualTo("es")
        c.tap("s1", "es")
        assertThat(c.overrideFor("s1")).isNull()
    }

    @Test
    fun `a flag tap leaves Original for the tapped language`() {
        val c = controller()
        c.select("s1", StoryViewerContentRules.ORIGINAL_LANGUAGE_OVERRIDE)
        c.tap("s1", "en")
        assertThat(c.overrideFor("s1")).isEqualTo("en")
    }

    @Test
    fun `translation requests are tracked per language and per slide and are not doubled`() {
        val c = controller()
        assertThat(c.beginTranslation("s1", "EN ")).isTrue()
        assertThat(c.beginTranslation("s1", "en")).isFalse()
        assertThat(c.translatingCodes("s1")).containsExactly("en")
        assertThat(c.translatingCodes("s2")).isEmpty()
        c.endTranslation("s1", "en")
        assertThat(c.isTranslating("s1", "en")).isFalse()
    }

    @Test
    fun `a retranslation spins until the text moves`() {
        val c = controller()
        c.beginRetranslation("s1", "en", "Hello")
        assertThat(c.retranslatingCodes("s1") { "Hello" }).containsExactly("en")
        assertThat(c.retranslatingCodes("s1") { "Hi" }).isEmpty()
        assertThat(c.retranslatingCodes("s1") { "Hello" }).isEmpty()
    }

    @Test
    fun `a retranslation returning the same text stops spinning after twenty seconds`() {
        val clock = Clock()
        val c = controller(clock)
        c.beginRetranslation("s1", "en", "Hello")
        clock.now = 19_999
        assertThat(c.retranslatingCodes("s1") { "Hello" }).containsExactly("en")
        clock.now = 20_000
        assertThat(c.retranslatingCodes("s1") { "Hello" }).isEmpty()
    }
}
