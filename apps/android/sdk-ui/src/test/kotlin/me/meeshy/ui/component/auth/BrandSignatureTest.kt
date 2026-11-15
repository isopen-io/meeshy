package me.meeshy.ui.component.auth

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertTouchHeightIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La signature de marque : « Meeshy <version> · <build> », le crédit « by services.ceo » qui
 * ouvre la plateforme au toucher, une phrase pour le lecteur d'écran.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BrandSignatureTest {

    @get:Rule
    val compose = createComposeRule()

    private class RecordingUriHandler(private val failure: RuntimeException? = null) : UriHandler {
        val opened = mutableListOf<String>()
        override fun openUri(uri: String) {
            failure?.let { throw it }
            opened += uri
        }
    }

    private fun show(handler: UriHandler = RecordingUriHandler()) {
        compose.setContent {
            CompositionLocalProvider(LocalUriHandler provides handler) {
                MeeshyTheme { BrandSignature(versionName = "2.3.1", buildNumber = "412") }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `it shows the version and the build around a middle dot`() {
        show()

        compose.onNodeWithText("Meeshy 2.3.1 · 412").assertExists()
    }

    @Test
    fun `it shows the brand credit as is`() {
        show()

        compose.onNodeWithText("by services.ceo").assertExists()
    }

    @Test
    fun `the screen reader hears a sentence rather than a dotted line`() {
        show()

        compose.onNodeWithContentDescription("Meeshy version 2.3.1, build 412.").assertExists()
    }

    @Test
    fun `touching the credit opens the platform`() {
        val handler = RecordingUriHandler()
        show(handler)

        compose.onNodeWithText("by services.ceo").performClick()

        assertThat(handler.opened).containsExactly("https://services.ceo")
    }

    @Test
    fun `the credit says what it will do and is reachable as a 48 dp target`() {
        show()

        val credit = compose.onNodeWithText("by services.ceo")
        assertThat(credit.fetchSemanticsNode().config[SemanticsActions.OnClick].label)
            .isEqualTo("Open the services.ceo platform in the browser")
        credit.assertTouchHeightIsEqualTo(48.dp)
    }

    @Test
    fun `a phone with no browser leaves the credit inert instead of crashing`() {
        show(RecordingUriHandler(failure = IllegalArgumentException("Can't open https://services.ceo")))

        compose.onNodeWithText("by services.ceo").performClick()

        compose.onNodeWithText("by services.ceo").assertExists()
    }
}
