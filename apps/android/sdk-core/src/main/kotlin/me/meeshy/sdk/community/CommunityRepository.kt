package me.meeshy.sdk.community

import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiCommunitySearchResult
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.model.CreateCommunityRequest
import me.meeshy.sdk.model.IdentifierAvailability
import me.meeshy.sdk.model.InviteMemberRequest
import me.meeshy.sdk.model.UpdateCommunityRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.net.api.AddCommunityMemberRequest
import me.meeshy.sdk.net.api.CommunityApi
import me.meeshy.sdk.net.api.UpdateCommunityMemberRoleRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Le bilan d'une invitation de plusieurs personnes : [failed] sur [requested] ont échoué. */
data class CommunityInviteOutcome(val requested: Int, val failed: Int) {
    /** Zéro échec vaut succès. */
    val isSuccess: Boolean get() = failed == 0
}

/** Communities, members and community conversations — port of CommunityService (CommunityService.swift). */
@Singleton
class CommunityRepository @Inject constructor(
    private val communityApi: CommunityApi,
) {
    suspend fun list(
        search: String? = null,
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<List<ApiCommunity>> =
        apiCall { communityApi.list(offset, limit, search?.takeIf { it.isNotEmpty() }) }

    /**
     * [list] avec le bloc `pagination` de l'enveloppe : l'écran Communautés en tire `hasMore` pour
     * charger la page suivante (iOS lit `response.pagination?.hasMore`).
     */
    suspend fun listPaged(
        search: String? = null,
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<PagedResult<List<ApiCommunity>>> =
        pagedApiCall { communityApi.list(offset, limit, search?.takeIf { it.isNotEmpty() }) }

    suspend fun search(
        query: String,
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<List<ApiCommunitySearchResult>> =
        apiCall { communityApi.search(query, offset, limit) }

    suspend fun get(communityId: String): NetworkResult<ApiCommunity> =
        apiCall { communityApi.get(communityId) }

    suspend fun create(
        name: String,
        identifier: String? = null,
        description: String? = null,
        isPrivate: Boolean = true,
    ): NetworkResult<ApiCommunity> =
        apiCall {
            communityApi.create(CreateCommunityRequest(name, identifier, description, isPrivate))
        }

    suspend fun update(
        communityId: String,
        name: String? = null,
        identifier: String? = null,
        description: String? = null,
        isPrivate: Boolean? = null,
        avatar: String? = null,
        banner: String? = null,
    ): NetworkResult<ApiCommunity> =
        apiCall {
            communityApi.update(
                communityId,
                UpdateCommunityRequest(name, identifier, description, isPrivate, avatar, banner),
            )
        }

    suspend fun delete(communityId: String): NetworkResult<Unit> =
        apiCall { communityApi.delete(communityId) }

    suspend fun getMembers(
        communityId: String,
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<List<ApiCommunityMember>> =
        apiCall { communityApi.getMembers(communityId, offset, limit) }

    /** [getMembers] avec `pagination`, pour la page suivante de la liste des membres. */
    suspend fun getMembersPaged(
        communityId: String,
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<PagedResult<List<ApiCommunityMember>>> =
        pagedApiCall { communityApi.getMembers(communityId, offset, limit) }

    suspend fun addMember(
        communityId: String,
        userId: String,
        role: String = "member",
    ): NetworkResult<ApiCommunityMember> =
        apiCall { communityApi.addMember(communityId, AddCommunityMemberRequest(userId, role)) }

    suspend fun updateMemberRole(
        communityId: String,
        memberId: String,
        role: String,
    ): NetworkResult<ApiCommunityMember> =
        apiCall {
            communityApi.updateMemberRole(
                communityId,
                memberId,
                UpdateCommunityMemberRoleRequest(role),
            )
        }

    suspend fun removeMember(communityId: String, userId: String): NetworkResult<Unit> =
        apiCall { communityApi.removeMember(communityId, userId) }

    suspend fun join(communityId: String): NetworkResult<ApiCommunityMember> =
        apiCall { communityApi.join(communityId) }

    suspend fun leave(communityId: String): NetworkResult<Unit> =
        apiCall { communityApi.leave(communityId) }

    suspend fun invite(communityId: String, userId: String): NetworkResult<ApiCommunityMember> =
        apiCall { communityApi.invite(communityId, InviteMemberRequest(userId)) }

    /**
     * Invite plusieurs personnes par une invitation unitaire chacune (parité iOS : la passerelle n'a
     * pas d'endpoint batch). Un échec n'arrête pas les suivantes ; le bilan compte les échecs.
     */
    suspend fun inviteMany(communityId: String, userIds: List<String>): CommunityInviteOutcome {
        val failed = userIds.count { invite(communityId, it) !is NetworkResult.Success }
        return CommunityInviteOutcome(requested = userIds.size, failed = failed)
    }

    /** Les communautés créées ou administrées par moi (`role=admin,moderator`). */
    suspend fun mine(role: String = ADMIN_ROLES): NetworkResult<List<CommunityMini>> =
        apiCall { communityApi.mine(role) }

    suspend fun checkIdentifier(identifier: String): NetworkResult<IdentifierAvailability> =
        apiCall { communityApi.checkIdentifier(identifier) }

    suspend fun getConversations(communityId: String): NetworkResult<List<ApiConversation>> =
        apiCall { communityApi.getConversations(communityId) }

    suspend fun addConversation(
        communityId: String,
        conversationId: String,
    ): NetworkResult<ApiConversation> =
        apiCall { communityApi.addConversation(communityId, conversationId) }

    companion object {
        const val ADMIN_ROLES = "admin,moderator"
    }
}
