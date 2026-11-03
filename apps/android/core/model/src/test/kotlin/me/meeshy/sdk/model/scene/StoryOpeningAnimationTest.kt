package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTransitionEffect
import org.junit.Test

/** La pose de lecture d'une slide : ouverture et fermeture de 1,2 s, et leur repli en fondu simple sous animations réduites. */
class StoryOpeningAnimationTest {

    @Test
    fun `la duree commune est de 1,2 seconde`() {
        assertThat(SceneRootTransitionPose.DURATION_SECONDS).isEqualTo(1.2)
    }

    @Test
    fun `les quatre effets partent d un etat visible different et finissent neutres`() {
        StoryTransitionEffect.entries.forEach { effect ->
            val start = SceneRootTransitionPose.poseAt(effect, null, 6.0, openingElapsed = 0.0, playbackSeconds = 0.0, reduceMotion = false)
            val end = SceneRootTransitionPose.poseAt(effect, null, 6.0, openingElapsed = 1.2, playbackSeconds = 1.2, reduceMotion = false)
            assertThat(start.isNeutral).isFalse()
            assertThat(end.isNeutral).isTrue()
        }
    }

    @Test
    fun `sous animations reduites le zoom devient un fondu simple`() {
        val pose = SceneRootTransitionPose.poseAt(StoryTransitionEffect.ZOOM, null, 6.0, openingElapsed = 0.6, playbackSeconds = 0.6, reduceMotion = true)
        assertThat(pose.opacity).isWithin(1e-9).of(0.5)
        assertThat(pose.scale).isEqualTo(1.0)
    }

    @Test
    fun `sous animations reduites le glissement et la revelation ne bougent ni ne masquent`() {
        listOf(StoryTransitionEffect.SLIDE, StoryTransitionEffect.REVEAL).forEach { effect ->
            val pose = SceneRootTransitionPose.poseAt(effect, effect, 6.0, openingElapsed = 0.3, playbackSeconds = 0.3, reduceMotion = true)
            assertThat(pose.scale).isEqualTo(1.0)
            assertThat(pose.translateXFraction).isEqualTo(0.0)
            assertThat(pose.revealCoverage).isNull()
            assertThat(pose.opacity).isWithin(1e-9).of(0.25)
        }
    }

    @Test
    fun `sous animations reduites la fermeture s efface en fondu`() {
        val pose = SceneRootTransitionPose.poseAt(null, StoryTransitionEffect.SLIDE, 6.0, openingElapsed = 9.0, playbackSeconds = 5.4, reduceMotion = true)
        assertThat(pose.opacity).isWithin(1e-9).of(0.5)
        assertThat(pose.translateXFraction).isEqualTo(0.0)
    }

    @Test
    fun `sans effet choisi les animations reduites n en inventent aucun`() {
        val pose = SceneRootTransitionPose.poseAt(null, null, 6.0, openingElapsed = 0.0, playbackSeconds = 0.0, reduceMotion = true)
        assertThat(pose.isNeutral).isTrue()
    }

    @Test
    fun `la fermeture suit la tete de lecture pendant que l ouverture suit son propre temps`() {
        val pose = SceneRootTransitionPose.poseAt(StoryTransitionEffect.FADE, StoryTransitionEffect.FADE, 6.0, openingElapsed = 0.0, playbackSeconds = 5.4, reduceMotion = false)
        assertThat(pose.opacity).isWithin(1e-9).of(0.5)
    }
}
