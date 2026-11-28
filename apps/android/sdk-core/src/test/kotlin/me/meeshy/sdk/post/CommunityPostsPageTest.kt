package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test
import java.io.IOException

/**
 * #16879 — les publications d'une communauté se lisent par l'adresse canonique
 * `GET /social/posts?scope=community&communityId=` (#4346), jamais par l'alias déprécié
 * `/posts/community/:id` : la passerelle y pose le même contrôle d'accès (privée réservée aux
 * membres, désactivée muette, auteurs bloqués exclus).
 */
class CommunityPostsPageTest {

    private val api: PostApi = mockk(relaxed = true)
    private val repo = PostRepository(api, mockk<TranslationApi>(relaxed = true), mockk<OutboxRepository>(relaxed = true))

    @Test
    fun `une page de la communaute porte ses publications et son curseur`() = runTest {
        coEvery { api.getCommunityFeed(communityId = "c1", cursor = null, limit = any()) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "p1"), ApiPost(id = "p2")),
            pagination = Pagination(nextCursor = "cur2", hasMore = true),
        )

        val page = (repo.getCommunityPostsPage("c1") as NetworkResult.Success).data

        assertThat(page.posts.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(page.nextCursor).isEqualTo("cur2")
        assertThat(page.hasMore).isTrue()
    }

    @Test
    fun `la page suivante part avec la communaute et le curseur, par la portee canonique`() = runTest {
        coEvery { api.getCommunityFeed(any(), any(), any(), any()) } returns
            ApiResponse(success = true, data = emptyList(), pagination = Pagination(nextCursor = null, hasMore = false))

        repo.getCommunityPostsPage("c9", cursor = "cur2")

        coVerify(exactly = 1) { api.getCommunityFeed(scope = "community", communityId = "c9", cursor = "cur2", limit = any()) }
        coVerify(exactly = 0) { api.getCommunityPosts(any(), any(), any()) }
    }

    @Test
    fun `un refus de la passerelle est un echec, jamais une liste vide`() = runTest {
        coEvery { api.getCommunityFeed(any(), any(), any(), any()) } returns
            ApiResponse(success = false, data = null, error = "forbidden")

        assertThat(repo.getCommunityPostsPage("c1")).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `hors ligne est un echec`() = runTest {
        coEvery { api.getCommunityFeed(any(), any(), any(), any()) } throws IOException("offline")

        assertThat(repo.getCommunityPostsPage("c1")).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
