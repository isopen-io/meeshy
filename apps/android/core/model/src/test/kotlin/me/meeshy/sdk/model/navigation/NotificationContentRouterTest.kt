package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryViewerInitialAction
import org.junit.Test

class NotificationContentRouterTest {
    private fun surface(
        postType: String? = null,
        contentType: String? = null,
        type: String? = "post_comment",
        hint: Boolean = false,
    ) = NotificationContentRouter.surface(postType, contentType, type, hint)

    @Test
    fun `un commentaire de reel ouvre le reel quel que soit le type de la notification`() {
        listOf("post_comment", "story_thread_reply", "friend_story_comment", "story_new_comment", "post_like", "friend_new_post")
            .forEach { type -> assertThat(surface(postType = "REEL", type = type)).isEqualTo(NotificationContentSurface.REEL) }
    }

    @Test
    fun `la casse du discriminant est sans effet`() {
        assertThat(surface(postType = "reel")).isEqualTo(NotificationContentSurface.REEL)
    }

    @Test
    fun `un reel n est jamais lu comme une story meme avec un indice de cache`() {
        assertThat(surface(postType = "REEL", hint = true)).isEqualTo(NotificationContentSurface.REEL)
    }

    @Test
    fun `story humeur et status partagent la surface ephemere`() {
        listOf("STORY", "STATUS", "MOOD").forEach {
            assertThat(surface(postType = it)).isEqualTo(NotificationContentSurface.STORY)
        }
    }

    @Test
    fun `un post ordinaire ouvre le detail`() {
        assertThat(surface(postType = "POST", type = "story_thread_reply")).isEqualTo(NotificationContentSurface.POST)
    }

    @Test
    fun `contentType sert quand postType est absent ou vide`() {
        assertThat(surface(contentType = "REEL", type = "friend_new_post")).isEqualTo(NotificationContentSurface.REEL)
        assertThat(surface(postType = "", contentType = "MOOD")).isEqualTo(NotificationContentSurface.STORY)
    }

    @Test
    fun `postType prime sur contentType`() {
        assertThat(surface(postType = "POST", contentType = "REEL")).isEqualTo(NotificationContentSurface.POST)
    }

    @Test
    fun `sans discriminant un type ephemere par construction ouvre la story`() {
        listOf("story_new_comment", "friend_new_story", "friend_new_mood", "story_reaction", "status_reaction")
            .forEach { assertThat(surface(type = it)).isEqualTo(NotificationContentSurface.STORY) }
    }

    @Test
    fun `sans discriminant ni type ephemere l indice de cache decide`() {
        assertThat(surface(hint = true)).isEqualTo(NotificationContentSurface.STORY)
        assertThat(surface(hint = false)).isEqualTo(NotificationContentSurface.POST)
        assertThat(surface(type = null)).isEqualTo(NotificationContentSurface.POST)
    }

    @Test
    fun `l intention suit le type`() {
        assertThat(NotificationContentRouter.intent("post_comment")).isEqualTo(StoryViewerInitialAction.COMMENTS)
        assertThat(NotificationContentRouter.intent("story_thread_reply")).isEqualTo(StoryViewerInitialAction.COMMENTS)
        assertThat(NotificationContentRouter.intent("story_reaction")).isEqualTo(StoryViewerInitialAction.VIEWS)
        assertThat(NotificationContentRouter.intent("friend_new_story")).isNull()
        assertThat(NotificationContentRouter.opensComments("comment_reply")).isTrue()
        assertThat(NotificationContentRouter.opensComments("post_like")).isFalse()
    }
}
