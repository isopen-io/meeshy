package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.model.StoryCommentsState
import me.meeshy.sdk.model.StoryCommentsZone
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StoryCommentsOverlayComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private fun comment(id: String, author: String = "Alice", authorId: String = "u-alice") = StoryComment(
        id = id, clientId = null, authorName = author, avatarUrl = null, content = "Bonjour $id", isTranslated = false,
        createdAt = null, status = StoryCommentStatus.Sent, authorId = authorId,
    )

    private val frame = StoryCommentsZone.Frame(bottomInset = 80f, maxHeight = 400f)

    private fun actions(replied: MutableList<String> = mutableListOf()) = StoryCommentsOverlayActions(
        row = StoryCommentRowCallbacks(
            onReply = { replied += it.id },
            onToggleLike = {},
            onToggleOriginal = {},
            onCommitEdit = { _, _ -> },
            onDelete = {},
            onRequestRemove = {},
            onRequestReport = {},
        ),
        onToggleThread = {},
        onLoadMoreReplies = {},
        onLoadMoreRoots = {},
    )

    private fun show(state: StoryCommentsUiState, expired: Boolean = false, actions: StoryCommentsOverlayActions = actions()) {
        compose.setContent {
            MeeshyTheme(darkTheme = true) {
                StoryCommentsOverlay(
                    state = state,
                    isStoryExpired = expired,
                    frame = frame,
                    targetCommentId = null,
                    targetParentCommentId = null,
                    actions = actions,
                    onListTop = {},
                )
            }
        }
    }

    @Test
    fun `an empty thread says there are no comments, in one line`() {
        show(StoryCommentsUiState())

        compose.onNodeWithText("No comments").assertIsDisplayed()
        compose.onAllNodesWithText("Be the first to comment!").assertCountEquals(0)
    }

    @Test
    fun `a failed first load on an empty cache says so instead of the empty state`() {
        show(StoryCommentsUiState(isOffline = true))

        compose.onNodeWithText("Couldn't load comments").assertIsDisplayed()
        compose.onNodeWithText("No comments").assertDoesNotExist()
    }

    @Test
    fun `the list shows each comment and its reply button`() {
        val replied = mutableListOf<String>()
        show(
            StoryCommentsUiState(comments = StoryCommentsState(roots = listOf(comment("a"), comment("b", "Bob", "u-bob")), hasLoaded = true), viewerId = "u-me"),
            actions = actions(replied),
        )

        compose.onNodeWithText("Bonjour a").assertIsDisplayed()
        compose.onNodeWithText("Bonjour b").assertIsDisplayed()
        compose.onNodeWithText("No comments").assertDoesNotExist()
    }

    @Test
    fun `reply hands the comment to the host`() {
        val replied = mutableListOf<String>()
        show(
            StoryCommentsUiState(comments = StoryCommentsState(roots = listOf(comment("a")), hasLoaded = true), viewerId = "u-me"),
            actions = actions(replied),
        )

        compose.onNodeWithText("Reply").performClick()

        assertThat(replied).containsExactly("a")
    }

    @Test
    fun `an expired story keeps its comments and shows the banner`() {
        show(StoryCommentsUiState(comments = StoryCommentsState(roots = listOf(comment("a")), hasLoaded = true)), expired = true)

        compose.onNodeWithText("Story expired — comments remain visible").assertIsDisplayed()
        compose.onNodeWithText("Bonjour a").assertIsDisplayed()
    }

    @Test
    fun `the options menu is absent when the reader has nothing to do on a comment`() {
        show(
            StoryCommentsUiState(
                comments = StoryCommentsState(roots = listOf(comment("a").copy(effectFlags = MessageEffectFlags.BLURRED.toInt())), hasLoaded = true),
                viewerId = null,
            ),
        )

        compose.onNodeWithContentDescription("Comment options").assertDoesNotExist()
    }
}
