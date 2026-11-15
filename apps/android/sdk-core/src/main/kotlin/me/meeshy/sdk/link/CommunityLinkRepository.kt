package me.meeshy.sdk.link

import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.model.links.toCommunityLink
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommunityLinksApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les communautés que l'utilisateur administre, lues comme des liens de partage — port de
 * `CommunityLinkService.listCommunityLinks` : le lien est construit sur l'origine WEB, pas celle de l'API.
 */
@Singleton
class CommunityLinkRepository @Inject constructor(
    private val api: CommunityLinksApi,
    config: MeeshyConfig,
) {
    private val webOrigin: String =
        ServerEnvironmentResolver.webOrigin(ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl))

    suspend fun listCommunityLinks(): NetworkResult<List<CommunityLink>> =
        apiCall { api.mine(ADMIN_ROLES) }.map { minis -> minis.map { it.toCommunityLink(webOrigin) } }

    private companion object {
        const val ADMIN_ROLES = "admin,moderator"
    }
}
