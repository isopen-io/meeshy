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
class SceneItemSignatureTest {

    private fun sig(
        t: StoryTextObject = text("t").copy(startTime = 0.0, duration = 10.0),
        time: Double = 1.0,
        langs: List<String> = listOf("fr"),
    ) = SceneRenderPlanner.plan(SceneLists(texts = listOf(t)), time, SceneRenderMode.PLAY, SceneReaderLanguages(langs)).single().signature

    @Test
    fun `la signature est stable tant que rien ne change`() {
        assertThat(sig()).isEqualTo(sig())
    }

    @Test
    fun `elle change quand la pose interpolee change`() {
        val frames = listOf(StoryKeyframe(time = 0f, x = 0.0), StoryKeyframe(time = 10f, x = 1.0))
        val t = text("t").copy(startTime = 0.0, duration = 10.0, keyframes = frames)
        assertThat(sig(t, time = 1.0)).isNotEqualTo(sig(t, time = 2.0))
    }

    @Test
    fun `elle change avec les langues le contenu et la presence`() {
        val base = sig()
        assertThat(sig(langs = listOf("en"))).isNotEqualTo(base)
        assertThat(sig(t = text("t").copy(text = "autre", startTime = 0.0, duration = 10.0))).isNotEqualTo(base)
        val ghost = SceneRenderPlanner.plan(
            SceneLists(texts = listOf(text("t").copy(startTime = 0.0, duration = 10.0))), 20.0,
            SceneRenderMode.PLAY, SceneReaderLanguages(listOf("fr")), ghostOpacity = SCENE_GHOST_OPACITY,
        ).single().signature
        assertThat(ghost).isNotEqualTo(base)
    }
}
