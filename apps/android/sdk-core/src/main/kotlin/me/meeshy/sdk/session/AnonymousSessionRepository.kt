package me.meeshy.sdk.session

import me.meeshy.sdk.model.AnonymousJoinRequest
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.LeaveAnonymousRequest
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.model.toSessionContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.ShareLinkApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Anonymous (shared-link guest) session use cases — owns joining a conversation
 * as a guest, re-hydrating the guest session on app start, and leaving it.
 *
 * The join hardens the server-advertised capabilities via
 * [AnonymousJoinResponse.toSessionContext] (videos/audios/locations/links are
 * always denied) before anything is persisted, and installs the
 * `X-Session-Token` on the [TokenStore] so every subsequent guest request is
 * authenticated. Persistence is delegated to the stateless
 * [AnonymousSessionStore].
 */
@Singleton
public class AnonymousSessionRepository @Inject constructor(
    private val shareLinkApi: ShareLinkApi,
    private val store: AnonymousSessionStore,
    private val tokenStore: TokenStore,
) {
    /**
     * Fetch the public preview of a share link by its identifier — the no-auth
     * `anonymous/link/{identifier}` endpoint (port of iOS `getLinkInfo`). Purely
     * a read: it never touches the token store or persisted session, so a preview
     * can never strand a half-authenticated guest.
     */
    public suspend fun preview(identifier: String): NetworkResult<ShareLinkInfo> =
        apiCall { shareLinkApi.getLinkInfo(identifier) }

    /**
     * Join [linkId] as an anonymous guest. On success the hardened context is
     * persisted and its session token installed. A response that cannot form a
     * real session (missing participant/conversation or a blank token) folds
     * into a [NetworkResult.Failure] and persists nothing — a malformed payload
     * never strands a half-authenticated guest.
     */
    public suspend fun join(
        linkId: String,
        request: AnonymousJoinRequest,
    ): NetworkResult<AnonymousSessionContext> =
        when (val result = apiCall { shareLinkApi.joinAnonymously(linkId, request) }) {
            is NetworkResult.Success -> {
                val context = result.data.toSessionContext()
                    ?: return NetworkResult.Failure(
                        ApiError(message = "Malformed anonymous join response", code = "PARSE"),
                    )
                persist(context)
                NetworkResult.Success(context)
            }
            is NetworkResult.Failure -> result
        }

    /**
     * Re-hydrate a persisted guest session on app start, re-installing its
     * `X-Session-Token`. Returns `null` (and touches nothing) when no guest
     * session was stored.
     */
    public suspend fun restore(): AnonymousSessionContext? {
        val context = store.load() ?: return null
        tokenStore.sessionToken = context.sessionToken
        return context
    }

    /**
     * End the guest session. Best-effort server leave, then **always** drop the
     * local session and its token so a failed network call can never leave the
     * guest half-authenticated. When no token is known, the leave is a local
     * no-op that still reports success.
     */
    public suspend fun leave(): NetworkResult<Unit> {
        val token = store.load()?.sessionToken ?: tokenStore.sessionToken
        val result = token
            ?.let { apiCall { shareLinkApi.leaveAnonymously(LeaveAnonymousRequest(it)) } }
            ?: NetworkResult.Success(Unit)
        store.clear()
        tokenStore.sessionToken = null
        return result
    }

    private suspend fun persist(context: AnonymousSessionContext) {
        tokenStore.sessionToken = context.sessionToken
        store.save(context)
    }
}
