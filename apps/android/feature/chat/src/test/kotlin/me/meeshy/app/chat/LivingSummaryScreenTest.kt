package me.meeshy.app.chat

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.reading.summary.DeterministicConversationDigest
import me.meeshy.sdk.model.reading.summary.FaceRampEntry
import me.meeshy.sdk.model.reading.summary.SummaryProtectionBadge
import me.meeshy.sdk.model.reading.summary.SummaryProtectionEntry
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les pièces de l'écran du Résumé vivant : le squelette de trois barres, l'en-tête (le partiel dit
 * partiel), la rampe de visages (accessibilité et appui), les protections (jamais de texte) et le
 * panneau de l'agent.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LivingSummaryScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val noMenu = SummaryEntryMenu(offered = { emptyList() }, run = { _, _ -> })

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme { CompositionLocalProvider(LocalReduceMotion provides true) { content() } }
        }
    }

    private fun digest(complete: Boolean) = DeterministicConversationDigest.EMPTY.copy(
        messageCount = 312,
        participantCount = 9,
        isComplete = complete,
    )

    private fun face(name: String, count: Int) = FaceRampEntry(
        id = name.lowercase(),
        displayName = name,
        avatarUrl = null,
        colorHex = "6366F1",
        presence = PresenceState.OFFLINE,
        awaitingCount = count,
        needScore = 1.0,
        evidenceMessageIds = listOf("m-$name"),
    )

    @Test
    fun `the skeleton announces itself while everything is empty`() {
        show { LivingSummarySkeleton() }
        compose.onNodeWithContentDescription("Loading the summary").assertIsDisplayed()
    }

    @Test
    fun `the header states the real counts`() {
        show { SummaryHeader(digest(complete = true)) }
        compose.onNodeWithText("312 messages · 9 people").assertIsDisplayed()
    }

    @Test
    fun `a partial window says it is partial`() {
        show { SummaryHeader(digest(complete = false)) }
        compose.onNodeWithText("Based on the last 312 messages").assertIsDisplayed()
    }

    @Test
    fun `a complete window does not claim to be partial`() {
        show { SummaryHeader(digest(complete = true)) }
        compose.onNodeWithText("Based on the last 312 messages").assertDoesNotExist()
    }

    @Test
    fun `a face reads who waits and how many messages, and a tap hands the entry back`() {
        var tapped: FaceRampEntry? = null
        show { FaceRampSection(listOf(face("Bob", 3)), noMenu) { tapped = it } }

        compose.onNodeWithContentDescription("Bob, 3 messages are waiting for you").performClick()

        assertThat(tapped?.id).isEqualTo("bob")
    }

    @Test
    fun `the protections name the sender and the badges, never a text`() {
        val entries = listOf(
            SummaryProtectionEntry("p1", "Alice", listOf(SummaryProtectionBadge.ViewOnce)),
            SummaryProtectionEntry("p2", "Carl", listOf(SummaryProtectionBadge.Ephemeral(remainingSeconds = 90.0))),
        )
        show { SummaryProtectionsSection(entries) }

        compose.onNodeWithText("What will disappear").assertIsDisplayed()
        compose.onNodeWithText("Alice").assertIsDisplayed()
        compose.onNodeWithContentDescription("View once").assertIsDisplayed()
        compose.onNodeWithText("Carl").assertIsDisplayed()
    }

    @Test
    fun `the agent panel carries its title and its text`() {
        show { AgentPanel("Le groupe prépare le week-end.") }
        compose.onNodeWithText("Agent overview").assertIsDisplayed()
        compose.onNodeWithText("Le groupe prépare le week-end.").assertIsDisplayed()
    }

    @Test
    fun `a face with no evidence offers no menu action`() {
        val noEvidence = face("Dana", 1).copy(evidenceMessageIds = emptyList())
        show { FaceRampSection(listOf(noEvidence), noMenu) {} }
        val actions = compose.onNodeWithContentDescription("Dana, 1 messages are waiting for you")
            .fetchSemanticsNode().config.getOrNull(SemanticsActions.CustomActions).orEmpty()
        assertThat(actions).isEmpty()
    }
}
