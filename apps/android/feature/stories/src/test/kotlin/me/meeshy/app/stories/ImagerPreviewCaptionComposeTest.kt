package me.meeshy.app.stories

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.scene.export.ImagerOffer
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14346 — l'aperçu de la vue Imager porte la légende de la scène, comme l'export la grave ; la vue s'intitule « Imager » et
 * son bouton dit « Enregistrer », les mots d'iOS (ici en anglais : « Picture it », « Save »).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w411dp-h891dp")
class ImagerPreviewCaptionComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private fun slide(text: String) = StorySlideView(id = "s1", text = text, isTranslated = false, imageUrl = null, accentHex = "6366F1")

    private fun show(text: String) {
        compose.setContent { MeeshyTheme { ImagerSheetContent(ImagerOffer.of(22_000), preview = { ImagerScenePreview(slide(text)) }, onDecide = {}) } }
        compose.waitForIdle()
    }

    @Test
    fun `the preview carries the caption the export bakes`() {
        show("Bonjour à tous")

        compose.onNodeWithTag(STORY_EXPORT_CAPTION_TAG).assertIsDisplayed()
        compose.onNodeWithText("Bonjour à tous").assertExists()
    }

    @Test
    fun `a scene without caption previews none`() {
        show("  ")

        compose.onNodeWithTag(STORY_EXPORT_CAPTION_TAG).assertDoesNotExist()
    }

    @Test
    fun `the view is titled with the menu word and saves with the export verb`() {
        show("")

        compose.onNodeWithText("Picture it").assertExists()
        compose.onNodeWithText("Save").assertExists()
        compose.onNodeWithText("Share").assertExists()
    }
}
