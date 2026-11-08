package me.meeshy.ui.component.bubble

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #14652 — la ligne de fichier d'une petite vidéo la télécharge seule, puis dit qu'elle est prête. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BubbleVideoRowAutoDownloadTest {

    @get:Rule
    val compose = createComposeRule()

    private val wifiOnly = MediaDownloadPreferences(video = AutoDownloadPolicy.WIFI_ONLY)

    private val small = BubbleFile(attachmentId = "v", name = "clip.mp4", sizeBytes = 40_000, url = "https://x/v.mp4", isVideo = true)

    private fun show(file: BubbleFile, condition: NetworkCondition, fetched: MutableList<String>) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalBubbleMediaAutoDownload provides BubbleMediaAutoDownload(condition, wifiOnly),
                    LocalBubbleVideoPrefetcher provides BubbleVideoPrefetcher { url -> fetched += url; true },
                ) {
                    BubbleFileRow(file = file, onColor = Color.Black, onClick = {})
                }
            }
        }
    }

    private fun stateIs(text: String) = SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, text)

    @Test
    fun onCellular_aSmallVideoRow_downloadsItselfOnce_thenSaysReady() {
        val fetched = mutableListOf<String>()
        show(small, NetworkCondition.GOOD_CELLULAR, fetched)
        compose.waitForIdle()

        assertThat(fetched).containsExactly("https://x/v.mp4")
        compose.onNode(stateIs("Ready to open")).assertExists()
    }

    @Test
    fun offline_theSmallVideoRowWaitsForTheGesture() {
        val fetched = mutableListOf<String>()
        show(small, NetworkCondition.OFFLINE, fetched)
        compose.waitForIdle()

        assertThat(fetched).isEmpty()
        compose.onNode(stateIs("Ready to open")).assertDoesNotExist()
    }

    @Test
    fun onCellular_aLargeVideoRowWaitsForTheGesture() {
        val fetched = mutableListOf<String>()
        show(small.copy(sizeBytes = 102_400), NetworkCondition.GOOD_CELLULAR, fetched)
        compose.waitForIdle()

        assertThat(fetched).isEmpty()
    }
}
