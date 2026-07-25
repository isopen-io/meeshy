package me.meeshy.sdk.sharelink

import me.meeshy.sdk.model.CreatedShareLink
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owner-facing share-link use cases (authenticated). Currently the creation path:
 * it flattens the gateway's nested `{ linkId, conversationId, shareLink }` envelope
 * into a [CreatedShareLink], preferring the top-level `linkId` and falling back to
 * the nested one. A failed create propagates as a [NetworkResult.Failure] — nothing
 * to persist, so the repository stays a thin, stateless data mapper.
 */
@Singleton
public class ShareLinkRepository @Inject constructor(
    private val linkApi: LinkApi,
) {
    public suspend fun create(request: CreateShareLinkRequest): NetworkResult<CreatedShareLink> =
        apiCall { linkApi.create(request) }.map { CreatedShareLink.from(it) }
}
