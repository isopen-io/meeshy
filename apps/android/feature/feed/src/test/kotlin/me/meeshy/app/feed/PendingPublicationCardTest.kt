package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14902 (iOS #14879) — dans le fil, une publication en attente ne se signale que par l'horloge d'un message en envoi, à la
 * place de l'heure ; son ⋯ n'offre que ce qui vaut sans serveur, et son détail n'offre qu'« Annuler l'envoi ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PendingPublicationCardTest {

    @get:Rule
    val compose = createComposeRule()

    private val cancelled = mutableListOf<String>()
    private val retried = mutableListOf<String>()

    private fun pending(status: UnsentPublicationStatus = UnsentPublicationStatus.SENDING) =
        PendingFeedPublications.cards(
            listOf(
                UnsentPublication(
                    cmid = "cmid_1",
                    kind = UnsentPublicationKind.POST,
                    text = "Bonjour",
                    mediaCount = 0,
                    status = status,
                    createdAtMillis = 1_000L,
                    failureReason = null,
                ),
            ),
            MeeshyUser(id = "me", username = "amina", displayName = "Amina"),
            mediaBaseUrl = null,
            offline = false,
        ).single()

    private fun showCard(card: PendingFeedCard) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(360.dp)) {
                    PostCard(
                        post = card.post,
                        onLike = {}, onBookmark = {}, onFlagTap = {}, onClick = {},
                        onOpenPost = {}, onImageTap = {}, isOwn = true,
                        pendingSend = PendingSendActions(
                            canRetry = card.canRetry,
                            canReopen = card.canReopen,
                            onRetry = { retried += card.post.id },
                            onReopen = {},
                            onCancel = { cancelled += card.post.id },
                        ),
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun openMenu() {
        compose.onNodeWithContentDescription("Post options").performClick()
        compose.waitForIdle()
    }

    @Test
    fun `the card shows the sending clock in place of the time, and no engagement`() {
        showCard(pending())

        compose.onAllNodesWithContentDescription("Waiting to send").assertCountEquals(1)
        compose.onAllNodesWithText("Waiting to send").assertCountEquals(0)
        listOf("Like", "Comments", "Reposts", "Send").forEach { compose.onAllNodesWithContentDescription(it).assertCountEquals(0) }
    }

    @Test
    fun `its menu offers cancel sending and nothing that needs the server`() {
        showCard(pending())
        openMenu()

        listOf("Open", "Cancel sending").forEach { compose.onAllNodesWithText(it).assertCountEquals(1) }
        listOf("Share", "Copy link", "Repost", "Pin", "Delete", "Retry").forEach { compose.onAllNodesWithText(it).assertCountEquals(0) }

        compose.onNodeWithText("Cancel sending").performClick()

        assertThat(cancelled).containsExactly("cmid_1")
    }

    @Test
    fun `a publication that gave up is retried from its menu`() {
        showCard(pending(UnsentPublicationStatus.FAILED))
        openMenu()

        compose.onNodeWithText("Retry").performClick()

        assertThat(retried).containsExactly("cmid_1")
    }

    @Test
    fun `the detail offers cancel sending alone and no comment composer`() {
        val card = pending(UnsentPublicationStatus.FAILED)
        compose.setContent {
            MeeshyTheme {
                PendingPostDetailContent(card = card, offline = false, onBack = {}, onCancel = { cancelled += card.post.id })
            }
        }
        compose.waitForIdle()

        compose.onAllNodesWithContentDescription("Waiting to send").assertCountEquals(1)
        openMenu()
        compose.onAllNodesWithText("Cancel sending").assertCountEquals(1)
        listOf("Open", "Copy text", "Retry", "Reopen", "Share").forEach { compose.onAllNodesWithText(it).assertCountEquals(0) }

        compose.onNodeWithText("Cancel sending").performClick()

        assertThat(cancelled).containsExactly("cmid_1")
    }
}
