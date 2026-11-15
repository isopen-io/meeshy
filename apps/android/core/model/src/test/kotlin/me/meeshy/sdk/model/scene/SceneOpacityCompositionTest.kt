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
class SceneOpacityCompositionTest {

    @Test
    fun `le fondu prime sur la keyframe qui prime sur la base`() {
        assertThat(SceneOpacityComposition.compose(fade = 0.2, keyframe = 0.6, base = 1.0)).isEqualTo(0.2)
        assertThat(SceneOpacityComposition.compose(fade = null, keyframe = 0.6, base = 1.0)).isEqualTo(0.6)
        assertThat(SceneOpacityComposition.compose(fade = null, keyframe = null, base = 0.8)).isEqualTo(0.8)
    }

    @Test
    fun `une enveloppe de fondu s applique a la pose d un texte`() {
        val obj = MeeshySceneObject.Text(text("t").copy(startTime = 0.0, duration = 10.0, fadeIn = 2.0))
        assertThat(ScenePoseResolver.resolve(obj, 1.0).opacity).isWithin(1e-6).of(0.5)
        assertThat(ScenePoseResolver.resolve(obj, 5.0).opacity).isEqualTo(1.0)
    }

    @Test
    fun `sans fondu l opacite de keyframe s applique`() {
        val frames = listOf(StoryKeyframe(time = 0f, opacity = 0.0), StoryKeyframe(time = 10f, opacity = 1.0))
        val obj = MeeshySceneObject.Text(text("t").copy(keyframes = frames))
        assertThat(ScenePoseResolver.resolve(obj, 5.0).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `les transitions de clips multiplient sortante et entrante d un meme media`() {
        val m = StoryMediaObject(id = "b", startTime = 0.0, duration = 10.0)
        val transitions = listOf(
            StoryClipTransition(id = "t1", fromClipId = "a", toClipId = "b", duration = 2f),
            StoryClipTransition(id = "t2", fromClipId = "b", toClipId = "c", duration = 4f),
        )
        // t=1 : entrante a mi-course (0,5), sortante pas commencee (1) ; t=8 : sortante a mi-course (0,5).
        assertThat(ScenePoseResolver.resolve(MeeshySceneObject.Media(m), 1.0, transitions).opacity).isWithin(1e-6).of(0.5)
        assertThat(ScenePoseResolver.resolve(MeeshySceneObject.Media(m), 8.0, transitions).opacity).isWithin(1e-6).of(0.5)
        assertThat(ScenePoseResolver.resolve(MeeshySceneObject.Media(m), 5.0, transitions).opacity).isEqualTo(1.0)
    }
}
