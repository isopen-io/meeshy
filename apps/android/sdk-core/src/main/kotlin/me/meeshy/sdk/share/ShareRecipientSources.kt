package me.meeshy.sdk.share

import kotlinx.coroutines.flow.first
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.ApiCommunitySearchResult
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **D'où viennent les destinataires** (#14774) — la couture que [ShareRecipientRepository] interroge.
 * Les lectures `cached*` ne touchent JAMAIS le réseau ; `fresh*` et `search*` le font et échouent par
 * `null` (jamais une exception), pour qu'une panne ne prenne pas la place du cache.
 */
interface ShareRecipientSources {
    suspend fun cachedConversations(): List<ApiConversation>
    suspend fun cachedFriends(): List<FriendRequestUser>
    suspend fun cachedCommunities(): List<ApiCommunity>

    /** La première page du serveur (50), pour revalider en silence ; `null` si elle n'a pas répondu. */
    suspend fun freshConversations(): List<ApiConversation>?

    suspend fun searchConversations(query: String): List<ApiConversation>
    suspend fun searchUsers(query: String): List<UserSearchResult>
    suspend fun searchCommunities(query: String): List<ApiCommunitySearchResult>

    fun blockedUserIds(): Set<String>
}

@Singleton
class LiveShareRecipientSources @Inject constructor(
    private val conversations: ConversationRepository,
    private val conversationApi: ConversationApi,
    private val friends: FriendListRepository,
    private val communityCache: CommunityCacheRepository,
    private val communities: CommunityRepository,
    private val userApi: UserApi,
    private val blocks: BlockCache,
) : ShareRecipientSources {

    override suspend fun cachedConversations(): List<ApiConversation> = conversations.cachedConversations().first()

    override suspend fun cachedFriends(): List<FriendRequestUser> = friends.cachedSnapshot().orEmpty()

    override suspend fun cachedCommunities(): List<ApiCommunity> = communityCache.list().first().valueOrNull.orEmpty()

    override suspend fun freshConversations(): List<ApiConversation>? =
        when (val result = apiCall { conversationApi.list(offset = 0, limit = FIRST_PAGE) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> null
        }

    override suspend fun searchConversations(query: String): List<ApiConversation> =
        apiCall { conversationApi.search(query) }.getOrNull().orEmpty()

    override suspend fun searchUsers(query: String): List<UserSearchResult> =
        apiCall { userApi.search(query, limit = SEARCH_LIMIT, offset = 0) }.getOrNull().orEmpty()

    override suspend fun searchCommunities(query: String): List<ApiCommunitySearchResult> =
        communities.search(query, offset = 0, limit = SEARCH_LIMIT).getOrNull().orEmpty()

    override fun blockedUserIds(): Set<String> = blocks.currentBlockedIds

    private companion object {
        const val FIRST_PAGE = 50
        const val SEARCH_LIMIT = 20
    }
}
