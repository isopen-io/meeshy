package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.StoryViewerWire
import me.meeshy.sdk.model.StoryViewersResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StoryApi
import org.junit.Test
import java.io.IOException

class StoryRepositoryTest {

    private val api: StoryApi = mockk(relaxed = true)
    private val repo = StoryRepository(api)

    @Test
    fun viewers_mapsWirePayloadToDomain() = runTest {
        coEvery { api.viewers("s1") } returns ApiResponse(
            success = true,
            data = StoryViewersResponse(
                viewers = listOf(
                    StoryViewerWire(id = "u1", username = "alice", displayName = "Alice", reaction = "❤️"),
                    StoryViewerWire(id = "u2", username = "bob", displayName = null),
                ),
            ),
        )

        val result = repo.viewers("s1")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        val viewers = (result as NetworkResult.Success).data
        assertThat(viewers.map { it.id }).containsExactly("u1", "u2").inOrder()
        assertThat(viewers[0].reactionEmoji).isEqualTo("❤️")
        // displayName defaulting flows through the repository mapping
        assertThat(viewers[1].displayName).isEqualTo("bob")
    }

    @Test
    fun viewers_emptyPayloadMapsToEmptyList() = runTest {
        coEvery { api.viewers("s1") } returns
            ApiResponse(success = true, data = StoryViewersResponse(viewers = emptyList()))

        val result = repo.viewers("s1")

        assertThat((result as NetworkResult.Success).data).isEmpty()
    }

    @Test
    fun viewers_networkErrorIsFailure() = runTest {
        coEvery { api.viewers("s1") } throws IOException("offline")

        assertThat(repo.viewers("s1")).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
