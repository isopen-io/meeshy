package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.UnitCenter
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CircularRevealMaskTest {
    @get:Rule
    val rule = createComposeRule()

    private fun host(progress: Float, reduceMotion: Boolean) = rule.setContent {
        CircularRevealMask(progress = { progress }, center = UnitCenter(0.1f, 0.8f), reduceMotion = reduceMotion) {
            Box(Modifier.size(40.dp).testTag("reel"))
        }
    }

    @Test
    fun `le contenu reste compose disque naissant`() {
        host(progress = 0f, reduceMotion = false)
        rule.onNodeWithTag("reel").assertExists()
    }

    @Test
    fun `le contenu reste compose disque a mi-course`() {
        host(progress = 0.5f, reduceMotion = false)
        rule.onNodeWithTag("reel").assertExists()
    }

    @Test
    fun `a pleine progression le contenu est affiche sans masque`() {
        host(progress = 1f, reduceMotion = false)
        rule.onNodeWithTag("reel").assertIsDisplayed()
    }

    @Test
    fun `reduire les animations remplace le cercle par un fondu et garde le contenu compose`() {
        host(progress = 0.5f, reduceMotion = true)
        rule.onNodeWithTag("reel").assertExists()
    }
}
