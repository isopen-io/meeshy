package me.meeshy.app.contacts.circles

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Les cercles sont propres à Meeshy : une phrase dit ce qu'ils règlent, visible au repos, sans (i) à ouvrir (#18083, règle 7). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CirclesIntroTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the circles say at rest what a circle sets`() {
        compose.setContent { MeeshyTheme { CirclesIntro() } }

        compose.onNodeWithText("Each person’s circle sets what you share with them.").assertIsDisplayed()
    }
}
