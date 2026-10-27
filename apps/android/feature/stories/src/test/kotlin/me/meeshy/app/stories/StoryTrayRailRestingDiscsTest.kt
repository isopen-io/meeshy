package me.meeshy.app.stories

import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #12497 — « Votre story » ne reste pas sous le disque flottant de gauche au repos (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryTrayRailRestingDiscsTest {

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

    @Test
    fun `au repos Votre story reste a droite du disque de gauche`() {
        val tray = StoryTrayBuilder.build(
            groups = listOf(group("me"), group("u2"), group("u3"), group("u4")),
            currentUserId = "me",
            mediaBaseUrl = null,
            nowMillis = now.toEpochMilli(),
        )
        compose.setContentBesideRestingDiscs {
            StoryTrayRail(tray, moodEmojiOf = { null }, onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {})
        }
        val mine = compose.onNodeWithText("Your story").getBoundsInRoot()
        assertThat(mine.left.value).isAtLeast(RestingDiscs.leadingEdge)
        assertThat(compose.scrollerBounds().right.value).isAtMost(RestingDiscs.trailingEdge)
    }
}
