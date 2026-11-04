package me.meeshy.app.auth

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RefusalScreensTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `l ecran session fermee n offre qu un bouton et il sort`() {
        var continued = 0
        compose.setContent { MeeshyTheme { SessionClosedScreen(onContinue = { continued++ }) } }

        compose.onAllNodes(hasClickAction()).assertCountEquals(1)
        compose.onNodeWithText("Sign in again").performClick()
        org.junit.Assert.assertEquals(1, continued)
    }

    @Test
    fun `l ecran de refus d age n offre qu un bouton, J ai compris`() {
        var acknowledged = 0
        compose.setContent { MeeshyTheme { AgeRefusalScreen(onAcknowledge = { acknowledged++ }) } }

        compose.onAllNodes(hasClickAction()).assertCountEquals(1)
        compose.onNodeWithText("Meeshy is for ages 13 and up").assertExists()
        compose.onNodeWithText("Got it").performClick()
        org.junit.Assert.assertEquals(1, acknowledged)
    }

    @Test
    fun `l ecran d age porte le corps du refus`() {
        compose.setContent { MeeshyTheme { AgeRefusalScreen(onAcknowledge = {}) } }

        compose.onNodeWithText("This account can't use Meeshy yet. You can join us when you turn 13.").assertExists()
    }

    @Test
    fun `l icone du refus suit la police et plafonne a 110 dp`() {
        org.junit.Assert.assertEquals(72f, refusalIconSize(1f).value, 0.01f)
        org.junit.Assert.assertEquals(90f, refusalIconSize(1.25f).value, 0.01f)
        org.junit.Assert.assertEquals(110f, refusalIconSize(2f).value, 0.01f)
    }
}
