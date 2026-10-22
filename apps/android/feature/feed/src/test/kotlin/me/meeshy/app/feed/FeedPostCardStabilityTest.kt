package me.meeshy.app.feed

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedPostCardStabilityTest {

    @get:Rule
    val compose = createComposeRule()

    @Composable
    private fun CountedCard(post: FeedPostPresentation, compositions: MutableMap<String, Int>) {
        SideEffect { compositions[post.id] = (compositions[post.id] ?: 0) + 1 }
        PostCard(
            post = post,
            onLike = {},
            onBookmark = {},
            onFlagTap = {},
            onClick = {},
            onOpenPost = {},
            onImageTap = {},
        )
    }

    @Test
    fun `un seul post qui change ne recompose que sa carte`() {
        val compositions = mutableMapOf<String, Int>()
        val posts = mutableStateOf(
            listOf(feedPostPresentation(id = "a"), feedPostPresentation(id = "b")),
        )
        compose.setContent {
            MeeshyTheme {
                Column {
                    posts.value.forEach { post ->
                        androidx.compose.runtime.key(post.id) { CountedCard(post, compositions) }
                    }
                }
            }
        }
        compose.waitForIdle()
        assertThat(compositions).containsExactly("a", 1, "b", 1)

        posts.value = posts.value.map { if (it.id == "b") it.copy(likeCount = 1, isLiked = true) else it }
        compose.waitForIdle()

        assertThat(compositions).containsExactly("a", 1, "b", 2)
    }
}
