package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * #13897 — recette S8 (Android 9) du 2026-10-31 : l'export d'un brouillon à vidéo posée s'arrêtait sur « les calques de la
 * scène 1 ne se sont pas peints », un `NullPointerException` dans `LayoutNodeDrawScope.drawContent`. Sur cet appareil, le
 * calque graphique est une vue (`GraphicsViewLayer`) : quand il n'a pas pu s'enregistrer pendant le passage de dessin,
 * `toImageBitmap` REJOUE son bloc, hors de tout passage, et `drawContent` n'a plus de nœud à peindre. Le bloc ne peint donc
 * qu'en passage ; rejoué hors passage, il ne peint rien et le dit, et la capture redemande un passage avant de relire.
 */
class StoryExportLayerRecordingTest {

    private class Layer(private val recording: StoryExportLayerRecording, private val outsidePasses: Int) {
        var replays = 0
        var painted = 0

        fun capture(): String {
            if (replays < outsidePasses) {
                replays++
                recording.record { painted++ }
                return "vide"
            }
            return "scène"
        }

        fun pass() = recording.pass { recording.record { painted++ } }
    }

    @Test
    fun `en passage de dessin le bloc peint`() {
        val recording = StoryExportLayerRecording()
        val layer = Layer(recording, outsidePasses = 0)

        layer.pass()

        assertThat(layer.painted).isEqualTo(1)
        assertThat(recording.replayed).isFalse()
    }

    @Test
    fun `rejoue hors passage le bloc ne peint rien et le dit`() {
        val recording = StoryExportLayerRecording()
        var painted = 0

        recording.record { painted++ }

        assertThat(painted).isEqualTo(0)
        assertThat(recording.replayed).isTrue()
    }

    @Test
    fun `une capture rejouee redemande un passage puis relit la scene`() = runTest {
        val recording = StoryExportLayerRecording()
        val layer = Layer(recording, outsidePasses = 1)
        var redraws = 0

        val captured = recording.capture(capture = layer::capture, redraw = { redraws++; layer.pass() })

        assertThat(captured).isEqualTo("scène")
        assertThat(redraws).isEqualTo(1)
        assertThat(layer.painted).isEqualTo(1)
    }

    @Test
    fun `un calque qui se rejoue toujours fait echouer la peinture plutot que de rendre une image vide`() = runTest {
        val recording = StoryExportLayerRecording()
        val layer = Layer(recording, outsidePasses = Int.MAX_VALUE)

        val failure = runCatching { recording.capture(capture = layer::capture, redraw = { layer.pass() }) }.exceptionOrNull()

        assertThat(failure).isInstanceOf(IllegalStateException::class.java)
        assertThat(failure).hasMessageThat().contains("hors de son passage de dessin")
        assertThat(layer.replays).isEqualTo(StoryExportLayerRecording.ATTEMPTS)
    }
}
