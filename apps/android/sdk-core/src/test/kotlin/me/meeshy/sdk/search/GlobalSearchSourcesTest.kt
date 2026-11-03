package me.meeshy.sdk.search

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.search.GlobalMessageSearchHit
import me.meeshy.sdk.model.search.SearchPaneFailure
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class GlobalSearchSourcesTest {

    private fun refusal(status: Int) = HttpException(Response.error<Unit>(status, "{}".toResponseBody()))

    private val messageApi = mockk<MessageApi>()
    private val postApi = mockk<PostApi>()

    private fun messageSource(online: Boolean = true) = RoomListMessageSearchSource(
        index = mockk(relaxed = true),
        messageDao = mockk<MessageDao>(relaxed = true),
        messageApi = messageApi,
        network = InMemoryNetworkMonitor(initialOnline = online),
    )

    @Test
    fun `the unified message search is asked first and serves its text as is`() = runTest {
        coEvery { messageApi.searchAll(any(), any(), any()) } returns ApiResponse(
            success = true,
            data = listOf(GlobalMessageSearchHit(id = "m1", conversationId = "c1", content = "Bonjour")),
        )

        val remote = messageSource().remote("bonjour", listOf("c1"))

        assertThat(remote?.served?.map { it.text }).containsExactly("Bonjour")
        assertThat(remote?.failed).isFalse()
        coVerify(exactly = 0) { messageApi.search(any(), any(), any(), any()) }
    }

    @Test
    fun `a server without the unified route falls back to the search per conversation`() = runTest {
        coEvery { messageApi.searchAll(any(), any(), any()) } throws refusal(404)
        coEvery { messageApi.search("c1", any(), any(), any()) } returns
            ApiResponse(success = true, data = listOf(ApiMessage(id = "m1", conversationId = "c1", content = "Hello")))

        val remote = messageSource().remote("hello", listOf("c1"))

        assertThat(remote?.messages?.map { it.id }).containsExactly("m1")
        assertThat(remote?.failed).isFalse()
    }

    @Test
    fun `a unified search that fails otherwise is a failure, never an empty answer`() = runTest {
        coEvery { messageApi.searchAll(any(), any(), any()) } throws IOException("down")

        val remote = messageSource().remote("hello", listOf("c1"))

        assertThat(remote?.failed).isTrue()
        coVerify(exactly = 0) { messageApi.search(any(), any(), any(), any()) }
    }

    @Test
    fun `offline the server is never asked`() = runTest {
        assertThat(messageSource(online = false).remote("hello", listOf("c1"))).isNull()
        coVerify(exactly = 0) { messageApi.searchAll(any(), any(), any()) }
    }

    @Test
    fun `posts are served by the post search`() = runTest {
        coEvery { postApi.search(any(), any(), any(), any()) } returns
            ApiResponse(success = true, data = listOf(ApiPost(id = "p1", type = "POST")))

        val pane = RemotePostSearchSource(postApi).search("bonjour")

        assertThat(pane.items.map { it.id }).containsExactly("p1")
        assertThat(pane.failure).isNull()
    }

    @Test
    fun `a server without the post search keeps the tab quiet instead of failing`() = runTest {
        coEvery { postApi.search(any(), any(), any(), any()) } throws refusal(404)

        val pane = RemotePostSearchSource(postApi).search("bonjour")

        assertThat(pane.items).isEmpty()
        assertThat(pane.failure).isNull()
    }

    @Test
    fun `an unreachable post search is a failure`() = runTest {
        coEvery { postApi.search(any(), any(), any(), any()) } throws IOException("down")

        assertThat(RemotePostSearchSource(postApi).search("bonjour").failure).isEqualTo(SearchPaneFailure.Unreachable)
    }
}
