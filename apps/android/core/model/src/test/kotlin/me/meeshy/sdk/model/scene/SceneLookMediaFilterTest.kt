package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class SceneLookMediaFilterTest {
    private fun media(filter: String?, background: Boolean = false) =
        StoryMediaObject(id = "m", mediaURL = "u", isBackground = background, filter = filter)

    @Test
    fun `le look d un media est son filtre seul a pleine force`() {
        val recipe = SceneLookRecipe.forMedia(media("bw"))
        assertThat(recipe.filterMatrix).isEqualTo(StoryFilterMatrix.effectiveMatrix(StoryFilter.BW, 1f))
    }

    @Test
    fun `un media sans filtre ou au filtre inconnu reste neutre`() {
        assertThat(SceneLookRecipe.forMedia(media(null)).isNeutral).isTrue()
        assertThat(SceneLookRecipe.forMedia(media("inconnu")).isNeutral).isTrue()
    }

    @Test
    fun `le filtre d un media premier plan ne colore pas le fond de la scene`() {
        val effects = StoryEffects(mediaObjects = listOf(media("bw")))
        assertThat(SceneLookRecipe.forEffects(effects).isNeutral).isTrue()
    }

    @Test
    fun `un filtre de scene existant reste un filtre de scene`() {
        val effects = StoryEffects(filter = "warm", filterIntensity = 0.5, mediaObjects = listOf(media(null, background = true)))
        assertThat(SceneLookRecipe.forEffects(effects).filterMatrix)
            .isEqualTo(StoryFilterMatrix.effectiveMatrix(StoryFilter.WARM, 0.5f))
    }

    @Test
    fun `le fond ignore un filtre d objet, comme le lecteur iOS qui ne peint que celui de la slide`() {
        val effects = StoryEffects(filter = "warm", filterIntensity = 1.0, mediaObjects = listOf(media("bw", background = true)))
        assertThat(SceneLookRecipe.forEffects(effects).filterMatrix)
            .isEqualTo(StoryFilterMatrix.effectiveMatrix(StoryFilter.WARM, 1f))
    }
}
