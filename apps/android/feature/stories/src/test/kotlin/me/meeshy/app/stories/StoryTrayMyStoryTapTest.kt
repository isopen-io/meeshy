package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** L'appui sur « Moi » mène à « Mes stories » ou au composeur, et TalkBack nomme cette destination réelle. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryTrayMyStoryTapTest {

    @get:Rule
    val compose = createComposeRule()

    private val now = java.time.Instant.parse("2026-06-17T12:00:00Z")

    private fun trayWithMyStory() = StoryTrayBuilder.build(
        groups = listOf(
            StoryGroup(
                id = "me", username = "me", avatarColor = "FF6B6B",
                stories = listOf(StoryItem(id = "s", createdAt = now.minusSeconds(60).toString(), expiresAt = now.plusSeconds(3600).toString())),
            ),
        ),
        currentUserId = "me",
        mediaBaseUrl = null,
        nowMillis = now.toEpochMilli(),
    )

    private fun emptyTray() = StoryTrayBuilder.build(emptyList(), "me", null, now.toEpochMilli())

    @Test
    fun `avec une story active le tap sur Moi ouvre Mes stories`() {
        var managed = 0
        var opened = 0
        compose.setContent {
            StoryTrayRail(
                tray = trayWithMyStory(), moodEmojiOf = { null },
                onOpenStory = { opened++ }, onAddStory = {}, onManageStories = { managed++ },
                onShowProfile = null, onAppeared = {},
            )
        }
        compose.onNodeWithContentDescription("Manage my stories").performClick()
        assertThat(managed).isEqualTo(1)
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `sans story le tap ouvre le composeur et le libelle le dit`() {
        var added = 0
        compose.setContent {
            StoryTrayRail(
                tray = emptyTray(), moodEmojiOf = { null },
                onOpenStory = {}, onAddStory = { added++ }, onManageStories = {},
                onShowProfile = null, onAppeared = {},
            )
        }
        compose.onNodeWithContentDescription("Create a story").performClick()
        assertThat(added).isEqualTo(1)
    }

    @Test
    fun `un historique expire sans story active mene a Mes stories`() {
        var managed = 0
        compose.setContent {
            StoryTrayRail(
                tray = emptyTray(), moodEmojiOf = { null },
                onOpenStory = {}, onAddStory = {}, onManageStories = { managed++ },
                onShowProfile = null, onAppeared = {}, hasStoryHistory = true,
            )
        }
        compose.onNodeWithContentDescription("Manage my stories").performClick()
        assertThat(managed).isEqualTo(1)
    }
}
