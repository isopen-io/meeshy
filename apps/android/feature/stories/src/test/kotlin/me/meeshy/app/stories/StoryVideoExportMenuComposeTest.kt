package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.ImagerDecision
import me.meeshy.sdk.model.scene.export.ImagerOffer
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le menu ⋮ du lecteur offre les trois sorties vidéo d'une story (#13872) ; « Imager » ouvre sa vue (#14326) : au-delà d'une
 * minute chaque quart avec la durée qu'il rend, puis Enregistrer ou Partager depuis elle ; la fermer arrête l'export.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w411dp-h891dp")
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

    @Test fun `la vue imager d une story de quatre minutes montre les quarts, le tout preselectionne, puis enregistre la part choisie`() {
        val decided = mutableListOf<ImagerDecision?>()
        compose.setContent { MeeshyTheme { ImagerSheetContent(ImagerOffer.of(240_000), preview = {}, onDecide = { decided += it }) } }
        compose.onNodeWithText("Imager").assertExists()
        compose.onNodeWithText("Quelle durée imager ?").assertExists()
        listOf("1/4 · 1:00", "2/4 · 2:00", "3/4 · 3:00", "4/4 · 4:00").forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("4/4 · 4:00").assertIsSelected()
        compose.onNodeWithText("2/4 · 2:00").performClick()
        compose.onNodeWithText("2/4 · 2:00").assertIsSelected()
        compose.onNodeWithText("Enregistrer").performClick()
        assertThat(decided).containsExactly(ImagerDecision(SceneExportDestination.GALLERY, ImagerQuarter.TWO))
    }

    @Test fun `la vue imager d une composition courte ne propose aucun quart et partage le tout`() {
        val decided = mutableListOf<ImagerDecision?>()
        compose.setContent { MeeshyTheme { ImagerSheetContent(ImagerOffer.of(22_000), preview = {}, onDecide = { decided += it }) } }
        compose.onNodeWithText("Quelle durée imager ?").assertDoesNotExist()
        compose.onNodeWithText("Partager").performClick()
        assertThat(decided).containsExactly(ImagerDecision(SceneExportDestination.SHARE, null))
    }

    @Test fun `tant que la composition se prepare, enregistrer et partager attendent, fermer renonce`() {
        val decided = mutableListOf<ImagerDecision?>()
        compose.setContent { MeeshyTheme { ImagerSheetContent(offer = null, preview = {}, onDecide = { decided += it }) } }
        compose.onNodeWithText("Préparation de la composition…").assertExists()
        compose.onNodeWithText("Enregistrer").assertIsNotEnabled()
        compose.onNodeWithText("Partager").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Fermer").performClick()
        assertThat(decided).containsExactly(null)
    }
}
