package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test
import java.io.IOException

class ReelDoorTest {
    private class FakeSource(
        var cachedPost: ApiPost? = null,
        var answer: () -> NetworkResult<ApiPost> = { NetworkResult.Failure(ApiError("x", httpStatus = 500)) },
    ) : ReelPostSource {
        var fetches = 0
        override suspend fun cached(postId: String): ApiPost? = cachedPost
        override suspend fun fetch(postId: String): NetworkResult<ApiPost> {
            fetches++
            return answer()
        }
    }

    private class FakePresenter : ReelsPresenting {
        val presented = mutableListOf<Triple<String, String?, String?>>()
        val failures = mutableListOf<ContentFetchFailure>()
        override fun present(post: ApiPost, commentId: String?, parentCommentId: String?) {
            presented += Triple(post.id, commentId, parentCommentId)
        }
        override fun presentFailure(failure: ContentFetchFailure, postId: String, commentId: String?, parentCommentId: String?) {
            failures += failure
        }
    }

    private fun post(id: String = "p1", type: String = "REEL") = ApiPost(id = id, type = type)

    private suspend fun open(source: FakeSource, presenter: FakePresenter = FakePresenter()): Pair<FakePresenter, List<ApiPost>> {
        val details = mutableListOf<ApiPost>()
        ReelDoor(ReelNotificationOpener(source), presenter).open("p1", "c2", "c1") { details += it }
        return presenter to details
    }

    @Test
    fun `un reel en cache s ouvre sans requete`() = runTest {
        val source = FakeSource(cachedPost = post())
        val (presenter, details) = open(source)
        assertThat(source.fetches).isEqualTo(0)
        assertThat(presenter.presented).containsExactly(Triple("p1", "c2", "c1"))
        assertThat(details).isEmpty()
    }

    @Test
    fun `un cache non reel ne tranche pas le reseau reclasse`() = runTest {
        val source = FakeSource(cachedPost = post(type = "POST"), answer = { NetworkResult.Success(post()) })
        val (presenter, _) = open(source)
        assertThat(source.fetches).isEqualTo(1)
        assertThat(presenter.presented).hasSize(1)
    }

    @Test
    fun `un post non reel ouvre le detail amorce par le post lu`() = runTest {
        val source = FakeSource(answer = { NetworkResult.Success(post(type = "POST")) })
        val (presenter, details) = open(source)
        assertThat(source.fetches).isEqualTo(1)
        assertThat(details.map { it.id }).containsExactly("p1")
        assertThat(presenter.presented).isEmpty()
    }

    @Test
    fun `un echec ouvre le lecteur sur la vraie cause en une seule requete`() = runTest {
        val offline = FakeSource(answer = { NetworkResult.Failure(ApiError("n", code = "NETWORK")) })
        assertThat(open(offline).first.failures).containsExactly(ContentFetchFailure.NETWORK)
        val server = FakeSource(answer = { NetworkResult.Failure(ApiError("s", httpStatus = 503)) })
        assertThat(open(server).first.failures).containsExactly(ContentFetchFailure.SERVER)
        assertThat(server.fetches).isEqualTo(1)
        val gone = FakeSource(answer = { NetworkResult.Failure(ApiError("g", httpStatus = 404)) })
        assertThat(open(gone).first.failures).containsExactly(ContentFetchFailure.NOT_FOUND)
    }

    @Test
    fun `une exception reseau est classee hors ligne`() = runTest {
        val source = FakeSource(answer = { throw IOException("down") })
        assertThat(open(source).first.failures).containsExactly(ContentFetchFailure.NETWORK)
    }
}
