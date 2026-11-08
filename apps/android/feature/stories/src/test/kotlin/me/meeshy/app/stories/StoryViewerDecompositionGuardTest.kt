package me.meeshy.app.stories

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Le lecteur de stories est un hôte mince plus des fichiers emplacement à propriétaire unique : un lot qui
 * ajoute une fonction crée ou étend SON fichier, il ne regonfle pas l'hôte (lot story-viewer-decomposition-and-nav-graph).
 */
class StoryViewerDecompositionGuardTest {

    private val dir = File("src/main/kotlin/me/meeshy/app/stories")

    private val slotFiles = listOf(
        "StoryViewerShell.kt",
        "StoryViewerCanvas.kt",
        "StoryViewerTopBar.kt",
        "StoryProgressBars.kt",
        "StoryRailOverlays.kt",
        "StoryViewerSheetsHost.kt",
        "StoryGestureLayer.kt",
        "StoryPlaybackDriver.kt",
        "StoryCommentsOverlayHost.kt",
    )

    @Test
    fun `l hote du lecteur reste sous 250 lignes`() {
        val lines = File(dir, "StoryViewerScreen.kt").readLines().size

        assertWithMessage("StoryViewerScreen.kt : $lines lignes").that(lines).isLessThan(250)
    }

    @Test
    fun `chaque fichier emplacement nomme son lot proprietaire dans sa KDoc`() {
        val missing = slotFiles.filterNot { name ->
            val file = File(dir, name)
            file.exists() && file.readText().contains("Propriétaire :")
        }

        assertWithMessage("fichiers sans KDoc de propriétaire : $missing").that(missing).isEmpty()
    }

    @Test
    fun `l etat du lecteur ne grossit plus, chaque lot expose son controleur`() {
        val models = File(dir, "StoryViewerModels.kt").readText()

        assertWithMessage("la règle d'extension doit être écrite sur StoryViewerUiState")
            .that(models).contains("RÈGLE D'EXTENSION")
    }

    @Test
    fun `aucun fichier emplacement ne depasse le budget de 1000 lignes`() {
        val oversized = slotFiles.filter { File(dir, it).exists() && File(dir, it).readLines().size > 1000 }

        assertWithMessage("fichiers hors budget : $oversized").that(oversized).isEmpty()
    }
}
