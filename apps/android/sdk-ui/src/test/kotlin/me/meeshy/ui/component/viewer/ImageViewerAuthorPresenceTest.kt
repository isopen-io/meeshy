package me.meeshy.ui.component.viewer

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.component.presenceDotTag
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'auteur d'une page de la galerie plein écran porte le point de présence vivant, comme iOS
 * (`FullscreenIdentityRow`, #13745). Sans visage servi par la galerie, ou sans présence servie, aucun point.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ImageViewerAuthorPresenceTest {

    @get:Rule
    val compose = createComposeRule()

    private fun store(live: Map<String, PresenceState>): PresenceStore = mockk {
        every { currentStateOf(any(), any()) } answers { live[firstArg()] }
        every { presenceOf(any(), any()) } answers { flowOf(live[firstArg()]) }
        every { presenceOf(any()) } answers { flowOf(live[firstArg()]) }
    }

    private fun show(live: Map<String, PresenceState>, identity: ImageViewerAuthor?) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalPresenceStore provides store(live)) {
                    ImageViewerMetadataBlock(
                        author = "Ana",
                        timestamp = null,
                        caption = null,
                        captionKey = 0,
                        identity = identity,
                    )
                }
            }
        }
    }

    private fun assertNoDot() =
        PresenceState.values().forEach { compose.onNodeWithTag(presenceDotTag(it), useUnmergedTree = true).assertDoesNotExist() }

    @Test
    fun `l'auteur d'une page a le point que la carte vivante sert`() {
        show(mapOf("u1" to PresenceState.ONLINE), ImageViewerAuthor(userId = "u1"))

        compose.onNodeWithTag(presenceDotTag(PresenceState.ONLINE), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `un auteur dont rien n'est servi n'a aucun point`() {
        show(emptyMap(), ImageViewerAuthor(userId = "u1"))

        assertNoDot()
    }

    @Test
    fun `une page sans visage servi garde le nom seul, sans avatar ni point`() {
        show(mapOf("u1" to PresenceState.ONLINE), identity = null)

        assertNoDot()
    }

    @Test
    fun `un auteur sans compte n'a aucun point`() {
        show(mapOf("u1" to PresenceState.ONLINE), ImageViewerAuthor(userId = null))

        assertNoDot()
    }
}
