package me.meeshy.ui.story.canvas

import androidx.compose.ui.Modifier
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.PreviewVideoCommand
import me.meeshy.sdk.model.scene.SceneRenderMode
import me.meeshy.sdk.model.scene.SceneRootPose
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneTimelineBridgeRobolectricTest {

    private fun scrubbed(seconds: Double = 2.0) = SceneTimelineBridge().also { it.scrub(seconds) }

    @Test
    fun `sans aperçu le canvas reste en édition et rien n est muet`() {
        val bridge = SceneTimelineBridge()
        assertThat(bridge.isActive).isFalse()
        assertThat(bridge.renderMode).isEqualTo(SceneRenderMode.EDIT)
        assertThat(bridge.audioMuted(authorMuted = false)).isFalse()
        assertThat(bridge.objectOpacity(1.0, 2.0)).isEqualTo(1.0)
    }

    @Test
    fun `le scrub entre en aperçu rend la sémantique lecture et mute les players`() {
        val bridge = scrubbed(5.0)
        assertThat(bridge.previewSeconds).isEqualTo(5.0)
        assertThat(bridge.renderMode).isEqualTo(SceneRenderMode.PLAY)
        assertThat(bridge.audioMuted(authorMuted = false)).isTrue()
        assertThat(bridge.objectOpacity(1.0, 3.0)).isEqualTo(0.25)
    }

    @Test
    fun `la lecture cache ce qui est hors fenêtre et le scrub seek de façon tolérante`() {
        val bridge = scrubbed(5.0)
        assertThat(bridge.videoCommand(5000)).isEqualTo(PreviewVideoCommand.SeekTolerant(5000))
        bridge.setPlaying(true)
        assertThat(bridge.objectOpacity(1.0, 3.0)).isEqualTo(0.0)
        assertThat(bridge.videoCommand(5000)).isEqualTo(PreviewVideoCommand.RestartAligned(5000))
        bridge.scrub(5.1)
        assertThat(bridge.videoCommand(5100)).isEqualTo(PreviewVideoCommand.None)
    }

    @Test
    fun `la fin rend le canvas à l édition`() {
        val bridge = scrubbed()
        bridge.setPlaying(true)
        bridge.end()
        assertThat(bridge.isActive).isFalse()
        assertThat(bridge.playing).isFalse()
        assertThat(bridge.renderMode).isEqualTo(SceneRenderMode.EDIT)
        assertThat(bridge.audioMuted(authorMuted = false)).isFalse()
    }

    @Test
    fun `jouer sans aperçu actif ne change rien`() {
        val bridge = SceneTimelineBridge()
        bridge.setPlaying(true)
        assertThat(bridge.playing).isFalse()
    }

    @Test
    fun `la tête ne devient jamais négative`() {
        assertThat(scrubbed(-3.0).previewSeconds).isEqualTo(0.0)
    }

    @Test
    fun `la couche de pose construit un modificateur`() {
        assertThat(Modifier.sceneRootPoseLayer { SceneRootPose.NEUTRAL }).isNotSameInstanceAs(Modifier)
    }
}
