package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerSlideRailLawTest {
    @Test
    fun `the rail stands as soon as a scene exists, a lone scene counting only once it is mounted`() {
        assertThat(ComposerHeaderTiles.showsRail(sceneCount = 0, scenePresent = false)).isFalse()
        assertThat(ComposerHeaderTiles.showsRail(sceneCount = 1, scenePresent = false)).isFalse()
        assertThat(ComposerHeaderTiles.showsRail(sceneCount = 1, scenePresent = true)).isTrue()
        assertThat(ComposerHeaderTiles.showsRail(sceneCount = 2, scenePresent = false)).isTrue()
    }

    @Test
    fun `a lone tile is a preview, not a button - tiles navigate from two scenes`() {
        assertThat(ComposerHeaderTiles.tilesNavigate(1)).isFalse()
        assertThat(ComposerHeaderTiles.tilesNavigate(2)).isTrue()
    }

    @Test
    fun `the bin sits on the current tile only, and never under two scenes`() {
        assertThat(ComposerHeaderTiles.showsDelete(sceneIndex = 1, currentIndex = 1, sceneCount = 3)).isTrue()
        assertThat(ComposerHeaderTiles.showsDelete(sceneIndex = 0, currentIndex = 1, sceneCount = 3)).isFalse()
        assertThat(ComposerHeaderTiles.showsDelete(sceneIndex = 0, currentIndex = 0, sceneCount = 1)).isFalse()
    }

    @Test
    fun `adding a scene is refused out loud at the cap, never silent`() {
        assertThat(ComposerSceneAddition.outcome(canAddSlide = true)).isEqualTo(ComposerSceneAddition.ADDED)
        assertThat(ComposerSceneAddition.outcome(canAddSlide = false)).isEqualTo(ComposerSceneAddition.REFUSED_AT_CAP)
    }

    @Test
    fun `removing a scene asks first only when it holds something`() {
        assertThat(ComposerSlideDeletion.needsConfirmation(holdsMatter = true)).isTrue()
        assertThat(ComposerSlideDeletion.needsConfirmation(holdsMatter = false)).isFalse()
    }

    @Test
    fun `a drag ticks once per slot crossed and not before`() {
        assertThat(ComposerSlideDrag.ticks(previousTarget = 1, target = 1)).isFalse()
        assertThat(ComposerSlideDrag.ticks(previousTarget = 1, target = 2)).isTrue()
    }
}
