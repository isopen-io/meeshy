package me.meeshy.app.stories

import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13666 — le rail de stories mesure 120 dp, comme `StoryTrayView.trayHeight` d'iOS, quel que soit son contenu (143 dp mesurés avant). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryTrayRailHeightTest {

    @get:Rule
    val compose = createComposeRule()

    private val now = java.time.Instant.parse("2026-06-17T12:00:00Z")

    private fun group(id: String, stories: Int) = StoryGroup(
        id = id,
        username = "user-$id",
        avatarColor = "FF6B6B",
        avatarURL = null,
        stories = (0 until stories).map {
            StoryItem(id = "$id-$it", createdAt = now.minusSeconds(3600).toString(), expiresAt = now.plusSeconds(3600).toString())
        },
    )

    private fun railHeight(vararg groups: StoryGroup) = run {
        compose.setContent {
            me.meeshy.ui.theme.MeeshyTheme {
                StoryTrayRail(
                    tray = StoryTrayBuilder.build(groups.toList(), "me", null, now.toEpochMilli()),
                    moodEmojiOf = { null },
                    onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {},
                    onAddStatus = {},
                )
            }
        }
        compose.waitForIdle()
        compose.onRoot().getUnclippedBoundsInRoot().height
    }

    @Test
    fun `le rail sans aucune story mesure la hauteur d iOS`() {
        assertThat(railHeight()).isEqualTo(StoryEntryMetrics.height)
        assertThat(StoryEntryMetrics.height).isEqualTo(120.dp)
    }

    @Test
    fun `le libelle de chaque cellule tient dans le rail, sans etre rogne`() {
        railHeight(group("me", 3), group("u2", 5))
        listOf("Your story", "user-u2").forEach { label ->
            val bounds = compose.onNodeWithText(label, useUnmergedTree = true).getUnclippedBoundsInRoot()
            assertThat(bounds.bottom.value).isAtMost(StoryEntryMetrics.height.value)
        }
    }

    @Test
    fun `le rail avec des anneaux a plusieurs stories mesure la hauteur d iOS`() {
        assertThat(railHeight(group("me", 3), group("u2", 5), group("u3", 1))).isEqualTo(StoryEntryMetrics.height)
    }
}
