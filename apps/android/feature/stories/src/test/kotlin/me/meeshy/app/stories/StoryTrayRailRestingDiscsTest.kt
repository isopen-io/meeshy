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

/** #13665 — le rail est collé au bord, à la même place au-dessus et à côté des disques flottants au repos (360 dp) : le fil et la liste des conversations montent le même rail. */
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

    private fun tray() = StoryTrayBuilder.build(
        groups = listOf(group("me"), group("u2"), group("u3"), group("u4")),
        currentUserId = "me",
        mediaBaseUrl = null,
        nowMillis = now.toEpochMilli(),
    )

    private fun mineLeftBesideDiscs(): Float {
        compose.setContentBesideRestingDiscs {
            StoryTrayRail(tray(), moodEmojiOf = { null }, onOpenStory = {}, onAddStory = {}, onManageStories = {}, onShowProfile = null, onAppeared = {})
        }
        return compose.onNodeWithText("Your story").getBoundsInRoot().left.value
    }

    @Test
    fun `Votre story ne se decale pas vers le milieu a la hauteur des disques`() {
        val besideDiscs = mineLeftBesideDiscs()
        assertThat(compose.scrollerBounds().left.value).isEqualTo(0f)
        assertThat(besideDiscs).isLessThan(RestingDiscs.leadingEdge)
    }
}
