package me.meeshy.sdk.sharelink

import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Authenticated share-link join — the JWT counterpart of the anonymous
 * [me.meeshy.sdk.session.AnonymousSessionRepository.join]. A logged-in user
 * activating a share link hits `POST conversations/join/:linkId`, which is
 * idempotent server-side: an existing member gets the same canonical
 * conversationId as a fresh join, so callers can always navigate to the returned
 * id without pre-checking membership.
 *
 * Stateless: it installs no token (the caller is already authenticated) and
 * neither reads nor writes Room. The "when to join / where to navigate"
 * orchestration stays app-side.
 */
@Singleton
public class ShareLinkJoinRepository @Inject constructor(
    private val conversationApi: ConversationApi,
) {
    /**
     * Join [linkId] as the authenticated user and return the canonical
     * conversationId. A blank id is inert — it folds to a [NetworkResult.Failure]
     * without touching the network (never the doomed `conversations/join/`
     * request iOS would fire). A success envelope carrying a blank conversationId
     * is treated as malformed, so a caller can never navigate to an empty id.
     */
    public suspend fun joinAuthenticated(linkId: String): NetworkResult<String> {
        val trimmed = linkId.trim()
        if (trimmed.isEmpty()) {
            return NetworkResult.Failure(ApiError(message = "Blank share-link id", code = "BLANK"))
        }
        return when (val result = apiCall { conversationApi.joinViaShareLink(trimmed) }) {
            is NetworkResult.Success -> {
                val conversationId = result.data.conversationId.trim()
                if (conversationId.isEmpty()) {
                    NetworkResult.Failure(
                        ApiError(message = "Malformed join response", code = "PARSE"),
                    )
                } else {
                    NetworkResult.Success(conversationId)
                }
            }
            is NetworkResult.Failure -> result
        }
    }
}
