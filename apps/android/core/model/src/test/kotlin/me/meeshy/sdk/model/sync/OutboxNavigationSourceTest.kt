package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxNavigationSourceTest {
    @Test
    fun `a send targets the local bubble, a mutation the server message`() {
        assertThat(OutboxNavigationSource.forSend("c", "local-1")).isEqualTo(OutboxNavigationSource.Conversation("c", "local-1"))
        assertThat(OutboxNavigationSource.forMutation("c", "srv-9")).isEqualTo(OutboxNavigationSource.Conversation("c", "srv-9"))
    }

    @Test
    fun `an unreadable payload opens the conversation without an anchor`() {
        assertThat(OutboxNavigationSource.forMutation("c", null)).isEqualTo(OutboxNavigationSource.Conversation("c", null))
        assertThat(OutboxNavigationSource.forMutation("c", " ")).isEqualTo(OutboxNavigationSource.Conversation("c", null))
    }

    @Test
    fun `posts and stories fall back to unknown without an id`() {
        assertThat(OutboxNavigationSource.forPost("p")).isEqualTo(OutboxNavigationSource.Post("p"))
        assertThat(OutboxNavigationSource.forPost(null)).isEqualTo(OutboxNavigationSource.Unknown)
        assertThat(OutboxNavigationSource.forStory("")).isEqualTo(OutboxNavigationSource.Unknown)
        assertThat(OutboxNavigationSource.forStory("s")).isEqualTo(OutboxNavigationSource.Story("s"))
    }
}
