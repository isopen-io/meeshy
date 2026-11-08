package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.DirectConversationSource
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.story.StoryReplyContext
import me.meeshy.sdk.net.ApiError
import org.junit.Test

class StoryReplyResolverTest {

    private val context = StoryReplyContext.Story(replyToId = "s1", authorId = "author")

    private fun direct(id: String) = ApiConversation(id = id, type = "direct")

    private fun resolver(
        pending: PendingStoryReplyContext,
        cached: ApiConversation? = null,
        resolution: DirectConversationResolution = DirectConversationResolution.Failed(ApiError("x"), offline = false),
    ): StoryReplyResolver {
        val source = mockk<DirectConversationSource> {
            coEvery { cachedDirectWith(any()) } returns cached
            coEvery { directConversationWith(any()) } returns resolution
        }
        return StoryReplyResolver(DirectConversationOpener(source), pending)
    }

    @Test
    fun `the cached direct opens and the context is posted`() = runTest {
        val pending = PendingStoryReplyContext()

        val target = resolver(pending, cached = direct("c1")).resolve(context)

        assertThat(target).isEqualTo(StoryReplyTarget.Open("c1"))
        assertThat(pending.current.value).isEqualTo(context)
    }

    @Test
    fun `an existing direct served by the network opens`() = runTest {
        val pending = PendingStoryReplyContext()
        val found = DirectConversationResolution.Found(direct("c2"), fromCache = false)

        assertThat(resolver(pending, resolution = found).resolve(context)).isEqualTo(StoryReplyTarget.Open("c2"))
    }

    @Test
    fun `a missing direct is created then opened`() = runTest {
        val pending = PendingStoryReplyContext()
        val created = DirectConversationResolution.Created(direct("c3"))

        assertThat(resolver(pending, resolution = created).resolve(context)).isEqualTo(StoryReplyTarget.Open("c3"))
    }

    @Test
    fun `a failure posts nothing and is told`() = runTest {
        val pending = PendingStoryReplyContext()

        assertThat(resolver(pending).resolve(context)).isEqualTo(StoryReplyTarget.Failed)
        assertThat(pending.current.value).isNull()
    }

    @Test
    fun `a context without author fails closed`() = runTest {
        val pending = PendingStoryReplyContext()

        val target = resolver(pending, cached = direct("c1")).resolve(StoryReplyContext.Story("s1", ""))

        assertThat(target).isEqualTo(StoryReplyTarget.Failed)
    }

    @Test
    fun `the pending context is consumed once`() {
        val pending = PendingStoryReplyContext()
        pending.post(context)

        assertThat(pending.consume()).isEqualTo(context)
        assertThat(pending.consume()).isNull()
    }
}
