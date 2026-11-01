package me.meeshy.app.chat

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.share.ShareAction
import me.meeshy.sdk.model.share.ShareLimitsReport
import me.meeshy.sdk.model.share.SharePlan
import me.meeshy.sdk.model.share.ShareTitle
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14331 — « Transférer » offre « Imager la discussion » quand l'hôte la fournit, et le geste l'ouvre. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ShareSheetImageDiscussionTest {

    @get:Rule
    val compose = createComposeRule()

    private val plan = SharePlan(
        title = ShareTitle.FORWARD, kept = listOf("m1"), withdrawn = emptyList(), blocked = null,
        actions = listOf(ShareAction.SEND, ShareAction.IMAGER), withheld = emptyList(), grouping = null, caption = null,
        flameMaxDurationSeconds = null, blurInherited = false, encryption = null, limits = ShareLimitsReport(0, 0, 0, 0, 0), canSend = false,
    )

    private fun actions(onImageDiscussion: (() -> Unit)?) = ShareSheetActions(
        onQueryChange = {}, onToggle = {}, onCaptionChange = {}, onDurationChange = {}, onSend = {}, onDismiss = {},
        onImageDiscussion = onImageDiscussion,
    )

    @Test
    fun `the discussion is offered by the host and the tap opens it`() {
        var opened = 0
        compose.setContent { MeeshyTheme { ShareSheetBody(ShareSheetModel(plan = plan, sourceMessageCount = 1), Color.Blue, actions { opened++ }) } }

        compose.onNodeWithText("Picture the conversation").assertIsDisplayed().performClick()

        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `without the host's offer there is no discussion button`() {
        compose.setContent { MeeshyTheme { ShareSheetBody(ShareSheetModel(plan = plan, sourceMessageCount = 1), Color.Blue, actions(null)) } }

        compose.onNodeWithText("Picture the conversation").assertDoesNotExist()
    }
}
