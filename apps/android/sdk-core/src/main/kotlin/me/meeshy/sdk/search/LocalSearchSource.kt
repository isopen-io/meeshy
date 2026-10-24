package me.meeshy.sdk.search

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.SuggestionDao
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.search.FtsQuerySanitizer
import me.meeshy.sdk.model.search.SearchTextFolder
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.UserSearchResult
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que l'appareil sait repondre SEUL, sans reseau : index FTS et caches Room. */
public interface LocalSearchSource {
    public suspend fun conversations(query: String): List<ApiConversation>
    public suspend fun users(query: String): List<UserSearchResult>
    public suspend fun messages(query: String): List<MessageSearchHit>
}

/**
 * Source locale adossee a Room : conversations par FTS puis hydratation du cache, personnes
 * dans les amis et suggestions en cache, messages par FTS. La presence des lignes locales
 * n'est PAS reprise (donnee absente = aucun point) : seul le serveur la sert, a jour.
 */
@Singleton
public class RoomLocalSearchSource @Inject constructor(
    private val index: LocalSearchIndex,
    private val conversationDao: ConversationDao,
    private val friends: FriendListRepository,
    private val suggestionDao: SuggestionDao,
) : LocalSearchSource {

    override suspend fun conversations(query: String): List<ApiConversation> =
        hydrated(index.searchConversationIds(query))

    override suspend fun users(query: String): List<UserSearchResult> {
        val needle = FtsQuerySanitizer.match(query)?.let { SearchTextFolder.fold(query.trim()) } ?: return emptyList()
        val fromFriends = friends.cachedSnapshot().orEmpty().map(::userOf)
        val fromSuggestions = suggestionDao.observeAll().first().mapNotNull {
            runCatching { MeeshyApi.json.decodeFromString<UserSearchResult>(it.payload) }.getOrNull()
        }
        return (fromFriends + fromSuggestions)
            .distinctBy { it.id }
            .filter { user -> matches(user, needle) }
    }

    override suspend fun messages(query: String): List<MessageSearchHit> {
        val hits = index.searchMessages(query)
        if (hits.isEmpty()) return emptyList()
        val conversations = hydrated(hits.map { it.conversationId }.distinct()).associateBy { it.id }
        return hits.map { hit ->
            val conversation = conversations[hit.conversationId]
            MessageSearchHit(
                message = ApiMessage(
                    id = hit.messageId,
                    conversationId = hit.conversationId,
                    content = hit.text,
                    createdAt = Instant.ofEpochMilli(hit.createdAt).toString(),
                ),
                conversationTitle = conversation?.let(::titleOf).orEmpty(),
                conversation = conversation,
            )
        }
    }

    private suspend fun hydrated(ids: List<String>): List<ApiConversation> =
        ids.mapNotNull { id ->
            conversationDao.find(id)?.let { row ->
                runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(row.payload) }.getOrNull()
            }
        }

    private fun titleOf(conversation: ApiConversation): String =
        conversation.resolvedPreferences?.customName?.takeIf { it.isNotBlank() } ?: conversation.title.orEmpty()

    private fun userOf(friend: FriendRequestUser) = UserSearchResult(
        id = friend.id,
        username = friend.username,
        displayName = friend.displayName ?: listOfNotNull(friend.firstName, friend.lastName).joinToString(" ").ifBlank { null },
        avatar = friend.avatar,
        isOnline = null,
    )

    private fun matches(user: UserSearchResult, foldedNeedle: String): Boolean =
        listOfNotNull(user.displayName, user.username).any { SearchTextFolder.fold(it).contains(foldedNeedle) }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class LocalSearchSourceModule {
    @Binds
    abstract fun bindLocalSearchSource(source: RoomLocalSearchSource): LocalSearchSource
}
