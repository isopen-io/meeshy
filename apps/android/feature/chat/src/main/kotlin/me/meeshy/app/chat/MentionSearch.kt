package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Directory lookup backing the composer @-mention autocomplete. Protocol-injected
 * (port of iOS `MentionServiceProviding`) so the composer's remote-merge behaviour is
 * testable without a live network. A failed lookup degrades to an empty list — the
 * local roster still serves the panel.
 */
interface MentionSearch {
    suspend fun search(query: String): List<MentionCandidate>
}

/** Maps a user-directory search onto mention candidates, dropping handleless rows. */
@Singleton
class DirectoryMentionSearch @Inject constructor(
    private val userRepository: UserRepository,
) : MentionSearch {

    override suspend fun search(query: String): List<MentionCandidate> =
        when (val result = userRepository.searchUsers(query, limit = REMOTE_LIMIT)) {
            is NetworkResult.Success -> result.data.mapNotNull { it.toMentionCandidate() }
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

@Module
@InstallIn(SingletonComponent::class)
abstract class MentionSearchModule {
    @Binds
    abstract fun bindMentionSearch(impl: DirectoryMentionSearch): MentionSearch
}
