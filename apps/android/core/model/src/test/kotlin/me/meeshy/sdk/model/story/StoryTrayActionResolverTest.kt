package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTrayActionResolverTest {

    @Test
    fun `an active story opens my stories`() {
        assertThat(StoryTrayActionResolver.avatarTap(hasMyStory = true, hasAnyStory = true))
            .isEqualTo(MyStoryAvatarAction.ManageStories)
    }

    @Test
    fun `an entirely expired history still opens my stories`() {
        assertThat(StoryTrayActionResolver.avatarTap(hasMyStory = false, hasAnyStory = true))
            .isEqualTo(MyStoryAvatarAction.ManageStories)
    }

    @Test
    fun `no story at all opens the composer`() {
        assertThat(StoryTrayActionResolver.avatarTap(hasMyStory = false, hasAnyStory = false))
            .isEqualTo(MyStoryAvatarAction.CreateStory)
    }
}
