package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneExportStateTest {

    @Test
    fun `un export demarre a zero depuis le repos`() {
        val next = SceneExportReducer.start(SceneExportState.Idle, SceneExportDestination.GALLERY)
        assertThat(next).isEqualTo(SceneExportState.Running(0f, SceneExportDestination.GALLERY))
        assertThat(next.isExporting).isTrue()
    }

    @Test
    fun `un second export est IGNORE pendant un bake, jamais mis en file`() {
        val running = SceneExportState.Running(0.4f, SceneExportDestination.SHARE)
        assertThat(SceneExportReducer.start(running, SceneExportDestination.GALLERY)).isSameInstanceAs(running)
    }

    @Test
    fun `la progression est bornee et ne recule jamais`() {
        var s: SceneExportState = SceneExportReducer.start(SceneExportState.Idle, SceneExportDestination.SHARE)
        s = SceneExportReducer.progress(s, 0.5f)
        s = SceneExportReducer.progress(s, 0.3f)
        assertThat((s as SceneExportState.Running).fraction).isEqualTo(0.5f)
        s = SceneExportReducer.progress(s, 7f)
        assertThat((s as SceneExportState.Running).fraction).isEqualTo(1f)
        assertThat(SceneExportReducer.progress(SceneExportState.Running(0.1f, SceneExportDestination.SHARE), Float.NaN))
            .isEqualTo(SceneExportState.Running(0.1f, SceneExportDestination.SHARE))
    }

    @Test
    fun `une progression tardive ne ressuscite pas un export repose`() {
        assertThat(SceneExportReducer.progress(SceneExportState.Idle, 0.9f)).isEqualTo(SceneExportState.Idle)
    }

    @Test
    fun `la fin porte le fichier et sa destination, l echec libere l ecran`() {
        val running = SceneExportState.Running(0.9f, SceneExportDestination.SHARE)
        assertThat(SceneExportReducer.completed(running, "/tmp/a.mp4"))
            .isEqualTo(SceneExportState.Ready("/tmp/a.mp4", SceneExportDestination.SHARE))
        assertThat(SceneExportReducer.failed(running)).isEqualTo(SceneExportState.Failed)
        assertThat(SceneExportReducer.completed(SceneExportState.Idle, "/tmp/a.mp4")).isEqualTo(SceneExportState.Idle)
    }

    @Test
    fun `annuler pendant le bake rend le repos et un fichier pret est a effacer`() {
        assertThat(SceneExportReducer.cancel(SceneExportState.Running(0.5f, SceneExportDestination.GALLERY)))
            .isEqualTo(SceneExportState.Idle)
        val ready = SceneExportState.Ready("/tmp/b.mp4", SceneExportDestination.SHARE)
        assertThat(SceneExportReducer.cancel(ready)).isEqualTo(SceneExportState.Idle)
        assertThat(SceneExportReducer.leftoverFile(ready)).isEqualTo("/tmp/b.mp4")
        assertThat(SceneExportReducer.leftoverFile(SceneExportState.Idle)).isNull()
    }

    @Test
    fun `le voile ne se montre que pendant le bake`() {
        assertThat(SceneExportState.Idle.veilFraction).isNull()
        assertThat(SceneExportState.Running(0.25f, SceneExportDestination.SHARE).veilFraction).isEqualTo(0.25f)
        assertThat(SceneExportState.Ready("x", SceneExportDestination.SHARE).veilFraction).isNull()
    }

    @Test
    fun `la sauvegarde en galerie se dit puis l ecran rend le repos`() {
        val running = SceneExportState.Running(1f, SceneExportDestination.GALLERY)
        val saved = SceneExportReducer.saved(running)
        assertThat(saved).isEqualTo(SceneExportState.Saved)
        assertThat(SceneExportReducer.acknowledged(saved)).isEqualTo(SceneExportState.Idle)
        assertThat(SceneExportReducer.acknowledged(SceneExportState.Failed)).isEqualTo(SceneExportState.Idle)
        assertThat(SceneExportReducer.acknowledged(running)).isSameInstanceAs(running)
        assertThat(SceneExportReducer.saved(SceneExportState.Idle)).isEqualTo(SceneExportState.Idle)
    }
}
