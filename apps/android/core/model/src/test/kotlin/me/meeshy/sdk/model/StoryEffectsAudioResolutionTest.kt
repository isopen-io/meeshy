package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryEffectsAudioResolutionTest {
    @Test fun `le premier objet fond explicite l'emporte`() {
        val fx = StoryEffects(
            backgroundAudioId = "legacy",
            audioPlayerObjects = listOf(StoryAudioPlayerObject("a"), StoryAudioPlayerObject("b", isBackground = true)),
        )
        assertThat(fx.resolvedBackgroundAudio?.id).isEqualTo("b")
    }

    @Test fun `la synthese heritee rogne la source et ne decale pas le plan`() {
        val fx = StoryEffects(
            backgroundAudioId = "pm", backgroundAudioVolume = 0.8f,
            backgroundAudioStart = 10.0, backgroundAudioEnd = 25.0,
        )
        val bg = fx.resolvedBackgroundAudio!!
        assertThat(bg.postMediaId).isEqualTo("pm")
        assertThat(bg.volume).isEqualTo(0.8f)
        assertThat(bg.sourceStart).isEqualTo(10f)
        assertThat(bg.sourceEnd).isEqualTo(25f)
        assertThat(bg.startTime).isNull()
        assertThat(bg.duration).isEqualTo(15f)
        assertThat(bg.loop).isTrue()
        assertThat(bg.isBackground).isTrue()
    }

    @Test fun `sans bornes la synthese est inchangee volume par defaut 0,5`() {
        val bg = StoryEffects(backgroundAudioId = "pm").resolvedBackgroundAudio!!
        assertThat(bg.volume).isEqualTo(0.5f)
        assertThat(bg.sourceStart).isNull()
        assertThat(bg.duration).isNull()
    }

    @Test fun `un drapeau explicite false interdit la synthese`() {
        val fx = StoryEffects(backgroundAudioId = "pm", audioPlayerObjects = listOf(StoryAudioPlayerObject("a", isBackground = false)))
        assertThat(fx.resolvedBackgroundAudio).isNull()
        assertThat(fx.resolvedForegroundAudioPlayers.map { it.id }).containsExactly("a")
    }

    @Test fun `la regle de scene montre le premier plan en pastille et cache le fond`() {
        val fg = StoryAudioPlayerObject("a", x = 0.2, y = 0.3, scale = 1.5)
        val bg = StoryAudioPlayerObject("b", isBackground = true)
        assertThat(SceneAudioStageRule.presence(bg)).isEqualTo(SceneAudioStagePresence.OffStage)
        assertThat(SceneAudioStageRule.presence(fg))
            .isEqualTo(SceneAudioStagePresence.Chip(SceneAudioChipPose(0.2, 0.3, 1.5, 0.0)))
        assertThat(SceneAudioStageRule.stagedAudios(listOf(fg, bg)).map { it.id }).containsExactly("a")
    }
}
