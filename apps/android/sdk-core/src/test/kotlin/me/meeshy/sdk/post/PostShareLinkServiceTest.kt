package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.PostShareLink
import me.meeshy.sdk.model.PostShareResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.SharePostRequest
import org.junit.Test

class PostShareLinkServiceTest {

    private val api: PostApi = mockk()

    private fun minted(url: String?) =
        ApiResponse(success = true, data = PostShareResult(shared = true, shareCount = 1, shortUrl = url))

    @Test
    fun `une frappe reussie rend l URL courte suivie`() = runTest {
        coEvery { api.shareWithLink("p1", SharePostRequest("copy", true)) } returns minted("https://meeshy.me/l/abc")

        val link = PostShareLinkService(api).resolve("p1", "copy")

        assertThat(link).isEqualTo(PostShareLink("https://meeshy.me/l/abc", tracked = true))
    }

    @Test
    fun `hors ligne l URL brute du post est rendue`() = runTest {
        coEvery { api.shareWithLink(any(), any()) } throws IOException("offline")

        val link = PostShareLinkService(api).resolve("p1", "system")

        assertThat(link).isEqualTo(PostShareLink("https://meeshy.me/feeds/post/p1", tracked = false))
    }

    @Test
    fun `une reponse sans lien court retombe sur l URL brute`() = runTest {
        coEvery { api.shareWithLink(any(), any()) } returns minted(null)

        assertThat(PostShareLinkService(api).resolve("p1", "copy").tracked).isFalse()
    }

    @Test
    fun `une limite de debit retombe sur l URL brute`() = runTest {
        coEvery { api.shareWithLink(any(), any()) } returns ApiResponse(success = false, error = "rate limited", code = "RATE_LIMITED")

        assertThat(PostShareLinkService(api).resolve("p1", "copy").url).isEqualTo("https://meeshy.me/feeds/post/p1")
    }

    @Test
    fun `deux appels simultanes sur le meme post ne frappent qu un lien`() = runTest {
        val gate = CompletableDeferred<Unit>()
        coEvery { api.shareWithLink(any(), any()) } coAnswers {
            gate.await()
            minted("https://meeshy.me/l/once")
        }
        val service = PostShareLinkService(api)

        val first = async { service.resolve("p1", "copy") }
        val second = async { service.resolve("p1", "system") }
        gate.complete(Unit)

        assertThat(first.await()).isEqualTo(second.await())
        coVerify(exactly = 1) { api.shareWithLink(any(), any()) }
    }

    @Test
    fun `une fois le verrou rendu un nouveau partage frappe un nouveau lien`() = runTest {
        coEvery { api.shareWithLink(any(), any()) } returns minted("https://meeshy.me/l/x")
        val service = PostShareLinkService(api)

        service.resolve("p1", "copy")
        service.resolve("p1", "copy")

        coVerify(exactly = 2) { api.shareWithLink(any(), any()) }
    }
}
