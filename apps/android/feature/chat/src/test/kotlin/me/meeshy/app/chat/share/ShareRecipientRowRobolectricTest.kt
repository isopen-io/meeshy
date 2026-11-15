package me.meeshy.app.chat.share

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.share.ShareCommunity
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareDirectoryView
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareRecipientRowModel
import me.meeshy.sdk.model.share.ShareRecipientsZoneState
import me.meeshy.sdk.model.share.ShareSearchResults
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ShareRecipientRowRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun conv(id: String, title: String) =
        ShareRecipient.conversation(id, title, ShareRecipient.Detail.Direct, null, null, peerUserId = "u$id")

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme {
                androidx.compose.runtime.CompositionLocalProvider(LocalReduceMotion provides true) { content() }
            }
        }
    }

    private val noActions = ShareRecipientsZoneActions({}, {}, {}, {})

    @Test
    fun `each row is exactly one semantic node`() {
        val recipients = listOf(conv("1", "Léa"), conv("2", "Marc"), conv("3", "Zoé"))
        show {
            androidx.compose.foundation.layout.Column {
                recipients.forEach {
                    ShareRecipientRow(ShareRecipientRowModel(it, null, false, null), MeeshyPalette.Indigo500, {}, {})
                }
            }
        }
        compose.onAllNodesWithTag(ShareRecipientRowTestTag).assertCountEquals(3)
    }

    @Test
    fun `the row speaks title, detail, online and selected in one label`() {
        show {
            ShareRecipientRow(ShareRecipientRowModel(conv("1", "Léa"), PresenceState.ONLINE, true, null), MeeshyPalette.Indigo500, {}, {})
        }
        compose.onNodeWithContentDescription("Léa, Conversation, online, selected").assertExists()
    }

    @Test
    fun `touching a row ticks it, and a served row is inert`() {
        var toggles = 0
        show {
            androidx.compose.foundation.layout.Column {
                ShareRecipientRow(ShareRecipientRowModel(conv("1", "Léa"), null, false, null), MeeshyPalette.Indigo500, { toggles++ }, {})
                ShareRecipientRow(ShareRecipientRowModel(conv("2", "Marc"), null, false, ShareDelivery.Sent), MeeshyPalette.Indigo500, { toggles += 10 }, {})
            }
        }
        compose.onAllNodesWithTag(ShareRecipientRowTestTag).let {
            it[0].performClick()
            it[1].performClick()
        }
        assert(toggles == 1)
    }

    @Test
    fun `a failed row offers a retry button that does not toggle`() {
        var retried = 0
        var toggled = 0
        show {
            ShareRecipientRow(
                ShareRecipientRowModel(conv("1", "Léa"), null, true, ShareDelivery.Failed(ShareFailure.GENERIC)),
                MeeshyPalette.Indigo500, { toggled++ }, { retried++ },
            )
        }
        compose.onNodeWithTextRetry().performClick()
        assert(retried == 1 && toggled == 0)
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onNodeWithTextRetry() =
        onNodeWithText("Retry")

    @Test
    fun `the zone draws three skeleton rows on a cold empty cache and rows otherwise`() {
        val view = ShareDirectoryView(emptyList(), emptyList(), emptyList(), emptyList())
        val skeleton = ShareRecipientsZoneState.of(view, true, true, null, emptyList(), true, emptyMap())
        show { ShareRecipientsZone(skeleton, ShareRecipientsZoneSnapshot(), MeeshyPalette.Indigo500, noActions) }
        compose.onAllNodesWithTag(ShareRecipientsSkeletonTestTag, useUnmergedTree = true).assertCountEquals(3)
    }

    @Test
    fun `the zone says nobody is here when the cache is empty and nothing is loading`() {
        val view = ShareDirectoryView(emptyList(), emptyList(), emptyList(), emptyList())
        val empty = ShareRecipientsZoneState.of(view, true, false, null, emptyList(), true, emptyMap())
        show { ShareRecipientsZone(empty, ShareRecipientsZoneSnapshot(), MeeshyPalette.Indigo500, noActions) }
        compose.onNodeWithText("No one here yet").assertExists()
    }

    @Test
    fun `the zone lists recents, rows, and a community that unfolds its channels`() {
        val convs = listOf(conv("1", "Léa Dupont"), conv("2", "Marc"))
        val channel = ShareRecipient.conversation("k", "Général", ShareRecipient.Detail.Channel("Com"), null, null, null)
        val view = ShareDirectoryView(convs, convs, emptyList(), listOf(ShareCommunity("c1", "Com", null)))
        val state = ShareRecipientsZoneState.of(view, false, false, ShareSearchResults.EMPTY, emptyList(), true, mapOf("c1" to listOf(channel)))
        show { ShareRecipientsZone(state, ShareRecipientsZoneSnapshot(), MeeshyPalette.Indigo500, noActions) }
        compose.onAllNodesWithTag(ShareRecentChipTestTag).assertCountEquals(2)
        compose.onAllNodesWithTag(ShareRecipientRowTestTag).assertCountEquals(3)
        compose.onNodeWithContentDescription("Général, Channel of Com").assertExists()
    }
}
