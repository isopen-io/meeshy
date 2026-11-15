package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w411dp-h891dp")
class StoryVideoExportMenuComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test fun `le menu offre enregistrer et partager dans leur mode, imager ouvre l atelier de carte`() {
        val picked = mutableListOf<StoryExportMode>()
        var imaged = 0
        compose.setContent { MeeshyTheme { Column { StoryVideoExportMenuEntries(onPick = { picked += it }, onImager = { imaged++ }) } } }
        compose.onNodeWithText("Enregistrer la vidéo").performClick()
        compose.onNodeWithText("Partager la vidéo").performClick()
        compose.onNodeWithText("Imager").performClick()
        assertThat(picked).containsExactly(StoryExportMode.SAVE, StoryExportMode.SHARE).inOrder()
        assertThat(imaged).isEqualTo(1)
    }

    @Test fun `sans atelier de carte le menu n offre pas imager`() {
        compose.setContent { MeeshyTheme { Column { StoryVideoExportMenuEntries(onPick = {}) } } }
        compose.onNodeWithText("Imager").assertDoesNotExist()
    }
}
