package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StorySlidePublishMatter.Facts
import org.junit.Test

class StorySlidePublishMatterTest {

    private fun deserves(facts: Facts, captioned: Boolean = true) = StorySlidePublishMatter.deservesAPost(facts, captioned)

    @Test
    fun `une slide vierge ou une coquille de texte vide ne merite pas de post`() {
        assertThat(deserves(Facts())).isFalse()
        assertThat(deserves(Facts(caption = "   ", realTextObjects = 0))).isFalse()
    }

    @Test
    fun `chaque famille de matiere merite un post a elle seule`() {
        val families = listOf(
            Facts(caption = "salut"),
            Facts(realTextObjects = 1),
            Facts(mediaCount = 1),
            Facts(hasBackgroundMedia = true),
            Facts(stickerCount = 1),
            Facts(placeCount = 1),
            Facts(strokeCount = 1),
            Facts(soundCount = 1),
            Facts(hasChosenBackground = true),
        )
        families.forEach { assertThat(deserves(it)).isTrue() }
    }

    @Test
    fun `hors legende un texte seul de la slide ne compte pas mais la matiere compte`() {
        assertThat(deserves(Facts(caption = "salut"), captioned = false)).isFalse()
        assertThat(deserves(Facts(caption = "salut", placeCount = 1), captioned = false)).isTrue()
    }

    @Test
    fun `anyDeservesAPost lit toutes les slides`() {
        assertThat(StorySlidePublishMatter.anyDeservesAPost(listOf(Facts(), Facts(soundCount = 1)))).isTrue()
        assertThat(StorySlidePublishMatter.anyDeservesAPost(listOf(Facts(), Facts()))).isFalse()
    }
}
