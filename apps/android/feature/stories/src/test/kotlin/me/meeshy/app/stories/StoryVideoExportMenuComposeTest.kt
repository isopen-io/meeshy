package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.export.ImagerLength
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le menu ⋮ du lecteur offre les trois sorties vidéo d'une story (#13872) ; au-delà d'une minute, Imager montre chaque
 * quart avec la durée qu'il rend, et renoncer arrête l'export.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class StoryVideoExportMenuComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test fun `le menu offre enregistrer, partager et imager, chacun dans son mode`() {
        val picked = mutableListOf<StoryExportMode>()
        compose.setContent { MeeshyTheme { Column { StoryVideoExportMenuEntries(onPick = { picked += it }) } } }
        compose.onNodeWithText("Enregistrer la vidéo").performClick()
        compose.onNodeWithText("Partager la vidéo").performClick()
        compose.onNodeWithText("Imager").performClick()
        assertThat(picked).containsExactly(StoryExportMode.SAVE, StoryExportMode.SHARE, StoryExportMode.IMAGER).inOrder()
    }

    @Test fun `imager une story de quatre minutes montre les quatre quarts et leur duree`() {
        val chosen = mutableListOf<ImagerQuarter?>()
        compose.setContent { MeeshyTheme { ImagerLengthDialog(ImagerLength.choices(240_000), onChoose = { chosen += it }) } }
        compose.onNodeWithText("Quelle durée imager ?").assertExists()
        listOf("1/4 · 1:00", "2/4 · 2:00", "3/4 · 3:00", "4/4 · 4:00").forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("2/4 · 2:00").performClick()
        compose.onNodeWithText("Annuler").performClick()
        assertThat(chosen).containsExactly(ImagerQuarter.TWO, null).inOrder()
    }
}
