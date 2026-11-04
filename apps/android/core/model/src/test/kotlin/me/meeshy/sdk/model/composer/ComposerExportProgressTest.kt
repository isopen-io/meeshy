package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportPhase
import me.meeshy.sdk.model.composer.scene.SceneExportState
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ComposerExportProgressTest {

    @Test
    fun `aucun voile hors d'un bake`() {
        assertThat(ComposerExportProgress.of(SceneExportState.Idle)).isNull()
        assertThat(ComposerExportProgress.of(SceneExportState.Saved)).isNull()
        assertThat(ComposerExportProgress.of(SceneExportState.Failed)).isNull()
    }

    @Test
    fun `le rendu dit son pourcentage arrondi et borne`() {
        val rendering = { f: Float -> ComposerExportProgress.of(SceneExportState.Running(f, SceneExportDestination.SHARE)) }
        assertThat(rendering(0.426f)).isEqualTo(ComposerExportProgress.Rendering(43))
        assertThat(rendering(7f)!!.percent).isEqualTo(100)
        assertThat(rendering(-1f)!!.percent).isEqualTo(0)
        assertThat(rendering(0.2f)!!.cancelable).isTrue()
    }

    @Test
    fun `la relecture du fichier est un temps a part`() {
        val state = SceneExportState.Running(1f, SceneExportDestination.GALLERY, SceneExportPhase.VERIFYING)
        assertThat(ComposerExportProgress.of(state)).isEqualTo(ComposerExportProgress.Verifying)
    }
}
