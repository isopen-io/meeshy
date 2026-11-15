package me.meeshy.sdk.visitor

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.TrackedLinkSharer
import me.meeshy.sdk.model.visitor.VisitorContentKind
import me.meeshy.sdk.model.visitor.VisitorContentRequest
import me.meeshy.sdk.model.visitor.VisitorContentState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class VisitorContentLoaderTest {
    private val ada = TrackedLinkSharer(displayName = "Ada", username = "ada")
    private val post = ApiPost(id = "p1", content = "Bonjour")

    private class Fixture(
        val postResult: NetworkResult<ApiPost>,
        val linkResult: NetworkResult<ResolvedTrackedLink> = NetworkResult.Failure(ApiError("offline", code = "NETWORK")),
    ) {
        var resolvedTokens = mutableListOf<String>()
        val loader = VisitorContentLoader(
            posts = { postResult },
            links = { token -> resolvedTokens += token; linkResult },
        )
    }

    private fun request(via: String? = null) = VisitorContentRequest("p1", VisitorContentKind.POST, via)

    @Test
    fun `un post public est servi sans resoudre de lien quand aucun jeton n est la`() = runTest {
        val f = Fixture(NetworkResult.Success(post))
        assertThat(f.loader.load(request())).isEqualTo(VisitorContentState.Served(post, sharer = null))
        assertThat(f.resolvedTokens).isEmpty()
    }

    @Test
    fun `le jeton via nomme qui a partage`() = runTest {
        val f = Fixture(NetworkResult.Success(post), NetworkResult.Success(ResolvedTrackedLink(sharer = ada)))
        assertThat(f.loader.load(request(via = "tok"))).isEqualTo(VisitorContentState.Served(post, ada))
        assertThat(f.resolvedTokens).containsExactly("tok")
    }

    @Test
    fun `un partageur introuvable ne coute rien le contenu reste servi sans nom`() = runTest {
        val f = Fixture(NetworkResult.Success(post))
        assertThat(f.loader.load(request(via = "tok"))).isEqualTo(VisitorContentState.Served(post, null))
    }

    @Test
    fun `403 et 404 sont un refus sans reessai`() = runTest {
        listOf(403, 404, 410).forEach { status ->
            val f = Fixture(NetworkResult.Failure(ApiError("no", httpStatus = status)))
            assertThat(f.loader.load(request())).isEqualTo(VisitorContentState.Refused)
        }
    }

    @Test
    fun `une panne reseau ou serveur propose de reessayer`() = runTest {
        assertThat(Fixture(NetworkResult.Failure(ApiError("x", code = "NETWORK"))).loader.load(request()))
            .isEqualTo(VisitorContentState.Failed(ContentFetchFailure.NETWORK))
        assertThat(Fixture(NetworkResult.Failure(ApiError("x", httpStatus = 500))).loader.load(request()))
            .isEqualTo(VisitorContentState.Failed(ContentFetchFailure.SERVER))
    }
}
