package me.meeshy.sdk.mention

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.api.MentionSuggestionDto
import me.meeshy.sdk.net.api.MentionsApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Remote lookup backing the composer @-mention autocomplete. Protocol-injected
 * (port of iOS `MentionServiceProviding`) so the composer's remote-merge behaviour is
 * testable without a live network. A failed lookup degrades to an empty list — the
 * local cache still serves the panel.
 *
 * [suggest] is the contextual entry (#14053): with a [MentionContext] the gateway brings up
 * the people of that conversation or post; without one, the plain directory [search] answers.
 */
interface MentionSearch {
    suspend fun search(query: String): List<MentionCandidate>

    suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> = search(query)

    companion object {
        val None: MentionSearch = object : MentionSearch {
            override suspend fun search(query: String): List<MentionCandidate> = emptyList()
        }
    }
}

/** Maps a user-directory search onto mention candidates, dropping handleless rows. */
@Singleton
class DirectoryMentionSearch @Inject constructor(
    private val userRepository: UserRepository,
    private val displayNames: UserDisplayNameCache = UserDisplayNameCache(),
) : MentionSearch {

    override suspend fun search(query: String): List<MentionCandidate> =
        when (val result = userRepository.searchUsers(query, limit = REMOTE_LIMIT)) {
            is NetworkResult.Success -> result.data.mapNotNull { it.toMentionCandidate() }
                .also { candidates -> candidates.forEach { displayNames.track(it.username, it.displayName) } }
            is NetworkResult.Failure -> emptyList()
        }

    private fun UserSearchResult.toMentionCandidate(): MentionCandidate? {
        val handle = username.trim()
        if (handle.isEmpty()) return null
        return MentionCandidate(
            id = id,
            username = handle,
            displayName = displayName?.trim()?.ifEmpty { null } ?: handle,
            avatarURL = avatar,
        )
    }

    private companion object {
        const val REMOTE_LIMIT = 15
    }
}

/**
 * `GET mentions/suggestions` for a known context, the directory otherwise (#14053). The gateway's
 * order (known people, the context, contacts, directory) is kept verbatim. A failure degrades to an
 * empty list, never to the directory: that would offer people a members-only conversation refuses
 * at send.
 */
@Singleton
class ContextualMentionSearch @Inject constructor(
    private val mentionsApi: MentionsApi,
    private val directory: DirectoryMentionSearch,
    private val displayNames: UserDisplayNameCache,
) : MentionSearch {

    override suspend fun search(query: String): List<MentionCandidate> = directory.search(query)

    override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> {
        if (context == null) return directory.search(query)
        return when (val result = apiCall { mentionsApi.suggestions(context.id, context.type.wire, query) }) {
            is NetworkResult.Success -> result.data.mapNotNull { it.toMentionCandidate() }
                .also { candidates -> candidates.forEach { displayNames.track(it.username, it.displayName) } }
            is NetworkResult.Failure -> emptyList()
        }
    }

    private fun MentionSuggestionDto.toMentionCandidate(): MentionCandidate? {
        val handle = username?.trim().orEmpty()
        if (handle.isEmpty()) return null
        return MentionCandidate(
            id = id,
            username = handle,
            displayName = displayName?.trim()?.ifEmpty { null } ?: handle,
            avatarURL = avatar,
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MentionSearchModule {
    @Binds
    abstract fun bindMentionSearch(impl: ContextualMentionSearch): MentionSearch
}
