package me.meeshy.sdk.post

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class PostRepositoryTest {

    private val api: PostApi = mockk(relaxed = true)
    private val translationApi: TranslationApi = mockk(relaxed = true)

    private fun ok(post: ApiPost) = ApiResponse(success = true, data = listOf(post))
    private fun okUnit() = ApiResponse(success = true, data = Unit)

    private fun page(posts: List<ApiPost>, nextCursor: String?, hasMore: Boolean) =
        ApiResponse(
            success = true,
            data = posts,
            pagination = Pagination(nextCursor = nextCursor, hasMore = hasMore),
        )

    private fun List<ApiPost>.post(id: String) = first { it.id == id }

    private fun CacheResult<List<ApiPost>>.posts(): List<ApiPost> =
        (this as? CacheResult.Fresh)?.value ?: (this as CacheResult.Stale).value

    private suspend fun seed(post: ApiPost): PostRepository {
        coEvery { api.getFeed(any(), any()) } returns ok(post)
        val repo = PostRepository(api, translationApi)
        repo.refresh()
        return repo
    }

    @Test
    fun toggleLike_likesOptimistically_andCallsApi() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", likeCount = 2, isLikedByMe = false))
        coEvery { api.like("p1") } returns okUnit()

        repo.feedStream().test {
            // initial fresh state from the seeded cache
            assertThat((awaitItem() as CacheResult.Fresh).value.post("p1").isLikedByMe).isFalse()

            repo.toggleLike("p1")

            val after = awaitItem()
            val liked = ((after as? CacheResult.Fresh)?.value ?: (after as CacheResult.Stale).value).post("p1")
            assertThat(liked.isLikedByMe).isTrue()
            assertThat(liked.likeCount).isEqualTo(3)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.like("p1") }
    }

    @Test
    fun toggleLike_unlikesWhenAlreadyLiked() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", likeCount = 5, isLikedByMe = true))
        coEvery { api.unlike("p1") } returns okUnit()

        repo.toggleLike("p1")

        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            assertThat(post.isLikedByMe).isFalse()
            assertThat(post.likeCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.unlike("p1") }
    }

    @Test
    fun toggleLike_rollsBackOnFailure() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", likeCount = 2, isLikedByMe = false))
        coEvery { api.like("p1") } throws IOException("offline")

        repo.toggleLike("p1")

        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            // rolled back to the pre-toggle values
            assertThat(post.isLikedByMe).isFalse()
            assertThat(post.likeCount).isEqualTo(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun toggleBookmark_bookmarksOptimistically_andCallsApi() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 2, isBookmarkedByMe = false))
        coEvery { api.bookmark("p1") } returns okUnit()

        repo.feedStream().test {
            assertThat((awaitItem() as CacheResult.Fresh).value.post("p1").isBookmarkedByMe).isFalse()

            repo.toggleBookmark("p1")

            val after = awaitItem()
            val bookmarked = ((after as? CacheResult.Fresh)?.value ?: (after as CacheResult.Stale).value).post("p1")
            assertThat(bookmarked.isBookmarkedByMe).isTrue()
            assertThat(bookmarked.bookmarkCount).isEqualTo(3)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.bookmark("p1") }
    }

    @Test
    fun toggleBookmark_removesWhenAlreadyBookmarked() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 5, isBookmarkedByMe = true))
        coEvery { api.removeBookmark("p1") } returns okUnit()

        repo.toggleBookmark("p1")

        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            assertThat(post.isBookmarkedByMe).isFalse()
            assertThat(post.bookmarkCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.removeBookmark("p1") }
    }

    @Test
    fun toggleBookmark_rollsBackOnFailure() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 2, isBookmarkedByMe = false))
        coEvery { api.bookmark("p1") } throws IOException("offline")

        val accepted = repo.toggleBookmark("p1")

        assertThat(accepted).isFalse()
        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            assertThat(post.isBookmarkedByMe).isFalse()
            assertThat(post.bookmarkCount).isEqualTo(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun toggleBookmark_returnsFalseForUnknownPost() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 2, isBookmarkedByMe = false))

        val accepted = repo.toggleBookmark("missing")

        assertThat(accepted).isFalse()
        coVerify(exactly = 0) { api.bookmark(any()) }
    }

    @Test
    fun feedHasMore_reflectsFirstPagePagination() = runTest {
        coEvery { api.getFeed(null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a")), nextCursor = "c1", hasMore = true)
        val repo = PostRepository(api, translationApi)

        repo.refresh()

        assertThat(repo.feedHasMore.value).isTrue()
    }

    @Test
    fun loadMore_appendsDedupedNextPage_andStopsWhenExhausted() = runTest {
        coEvery { api.getFeed(null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a")), nextCursor = "c1", hasMore = true)
        coEvery { api.getFeed("c1", any()) } returns
            page(
                listOf(ApiPost(id = "p1", content = "a"), ApiPost(id = "p2", content = "b")),
                nextCursor = null,
                hasMore = false,
            )
        val repo = PostRepository(api, translationApi)
        repo.refresh()

        val moreRemains = repo.loadMore()

        assertThat(moreRemains).isFalse()
        assertThat(repo.feedHasMore.value).isFalse()
        repo.feedStream().test {
            assertThat(awaitItem().posts().map { it.id }).containsExactly("p1", "p2").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun loadMore_isNoOp_whenNoCursorRemains() = runTest {
        coEvery { api.getFeed(null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a")), nextCursor = null, hasMore = false)
        val repo = PostRepository(api, translationApi)
        repo.refresh()

        assertThat(repo.loadMore()).isFalse()

        coVerify(exactly = 1) { api.getFeed(any(), any()) }
    }

    @Test
    fun getBookmarksPage_returnsPostsWithPaginationWatermark() = runTest {
        coEvery { api.getBookmarks(null, any()) } returns
            page(listOf(ApiPost(id = "b1", content = "a"), ApiPost(id = "b2", content = "b")), "cur2", true)
        val repo = PostRepository(api, translationApi)

        val result = repo.getBookmarksPage(cursor = null)

        val data = (result as NetworkResult.Success).data
        assertThat(data.posts.map { it.id }).containsExactly("b1", "b2").inOrder()
        assertThat(data.nextCursor).isEqualTo("cur2")
        assertThat(data.hasMore).isTrue()
    }

    @Test
    fun getBookmarksPage_forwardsTheCursorToTheApi() = runTest {
        coEvery { api.getBookmarks("cur2", any()) } returns
            page(listOf(ApiPost(id = "b3", content = "c")), nextCursor = null, hasMore = false)
        val repo = PostRepository(api, translationApi)

        val result = repo.getBookmarksPage(cursor = "cur2")

        assertThat((result as NetworkResult.Success).data.posts.map { it.id }).containsExactly("b3")
        assertThat(result.data.hasMore).isFalse()
        coVerify(exactly = 1) { api.getBookmarks("cur2", any()) }
    }

    @Test
    fun getBookmarksPage_foldsUnsuccessfulEnvelopeIntoFailure() = runTest {
        coEvery { api.getBookmarks(any(), any()) } returns
            ApiResponse(success = false, data = null, error = "nope")
        val repo = PostRepository(api, translationApi)

        val result = repo.getBookmarksPage()

        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("nope")
    }

    @Test
    fun getBookmarksPage_foldsTransportFailureIntoFailure() = runTest {
        coEvery { api.getBookmarks(any(), any()) } throws IOException("offline")
        val repo = PostRepository(api, translationApi)

        assertThat(repo.getBookmarksPage()).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun getBookmarksPage_defaultsHasMoreFalseWhenPaginationAbsent() = runTest {
        coEvery { api.getBookmarks(any(), any()) } returns
            ApiResponse(success = true, data = listOf(ApiPost(id = "b1", content = "a")))
        val repo = PostRepository(api, translationApi)

        val data = (repo.getBookmarksPage() as NetworkResult.Success).data
        assertThat(data.hasMore).isFalse()
        assertThat(data.nextCursor).isNull()
    }

    @Test
    fun getUserPostsPage_returnsPostsWithPaginationWatermark() = runTest {
        coEvery { api.getUserPosts("u1", null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a"), ApiPost(id = "p2", content = "b")), "cur2", true)
        val repo = PostRepository(api, translationApi)

        val data = (repo.getUserPostsPage("u1", cursor = null) as NetworkResult.Success).data

        assertThat(data.posts.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(data.nextCursor).isEqualTo("cur2")
        assertThat(data.hasMore).isTrue()
    }

    @Test
    fun getUserPostsPage_forwardsUserIdAndCursorToTheApi() = runTest {
        coEvery { api.getUserPosts("u9", "cur2", any()) } returns
            page(listOf(ApiPost(id = "p3", content = "c")), nextCursor = null, hasMore = false)
        val repo = PostRepository(api, translationApi)

        val result = repo.getUserPostsPage("u9", cursor = "cur2")

        assertThat((result as NetworkResult.Success).data.posts.map { it.id }).containsExactly("p3")
        assertThat(result.data.hasMore).isFalse()
        coVerify(exactly = 1) { api.getUserPosts("u9", "cur2", any()) }
    }

    @Test
    fun getUserPostsPage_foldsUnsuccessfulEnvelopeIntoFailure() = runTest {
        coEvery { api.getUserPosts(any(), any(), any()) } returns
            ApiResponse(success = false, data = null, error = "forbidden")
        val repo = PostRepository(api, translationApi)

        val result = repo.getUserPostsPage("u1")

        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("forbidden")
    }

    @Test
    fun getUserPostsPage_foldsTransportFailureIntoFailure() = runTest {
        coEvery { api.getUserPosts(any(), any(), any()) } throws IOException("offline")
        val repo = PostRepository(api, translationApi)

        assertThat(repo.getUserPostsPage("u1")).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun getUserPostsPage_defaultsHasMoreFalseWhenPaginationAbsent() = runTest {
        coEvery { api.getUserPosts(any(), any(), any()) } returns
            ApiResponse(success = true, data = listOf(ApiPost(id = "p1", content = "a")))
        val repo = PostRepository(api, translationApi)

        val data = (repo.getUserPostsPage("u1") as NetworkResult.Success).data
        assertThat(data.hasMore).isFalse()
        assertThat(data.nextCursor).isNull()
    }

    // --- create: location attachment ---------------------------------------

    private fun okPost(post: ApiPost) = ApiResponse(success = true, data = post)

    @Test
    fun create_withNoLocation_forwardsANullLocationField() = runTest {
        val slot = slot<CreatePostRequest>()
        coEvery { api.create(capture(slot)) } returns okPost(ApiPost(id = "new", content = "hi"))
        val repo = PostRepository(api, translationApi)

        repo.create(content = "hi")

        assertThat(slot.captured.location).isNull()
    }

    @Test
    fun create_withALocation_forwardsItVerbatimOnTheWireRequest() = runTest {
        val place = SharedPlace(
            latitude = 48.8566,
            longitude = 2.3522,
            name = null,
            address = null,
            category = null,
        )
        val slot = slot<CreatePostRequest>()
        coEvery { api.create(capture(slot)) } returns okPost(ApiPost(id = "new", content = "hi"))
        val repo = PostRepository(api, translationApi)

        repo.create(content = "hi", location = place)

        assertThat(slot.captured.location).isEqualTo(place)
    }

    // --- On-demand post translation (requestOnDemandTranslation) ---

    private fun translated(text: String) =
        ApiResponse(success = true, data = TranslateResponse(translatedText = text))

    private fun CacheResult<List<ApiPost>>.cachedPost(id: String): ApiPost =
        ((this as? CacheResult.Fresh)?.value ?: (this as CacheResult.Stale).value).post(id)

    @Test
    fun requestOnDemandTranslation_storesTheTranslationAndReportsSuccess() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val stored = repo.requestOnDemandTranslation("p1", "es")

        assertThat(stored).isTrue()
        repo.feedStream().test {
            assertThat(awaitItem().cachedPost("p1").translations!!["es"]!!.text).isEqualTo("Hola")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun requestOnDemandTranslation_forwardsTheSourceTextAndLanguages() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))
        val slot = slot<TranslateRequest>()
        coEvery { translationApi.translate(capture(slot)) } returns translated("Hola")

        repo.requestOnDemandTranslation("p1", "  es  ")

        assertThat(slot.captured.text).isEqualTo("Bonjour")
        assertThat(slot.captured.sourceLanguage).isEqualTo("fr")
        assertThat(slot.captured.targetLanguage).isEqualTo("es")
    }

    @Test
    fun requestOnDemandTranslation_isInertForAnUnknownPost() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))

        val stored = repo.requestOnDemandTranslation("missing", "es")

        assertThat(stored).isFalse()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun requestOnDemandTranslation_isInertForABlankTarget() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))

        val stored = repo.requestOnDemandTranslation("p1", "   ")

        assertThat(stored).isFalse()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun requestOnDemandTranslation_isInertWhenThePostHasNoSourceText() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "   ", originalLanguage = "fr"))

        val stored = repo.requestOnDemandTranslation("p1", "es")

        assertThat(stored).isFalse()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun requestOnDemandTranslation_returnsFalseWhenTheTranslatorFails() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))
        coEvery { translationApi.translate(any()) } throws IOException("offline")

        val stored = repo.requestOnDemandTranslation("p1", "es")

        assertThat(stored).isFalse()
    }

    @Test
    fun requestOnDemandTranslation_returnsFalseForABlankTranslation() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))
        coEvery { translationApi.translate(any()) } returns translated("   ")

        val stored = repo.requestOnDemandTranslation("p1", "es")

        assertThat(stored).isFalse()
    }

    @Test
    fun requestOnDemandTranslation_isIdempotentWhenTheTranslationAlreadyMatches() = runTest {
        val repo = seed(
            ApiPost(
                id = "p1",
                content = "Bonjour",
                originalLanguage = "fr",
                translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola")),
            ),
        )
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val stored = repo.requestOnDemandTranslation("p1", "es")

        assertThat(stored).isFalse()
    }

    // --- Realtime translation push (applyTranslationUpdate): the gateway translated the
    //     post server-side and broadcast the finished entry; no translator call here. ---

    private fun pushedEntry(text: String = "Hola") = ApiPostTranslationEntry(
        text = text,
        translationModel = "nllb",
        confidenceScore = 0.97,
        createdAt = "2026-08-24T00:00:00Z",
    )

    @Test
    fun applyTranslationUpdate_foldsThePushedEntryIntoTheCache_preservingMetadata() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))

        val stored = repo.applyTranslationUpdate("p1", "es", pushedEntry())

        assertThat(stored).isTrue()
        repo.feedStream().test {
            val entry = awaitItem().cachedPost("p1").translations!!["es"]!!
            assertThat(entry.text).isEqualTo("Hola")
            assertThat(entry.translationModel).isEqualTo("nllb")
            assertThat(entry.confidenceScore).isEqualTo(0.97)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun applyTranslationUpdate_isInertForAnUnknownPost() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))

        val stored = repo.applyTranslationUpdate("missing", "es", pushedEntry())

        assertThat(stored).isFalse()
    }

    @Test
    fun applyTranslationUpdate_isInertForABlankTarget() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))

        val stored = repo.applyTranslationUpdate("p1", "   ", pushedEntry())

        assertThat(stored).isFalse()
    }

    @Test
    fun applyTranslationUpdate_isInertForABlankPushedText() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr"))

        val stored = repo.applyTranslationUpdate("p1", "es", pushedEntry(text = "   "))

        assertThat(stored).isFalse()
    }

    @Test
    fun applyTranslationUpdate_isIdempotentWhenTheIdenticalEntryIsAlreadyCached() = runTest {
        val repo = seed(
            ApiPost(
                id = "p1",
                content = "Bonjour",
                originalLanguage = "fr",
                translations = mapOf("es" to pushedEntry()),
            ),
        )

        val stored = repo.applyTranslationUpdate("p1", "es", pushedEntry())

        assertThat(stored).isFalse()
    }

    // --- Realtime post edit push (applyPostUpdate): the author edited the post and the
    //     gateway broadcast the whole new (unpersonalized) post. ---

    @Test
    fun applyPostUpdate_foldsTheEditIntoTheCache_preservingTheReadersLikeState() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", likeCount = 2, isLikedByMe = true))

        val stored = repo.applyPostUpdate(
            ApiPost(id = "p1", content = "Bonjour (edited)", likeCount = 9, isLikedByMe = false),
        )

        assertThat(stored).isTrue()
        repo.feedStream().test {
            val post = awaitItem().cachedPost("p1")
            assertThat(post.content).isEqualTo("Bonjour (edited)")
            assertThat(post.likeCount).isEqualTo(9)
            // The broadcast's own like flag (false) is ignored — the reader stays liked.
            assertThat(post.isLikedByMe).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun applyPostUpdate_isInertForAnUnknownPost() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour"))

        val stored = repo.applyPostUpdate(ApiPost(id = "missing", content = "edited"))

        assertThat(stored).isFalse()
    }

    @Test
    fun applyPostUpdate_isInertForAnIdenticalReBroadcast() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "Bonjour", likeCount = 3, isLikedByMe = true))

        val stored = repo.applyPostUpdate(
            ApiPost(id = "p1", content = "Bonjour", likeCount = 3, isLikedByMe = true),
        )

        assertThat(stored).isFalse()
    }

    // --- On-demand post translation for a caller-held post (translatePost) ---

    @Test
    fun translatePost_translatesTheSourceAndReturnsTheMergedPost() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val merged = repo.translatePost(
            ApiPost(id = "p9", content = "Bonjour", originalLanguage = "fr"),
            "es",
        )

        assertThat(merged?.translations?.get("es")?.text).isEqualTo("Hola")
    }

    @Test
    fun translatePost_forwardsTheSourceTextAndLanguages_andTrimsTheTarget() = runTest {
        val repo = PostRepository(api, translationApi)
        val slot = slot<TranslateRequest>()
        coEvery { translationApi.translate(capture(slot)) } returns translated("Hola")

        repo.translatePost(ApiPost(id = "p9", content = "Bonjour", originalLanguage = "fr"), "  es  ")

        assertThat(slot.captured.text).isEqualTo("Bonjour")
        assertThat(slot.captured.sourceLanguage).isEqualTo("fr")
        assertThat(slot.captured.targetLanguage).isEqualTo("es")
    }

    @Test
    fun translatePost_isInertForABlankTarget() = runTest {
        val repo = PostRepository(api, translationApi)

        val merged = repo.translatePost(ApiPost(id = "p9", content = "Bonjour"), "   ")

        assertThat(merged).isNull()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun translatePost_isInertWhenThePostHasNoSourceText() = runTest {
        val repo = PostRepository(api, translationApi)

        val merged = repo.translatePost(ApiPost(id = "p9", content = "   "), "es")

        assertThat(merged).isNull()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun translatePost_returnsNullWhenTheTranslatorFails() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } throws IOException("offline")

        val merged = repo.translatePost(ApiPost(id = "p9", content = "Bonjour"), "es")

        assertThat(merged).isNull()
    }

    @Test
    fun translatePost_returnsNullForABlankTranslation() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } returns translated("   ")

        val merged = repo.translatePost(ApiPost(id = "p9", content = "Bonjour"), "es")

        assertThat(merged).isNull()
    }

    @Test
    fun translatePost_isIdempotentWhenTheTranslationAlreadyMatches() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val merged = repo.translatePost(
            ApiPost(
                id = "p9",
                content = "Bonjour",
                originalLanguage = "fr",
                translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola")),
            ),
            "es",
        )

        assertThat(merged).isNull()
    }

    // --- On-demand comment translation for a caller-held comment (translateComment) ---

    @Test
    fun translateComment_translatesTheSourceAndReturnsTheMergedComment() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val merged = repo.translateComment(
            ApiPostComment(id = "c9", content = "Bonjour", originalLanguage = "fr"),
            "es",
        )

        assertThat(merged?.id).isEqualTo("c9")
        assertThat(merged?.translations?.get("es")?.text).isEqualTo("Hola")
    }

    @Test
    fun translateComment_forwardsTheSourceTextAndLanguages_andTrimsTheTarget() = runTest {
        val repo = PostRepository(api, translationApi)
        val slot = slot<TranslateRequest>()
        coEvery { translationApi.translate(capture(slot)) } returns translated("Hola")

        repo.translateComment(ApiPostComment(id = "c9", content = "Bonjour", originalLanguage = "fr"), "  es  ")

        assertThat(slot.captured.text).isEqualTo("Bonjour")
        assertThat(slot.captured.sourceLanguage).isEqualTo("fr")
        assertThat(slot.captured.targetLanguage).isEqualTo("es")
    }

    @Test
    fun translateComment_isInertForABlankTarget() = runTest {
        val repo = PostRepository(api, translationApi)

        val merged = repo.translateComment(ApiPostComment(id = "c9", content = "Bonjour"), "   ")

        assertThat(merged).isNull()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun translateComment_isInertWhenTheCommentHasNoSourceText() = runTest {
        val repo = PostRepository(api, translationApi)

        val merged = repo.translateComment(ApiPostComment(id = "c9", content = "   "), "es")

        assertThat(merged).isNull()
        coVerify(exactly = 0) { translationApi.translate(any()) }
    }

    @Test
    fun translateComment_returnsNullWhenTheTranslatorFails() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } throws IOException("offline")

        val merged = repo.translateComment(ApiPostComment(id = "c9", content = "Bonjour"), "es")

        assertThat(merged).isNull()
    }

    @Test
    fun translateComment_returnsNullForABlankTranslation() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } returns translated("   ")

        val merged = repo.translateComment(ApiPostComment(id = "c9", content = "Bonjour"), "es")

        assertThat(merged).isNull()
    }

    @Test
    fun translateComment_isIdempotentWhenTheTranslationAlreadyMatches() = runTest {
        val repo = PostRepository(api, translationApi)
        coEvery { translationApi.translate(any()) } returns translated("Hola")

        val merged = repo.translateComment(
            ApiPostComment(
                id = "c9",
                content = "Bonjour",
                originalLanguage = "fr",
                translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola")),
            ),
            "es",
        )

        assertThat(merged).isNull()
    }
}
