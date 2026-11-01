package me.meeshy.app.feed

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import me.meeshy.sdk.model.net.OnlyUnlinkedRefusal
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14169 — « Publications non envoyées » dit à l'auteur pourquoi la sienne est arrêtée par le plafond des choisis sans lien. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OnlyUnlinkedRefusalLineTest {

    @get:Rule
    val compose = createComposeRule()

    private fun failed(reason: String?) = UnsentPublication(
        cmid = "cmid_post",
        kind = UnsentPublicationKind.POST,
        text = "bonjour",
        mediaCount = 0,
        status = UnsentPublicationStatus.FAILED,
        createdAtMillis = 0L,
        failureReason = reason,
    )

    private fun show(reason: String?) {
        compose.setContent { MeeshyTheme { OnlyUnlinkedRefusalLine(failed(reason)) } }
        compose.waitForIdle()
    }

    @Test
    fun `le refus dit combien de choisis sont sans lien et la limite du jour`() {
        show(OnlyUnlinkedRefusal(limit = 50, unlinked = 3).reason)

        compose.onNodeWithText(
            "3 people you chose have no link with you yet, and the daily limit is 50. Remove them from the list, or try again tomorrow.",
        ).assertIsDisplayed()
    }

    @Test
    fun `sans nombres le refus se dit quand meme`() {
        show(OnlyUnlinkedRefusal(limit = null, unlinked = null).reason)

        compose.onNodeWithText(
            "Too many of the people you chose have no link with you yet today. Remove them from the list, or try again tomorrow.",
        ).assertIsDisplayed()
    }

    @Test
    fun `un autre echec ne dit rien de ce plafond`() {
        show("Post refused: HTTP 415")

        compose.onAllNodesWithText("try again tomorrow", substring = true).assertCountEquals(0)
    }
}
