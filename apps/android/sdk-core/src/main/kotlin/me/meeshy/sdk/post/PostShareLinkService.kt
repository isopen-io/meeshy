package me.meeshy.sdk.post

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import me.meeshy.sdk.model.PostShareTarget
import me.meeshy.sdk.model.PostShareLinkLaw
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.SharePostRequest
import me.meeshy.sdk.net.apiCall

/**
 * « Copier le lien » et « Partager » d'un post frappent le même lien suivi
 * (`POST /posts/{id}/share` avec `generateLink`). Si la frappe échoue (hors ligne, limite de débit,
 * passerelle), l'utilisateur reçoit l'URL brute du post : seule l'attribution est perdue, jamais le
 * partage. Un verrou par post empêche le double envoi : un second appel pendant le premier attend
 * le MÊME résultat au lieu de frapper un second lien.
 */
@Singleton
class PostShareLinkService @Inject constructor(
    private val postApi: PostApi,
) {
    private val inFlight = ConcurrentHashMap<String, CompletableDeferred<PostShareTarget>>()

    suspend fun resolve(postId: String, platform: String): PostShareTarget {
        val mine = CompletableDeferred<PostShareTarget>()
        val running = inFlight.putIfAbsent(postId, mine)
        if (running != null) return running.await()
        var link = PostShareLinkLaw.resolve(postId, null)
        try {
            link = mint(postId, platform)
            return link
        } catch (cancelled: CancellationException) {
            throw cancelled
        } finally {
            mine.complete(link)
            inFlight.remove(postId, mine)
        }
    }

    private suspend fun mint(postId: String, platform: String): PostShareTarget =
        when (val result = apiCall { postApi.shareWithLink(postId, SharePostRequest(platform, generateLink = true)) }) {
            is NetworkResult.Success -> PostShareLinkLaw.resolve(postId, result.data.shortUrl)
            is NetworkResult.Failure -> PostShareLinkLaw.resolve(postId, null)
        }
}
