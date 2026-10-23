package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneKeyframeBaseHoldTest {

    private fun kf(time: Float, x: Double? = null, scale: Double? = null, opacity: Double? = null, easing: StoryEasing? = null) =
        StoryKeyframe(time = time, x = x, scale = scale, opacity = opacity, easing = easing)

    @Test
    fun `chaque canal tient sa base avant sa premiere keyframe`() {
        val frames = listOf(kf(2f, x = 0.9, opacity = 0.0), kf(4f, x = 0.1, opacity = 1.0), kf(3f, scale = 2.0))
        val r = StoryKeyframeResolver.resolve(frames, currentTime = 1f, baseX = 0.3, baseY = 0.4, baseScale = 1.0, baseOpacity = 0.7)
        assertThat(r).isNull()
        val atTwo = StoryKeyframeResolver.resolve(frames, currentTime = 2f, baseX = 0.3, baseScale = 1.5)!!
        assertThat(atTwo.x).isWithin(1e-6).of(0.9)
        assertThat(atTwo.scale).isEqualTo(1.5)
    }

    @Test
    fun `l objet ne saute pas a la valeur keyframee au debut du clip`() {
        val frames = listOf(kf(2f, x = 0.9), kf(4f, x = 0.1))
        val start = StoryKeyframeResolver.resolve(frames, currentTime = 5f, startTime = 5f, baseX = 0.3)
        assertThat(start).isNull()
        val pose = ScenePoseResolver.resolve(MeeshySceneObject.Text(text("t", x = 0.3).copy(startTime = 5.0, keyframes = frames)), 5.0)
        assertThat(pose.x).isEqualTo(0.3)
    }

    @Test
    fun `l easing du segment suivant s applique apres la premiere keyframe`() {
        val frames = listOf(kf(0f, x = 0.0, easing = StoryEasing.EASE_IN), kf(10f, x = 1.0))
        val r = StoryKeyframeResolver.resolve(frames, currentTime = 5f)!!
        assertThat(r.x).isWithin(1e-4).of(0.25)
    }
}
