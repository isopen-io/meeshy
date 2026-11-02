package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiHashtag
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiResponseMeta
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.HashtagApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.session.DefaultSessionTeardown
import org.junit.Test

class PostHashtagRepositoryTest {

    private val postApi: PostApi = mockk()
    private val hashtagApi: HashtagApi = mockk()
    private val listings = FeedListingRegistry()
    private val repository = PostHashtagRepository(postApi, hashtagApi, listings)

    @Test
    fun `la page rend les posts et le curseur de la suite`() = runTest {
        coEvery { postApi.getByHashtag("paris", null, 20) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "a"), ApiPost(id = "b")),
            pagination = Pagination(hasMore = true, nextCursor = "c2"),
        )

        val page = (repository.posts("#Paris") as NetworkResult.Success).data

        assertThat(page.posts.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(page.nextCursor).isEqualTo("c2")
        assertThat(page.hasMore).isTrue()
    }

    @Test
    fun `la premiere page vue est gardee pour ouvrir l ecran sans attente`() = runTest {
        coEvery { postApi.getByHashtag("paris", null, 20) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "a")),
            pagination = Pagination(hasMore = true, nextCursor = "c2"),
        )
        assertThat(repository.cachedFirstPage("#Paris")).isNull()

        repository.posts("paris")

        assertThat(repository.cachedFirstPage("PARIS")?.posts?.map { it.id }).containsExactly("a")
    }

    @Test
    fun `la deconnexion oublie les premieres pages du compte precedent`() = runTest {
        coEvery { postApi.getByHashtag("paris", null, 20) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "a")),
        )
        repository.posts("paris")

        val teardown = DefaultSessionTeardown(
            database = mockk(relaxed = true),
            categorySnapshotStore = mockk(relaxed = true),
            conversationDraftStore = mockk(relaxed = true),
            conversationLockStore = mockk(relaxed = true),
            storyComposerDraftStore = mockk(relaxed = true),
            friendshipCache = mockk(relaxed = true),
            notificationRepository = mockk(relaxed = true),
            blockCache = mockk(relaxed = true),
            perAccountCaches = setOf(repository),
        )
        teardown.wipe()

        assertThat(repository.cachedFirstPage("paris")).isNull()
    }

    @Test
    fun `une page suivante ne remplace pas la premiere en cache`() = runTest {
        coEvery { postApi.getByHashtag("paris", "c2", 20) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "z")),
        )

        repository.posts("paris", cursor = "c2")

        assertThat(repository.cachedFirstPage("paris")).isNull()
    }

    @Test
    fun `le curseur est renvoye a la page suivante`() = runTest {
        coEvery { postApi.getByHashtag("paris", "c2", 20) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "c")),
            pagination = Pagination(hasMore = false),
        )

        val page = (repository.posts("paris", cursor = "c2") as NetworkResult.Success).data

        assertThat(page.hasMore).isFalse()
        assertThat(page.nextCursor).isNull()
    }

    @Test
    fun `l identifiant de page servi est retenu pour les impressions`() = runTest {
        coEvery { postApi.getByHashtag(any(), any(), any()) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "a"), ApiPost(id = "b")),
            meta = ApiResponseMeta(feedRequestId = "req-9"),
        )

        repository.posts("paris")

        assertThat(listings.listingFor("b")?.feedRequestId).isEqualTo("req-9")
        assertThat(listings.listingFor("b")?.position).isEqualTo(1)
    }

    @Test
    fun `la tendance rend les mots-diese par usage`() = runTest {
        coEvery { hashtagApi.trending(20) } returns ApiResponse(success = true, data = listOf(ApiHashtag("paris", 12)))

        val tags = (repository.trending() as NetworkResult.Success).data

        assertThat(tags).containsExactly(ApiHashtag("paris", 12))
    }
}
