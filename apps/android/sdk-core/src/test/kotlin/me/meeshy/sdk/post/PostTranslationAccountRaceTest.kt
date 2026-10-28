package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import org.junit.Test

/** #13577 — la traduction à la demande d'un post, répondue après le changement de compte, n'écrit pas la copie de A chez B. */
class PostTranslationAccountRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val api: PostApi = mockk(relaxed = true)
    private val translationApi: TranslationApi = mockk(relaxed = true)
    private val repository = PostRepository(api, translationApi, mockk(relaxed = true), fence = fence)

    private fun feedOf(liked: Boolean) = ApiResponse(
        success = true,
        data = listOf(ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr", isLikedByMe = liked)),
    )

    @Test
    fun `a translation requested by A and answered after B signed in leaves B's copy of the post alone`() = runTest {
        coEvery { api.getFeed(any(), any()) } returns feedOf(liked = true)
        repository.refresh()
        val answer = CompletableDeferred<ApiResponse<TranslateResponse>>()
        coEvery { translationApi.translate(any()) } coAnswers { answer.await() }
        val stored = async { repository.requestOnDemandTranslation("p1", "es") }
        runCurrent()

        owner.id = null
        transition.bumpGeneration()
        fence.close { repository.clear() }
        owner.id = "B"
        transition.bumpGeneration()
        coEvery { api.getFeed(any(), any()) } returns feedOf(liked = false)
        repository.refresh()
        answer.complete(ApiResponse(success = true, data = TranslateResponse(translatedText = "Hola")))

        assertThat(stored.await()).isFalse()
        val cached = repository.cachedPost("p1")!!
        assertThat(cached.isLikedByMe).isFalse()
        assertThat(cached.translations).isNull()
    }

    @Test
    fun `a translation answered under the same account is stored`() = runTest {
        coEvery { api.getFeed(any(), any()) } returns feedOf(liked = true)
        repository.refresh()
        coEvery { translationApi.translate(any()) } returns
            ApiResponse(success = true, data = TranslateResponse(translatedText = "Hola"))

        assertThat(repository.requestOnDemandTranslation("p1", "es")).isTrue()
        assertThat(repository.cachedPost("p1")!!.translations!!["es"]!!.text).isEqualTo("Hola")
    }

    @Test
    fun `a like set while the translator works survives the translation`() = runTest {
        coEvery { api.getFeed(any(), any()) } returns feedOf(liked = false)
        repository.refresh()
        val answer = CompletableDeferred<ApiResponse<TranslateResponse>>()
        coEvery { translationApi.translate(any()) } coAnswers { answer.await() }
        val stored = async { repository.requestOnDemandTranslation("p1", "es") }
        runCurrent()

        coEvery { api.getFeed(any(), any()) } returns feedOf(liked = true)
        repository.refresh()
        answer.complete(ApiResponse(success = true, data = TranslateResponse(translatedText = "Hola")))

        assertThat(stored.await()).isTrue()
        val cached = repository.cachedPost("p1")!!
        assertThat(cached.isLikedByMe).isTrue()
        assertThat(cached.translations!!["es"]!!.text).isEqualTo("Hola")
    }
}
