package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScenePreviewPolicyTest {
    @Test
    fun `l apercu de frise rend la semantique lecture sans quitter l edition`() {
        assertThat(ScenePreviewPolicy.renderMode(editing = true, previewActive = true)).isEqualTo(SceneRenderMode.PLAY)
        assertThat(ScenePreviewPolicy.renderMode(editing = true, previewActive = false)).isEqualTo(SceneRenderMode.EDIT)
        assertThat(ScenePreviewPolicy.renderMode(editing = false, previewActive = false)).isEqualTo(SceneRenderMode.PLAY)
    }

    @Test
    fun `les lecteurs du canvas sont muets pendant l apercu`() {
        assertThat(ScenePreviewPolicy.audioMuted(authorMuted = false, previewActive = true)).isTrue()
        assertThat(ScenePreviewPolicy.audioMuted(authorMuted = false, previewActive = false)).isFalse()
        assertThat(ScenePreviewPolicy.audioMuted(authorMuted = true, previewActive = false)).isTrue()
    }

    @Test
    fun `hors fenetre un objet est fantome a l arret et cache en lecture`() {
        assertThat(ScenePreviewPolicy.objectOpacity(true, playing = false, seconds = 5.0, startSeconds = 1.0, endSeconds = 3.0)).isEqualTo(0.25)
        assertThat(ScenePreviewPolicy.objectOpacity(true, playing = true, seconds = 5.0, startSeconds = 1.0, endSeconds = 3.0)).isEqualTo(0.0)
        assertThat(ScenePreviewPolicy.objectOpacity(true, playing = true, seconds = 2.0, startSeconds = 1.0, endSeconds = 3.0)).isEqualTo(1.0)
        assertThat(ScenePreviewPolicy.objectOpacity(true, playing = false, seconds = 0.5, startSeconds = 1.0, endSeconds = null)).isEqualTo(0.25)
        assertThat(ScenePreviewPolicy.objectOpacity(false, playing = false, seconds = 9.0, startSeconds = 1.0, endSeconds = 3.0)).isEqualTo(1.0)
    }

    @Test
    fun `les videos sont calees par seek tolerant puis relancees une fois sans re seek`() {
        assertThat(ScenePreviewPolicy.videoCommand(playing = false, wasPlaying = false, playheadMs = 1500))
            .isEqualTo(PreviewVideoCommand.SeekTolerant(1500))
        assertThat(ScenePreviewPolicy.videoCommand(playing = true, wasPlaying = false, playheadMs = 1500))
            .isEqualTo(PreviewVideoCommand.RestartAligned(1500))
        assertThat(ScenePreviewPolicy.videoCommand(playing = true, wasPlaying = true, playheadMs = 1600))
            .isEqualTo(PreviewVideoCommand.None)
    }
}
