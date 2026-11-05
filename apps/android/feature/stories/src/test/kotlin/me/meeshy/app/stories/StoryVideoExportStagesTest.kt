package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test

class StoryVideoExportStagesTest {

    private fun request() = StoryExportPaintRequest(
        slide = StorySlideView(id = "s", text = "", isTranslated = false, imageUrl = null, accentHex = "112233"),
        effects = null,
        durationMillis = 6_000,
        frames = emptyList(),
        withBackground = true,
        directory = File("."),
        format = StoryExportVideoFormat.of(),
    )

    @Test fun `la peinture rend les calques que l ecran a ecrits`() = runTest {
        val stages = StoryVideoExportStages()
        val request = request()
        val painted = async { stages.askPaint(request) }
        runCurrent()
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Painting(request))
        stages.answerPaint(listOf(File("a.png")))
        assertThat(painted.await()).containsExactly(File("a.png"))
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Idle)
    }

    @Test fun `annuler pendant une etape la libere et rend le repos`() = runTest {
        val stages = StoryVideoExportStages()
        val asked = async { runCatching { stages.askPaint(request()) } }
        runCurrent()
        stages.reset()
        assertThat(asked.await().isFailure).isTrue()
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Idle)
    }

    @Test fun `une reponse sans etape ouverte ne fait rien`() {
        val stages = StoryVideoExportStages()
        stages.answerPaint(null)
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Idle)
    }

    @Test fun `enregistrer va a la phototheque, partager a la feuille de partage, la carte recoit le fichier rendu`() {
        assertThat(StoryExportMode.SAVE.destination).isEqualTo(SceneExportDestination.GALLERY)
        assertThat(StoryExportMode.SHARE.destination).isEqualTo(SceneExportDestination.SHARE)
        assertThat(StoryExportMode.CARD.destination).isEqualTo(SceneExportDestination.SHARE)
    }

}
}
