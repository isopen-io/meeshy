package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithContentDescription
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PinnedStoryTrailBandTest {

    @get:Rule
    val compose = createComposeRule()

    private val now = java.time.Instant.parse("2026-06-17T12:00:00Z")

    private fun group(id: String, live: Boolean = true) = StoryGroup(
        id = id,
        username = "user-$id",
        avatarColor = "FF6B6B",
        avatarURL = null,
        stories = listOf(
            StoryItem(
                id = "$id-0",
                createdAt = now.minusSeconds(7200).toString(),
                expiresAt = (if (live) now.plusSeconds(3600) else now.minusSeconds(3600)).toString(),
            ),
        ),
    )

    private fun tray(vararg groups: StoryGroup) = StoryTrayBuilder.build(
        groups = groups.toList(),
        currentUserId = "me",
        mediaBaseUrl = null,
        nowMillis = now.toEpochMilli(),
    )

    private fun stories(tray: StoryTrayPresentation) = mockk<StoriesViewModel> {
        every { state } returns MutableStateFlow(StoriesUiState(tray = tray, hasStoryHistory = tray.ownHistory != null))
    }

    private fun mount(
        reveal: Float,
        tray: StoryTrayPresentation,
        opened: MutableList<String> = mutableListOf(),
        managed: MutableList<Unit> = mutableListOf(),
    ) = compose.setContent {
        PinnedStoryTrailBand(
            reveal = reveal,
            onOpenStory = { opened += it },
            onManageStories = { managed += Unit },
            onAddStory = {},
            viewModel = stories(tray),
            impressions = mockk(relaxed = true),
        )
    }

    @Test
    fun `la bande est absente a zero`() {
        mount(reveal = 0f, tray = tray(group("me"), group("u2")))
        compose.onAllNodesWithContentDescription("Open user-u2's story").assertCountEquals(0)
    }

    @Test
    fun `la bande est presente a un`() {
        mount(reveal = 1f, tray = tray(group("me"), group("u2")))
        compose.onNodeWithContentDescription("Open user-u2's story").assertExists()
    }

    @Test
    fun `toucher l'anneau d'un autre ouvre son lecteur`() {
        val opened = mutableListOf<String>()
        mount(reveal = 1f, tray = tray(group("me"), group("u2")), opened = opened)
        compose.onNodeWithContentDescription("Open user-u2's story").performClick()
        assertThat(opened).containsExactly("u2")
    }

    @Test
    fun `la premiere cellule est l'utilisateur et son appui ouvre son lecteur`() {
        val opened = mutableListOf<String>()
        mount(reveal = 1f, tray = tray(group("me"), group("u2")), opened = opened)
        compose.onNodeWithContentDescription("Open Your story's story").performClick()
        assertThat(opened).containsExactly("me")
    }

    @Test
    fun `un historique entierement expire reste le seul acces a Mes stories`() {
        val managed = mutableListOf<Unit>()
        mount(reveal = 1f, tray = tray(group("me", live = false)), managed = managed)
        compose.onNodeWithContentDescription("Manage my stories").performClick()
        assertThat(managed).hasSize(1)
    }

    @Test
    fun `sous 0,6 la bande ne recoit aucun geste`() {
        val opened = mutableListOf<String>()
        mount(reveal = 0.55f, tray = tray(group("me"), group("u2")), opened = opened)
        compose.onNodeWithContentDescription("Open user-u2's story").performClick()
        assertThat(opened).isEmpty()
    }
}
