package me.meeshy.ui.component.audio

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.profile.LocalProfileSheetOpener
import me.meeshy.ui.profile.ProfileSheetOpener
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Toucher le nom de l'auteur, sous le portrait, ouvre sa fiche comme toucher le portrait (iOS `AudioFullscreenPage`). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenPageIdentityTest {

    @get:Rule
    val compose = createComposeRule()

    private val opened = mutableListOf<ProfileSheetUser>()

    @Test
    fun `toucher le nom de l auteur ouvre sa fiche`() {
        val author = ProfileSheetUser(userId = "ada", username = "ada", displayName = "Ada")
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalProfileSheetOpener provides ProfileSheetOpener { opened += it }) {
                    AudioFullscreenPage(
                        source = audioSource("a", 1_000L, "Ada").copy(author = author),
                        pageIndex = 0,
                        pageCount = 1,
                        player = FakeAudioFullscreenPlayer(),
                        heardPositionMs = null,
                        upcoming = { emptyList() },
                        accent = Color.Magenta,
                        chromeVisible = true,
                        onClose = {},
                        onToggleChrome = {},
                        onRevealChrome = {},
                        onChromeInteraction = {},
                        onDownload = null,
                        onNext = null,
                        onPrevious = null,
                    )
                }
            }
        }
        compose.waitForIdle()

        compose.onNodeWithText("Ada").performClick()

        assertThat(opened.map { it.userId }).containsExactly("ada")
    }
}
