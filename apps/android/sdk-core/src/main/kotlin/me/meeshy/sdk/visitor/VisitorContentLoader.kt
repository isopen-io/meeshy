package me.meeshy.sdk.visitor

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import me.meeshy.sdk.link.TrackedLinkRepository
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.TrackedLinkSharer
import me.meeshy.sdk.model.visitor.VisitorContentRequest
import me.meeshy.sdk.model.visitor.VisitorContentState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.toContentFetchFailure
import me.meeshy.sdk.post.PostRepository
import javax.inject.Inject

/** La lecture d'un post PUBLIC : la route `GET /posts/:id` que la passerelle sert a un visiteur sans jeton. */
fun interface VisitorPostSource {
    suspend fun post(postId: String): NetworkResult<ApiPost>
}

/** La resolution d'un `/l/<jeton>` (`GET /tracking-links/:token/resolve`, publique). */
fun interface VisitorLinkSource {
    suspend fun resolve(token: String): NetworkResult<ResolvedTrackedLink>
}

/**
 * Charge le contenu d'un visiteur et, si le lien en porte un, son partageur (iOS `VisitorContentLoader`). Le post part
 * sans jeton ; la resolution du lien n'est demandee QUE si un jeton est la, et un partageur introuvable ne coute rien.
 * Le Prisme (langue du lecteur) se descend a l'affichage, sur le post tel que la passerelle l'a servi.
 */
class VisitorContentLoader(
    private val posts: VisitorPostSource,
    private val links: VisitorLinkSource,
) {
    @Inject
    constructor(posts: PostRepository, links: TrackedLinkRepository) : this(
        posts = VisitorPostSource(posts::getPost),
        links = VisitorLinkSource(links::resolve),
    )

    suspend fun load(request: VisitorContentRequest): VisitorContentState = coroutineScope {
        val sharer = async { sharer(request.via) }
        when (val result = posts.post(request.postId)) {
            is NetworkResult.Success -> VisitorContentState.Served(result.data, sharer.await())
            is NetworkResult.Failure -> {
                sharer.cancel()
                val failure = result.error.toContentFetchFailure()
                if (failure.isAbsence) VisitorContentState.Refused else VisitorContentState.Failed(failure)
            }
        }
    }

    private suspend fun sharer(token: String?): TrackedLinkSharer? =
        token?.let { (links.resolve(it) as? NetworkResult.Success)?.data?.sharer }
}
