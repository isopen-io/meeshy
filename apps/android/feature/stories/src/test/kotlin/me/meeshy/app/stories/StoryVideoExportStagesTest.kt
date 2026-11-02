package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.ImagerDecision
import me.meeshy.sdk.model.scene.export.ImagerOffer
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test

class StoryVideoExportStagesTest {

    private val offer = ImagerOffer.of(240_000)
    private val decision = ImagerDecision(SceneExportDestination.SHARE, ImagerQuarter.THREE)

    private fun request() = StoryExportPaintRequest(
        slide = StorySlideView(id = "s", text = "", isTranslated = false, imageUrl = null, accentHex = "112233"),
        effects = null,
        durationMillis = 6_000,
        frames = emptyList(),
        withBackground = true,
        directory = File("."),
        format = StoryExportVideoFormat.of(),
    )

    @Test fun `imager ouvre la vue des le geste, avant que la composition soit mesuree`() {
        val stages = StoryVideoExportStages()
        stages.openImager()
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Imagining(offer = null))
    }

    @Test fun `la vue imager recoit l offre mesuree, attend sa decision puis revient au repos`() = runTest {
        val stages = StoryVideoExportStages()
        stages.openImager()
        val asked = async { stages.askImager(offer) }
        runCurrent()
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Imagining(offer))
        stages.answerImager(decision)
        assertThat(asked.await()).isEqualTo(decision)
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Idle)
    }

    @Test fun `fermer la vue imager rend une decision vide`() = runTest {
        val stages = StoryVideoExportStages()
        stages.openImager()
        val asked = async { stages.askImager(offer) }
        runCurrent()
        stages.answerImager(null)
        assertThat(asked.await()).isNull()
    }

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
        stages.openImager()
        val asked = async { runCatching { stages.askImager(offer) } }
        runCurrent()
        stages.reset()
        assertThat(asked.await().isFailure).isTrue()
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Idle)
    }

    @Test fun `une reponse sans etape ouverte ne fait rien`() {
        val stages = StoryVideoExportStages()
        stages.answerImager(decision)
        stages.answerPaint(null)
        assertThat(stages.stage.value).isEqualTo(StoryVideoExportStage.Idle)
    }

    @Test fun `enregistrer va a la photothèque, partager a la feuille de partage, imager part vers la galerie jusqu a la decision de sa vue`() {
        assertThat(StoryExportMode.SAVE.destination).isEqualTo(SceneExportDestination.GALLERY)
        assertThat(StoryExportMode.IMAGER.destination).isEqualTo(SceneExportDestination.GALLERY)
        assertThat(StoryExportMode.SHARE.destination).isEqualTo(SceneExportDestination.SHARE)
    }

    @Test fun `une duree se lit en minutes et secondes`() {
        assertThat(StoryVideoExportStages.clock(45_000)).isEqualTo("0:45")
        assertThat(StoryVideoExportStages.clock(120_000)).isEqualTo("2:00")
        assertThat(StoryVideoExportStages.clock(3_725_400)).isEqualTo("62:05")
    }
}
