package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryExportInputsTest {
    private val base = "https://gate.meeshy.me"
    private fun resolve(raw: String?, exists: Boolean = true, inputs: StoryExportInputs = StoryExportInputs.None, key: String = "k") =
        inputs.resolveVisual(key, raw, base) { exists }

    @Test fun `url absolue reste telle quelle`() {
        assertThat(resolve("https://cdn.meeshy.me/a.png")).isEqualTo(StoryExportVisualSource.Remote("https://cdn.meeshy.me/a.png"))
    }

    @Test fun `chemin relatif complete par la base serveur`() {
        assertThat(resolve("/api/v1/attachments/x.png"))
            .isEqualTo(StoryExportVisualSource.Remote("https://gate.meeshy.me/api/v1/attachments/x.png"))
    }

    @Test fun `chemin relatif sans base est irresoluble`() {
        val r = StoryExportInputs.None.resolveVisual("k", "/api/v1/attachments/x.png", null) { true }
        assertThat(r).isEqualTo(StoryExportVisualSource.Unresolvable)
    }

    @Test fun `file present est local`() {
        assertThat(resolve("file:///data/a.png")).isEqualTo(StoryExportVisualSource.Local("/data/a.png"))
    }

    @Test fun `file absent est irresoluble`() {
        assertThat(resolve("file:///data/a.png", exists = false)).isEqualTo(StoryExportVisualSource.Unresolvable)
    }

    @Test fun `image en memoire prime sur son adresse`() {
        val inputs = StoryExportInputs(inMemoryImageKeys = setOf("k"))
        assertThat(resolve("https://cdn.meeshy.me/a.png", inputs = inputs)).isEqualTo(StoryExportVisualSource.InMemory("k"))
    }

    @Test fun `vide ou schema inconnu est irresoluble`() {
        assertThat(resolve(null)).isEqualTo(StoryExportVisualSource.Unresolvable)
        assertThat(resolve("  ")).isEqualTo(StoryExportVisualSource.Unresolvable)
        assertThat(resolve("javascript:alert(1)")).isEqualTo(StoryExportVisualSource.Unresolvable)
    }

    @Test fun `fichier audio de session prime`() {
        val inputs = StoryExportInputs(audioFiles = mapOf("a1" to "/cache/a1.m4a"))
        assertThat(inputs.audioFile("a1")).isEqualTo("/cache/a1.m4a")
        assertThat(inputs.audioFile("zz")).isNull()
    }

    @Test fun `erreurs typees distinctes`() {
        val errors = listOf(
            StoryExportError.NoBackgroundVideo, StoryExportError.InvalidMediaUrl,
            StoryExportError.BackgroundVideoTrackMissing, StoryExportError.SessionCreationFailed,
            StoryExportError.ExportFailed("x"), StoryExportError.ExportCancelled,
            StoryExportError.SyntheticAssetGenerationFailed("y"),
        )
        assertThat(errors.toSet()).hasSize(7)
    }
}
