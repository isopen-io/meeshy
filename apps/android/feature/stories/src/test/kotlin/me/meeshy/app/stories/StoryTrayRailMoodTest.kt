package me.meeshy.app.stories

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13653 — le rail UNIQUE porte l'humeur comme iOS `StoryTrayView` : « Votre story » toujours là (même sans story),
 * l'invite « 💭 » sur son avatar, l'humeur des autres appuyable. Plus de barre « Statut » à part.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryTrayRailMoodTest {

    @get:Rule
    val compose = createComposeRule()

    private val now = java.time.Instant.parse("2026-06-17T12:00:00Z")

    private fun group(id: String) = StoryGroup(
        id = id,
        username = "user-$id",
        avatarColor = "FF6B6B",
        avatarURL = null,
        stories = listOf(StoryItem(id = "$id-0", createdAt = now.minusSeconds(3600).toString(), expiresAt = now.plusSeconds(3600).toString())),
    )

    private fun tray(vararg ids: String) = StoryTrayBuilder.build(
        groups = ids.map(::group),
        currentUserId = "me",
        mediaBaseUrl = null,
        nowMillis = now.toEpochMilli(),
    )

    @Test
    fun `sans aucune story le rail garde Votre story et l invite d humeur`() {
        var statusOpened = 0
        compose.setContent {
            StoryTrayRail(
                tray = tray(),
                moodEmojiOf = { null },
                onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {},
                onAddStatus = { statusOpened++ },
            )
        }
        compose.onNodeWithText("Your story").assertIsDisplayed()
        compose.onNodeWithContentDescription("Change my mood").performClick()
        assertThat(statusOpened).isEqualTo(1)
    }

    @Test
    fun `l avatar du compte pose son humeur et l appui rouvre le composeur d humeur`() {
        var statusOpened = 0
        compose.setContent {
            StoryTrayRail(
                tray = tray("me", "u2"),
                moodEmojiOf = { null },
                myMoodEmoji = "😀",
                onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {},
                onAddStatus = { statusOpened++ },
            )
        }
        compose.onNodeWithContentDescription("Change my mood").performClick()
        assertThat(statusOpened).isEqualTo(1)
    }

    @Test
    fun `l humeur d un autre appuyee mene a son humeur`() {
        val tapped = mutableListOf<String>()
        compose.setContent {
            StoryTrayRail(
                tray = tray("me", "u2"),
                moodEmojiOf = { userId -> "🔥".takeIf { userId == "u2" } },
                onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {},
                onAddStatus = {},
                onMoodTap = { tapped += it },
            )
        }
        compose.onNodeWithContentDescription("Mood 🔥").performClick()
        assertThat(tapped).containsExactly("u2")
    }

    @Test
    fun `le badge plus de Votre story offre une cible de 48 dp, comme le badge d humeur`() {
        compose.setContent {
            StoryTrayRail(
                tray = tray("me", "u2"),
                moodEmojiOf = { null },
                onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {},
                onAddStatus = {},
            )
        }
        val add = compose.onNodeWithContentDescription("Add a story").getUnclippedBoundsInRoot()
        assertThat(add.width).isAtLeast(48.dp)
        assertThat(add.height).isAtLeast(48.dp)
        val mood = compose.onNodeWithContentDescription("Change my mood").getUnclippedBoundsInRoot()
        assertThat(mood.width).isAtLeast(48.dp)
    }

    @Test
    fun `sans cablage d humeur le rail n affiche aucune invite`() {
        compose.setContent {
            StoryTrayRail(
                tray = tray("me"),
                moodEmojiOf = { null },
                onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {},
            )
        }
        compose.onAllNodesWithContentDescription("Change my mood").assertCountEquals(0)
    }
}
