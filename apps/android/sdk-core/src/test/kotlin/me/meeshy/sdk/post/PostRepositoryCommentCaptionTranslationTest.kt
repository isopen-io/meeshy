package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiMediaCaptionTranslationEntry
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test

/** La traduction en direct de la légende d'un média de COMMENTAIRE (mediaId + commentId) rejoint la ligne du fil. */
@OptIn(ExperimentalCoroutinesApi::class)
class PostRepositoryCommentCaptionTranslationTest {

    private val api: PostApi = mockk(relaxed = true)
    private val translationApi: TranslationApi = mockk(relaxed = true)
    private val outbox: OutboxRepository = mockk(relaxed = true)

    private fun media(id: String) = ApiPostMedia(id = id, caption = "Bonjour", captionLanguage = "fr")

    private val post = ApiPost(
        id = "p1",
        content = "post",
        media = listOf(media("m1")),
        comments = listOf(ApiPostComment(id = "c1", media = listOf(media("m1")))),
    )

    private suspend fun seeded(): PostRepository {
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = listOf(post))
        return PostRepository(api, translationApi, outbox).also { it.refresh() }
    }

    private val entry = ApiMediaCaptionTranslationEntry(text = "Hello", translationModel = "nllb", confidenceScore = 0.9)

    @Test
    fun aCommentMediaCaptionTranslationLandsOnTheCommentAndNotOnThePostMedia() = runTest {
        val repo = seeded()

        val stored = repo.applyMediaCaptionTranslationUpdate("p1", "m1", "c1", "en", entry)

        assertThat(stored).isTrue()
        val cached = repo.cachedPost("p1")!!
        assertThat(cached.comments!!.single().media!!.single().captionTranslations).containsEntry("en", entry)
        assertThat(cached.media!!.single().captionTranslations).isNull()
    }

    @Test
    fun aTranslationForAnUnknownCommentIsInert() = runTest {
        val repo = seeded()

        assertThat(repo.applyMediaCaptionTranslationUpdate("p1", "m1", "missing", "en", entry)).isFalse()
        assertThat(repo.cachedPost("p1")!!.comments!!.single().media!!.single().captionTranslations).isNull()
    }

    @Test
    fun aRepeatedTranslationDoesNotRewriteTheCache() = runTest {
        val repo = seeded()
        repo.applyMediaCaptionTranslationUpdate("p1", "m1", "c1", "en", entry)

        assertThat(repo.applyMediaCaptionTranslationUpdate("p1", "m1", "c1", "en", entry)).isFalse()
    }
}
