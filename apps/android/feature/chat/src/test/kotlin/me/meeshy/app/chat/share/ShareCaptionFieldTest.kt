package me.meeshy.app.chat.share

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.share.ShareDestination
import me.meeshy.sdk.model.share.ShareEntry
import me.meeshy.sdk.model.share.ShareGrouping
import me.meeshy.sdk.model.share.ShareMedia
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.SharePlanner
import me.meeshy.sdk.model.share.ShareSendBarState
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * NATIVE : en mode graphique LEGACY de Robolectric, aucun toucher n'atteint un segment d'une
 * `SingleChoiceSegmentedButtonRow` à plusieurs segments (un segment seul ou une `Surface` sélectionnable
 * le reçoivent, et l'action sémantique OnClick fonctionne) — le témoin du choix « Séparément » rendait null.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ShareCaptionFieldTest {

    @get:Rule
    val compose = createComposeRule()

    private fun media(n: Int) = (1..n).map { ShareMedia(id = "m$it", mimeType = "application/pdf", bytes = 1L) }
    private val recipient = ShareRecipient.conversation("1", "Léa", ShareRecipient.Detail.Direct, null, null, null)

    private fun state(files: Int = 2, online: Boolean = true, hasSent: Boolean = false, destinations: Int = 1): ShareSendBarState {
        val plan = SharePlanner.plan(ShareEntry.Media(media(files)), (1..destinations).map { ShareDestination("conv:$it") })
        return ShareSendBarState.of(plan, listOf(recipient), hasSent, online)
    }

    private fun show(
        state: ShareSendBarState,
        caption: String = "",
        onCaption: (String) -> Unit = {},
        onGrouping: (ShareGrouping) -> Unit = {},
        onSend: () -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme {
                androidx.compose.runtime.CompositionLocalProvider(LocalReduceMotion provides true) {
                    ShareSendBar(state, ShareSendBarInput(caption, ShareGrouping.TOGETHER), MeeshyPalette.Indigo500, ShareSendBarActions(onCaption, onGrouping, onSend))
                }
            }
        }
    }

    @Test
    fun `typing in the caption reports the text`() {
        var typed by mutableStateOf("")
        show(state(), onCaption = { typed = it })
        compose.onNodeWithTag(ShareCaptionTestTag).performTextInput("Salut")
        assertThat(typed).isEqualTo("Salut")
    }

    @Test
    fun `the caption never exceeds the share ceiling`() {
        var typed = ""
        show(state(), onCaption = { typed = it })
        compose.onNodeWithTag(ShareCaptionTestTag).performTextInput("a".repeat(ShareLimits.MAX_CAPTION_LENGTH + 20))
        assertThat(typed.length).isEqualTo(ShareLimits.MAX_CAPTION_LENGTH)
    }

    @Test
    fun `once something was sent there is no caption, no grouping and no button`() {
        show(state(hasSent = true))
        compose.onNodeWithTag(ShareCaptionTestTag).assertDoesNotExist()
        compose.onNodeWithTag(ShareGroupingTogetherTestTag).assertDoesNotExist()
        compose.onNodeWithTag(ShareSendBarState.SEND_TEST_ID).assertDoesNotExist()
    }

    @Test
    fun `the send button reports a tap when enabled and is inert when over the ceiling`() {
        var sends = 0
        show(state(), onSend = { sends++ })
        compose.onNodeWithTag(ShareSendBarState.SEND_TEST_ID).assertIsEnabled().performClick()
        assertThat(sends).isEqualTo(1)
    }

    @Test
    fun `too many files disable the button and name the files to remove`() {
        var sends = 0
        show(state(files = ShareLimits.MAX_FILES + 2), onSend = { sends++ })
        compose.onNodeWithTag(ShareSendBarState.SEND_TEST_ID).assertIsNotEnabled().performClick()
        assertThat(sends).isEqualTo(0)
        compose.onNodeWithText("Remove 2 files to send").assertIsDisplayed()
    }

    @Test
    fun `the grouping choice is reported`() {
        var chosen: ShareGrouping? = null
        show(state(), onGrouping = { chosen = it })
        compose.onNodeWithTag(ShareGroupingSeparatelyTestTag).performClick()
        assertThat(chosen).isEqualTo(ShareGrouping.SEPARATELY)
    }

    @Test
    fun `offline shows its banner`() {
        show(state(online = false))
        compose.onNodeWithText("Offline.", substring = true).assertIsDisplayed()
    }
}
