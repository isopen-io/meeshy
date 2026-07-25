package me.meeshy.sdk.sharelink

import me.meeshy.sdk.model.CreatedShareLink
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.ToggleShareLinkRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owner-facing share-link use cases (authenticated). A thin, stateless data mapper
 * over [LinkApi]: it flattens the create envelope into a [CreatedShareLink], and
 * otherwise forwards the list / stats / toggle / delete calls, folding each into a
 * [NetworkResult] so callers never see exceptions. The "when to load / optimistic
 * update / rollback" orchestration stays app-side in the ViewModel.
 */
@Singleton
public class ShareLinkRepository @Inject constructor(
    private val linkApi: LinkApi,
) {
    public suspend fun create(request: CreateShareLinkRequest): NetworkResult<CreatedShareLink> =
        apiCall { linkApi.create(request) }.map { CreatedShareLink.from(it) }

    public suspend fun listMyLinks(offset: Int = 0, limit: Int = 50): NetworkResult<List<MyShareLink>> =
        apiCall { linkApi.listMyLinks(offset, limit) }

    public suspend fun fetchMyStats(): NetworkResult<MyShareLinkStats> =
        apiCall { linkApi.fetchMyStats() }

    public suspend fun setActive(linkId: String, isActive: Boolean): NetworkResult<Unit> =
        apiCall { linkApi.toggle(linkId, ToggleShareLinkRequest(isActive)) }

    public suspend fun delete(linkId: String): NetworkResult<Unit> =
        apiCall { linkApi.delete(linkId) }

    public suspend fun extend(linkId: String, expiresAtIso: String): NetworkResult<Unit> =
        apiCall { linkApi.extend(linkId, ExtendShareLinkRequest(expiresAtIso)) }
}
