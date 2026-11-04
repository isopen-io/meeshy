package me.meeshy.ui.component.audio

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.ui.R
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.component.presenceDotTag
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le portrait du plein écran audio porte la présence VIVANTE de l'auteur (iOS : le point de `MeeshyAvatar` au cœur de
 * l'anneau) — hors ligne ou rien de servi : aucun point ; et Télécharger ne s'offre que là où le vocal peut sortir.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenAuthorAndDownloadTest {

    @get:Rule
    val compose = createComposeRule()

    private val downloadLabel get() = ApplicationProvider.getApplicationContext<android.content.Context>().getString(R.string.media_download)

    private fun store(live: Map<String, PresenceState>): PresenceStore = mockk {
        every { currentStateOf(any(), any()) } answers { live[firstArg()] }
        every { presenceOf(any(), any()) } answers { flowOf(live[firstArg()]) }
        every { presenceOf(any()) } answers { flowOf(live[firstArg()]) }
    }

    private fun page(exitOffer: MessageExitOffer? = MessageExitOffer.Unrestricted, served: PresenceState? = null) =
        audioSource("a", 1_000L, "Ada").copy(
            author = ProfileSheetUser(userId = "u1", username = "Ada", displayName = "Ada"),
            authorPresence = served,
            exitOffer = exitOffer,
        )

    private fun show(
        source: AudioFullscreenSource,
        live: Map<String, PresenceState>? = null,
        conversationIsEndToEnd: Boolean = false,
        onDownload: (AudioFullscreenSource) -> Unit = {},
    ) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalPresenceStore provides live?.let { store(it) }) {
                    AudioFullscreenScreen(
                        sources = listOf(source),
                        startAttachmentId = source.id,
                        player = FakeAudioFullscreenPlayer(),
                        accent = Color.Magenta,
                        onDismiss = {},
                        onDownload = onDownload,
                        conversationIsEndToEnd = conversationIsEndToEnd,
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(100)
    }

    private fun assertNoDot() =
        PresenceState.values().forEach { compose.onNodeWithTag(presenceDotTag(it), useUnmergedTree = true).assertDoesNotExist() }

    @Test
    fun `un auteur en ligne a son point au coeur de l anneau`() {
        show(page(), live = mapOf("u1" to PresenceState.ONLINE))

        compose.onNodeWithTag(presenceDotTag(PresenceState.ONLINE), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `un auteur absent ou inactif garde son point`() {
        show(page(), live = mapOf("u1" to PresenceState.AWAY))

        compose.onNodeWithTag(presenceDotTag(PresenceState.AWAY), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `un auteur hors ligne n a aucun point`() {
        show(page(), live = mapOf("u1" to PresenceState.OFFLINE))

        assertNoDot()
    }

    @Test
    fun `sans carte de presence la presence servie par la source fait foi`() {
        show(page(served = PresenceState.ONLINE))

        compose.onNodeWithTag(presenceDotTag(PresenceState.ONLINE), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `rien de servi ne donne aucun point`() {
        show(page(served = null), live = emptyMap())

        assertNoDot()
    }

    @Test
    fun `telecharger s offre sur un vocal qui peut sortir et rend la page touchee`() {
        val asked = mutableListOf<String>()
        show(page(), onDownload = { asked += it.id })

        compose.onNodeWithContentDescription(downloadLabel).performClick()

        assertThat(asked).containsExactly("a")
    }

    @Test
    fun `telecharger n existe pas dans une conversation chiffree de bout en bout`() {
        show(page(), conversationIsEndToEnd = true)

        compose.onNodeWithContentDescription(downloadLabel).assertDoesNotExist()
    }

    @Test
    fun `telecharger n existe pas sur une page dont la loi de sortie est inconnue ou fermee`() {
        show(page(exitOffer = MessageExitOffer.Unrestricted.copy(holdsBlur = true)))

        compose.onNodeWithContentDescription(downloadLabel).assertDoesNotExist()
    }
}
