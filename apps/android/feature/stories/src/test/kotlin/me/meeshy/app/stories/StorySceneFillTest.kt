package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.Test

/**
 * Loi 6 — la scène du composer peint ce que le lecteur peindra (#12314) : la couleur ou le
 * dégradé choisi, et sans fond le dégradé de l'auteur (sa couleur vers le noir), décidé par
 * la même fonction des deux côtés.
 */
class StorySceneFillTest {

    @Test
    fun `a chosen colour paints the scene`() {
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Hex("FF3B30"), ACCENT))
            .isEqualTo(StorySceneFill.Solid("FF3B30"))
    }

    @Test
    fun `a chosen gradient paints the scene`() {
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Gradient("FF3B30", "007AFF"), ACCENT))
            .isEqualTo(StorySceneFill.Linear("FF3B30", "007AFF"))
    }

    @Test
    fun `without a background, or with an unreadable one, the author gradient paints it`() {
        val fallback = StorySceneFill.AuthorGradient(ACCENT)
        assertThat(StorySceneFill.resolve(null, ACCENT)).isEqualTo(fallback)
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Hex("nope"), ACCENT)).isEqualTo(fallback)
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Gradient("FF3B30", "zz"), ACCENT)).isEqualTo(fallback)
    }

    @Test
    fun `the floor of a reel scene is black when it declares no readable background, like iOS`() {
        assertThat(StorySceneFill.resolve(null, ACCENT, SceneFloor.BLACK)).isEqualTo(StorySceneFill.Black)
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Hex("nope"), ACCENT, SceneFloor.BLACK)).isEqualTo(StorySceneFill.Black)
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Gradient("FF3B30", "zz"), ACCENT, SceneFloor.BLACK))
            .isEqualTo(StorySceneFill.Black)
    }

    @Test
    fun `a colour the scene declares survives a black floor`() {
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Hex("FF3B30"), ACCENT, SceneFloor.BLACK))
            .isEqualTo(StorySceneFill.Solid("FF3B30"))
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Gradient("FF3B30", "007AFF"), ACCENT, SceneFloor.BLACK))
            .isEqualTo(StorySceneFill.Linear("FF3B30", "007AFF"))
    }

    @Test
    fun `the default floor stays the author gradient of the story reader`() {
        assertThat(StorySceneFill.resolve(null, ACCENT, SceneFloor.AUTHOR_GRADIENT)).isEqualTo(StorySceneFill.AuthorGradient(ACCENT))
    }

    @Test
    fun `the author colour is the one the story tray gives the author, from the display name then the username`() {
        val named = MeeshyUser(id = "me", username = "demo", displayName = "Demo User")
        val unnamed = MeeshyUser(id = "me", username = "demo", displayName = " ")

        assertThat(StorySceneFill.authorAccentHex(named)).isEqualTo(DynamicColorGenerator.colorForName("Demo User"))
        assertThat(StorySceneFill.authorAccentHex(unnamed)).isEqualTo(DynamicColorGenerator.colorForName("demo"))
    }

    @Test
    fun `an author whose identity is not known yet has no colour, and the scene waits on black`() {
        val nameless = MeeshyUser(id = "me", username = " ", displayName = null)

        assertThat(StorySceneFill.authorAccentHex(null)).isNull()
        assertThat(StorySceneFill.authorAccentHex(nameless)).isNull()
        assertThat(StorySceneFill.resolve(null, null)).isEqualTo(StorySceneFill.Black)
        assertThat(StorySceneFill.resolve(StoryBackgroundValue.Hex("FF3B30"), null)).isEqualTo(StorySceneFill.Solid("FF3B30"))
    }

    private companion object {
        const val ACCENT = "4ECDC4"
    }
}
