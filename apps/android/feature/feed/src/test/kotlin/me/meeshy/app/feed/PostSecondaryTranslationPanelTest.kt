package me.meeshy.app.feed

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le panneau secondaire du détail d'un post et la feuille de traduction : libellés lus et états des langues. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostSecondaryTranslationPanelTest {

    @get:Rule
    val compose = createComposeRule()

    private val english = PostSecondaryTranslation.of(
        post = ApiPost(
            id = "p1",
            content = "Hola",
            originalLanguage = "es",
            translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello", confidenceScore = 0.88)),
        ),
        secondaryCode = "en",
        activeCode = "es",
    )

    @Test
    fun `the panel shows the language name, its flag and the translated text, and speaks them together`() {
        compose.setContent { MeeshyTheme { PostSecondaryTranslationPanel(english) } }

        compose.onNodeWithText("Hello").assertIsDisplayed()
        compose.onNodeWithContentDescription("Translation in English: Hello").assertExists()
    }

    @Test
    fun `no secondary translation draws nothing`() {
        compose.setContent { MeeshyTheme { PostSecondaryTranslationPanel(null) } }

        compose.onNodeWithText("Hello").assertDoesNotExist()
    }
}
