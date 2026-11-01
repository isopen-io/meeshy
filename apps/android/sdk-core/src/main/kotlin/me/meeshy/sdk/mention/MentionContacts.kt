package me.meeshy.sdk.mention

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.mention.MentionContactRoster
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The local contact cache the « @ » list opens on (#14053): accepted friends already cached on the
 * device, read synchronously by [snapshot] so the first keystroke never waits for anything.
 * [refresh] re-reads the device cache — a composer calls it when it opens, so an account switch or
 * a friendship accepted since is picked up without holding a live subscription.
 */
interface MentionContacts {
    fun snapshot(): List<MentionCandidate>

    suspend fun refresh()

    companion object {
        val None: MentionContacts = object : MentionContacts {
            override fun snapshot(): List<MentionCandidate> = emptyList()
            override suspend fun refresh() = Unit
        }
    }
}

/** [MentionContacts] over the Room cold-start cache of the Contacts tab, blocked people withheld. */
@Singleton
class CachedMentionContacts @Inject constructor(
    private val friends: FriendListRepository,
    private val blocks: BlockCache,
) : MentionContacts {

    @Volatile
    private var roster: List<MentionCandidate> = emptyList()

    override fun snapshot(): List<MentionCandidate> = roster

    override suspend fun refresh() {
        val cached = try {
            friends.cachedSnapshot().orEmpty()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            return
        }
        roster = MentionContactRoster.fromFriends(cached, blocked = blocks.currentBlockedIds)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MentionContactsModule {
    @Binds
    abstract fun bindMentionContacts(impl: CachedMentionContacts): MentionContacts
}
